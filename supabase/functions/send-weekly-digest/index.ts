import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://senti.watch";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get all organizations
    const { data: orgs } = await supabase.from("organizations").select("id, name");
    if (!orgs || orgs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no orgs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;

    for (const org of orgs) {
      // Gather weekly stats
      const [mentionsRes, negRes, critRes, alertsRes, escRes, narrativesRes] = await Promise.all([
        supabase.from("mentions").select("id", { count: "exact", head: true })
          .eq("org_id", org.id).gte("created_at", oneWeekAgo),
        supabase.from("mentions").select("id", { count: "exact", head: true })
          .eq("org_id", org.id).eq("sentiment_label", "negative").gte("created_at", oneWeekAgo),
        supabase.from("mentions").select("id", { count: "exact", head: true })
          .eq("org_id", org.id).eq("severity", "critical").gte("created_at", oneWeekAgo),
        supabase.from("alerts").select("id", { count: "exact", head: true })
          .eq("org_id", org.id).gte("triggered_at", oneWeekAgo),
        supabase.from("escalations").select("id", { count: "exact", head: true })
          .eq("org_id", org.id).in("status", ["open", "in_progress"]),
        supabase.from("narratives").select("name")
          .eq("org_id", org.id).eq("status", "active").order("updated_at", { ascending: false }).limit(5),
      ]);

      const totalMentions = mentionsRes.count ?? 0;
      const negCount = negRes.count ?? 0;
      const negativePct = totalMentions > 0 ? Math.round((negCount / totalMentions) * 100) : 0;

      const stats = {
        totalMentions,
        negativePct,
        criticalCount: critRes.count ?? 0,
        topNarratives: (narrativesRes.data || []).map((n: any) => n.name),
        alertCount: alertsRes.count ?? 0,
        escalationCount: escRes.count ?? 0,
      };

      // Skip digest if nothing happened
      if (totalMentions === 0 && stats.alertCount === 0 && stats.escalationCount === 0) continue;

      // Get members who want digests
      const { data: members } = await supabase
        .from("org_memberships")
        .select("user_id")
        .eq("org_id", org.id)
        .not("accepted_at", "is", null);

      if (!members || members.length === 0) continue;

      const userIds = members.map((m: any) => m.user_id);

      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("user_id, weekly_digest, email_enabled")
        .eq("org_id", org.id)
        .in("user_id", userIds);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      const prefsMap = new Map((prefs || []).map((p: any) => [p.user_id, p]));
      const profilesMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const { buildDigestEmail } = await import("../send-email/index.ts");
      const preferencesUrl = `${APP_URL}/settings?tab=notifications`;
      const dashboardUrl = `${APP_URL}/`;

      for (const userId of userIds) {
        const profile = profilesMap.get(userId);
        if (!profile?.email) continue;

        const userPrefs = prefsMap.get(userId);
        const emailEnabled = userPrefs ? userPrefs.email_enabled : true;
        const digestEnabled = userPrefs ? userPrefs.weekly_digest : true;

        if (!emailEnabled || !digestEnabled) continue;

        const { subject, html } = buildDigestEmail(org.name, stats, dashboardUrl, preferencesUrl);

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: `SentiWatch <digest@senti.watch>`,
            to: [profile.email],
            subject,
            html,
          }),
        });

        const result = await res.json();

        await supabase.from("email_logs").insert({
          org_id: org.id,
          recipient_email: profile.email,
          email_type: "weekly_digest",
          subject,
          resend_id: result.id || null,
          status: res.ok ? "sent" : "failed",
          metadata: { stats },
        });

        if (res.ok) totalSent++;
      }
    }

    return new Response(
      JSON.stringify({ sent: totalSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-weekly-digest error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
