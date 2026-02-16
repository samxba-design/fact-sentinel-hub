import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BRAND = {
  name: "SentiWatch",
  domain: "senti.watch",
  fromEmail: "alerts@senti.watch",
  fromName: "SentiWatch Alerts",
  primaryColor: "#6366f1",
  bgColor: "#0f0d1a",
  cardBg: "#1a1730",
  textColor: "#e2e0ea",
  mutedColor: "#9b97b0",
};

function emailLayout(title: string, content: string, preferencesUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bgColor};padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <!-- Header -->
  <tr><td style="padding:24px 32px;text-align:center;">
    <div style="display:inline-flex;align-items:center;gap:8px;">
      <span style="font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.5px;">🛡️ ${BRAND.name}</span>
    </div>
  </td></tr>
  <!-- Body -->
  <tr><td style="background:${BRAND.cardBg};border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,0.06);">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#fff;">${title}</h1>
    ${content}
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:24px 32px;text-align:center;">
    <p style="margin:0 0 8px;font-size:12px;color:${BRAND.mutedColor};">
      You're receiving this because you're a member of a SentiWatch organization.
    </p>
    <a href="${preferencesUrl}" style="font-size:12px;color:${BRAND.primaryColor};text-decoration:underline;">
      Manage notification preferences
    </a>
    <p style="margin:8px 0 0;font-size:11px;color:${BRAND.mutedColor};">
      ${BRAND.name} · Reputation Intelligence · <a href="https://${BRAND.domain}" style="color:${BRAND.mutedColor};">senti.watch</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function buildCriticalAlertEmail(alertType: string, message: string, orgName: string, dashboardUrl: string, preferencesUrl: string): { subject: string; html: string } {
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
    <a href="${dashboardUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:${BRAND.primaryColor};color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
      View in Dashboard →
    </a>`;
  return { subject, html: emailLayout(subject, content, preferencesUrl) };
}

export function buildEscalationEmail(escalationTitle: string, priority: string, assigneeName: string, orgName: string, escalationUrl: string, preferencesUrl: string): { subject: string; html: string } {
  const priorityColors: Record<string, string> = {
    critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e",
  };
  const color = priorityColors[priority] || priorityColors.medium;
  const subject = `[${orgName}] Escalation Assigned: ${escalationTitle}`;
  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.textColor};line-height:1.6;">
      You've been assigned an escalation that requires your attention.
    </p>
    <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#fff;">${escalationTitle}</p>
      <p style="margin:0;font-size:12px;color:${BRAND.mutedColor};">
        Priority: <span style="color:${color};font-weight:600;text-transform:uppercase;">${priority}</span>
        &nbsp;·&nbsp; Assigned to: <strong style="color:#fff;">${assigneeName}</strong>
      </p>
    </div>
    <a href="${escalationUrl}" style="display:inline-block;padding:10px 20px;background:${BRAND.primaryColor};color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
      View Escalation →
    </a>`;
  return { subject, html: emailLayout(subject, content, preferencesUrl) };
}

export function buildDigestEmail(orgName: string, stats: {
  totalMentions: number; negativePct: number; criticalCount: number;
  topNarratives: string[]; alertCount: number; escalationCount: number;
}, dashboardUrl: string, preferencesUrl: string): { subject: string; html: string } {
  const subject = `[${orgName}] Weekly Digest — ${stats.totalMentions} mentions tracked`;
  const statRow = (label: string, value: string | number, color?: string) =>
    `<tr><td style="padding:8px 0;font-size:13px;color:${BRAND.mutedColor};border-bottom:1px solid rgba(255,255,255,0.04);">${label}</td>
     <td style="padding:8px 0;font-size:13px;color:${color || '#fff'};font-weight:600;text-align:right;border-bottom:1px solid rgba(255,255,255,0.04);">${value}</td></tr>`;
  
  const content = `
    <p style="margin:0 0 20px;font-size:14px;color:${BRAND.textColor};line-height:1.6;">
      Here's your weekly reputation intelligence summary for <strong style="color:#fff;">${orgName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${statRow("Total Mentions", stats.totalMentions)}
      ${statRow("Negative Sentiment", `${stats.negativePct}%`, stats.negativePct > 30 ? "#ef4444" : "#22c55e")}
      ${statRow("Critical Detections", stats.criticalCount, stats.criticalCount > 0 ? "#ef4444" : "#22c55e")}
      ${statRow("Alerts Triggered", stats.alertCount)}
      ${statRow("Open Escalations", stats.escalationCount, stats.escalationCount > 0 ? "#f97316" : "#22c55e")}
    </table>
    ${stats.topNarratives.length > 0 ? `
    <div style="margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:12px;color:${BRAND.mutedColor};text-transform:uppercase;letter-spacing:0.5px;">Top Narratives</p>
      ${stats.topNarratives.map(n => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:4px 10px;background:rgba(99,102,241,0.15);border-radius:12px;font-size:11px;color:${BRAND.primaryColor};">${n}</span>`).join("")}
    </div>` : ""}
    <a href="${dashboardUrl}" style="display:inline-block;padding:10px 20px;background:${BRAND.primaryColor};color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
      Open Dashboard →
    </a>`;
  return { subject, html: emailLayout(subject, content, preferencesUrl) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const { to, subject, html, from } = await req.json();
    if (!to || !subject || !html) throw new Error("Missing required fields: to, subject, html");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: from || `${BRAND.fromName} <${BRAND.fromEmail}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.message || JSON.stringify(result));

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
