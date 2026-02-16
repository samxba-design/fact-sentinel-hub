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

    const { type, org_id, payload } = await req.json();
    if (!type || !org_id) throw new Error("Missing type or org_id");

    // Get org name
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", org_id)
      .single();
    const orgName = org?.name || "Your Organization";

    // Get org members with their notification preferences and emails
    const { data: members } = await supabase
      .from("org_memberships")
      .select("user_id")
      .eq("org_id", org_id)
      .not("accepted_at", "is", null);

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no members" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = members.map((m: any) => m.user_id);

    // Get preferences for all members
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("org_id", org_id)
      .in("user_id", userIds);

    // Get profiles for emails
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    const prefsMap = new Map((prefs || []).map((p: any) => [p.user_id, p]));
    const profilesMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    // Determine which preference field to check
    const prefFieldMap: Record<string, string> = {
      mention_spike: "mention_spikes",
      negative_spike: "negative_spikes",
      critical_mention: "critical_alerts",
      viral_risk: "viral_risk",
      escalation_assigned: "escalation_assigned",
      escalation_updated: "escalation_updated",
      scan_complete: "new_scan_complete",
    };

    const prefField = prefFieldMap[type];
    const preferencesUrl = `${APP_URL}/settings?tab=notifications`;
    const dashboardUrl = `${APP_URL}/`;

    let sentCount = 0;

    for (const userId of userIds) {
      const profile = profilesMap.get(userId);
      if (!profile?.email) continue;

      const userPrefs = prefsMap.get(userId);
      // Default to enabled if no preferences set
      const emailEnabled = userPrefs ? userPrefs.email_enabled : true;
      const typeEnabled = userPrefs && prefField ? userPrefs[prefField] : true;

      if (!emailEnabled || !typeEnabled) continue;

      let subject = "";
      let html = "";

      if (type === "escalation_assigned") {
        const { buildEscalationEmail } = await import("../send-email/index.ts");
        const result = buildEscalationEmail(
          payload.title || "Untitled Escalation",
          payload.priority || "medium",
          profile.full_name || profile.email,
          orgName,
          `${APP_URL}/escalations`,
          preferencesUrl
        );
        subject = result.subject;
        html = result.html;
      } else {
        // Critical alert types
        const { buildCriticalAlertEmail } = await import("../send-email/index.ts");
        const result = buildCriticalAlertEmail(
          type,
          payload.message || `A ${type.replace(/_/g, " ")} has been detected.`,
          orgName,
          dashboardUrl,
          preferencesUrl
        );
        subject = result.subject;
        html = result.html;
      }

      // Send via Resend
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: `SentiWatch Alerts <alerts@senti.watch>`,
          to: [profile.email],
          subject,
          html,
        }),
      });

      const result = await res.json();

      // Log the email
      await supabase.from("email_logs").insert({
        org_id,
        recipient_email: profile.email,
        email_type: type,
        subject,
        resend_id: result.id || null,
        status: res.ok ? "sent" : "failed",
        metadata: { payload, error: res.ok ? null : result },
      });

      if (res.ok) sentCount++;
    }

    return new Response(
      JSON.stringify({ sent: sentCount, total_members: userIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-notification error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
