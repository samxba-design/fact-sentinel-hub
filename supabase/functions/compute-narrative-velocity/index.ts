// Edge function: compute-narrative-velocity
// Scheduled (daily/hourly) to update narrative momentum, source breakdowns,
// and cross-platform flags. Called by pg_cron or manually.
//
// Input: { org_id?: string } — optional, processes all orgs if omitted.
// Output: { processed: number, updated: number }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiPrompt } from "../_lib/gemini.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const corsHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

interface NarrativeRow {
  id: string;
  org_id: string;
  name: string;
  mention_count_history: unknown[];
}

interface MentionCount {
  total: number;
  sources: Record<string, number>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const { org_id } = await req.json().catch(() => ({ /* noop */ }));

    // Fetch active narratives
    let query = supabase
      .from("narratives")
      .select("id, org_id, name, mention_count_history")
      .eq("status", "active");

    if (org_id) query = query.eq("org_id", org_id);

    const { data: narratives, error: fetchErr } = await query;
    if (fetchErr) throw new Error(`Fetch narratives: ${fetchErr.message}`);
    if (!narratives?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No active narratives" }), { headers: corsHeaders });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    const oneDayAgo = new Date(now.getTime() - 86400000);

    let updated = 0;

    for (const n of narratives as NarrativeRow[]) {
      try {
        // Count mentions linked to this narrative in the last 7 days
        const { data: currentMentions, error: cmErr } = await supabase
          .from("mention_narratives")
          .select("mention_id")
          .eq("narrative_id", n.id);

        if (cmErr || !currentMentions?.length) {
          // Reset velocity if no mentions
          await supabase.from("narratives").update({
            velocity: 0, momentum_score: 0,
            mention_count_history: JSON.stringify(getDailyHistory(n.mention_count_history, now, 0)),
            updated_at: new Date().toISOString(),
          }).eq("id", n.id);
          continue;
        }

        const mentionIds = currentMentions.map((m: unknown) => m.mention_id);

        // Get mention details for source breakdown & time range
        const { data: mentions, error: mErr } = await supabase
          .from("mentions")
          .select("source, posted_at, created_at")
          .in("id", mentionIds);

        if (mErr) continue;

        // Split into current (last 7d) and previous (7-14d ago)
        let currentCount = 0;
        let previousCount = 0;
        const sourceSet = new Set<string>();
        const recentSources = new Set<string>();

        for (const m of (mentions || [])) {
          const ts = m.posted_at || m.created_at;
          const date = new Date(ts);
          sourceSet.add(m.source);

          if (date >= sevenDaysAgo) {
            currentCount++;
            if (date >= oneDayAgo) recentSources.add(m.source);
          } else if (date >= fourteenDaysAgo && date < sevenDaysAgo) {
            previousCount++;
          }
        }

        // Velocity: % change from previous period
        let velocity: number;
        if (previousCount === 0) {
          velocity = currentCount > 0 ? 100 : 0;
        } else {
          velocity = ((currentCount - previousCount) / previousCount) * 100;
        }

        // Momentum score: 0-1 normalized velocity
        const momentumScore = Math.max(0, Math.min(1, (velocity + 100) / 200));

        // Cross-platform: ≥3 distinct source types within 24 hours
        const crossPlatform = recentSources.size >= 3;

        // Build source breakdown
        const sourceBreakdown: Record<string, number> = { /* noop */ };
        for (const m of (mentions || [])) {
          sourceBreakdown[m.source] = (sourceBreakdown[m.source] || 0) + 1;
        }

        // Update mention count history (daily buckets)
        const dailyCount = countMentionsByDay(mentions || []);
        const history = getDailyHistory(n.mention_count_history, now, dailyCount);

        // Gen fingerprint hash from name+top_sources
        const fingerprintHash = crossPlatform
          ? await generateFingerprint(n.name, [...recentSources])
          : null;

        const { error: upErr } = await supabase.from("narratives").update({
          velocity: Math.round(velocity * 100) / 100,
          momentum_score: Math.round(momentumScore * 100) / 100,
          mention_count_history: JSON.stringify(history),
          source_breakdown: JSON.stringify(sourceBreakdown),
          cross_platform: crossPlatform,
          fingerprint_hash: fingerprintHash,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", n.id);

        if (upErr) console.error(`Update narrative ${n.id}: ${upErr.message}`);
        else updated++;

        // Create cross-platform alert if new
        if (crossPlatform) {
          await maybeCreateAlert(n.org_id, n.id, n.name, fingerprintHash, [...recentSources], currentCount);
        }
      } catch (e) {
        console.error(`Narrative ${n.id} error:`, e);
      }
    }

    return new Response(JSON.stringify({ processed: narratives.length, updated }), { headers: corsHeaders });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

function countMentionsByDay(mentions: unknown[]): number {
  const oneDayAgo = new Date(Date.now() - 86400000);
  return mentions.filter((m: unknown) => {
    const ts = m.posted_at || m.created_at;
    return new Date(ts) >= oneDayAgo;
  }).length;
}

function getDailyHistory(existing: unknown[], now: Date, todayCount: number): unknown[] {
  const history = Array.isArray(existing) ? existing : [];
  const todayStr = now.toISOString().slice(0, 10);

  // Remove entries older than 30 days
  const cutoff = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const filtered = history.filter((h: unknown) => h.date >= cutoff);

  // Upsert today's count
  const idx = filtered.findIndex((h: unknown) => h.date === todayStr);
  if (idx >= 0) filtered[idx].count = todayCount;
  else filtered.push({ date: todayStr, count: todayCount });

  return filtered;
}

async function generateFingerprint(name: string, sources: string[]): Promise<string> {
  return `${name.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}:${sources.sort().join(',')}`;
}

async function maybeCreateAlert(
  orgId: string, narrativeId: string, narrativeName: string,
  fingerprint: string | null, sources: string[], count: number
) {
  // Check if we already alerted for this fingerprint recently
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const { data: existing } = await supabase
    .from("cross_platform_alerts")
    .select("id")
    .eq("org_id", orgId)
    .eq("fingerprint_hash", fingerprint)
    .gte("alerted_at", oneDayAgo)
    .limit(1);

  if (existing?.length) return; // Already alerted

  const severity = count >= 20 ? "critical" : count >= 10 ? "high" : "medium";

  await supabase.from("cross_platform_alerts").insert({
    org_id: orgId,
    narrative_id: narrativeId,
    fingerprint_hash: fingerprint,
    title: `Cross-platform: ${narrativeName}`,
    description: `Narrative "${narrativeName}" detected across ${sources.length} platforms (${sources.join(", ")}) with ${count} recent mentions`,
    sources,
    mention_count: count,
    severity,
  });
}