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

    // Get all orgs with tracking profiles that have scan schedules
    const { data: profiles, error: profErr } = await supabase
      .from("tracking_profiles")
      .select("org_id, scan_schedule, quiet_hours_start, quiet_hours_end, settings");
    if (profErr) throw profErr;

    const now = new Date();
    const currentHour = now.getUTCHours();
    const results: { org_id: string; status: string }[] = [];

    for (const profile of (profiles || [])) {
      // Check schedule - skip if no schedule configured
      const schedule = profile.scan_schedule;
      if (!schedule || schedule === "manual") {
        results.push({ org_id: profile.org_id, status: "skipped_no_schedule" });
        continue;
      }

      // Check quiet hours
      if (profile.quiet_hours_start != null && profile.quiet_hours_end != null) {
        const start = profile.quiet_hours_start;
        const end = profile.quiet_hours_end;
        if (start < end) {
          if (currentHour >= start && currentHour < end) {
            results.push({ org_id: profile.org_id, status: "skipped_quiet_hours" });
            continue;
          }
        } else {
          if (currentHour >= start || currentHour < end) {
            results.push({ org_id: profile.org_id, status: "skipped_quiet_hours" });
            continue;
          }
        }
      }

      // Determine if it's time to run based on schedule
      const { data: lastRun } = await supabase
        .from("scan_runs")
        .select("started_at")
        .eq("org_id", profile.org_id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastRun?.started_at) {
        const lastTime = new Date(lastRun.started_at).getTime();
        const elapsed = now.getTime() - lastTime;
        const hours = elapsed / (1000 * 60 * 60);

        const minHours: Record<string, number> = {
          "6h": 5.5,
          "12h": 11.5,
          "daily": 23,
          "weekly": 167,
        };

        if (hours < (minHours[schedule] || 23)) {
          results.push({ org_id: profile.org_id, status: "skipped_too_soon" });
          continue;
        }
      }

      // Get org keywords and sources
      const [kwRes, srcRes] = await Promise.all([
        supabase.from("keywords").select("value").eq("org_id", profile.org_id).eq("status", "active"),
        supabase.from("sources").select("type").eq("org_id", profile.org_id).eq("enabled", true),
      ]);

      const keywords = (kwRes.data || []).map((k: any) => k.value);
      const sources = (srcRes.data || []).map((s: any) => s.type);

      if (keywords.length === 0) {
        results.push({ org_id: profile.org_id, status: "skipped_no_keywords" });
        continue;
      }

      // Call run-scan edge function with service role key (acts as system)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString();

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/run-scan`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            org_id: profile.org_id,
            keywords,
            sources: sources.length > 0 ? sources : ["news"],
            date_from: sevenDaysAgo,
            date_to: now.toISOString(),
          }),
        });
        const data = await res.json();

        // After each scan completes, run spike detection for this org
        try {
          await fetch(`${supabaseUrl}/functions/v1/check-spikes`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ org_id: profile.org_id }),
          });
        } catch (spikeErr: any) {
          console.warn(`check-spikes failed for ${profile.org_id}:`, spikeErr.message);
        }

        results.push({
          org_id: profile.org_id,
          status: data.error ? `error: ${data.error}` : `completed: ${data.mentions_created || 0} mentions`,
        });
      } catch (e: any) {
        results.push({ org_id: profile.org_id, status: `error: ${e.message}` });
      }
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
