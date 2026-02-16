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

    // Get all orgs
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name");
    if (orgErr) throw orgErr;

    const alerts: { org_id: string; type: string; payload: any }[] = [];

    for (const org of (orgs || [])) {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      // Count mentions in last 1 hour vs previous 1 hour
      const [recentRes, prevRes, dailyNegRes, criticalRes] = await Promise.all([
        supabase.from("mentions").select("id", { count: "exact", head: true })
          .eq("org_id", org.id).gte("posted_at", oneHourAgo),
        supabase.from("mentions").select("id", { count: "exact", head: true })
          .eq("org_id", org.id).gte("posted_at", twoHoursAgo).lt("posted_at", oneHourAgo),
        supabase.from("mentions").select("id", { count: "exact", head: true })
          .eq("org_id", org.id).eq("sentiment_label", "negative").gte("posted_at", twentyFourHoursAgo),
        supabase.from("mentions").select("id", { count: "exact", head: true })
          .eq("org_id", org.id).eq("severity", "critical").gte("posted_at", twentyFourHoursAgo),
      ]);

      const recentCount = recentRes.count ?? 0;
      const prevCount = prevRes.count ?? 0;
      const dailyNeg = dailyNegRes.count ?? 0;
      const criticalCount = criticalRes.count ?? 0;

      // Spike detection: >3x increase in mentions hour-over-hour (min 5 mentions)
      if (recentCount >= 5 && prevCount > 0 && recentCount / prevCount >= 3) {
        alerts.push({
          org_id: org.id,
          type: "mention_spike",
          payload: {
            recent_count: recentCount,
            previous_count: prevCount,
            multiplier: Math.round((recentCount / prevCount) * 10) / 10,
            message: `Mention volume spiked ${Math.round(recentCount / prevCount)}x in the last hour (${recentCount} vs ${prevCount})`,
          },
        });
      }

      // Negative sentiment spike: >10 negative mentions in 24h
      if (dailyNeg >= 10) {
        // Check if we already have a recent alert for this
        const { data: existingAlert } = await supabase
          .from("alerts")
          .select("id")
          .eq("org_id", org.id)
          .eq("type", "negative_spike")
          .eq("status", "active")
          .gte("triggered_at", twentyFourHoursAgo)
          .maybeSingle();

        if (!existingAlert) {
          alerts.push({
            org_id: org.id,
            type: "negative_spike",
            payload: {
              negative_count: dailyNeg,
              period: "24h",
              message: `${dailyNeg} negative mentions detected in the last 24 hours`,
            },
          });
        }
      }

      // Critical severity alert: any new critical mentions
      if (criticalCount > 0) {
        const { data: existingAlert } = await supabase
          .from("alerts")
          .select("id")
          .eq("org_id", org.id)
          .eq("type", "critical_mention")
          .eq("status", "active")
          .gte("triggered_at", oneHourAgo)
          .maybeSingle();

        if (!existingAlert) {
          alerts.push({
            org_id: org.id,
            type: "critical_mention",
            payload: {
              critical_count: criticalCount,
              period: "24h",
              message: `${criticalCount} critical-severity mention(s) detected in the last 24 hours`,
            },
          });
        }
      }

      // Viral potential detection
      const { data: viralMentions } = await supabase
        .from("mentions")
        .select("id, content, flags")
        .eq("org_id", org.id)
        .gte("posted_at", twentyFourHoursAgo)
        .not("flags", "is", null);

      const viralCount = (viralMentions || []).filter((m: any) => {
        try {
          const flags = typeof m.flags === "string" ? JSON.parse(m.flags) : m.flags;
          return flags?.viral_potential === true;
        } catch { return false; }
      }).length;

      if (viralCount >= 3) {
        const { data: existingAlert } = await supabase
          .from("alerts")
          .select("id")
          .eq("org_id", org.id)
          .eq("type", "viral_risk")
          .eq("status", "active")
          .gte("triggered_at", twentyFourHoursAgo)
          .maybeSingle();

        if (!existingAlert) {
          alerts.push({
            org_id: org.id,
            type: "viral_risk",
            payload: {
              viral_count: viralCount,
              message: `${viralCount} mentions flagged with viral potential in the last 24 hours`,
            },
          });
        }
      }
    }

    // Insert all alerts and trigger email notifications
    if (alerts.length > 0) {
      const alertRows = alerts.map(a => ({
        org_id: a.org_id,
        type: a.type,
        payload: a.payload,
        status: "active",
        triggered_at: new Date().toISOString(),
      }));
      const { error: insertErr } = await supabase.from("alerts").insert(alertRows);
      if (insertErr) console.error("Alert insert error:", insertErr);

      // Send email notifications for each alert
      const supabaseFunctionsUrl = Deno.env.get("SUPABASE_URL")! + "/functions/v1";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      for (const alert of alerts) {
        try {
          await fetch(`${supabaseFunctionsUrl}/send-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              type: alert.type,
              org_id: alert.org_id,
              payload: alert.payload,
            }),
          });
        } catch (emailErr) {
          console.error("Email notification error:", emailErr);
        }
      }
    }

    return new Response(
      JSON.stringify({ alerts_created: alerts.length, alerts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("check-spikes error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
