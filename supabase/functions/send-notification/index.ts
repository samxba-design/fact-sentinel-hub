import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://senti.watch";
const BRAND = {
  name: "SentiWatch",
  domain: "senti.watch",
  fromEmail: "alerts@senti.watch",
  primaryColor: "#6366f1",
  bgColor: "#0f0d1a",
  cardBg: "#1a1730",
  textColor: "#e2e0ea",
  mutedColor: "#9b97b0",
};

function emailLayout(title: string, content: string, preferencesUrl: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bgColor};padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="padding:24px 32px;text-align:center;">
    <span style="font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.5px;">🛡️ ${BRAND.name}</span>
  </td></tr>
  <tr><td style="background:${BRAND.cardBg};border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,0.06);">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#fff;">${title}</h1>
    ${content}
  </td></tr>
  <tr><td style="padding:24px 32px;text-align:center;">
    <p style="margin:0 0 8px;font-size:12px;color:${BRAND.mutedColor};">You're receiving this because you're a member of a SentiWatch organization.</p>
    <a href="${preferencesUrl}" style="font-size:12px;color:${BRAND.primaryColor};text-decoration:underline;">Manage notification preferences</a>
    <p style="margin:8px 0 0;font-size:11px;color:${BRAND.mutedColor};">${BRAND.name} · Reputation Intelligence</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function buildAlertEmail(alertType: string, message: string, orgName: string, dashboardUrl: string, preferencesUrl: string) {
  const typeLabels: Record<string, string> = {
    mention_spike: "📈 Mention Spike Detected",
    negative_spike: "⚠️ Negative Sentiment Surge",
    critical_mention: "🚨 Critical Mention Detected",
    viral_risk: "🔥 Viral Risk Alert",
  };
  const subject = `[${orgName}] ${typeLabels[alertType] || "Alert"}: ${message.slice(0, 80)}`;
  const content = `
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;color:#fca5a5;font-weight:500;">${typeLabels[alertType] || alertType}</p>
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.textColor};line-height:1.6;">${message}</p>
    <p style="margin:0 0 8px;font-size:12px;color:${BRAND.mutedColor};">Organization: <strong style="color:#fff;">${orgName}</strong></p>
    <a href="${dashboardUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:${BRAND.primaryColor};color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">View in Dashboard →</a>`;
  return { subject, html: emailLayout(subject, content, preferencesUrl) };
}

function buildEscalationEmail(title: string, priority: string, assigneeName: string, orgName: string, preferencesUrl: string) {
  const colors: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };
  const subject = `[${orgName}] Escalation Assigned: ${title}`;
  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.textColor};line-height:1.6;">You've been assigned an escalation that requires your attention.</p>
    <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#fff;">${title}</p>
      <p style="margin:0;font-size:12px;color:${BRAND.mutedColor};">Priority: <span style="color:${colors[priority] || colors.medium};font-weight:600;text-transform:uppercase;">${priority}</span> · Assigned to: <strong style="color:#fff;">${assigneeName}</strong></p>
    </div>
    <a href="${APP_URL}/escalations" style="display:inline-block;padding:10px 20px;background:${BRAND.primaryColor};color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">View Escalation →</a>`;
  return { subject, html: emailLayout(subject, content, preferencesUrl) };
}

function buildContactNotificationEmail(name: string, email: string, company: string, message: string) {
  const subject = `New Contact Inquiry from ${name}`;
  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.textColor};line-height:1.6;">A new inquiry was submitted via the contact form.</p>
    <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0 0 6px;font-size:13px;color:${BRAND.mutedColor};">Name: <strong style="color:#fff;">${name}</strong></p>
      <p style="margin:0 0 6px;font-size:13px;color:${BRAND.mutedColor};">Email: <strong style="color:#fff;">${email}</strong></p>
      ${company ? `<p style="margin:0 0 6px;font-size:13px;color:${BRAND.mutedColor};">Company: <strong style="color:#fff;">${company}</strong></p>` : ""}
      <p style="margin:12px 0 0;font-size:14px;color:${BRAND.textColor};line-height:1.6;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;">${message}</p>
    </div>
    <a href="mailto:${email}" style="display:inline-block;padding:10px 20px;background:${BRAND.primaryColor};color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">Reply to ${name} →</a>`;
  return { subject, html: emailLayout(subject, content, `${APP_URL}/settings?tab=notifications`) };
}

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
      const { subject, html } = buildContactNotificationEmail(name, email, company || "", message);

      // Send to admin
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

    // --- Alert / escalation notifications (org-based) ---
    const { org_id, payload } = body;
    if (!type || !org_id) throw new Error("Missing type or org_id");

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
    };

    const prefField = prefFieldMap[type];
    const preferencesUrl = `${APP_URL}/settings?tab=notifications`;
    const dashboardUrl = `${APP_URL}/`;

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
          preferencesUrl
        );
        subject = result.subject;
        html = result.html;
      } else {
        const result = buildAlertEmail(
          type,
          payload.message || `A ${type.replace(/_/g, " ")} has been detected.`,
          orgName,
          dashboardUrl,
          preferencesUrl
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
