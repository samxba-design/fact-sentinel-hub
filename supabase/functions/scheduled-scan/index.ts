import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all orgs with tracking profiles
    const { data: profiles, error: profErr } = await supabase
      .from("tracking_profiles")
      .select("org_id, scan_schedule, quiet_hours_start, quiet_hours_end");
    if (profErr) throw profErr;

    const now = new Date();
    const currentHour = now.getUTCHours();
    const results: { org_id: string; status: string }[] = [];

    for (const profile of (profiles || [])) {
      // Skip if in quiet hours
      if (profile.quiet_hours_start != null && profile.quiet_hours_end != null) {
        const start = profile.quiet_hours_start;
        const end = profile.quiet_hours_end;
        if (start < end) {
          if (currentHour >= start && currentHour < end) {
            results.push({ org_id: profile.org_id, status: "skipped_quiet_hours" });
            continue;
          }
        } else {
          // Wraps midnight
          if (currentHour >= start || currentHour < end) {
            results.push({ org_id: profile.org_id, status: "skipped_quiet_hours" });
            continue;
          }
        }
      }

      // Get org keywords and sources
      const [kwRes, srcRes, orgRes] = await Promise.all([
        supabase.from("keywords").select("value").eq("org_id", profile.org_id).eq("status", "active"),
        supabase.from("sources").select("type").eq("org_id", profile.org_id).eq("enabled", true),
        supabase.from("organizations").select("name, domain, industry").eq("id", profile.org_id).single(),
      ]);

      const keywords = (kwRes.data || []).map((k: any) => k.value);
      const sources = (srcRes.data || []).map((s: any) => s.type);

      if (keywords.length === 0) {
        results.push({ org_id: profile.org_id, status: "skipped_no_keywords" });
        continue;
      }

      // Create scan run
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
      const configSnapshot = { keywords, sources, date_from: sevenDaysAgo, date_to: now.toISOString(), triggered_by: "scheduled" };
      
      const { data: scanRun, error: scanErr } = await supabase
        .from("scan_runs")
        .insert({
          org_id: profile.org_id,
          status: "running",
          started_at: now.toISOString(),
          config_snapshot: configSnapshot,
        })
        .select()
        .single();
      if (scanErr) {
        results.push({ org_id: profile.org_id, status: `error: ${scanErr.message}` });
        continue;
      }

      // Generate mentions via AI
      const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
      const org = orgRes.data;
      const keywordList = keywords.join(", ");
      const sourceList = sources.join(", ") || "twitter, reddit, news";

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0.9,
          messages: [
            {
              role: "system",
              content: `You are a social media monitoring simulator. Generate realistic synthetic mentions for a scheduled brand scan.
Organization: ${org?.name || "Unknown"} (${org?.industry || "technology"}, domain: ${org?.domain || "unknown"})
Keywords: ${keywordList}
Sources: ${sourceList}
Date range: last 7 days from ${now.toISOString()}

Generate 5-8 realistic mentions with varied sentiment and severity.
Return ONLY valid JSON: { "mentions": [ { "source", "content", "author_name", "author_handle", "author_verified", "author_follower_count", "sentiment_label", "sentiment_score", "sentiment_confidence", "severity", "language", "posted_at", "url", "metrics": { "likes", "shares", "comments" }, "flags": { "misinformation", "coordinated", "bot_likely", "viral_potential" } } ] }`,
            },
            { role: "user", content: "Run the scheduled scan now." },
          ],
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        await supabase.from("scan_runs").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", scanRun.id);
        results.push({ org_id: profile.org_id, status: `ai_error: ${errText.substring(0, 100)}` });
        continue;
      }

      const aiData = await aiRes.json();
      let rawContent = aiData.choices?.[0]?.message?.content || "{}";
      rawContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      let parsed: any;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        await supabase.from("scan_runs").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", scanRun.id);
        results.push({ org_id: profile.org_id, status: "parse_error" });
        continue;
      }

      const mentions = parsed.mentions || parsed;
      if (!Array.isArray(mentions) || mentions.length === 0) {
        await supabase.from("scan_runs").update({ status: "completed", finished_at: new Date().toISOString(), total_mentions: 0 }).eq("id", scanRun.id);
        results.push({ org_id: profile.org_id, status: "no_mentions" });
        continue;
      }

      const mentionRows = mentions.map((m: any) => ({
        org_id: profile.org_id,
        scan_run_id: scanRun.id,
        source: m.source || "unknown",
        content: m.content,
        author_name: m.author_name,
        author_handle: m.author_handle,
        author_verified: m.author_verified || false,
        author_follower_count: m.author_follower_count || 0,
        sentiment_label: m.sentiment_label,
        sentiment_score: m.sentiment_score,
        sentiment_confidence: m.sentiment_confidence,
        severity: m.severity || "low",
        language: m.language || "en",
        posted_at: m.posted_at,
        url: m.url,
        metrics: m.metrics || {},
        flags: m.flags || {},
        status: "new",
      }));

      await supabase.from("mentions").insert(mentionRows);

      const negCount = mentions.filter((m: any) => m.sentiment_label === "negative" || m.sentiment_label === "mixed").length;
      const emergencyCount = mentions.filter((m: any) => m.severity === "critical" || m.severity === "high").length;

      await supabase.from("scan_runs").update({
        status: "completed",
        finished_at: new Date().toISOString(),
        total_mentions: mentions.length,
        negative_pct: Math.round((negCount / mentions.length) * 100),
        emergencies_count: emergencyCount,
      }).eq("id", scanRun.id);

      results.push({ org_id: profile.org_id, status: `completed: ${mentions.length} mentions` });
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("scheduled-scan error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
