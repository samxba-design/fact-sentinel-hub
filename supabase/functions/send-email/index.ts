import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════
// Theme-Aware Email Design System
// ═══════════════════════════════════════════════════════════

type EmailTheme = "dark" | "light";

interface ThemeColors {
  bg: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  textBold: string;
  muted: string;
  primary: string;
  primaryText: string;
  success: string;
  warning: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  dangerText: string;
  subtleBg: string;
  subtleBorder: string;
  divider: string;
  badgeBg: string;
  badgeText: string;
  footerText: string;
}

const themes: Record<EmailTheme, ThemeColors> = {
  dark: {
    bg: "#0f0d1a",
    cardBg: "#1a1730",
    cardBorder: "rgba(255,255,255,0.06)",
    text: "#e2e0ea",
    textBold: "#ffffff",
    muted: "#9b97b0",
    primary: "#818cf8",
    primaryText: "#ffffff",
    success: "#34d399",
    warning: "#fbbf24",
    danger: "#f87171",
    dangerBg: "rgba(239,68,68,0.08)",
    dangerBorder: "rgba(239,68,68,0.2)",
    dangerText: "#fca5a5",
    subtleBg: "rgba(255,255,255,0.03)",
    subtleBorder: "rgba(255,255,255,0.06)",
    divider: "rgba(255,255,255,0.04)",
    badgeBg: "rgba(129,140,248,0.15)",
    badgeText: "#818cf8",
    footerText: "#6b6784",
  },
  light: {
    bg: "#f8f9fc",
    cardBg: "#ffffff",
    cardBorder: "#e5e7eb",
    text: "#374151",
    textBold: "#111827",
    muted: "#6b7280",
    primary: "#6366f1",
    primaryText: "#ffffff",
    success: "#059669",
    warning: "#d97706",
    danger: "#dc2626",
    dangerBg: "#fef2f2",
    dangerBorder: "#fecaca",
    dangerText: "#991b1b",
    subtleBg: "#f9fafb",
    subtleBorder: "#e5e7eb",
    divider: "#f3f4f6",
    badgeBg: "#eef2ff",
    badgeText: "#4f46e5",
    footerText: "#9ca3af",
  },
};

const BRAND = {
  name: "SentiWatch",
  domain: "senti.watch",
  fromEmail: "alerts@senti.watch",
  fromName: "SentiWatch Alerts",
};

function emailLayout(title: string, content: string, preferencesUrl: string, theme: EmailTheme = "dark"): string {
  const c = themes[theme];
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:${c.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <!-- Header -->
  <tr><td style="padding:24px 32px;text-align:center;">
    <span style="font-size:24px;font-weight:700;color:${c.textBold};letter-spacing:-0.5px;">🛡️ ${BRAND.name}</span>
  </td></tr>
  <!-- Body -->
  <tr><td style="background:${c.cardBg};border-radius:16px;padding:32px;border:1px solid ${c.cardBorder};${theme === "light" ? "box-shadow:0 1px 3px rgba(0,0,0,0.08);" : ""}">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:${c.textBold};">${title}</h1>
    ${content}
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:24px 32px;text-align:center;">
    <p style="margin:0 0 8px;font-size:12px;color:${c.footerText};">
      You're receiving this because you're a member of a SentiWatch organization.
    </p>
    <a href="${preferencesUrl}" style="font-size:12px;color:${c.primary};text-decoration:underline;">
      Manage notification preferences
    </a>
    <p style="margin:8px 0 0;font-size:11px;color:${c.footerText};">
      ${BRAND.name} · Reputation Intelligence · <a href="https://${BRAND.domain}" style="color:${c.footerText};">senti.watch</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function button(text: string, url: string, c: ThemeColors): string {
  return `<a href="${url}" style="display:inline-block;padding:12px 24px;background:${c.primary};color:${c.primaryText};text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:0.2px;">${text}</a>`;
}

function statRow(label: string, value: string | number, c: ThemeColors, color?: string): string {
  return `<tr>
    <td style="padding:10px 0;font-size:13px;color:${c.muted};border-bottom:1px solid ${c.divider};">${label}</td>
    <td style="padding:10px 0;font-size:14px;color:${color || c.textBold};font-weight:600;text-align:right;border-bottom:1px solid ${c.divider};">${value}</td>
  </tr>`;
}

// ═══════════════════════════════════════════════════════════
// Email Builders (all theme-aware)
// ═══════════════════════════════════════════════════════════

export function buildCriticalAlertEmail(
  alertType: string, message: string, orgName: string,
  dashboardUrl: string, preferencesUrl: string, theme: EmailTheme = "dark"
): { subject: string; html: string } {
  const c = themes[theme];
  const typeLabels: Record<string, string> = {
    mention_spike: "📈 Mention Spike Detected",
    negative_spike: "⚠️ Negative Sentiment Surge",
    critical_mention: "🚨 Critical Mention Detected",
    viral_risk: "🔥 Viral Risk Alert",
  };
  const subject = `[${orgName}] ${typeLabels[alertType] || "Alert"}: ${message.slice(0, 80)}`;
  const content = `
    <div style="background:${c.dangerBg};border:1px solid ${c.dangerBorder};border-radius:10px;padding:16px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;color:${c.dangerText};font-weight:600;">${typeLabels[alertType] || alertType}</p>
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:${c.text};line-height:1.7;">${message}</p>
    <p style="margin:0 0 20px;font-size:12px;color:${c.muted};">Organization: <strong style="color:${c.textBold};">${orgName}</strong></p>
    ${button("View in Dashboard →", dashboardUrl, c)}`;
  return { subject, html: emailLayout(subject, content, preferencesUrl, theme) };
}

export function buildEscalationEmail(
  escalationTitle: string, priority: string, assigneeName: string,
  orgName: string, escalationUrl: string, preferencesUrl: string, theme: EmailTheme = "dark"
): { subject: string; html: string } {
  const c = themes[theme];
  const priorityColors: Record<string, string> = {
    critical: c.danger, high: c.warning, medium: "#eab308", low: c.success,
  };
  const color = priorityColors[priority] || priorityColors.medium;
  const subject = `[${orgName}] Escalation Assigned: ${escalationTitle}`;
  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:${c.text};line-height:1.7;">
      You've been assigned an escalation that requires your attention.
    </p>
    <div style="background:${c.subtleBg};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${c.subtleBorder};">
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:${c.textBold};">${escalationTitle}</p>
      <p style="margin:0;font-size:12px;color:${c.muted};">
        Priority: <span style="color:${color};font-weight:600;text-transform:uppercase;">${priority}</span>
        &nbsp;·&nbsp; Assigned to: <strong style="color:${c.textBold};">${assigneeName}</strong>
      </p>
    </div>
    ${button("View Escalation →", escalationUrl, c)}`;
  return { subject, html: emailLayout(subject, content, preferencesUrl, theme) };
}

export function buildDigestEmail(
  orgName: string,
  stats: {
    totalMentions: number; negativePct: number; criticalCount: number;
    topNarratives: string[]; alertCount: number; escalationCount: number;
  },
  dashboardUrl: string, preferencesUrl: string, theme: EmailTheme = "dark"
): { subject: string; html: string } {
  const c = themes[theme];
  const subject = `[${orgName}] Weekly Digest — ${stats.totalMentions} mentions tracked`;

  // Sentiment gauge bar
  const negColor = stats.negativePct > 30 ? c.danger : stats.negativePct > 15 ? c.warning : c.success;
  const gaugeBar = `
    <div style="margin:0 0 20px;">
      <p style="margin:0 0 6px;font-size:11px;color:${c.muted};text-transform:uppercase;letter-spacing:0.5px;">Sentiment Health</p>
      <div style="background:${c.subtleBg};border-radius:6px;height:8px;overflow:hidden;border:1px solid ${c.subtleBorder};">
        <div style="height:100%;width:${Math.min(100, stats.negativePct * 2)}%;background:linear-gradient(90deg,${c.success},${negColor});border-radius:6px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;">
        <span style="font-size:10px;color:${c.muted};">Healthy</span>
        <span style="font-size:10px;color:${negColor};font-weight:600;">${stats.negativePct}% negative</span>
        <span style="font-size:10px;color:${c.muted};">At Risk</span>
      </div>
    </div>`;

  const content = `
    <p style="margin:0 0 20px;font-size:14px;color:${c.text};line-height:1.7;">
      Here's your weekly reputation intelligence summary for <strong style="color:${c.textBold};">${orgName}</strong>.
    </p>
    ${gaugeBar}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${statRow("Total Mentions", stats.totalMentions.toLocaleString(), c)}
      ${statRow("Negative Sentiment", `${stats.negativePct}%`, c, stats.negativePct > 30 ? c.danger : c.success)}
      ${statRow("Critical Detections", stats.criticalCount, c, stats.criticalCount > 0 ? c.danger : c.success)}
      ${statRow("Alerts Triggered", stats.alertCount, c)}
      ${statRow("Open Escalations", stats.escalationCount, c, stats.escalationCount > 0 ? c.warning : c.success)}
    </table>
    ${stats.topNarratives.length > 0 ? `
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:11px;color:${c.muted};text-transform:uppercase;letter-spacing:0.5px;">Active Narratives</p>
      ${stats.topNarratives.map(n => `<span style="display:inline-block;margin:3px 4px 3px 0;padding:5px 12px;background:${c.badgeBg};border-radius:14px;font-size:11px;color:${c.badgeText};font-weight:500;">${n}</span>`).join("")}
    </div>` : ""}
    ${button("Open Dashboard →", dashboardUrl, c)}`;
  return { subject, html: emailLayout(subject, content, preferencesUrl, theme) };
}

export function buildContactNotificationEmail(
  name: string, email: string, company: string, message: string, theme: EmailTheme = "dark"
): { subject: string; html: string } {
  const c = themes[theme];
  const subject = `New Contact Inquiry from ${name}`;
  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:${c.text};line-height:1.7;">A new inquiry was submitted via the contact form.</p>
    <div style="background:${c.subtleBg};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${c.subtleBorder};">
      <p style="margin:0 0 6px;font-size:13px;color:${c.muted};">Name: <strong style="color:${c.textBold};">${name}</strong></p>
      <p style="margin:0 0 6px;font-size:13px;color:${c.muted};">Email: <strong style="color:${c.textBold};">${email}</strong></p>
      ${company ? `<p style="margin:0 0 6px;font-size:13px;color:${c.muted};">Company: <strong style="color:${c.textBold};">${company}</strong></p>` : ""}
      <p style="margin:12px 0 0;font-size:14px;color:${c.text};line-height:1.7;border-top:1px solid ${c.divider};padding-top:12px;">${message}</p>
    </div>
    ${button(`Reply to ${name} →`, `mailto:${email}`, c)}`;
  return { subject, html: emailLayout(subject, content, `https://senti.watch/settings?tab=notifications`, theme) };
}

// ═══════════════════════════════════════════════════════════
// Edge Function Handler
// ═══════════════════════════════════════════════════════════

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
