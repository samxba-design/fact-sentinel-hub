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
    const body = await req.json();
    const { type } = body;

    // --- Contact inquiry (no auth needed) ---
    if (type === "contact_inquiry") {
      const { name, email, company, message } = body;
      const { buildContactNotificationEmail } = await import("../send-email/index.ts");
      const { subject, html } = buildContactNotificationEmail(name, email, company || "", message, "dark");

      const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "admin@senti.watch";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: `SentiWatch <notifications@senti.watch>`,
          to: [adminEmail],
          reply_to: email,
          subject,
          html,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || JSON.stringify(result));

      return new Response(JSON.stringify({ success: true, id: result.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Alert / escalation notifications (org-based, requires auth) ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerUserId = claimsData.claims.sub;

    const { org_id, payload } = body;
    if (!type || !org_id) throw new Error("Missing type or org_id");

    // Verify caller is a member of the target org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("id")
      .eq("user_id", callerUserId)
      .eq("org_id", org_id)
      .not("accepted_at", "is", null)
      .limit(1);

    if (!membership || membership.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden: not a member of this org" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: org } = await supabase.from("organizations").select("name").eq("id", org_id).single();
    const orgName = org?.name || "Your Organization";

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

    const [{ data: prefs }, { data: profiles }] = await Promise.all([
      supabase.from("notification_preferences").select("*").eq("org_id", org_id).in("user_id", userIds),
      supabase.from("profiles").select("id, email, full_name").in("id", userIds),
    ]);

    const prefsMap = new Map((prefs || []).map((p: any) => [p.user_id, p]));
    const profilesMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const prefFieldMap: Record<string, string> = {
      mention_spike: "mention_spikes",
      negative_spike: "negative_spikes",
      critical_mention: "critical_alerts",
      viral_risk: "viral_risk",
      escalation_assigned: "escalation_assigned",
      escalation_updated: "escalation_updated",
      scan_complete: "new_scan_complete",
      watchlist_person_mention: "critical_alerts", // uses same pref gate as critical alerts
    };

    const prefField = prefFieldMap[type];
    const preferencesUrl = `${APP_URL}/settings?tab=notifications`;
    const dashboardUrl = `${APP_URL}/`;

    const { buildCriticalAlertEmail, buildEscalationEmail } = await import("../send-email/index.ts");

    // Determine theme from payload or default to dark
    const emailTheme = payload?.theme === "light" ? "light" : "dark";

    let sentCount = 0;

    for (const userId of userIds) {
      const profile = profilesMap.get(userId);
      if (!profile?.email) continue;

      const userPrefs = prefsMap.get(userId);
      const emailEnabled = userPrefs ? userPrefs.email_enabled : true;
      const typeEnabled = userPrefs && prefField ? userPrefs[prefField] : true;
      if (!emailEnabled || !typeEnabled) continue;

      let subject = "";
      let html = "";

      if (type === "escalation_assigned") {
        const result = buildEscalationEmail(
          payload.title || "Untitled Escalation",
          payload.priority || "medium",
          profile.full_name || profile.email,
          orgName,
          `${APP_URL}/escalations`,
          preferencesUrl,
          emailTheme
        );
        subject = result.subject;
        html = result.html;
      } else if (type === "watchlist_person_mention") {
        const personName = payload.person_name || "A tracked person";
        const count = payload.new_mentions || 1;
        const result = buildCriticalAlertEmail(
          "Watchlist Alert",
          `${personName} has ${count} new mention${count !== 1 ? "s" : ""} in the last 24 hours. Review their activity.`,
          orgName,
          `${APP_URL}/people`,
          preferencesUrl,
          emailTheme
        );
        subject = result.subject;
        html = result.html;
      } else {
        const result = buildCriticalAlertEmail(
          type,
          payload.message || `A ${type.replace(/_/g, " ")} has been detected.`,
          orgName,
          dashboardUrl,
          preferencesUrl,
          emailTheme
        );
        subject = result.subject;
        html = result.html;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: `SentiWatch Alerts <alerts@senti.watch>`,
          to: [profile.email],
          subject,
          html,
        }),
      });

      const result = await res.json();
      console.log(`Email to ${profile.email}: ${res.ok ? "sent" : "failed"}`, result);

      await supabase.from("email_logs").insert({
        org_id,
        recipient_email: profile.email,
        email_type: type,
        subject,
        resend_id: result.id || null,
        status: res.ok ? "sent" : "failed",
        metadata: { payload, theme: emailTheme, error: res.ok ? null : result },
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
