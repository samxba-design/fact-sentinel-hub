import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Inline email builder — avoids cross-function dynamic import (unsupported in Supabase Edge Functions)
function buildDigestEmail(
  orgName: string,
  stats: { totalMentions: number; negativePct: number; criticalCount: number; topNarratives: string[]; alertCount: number; escalationCount: number },
  topThreats: any[],
  dashboardUrl: string
): { subject: string; html: string } {
  const subject = `[${orgName}] Intelligence Digest — ${stats.totalMentions} mentions tracked`;
  const negColor = stats.negativePct > 30 ? "#f87171" : stats.negativePct > 15 ? "#fbbf24" : "#34d399";
  const critColor = stats.criticalCount > 0 ? "#f87171" : "#34d399";
  const escColor = stats.escalationCount > 0 ? "#fbbf24" : "#34d399";

  const statRow = (label: string, value: string | number, color?: string) =>
    `<tr><td style="padding:6px 0;font-size:13px;color:#9b97b0;border-bottom:1px solid rgba(255,255,255,0.04);">${label}</td>
     <td style="padding:6px 0;font-size:13px;font-weight:600;color:${color || "#e2e0ea"};text-align:right;border-bottom:1px solid rgba(255,255,255,0.04);">${value}</td></tr>`;

  const threatRows = topThreats.slice(0, 5).map(t => {
    const snippet = (t.content || "No content").slice(0, 120)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const sev = t.severity === "critical" ? "#f87171" : "#fbbf24";
    return `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${sev}22;color:${sev};margin-right:8px;text-transform:uppercase;">${t.severity || "high"}</span>
      <span style="font-size:12px;color:#c4c0d8;">${snippet}${snippet.length < (t.content || "").length ? "…" : ""}</span>
      <br><span style="font-size:10px;color:#6d6a82;">via ${t.source || "unknown"}</span>
      ${t.url ? ` &middot; <a href="${t.url}" style="font-size:10px;color:#818cf8;text-decoration:none;">View &rarr;</a>` : ""}
    </td></tr>`;
  }).join("");

  const narrativeBadges = stats.topNarratives.map(n =>
    `<span style="display:inline-block;margin:3px 4px 3px 0;padding:5px 12px;background:rgba(99,102,241,0.15);border-radius:14px;font-size:11px;color:#a5b4fc;font-weight:500;">${n}</span>`
  ).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#1e2a3a,#0d1117);padding:28px 32px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="font-size:18px;font-weight:700;color:#e2e0ea;">&#128737; SentiWatch</span></td>
              <td align="right"><span style="font-size:11px;color:#6d6a82;background:rgba(99,102,241,0.15);padding:4px 10px;border-radius:8px;border:1px solid rgba(99,102,241,0.2);">Intelligence Digest</span></td>
            </tr>
          </table>
          <p style="margin:12px 0 0;font-size:22px;font-weight:700;color:#fff;">${orgName}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6d6a82;">Generated ${new Date().toUTCString()}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 14px;font-size:11px;color:#6d6a82;text-transform:uppercase;letter-spacing:0.8px;">Summary</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${statRow("Total Mentions", stats.totalMentions.toLocaleString())}
            ${statRow("Negative Sentiment", stats.negativePct + "%", negColor)}
            ${statRow("Critical Detections", stats.criticalCount, critColor)}
            ${statRow("Alerts Triggered", stats.alertCount)}
            ${statRow("Open Escalations", stats.escalationCount, escColor)}
          </table>
        </td></tr>
        ${topThreats.length > 0 ? `
        <tr><td style="padding:0 32px 24px;">
          <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:8px;padding:16px;">
            <p style="margin:0 0 12px;font-size:11px;color:#9b97b0;text-transform:uppercase;letter-spacing:0.5px;">&#9888; Top Threats</p>
            <table width="100%" cellpadding="0" cellspacing="0">${threatRows}</table>
          </div>
        </td></tr>` : ""}
        ${stats.topNarratives.length > 0 ? `
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0 0 10px;font-size:11px;color:#6d6a82;text-transform:uppercase;letter-spacing:0.8px;">Active Narratives</p>
          <div>${narrativeBadges}</div>
        </td></tr>` : ""}
        <tr><td style="padding:0 32px 32px;">
          <a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open Dashboard &rarr;</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.05);">
          <p style="margin:0;font-size:11px;color:#4d4b62;">You're receiving this because you enabled digests for ${orgName}. <a href="${dashboardUrl}/settings?tab=alerts" style="color:#6d6a82;">Manage preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { org_id, recipients, days = 7, preview_only = false } = body;

    if (!org_id) throw new Error("org_id required");

    const { data: org } = await supabase.from("organizations").select("name").eq("id", org_id).maybeSingle();
    if (!org) throw new Error("Organization not found");

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [mentionsRes, alertsRes, escalationsRes, narrativesRes] = await Promise.all([
      supabase.from("mentions").select("id, sentiment_label, severity, source, content, url, posted_at").eq("org_id", org_id).eq("mention_type", "brand").gte("created_at", since).limit(500),
      supabase.from("alerts").select("id").eq("org_id", org_id).gte("triggered_at", since),
      supabase.from("escalations").select("id").eq("org_id", org_id).not("status", "in", '("closed","resolved")'),
      supabase.from("narratives").select("name").eq("org_id", org_id).in("status", ["active", "emerging", "watch"]).order("confidence", { ascending: false }).limit(5),
    ]);

    const mentions = mentionsRes.data || [];
    const totalMentions = mentions.length;
    const negMentions = mentions.filter((m: any) => m.sentiment_label === "negative").length;
    const negativePct = totalMentions > 0 ? Math.round((negMentions / totalMentions) * 100) : 0;
    const criticalCount = mentions.filter((m: any) => m.severity === "critical").length;
    const alertCount = (alertsRes.data || []).length;
    const escalationCount = (escalationsRes.data || []).length;
    const topNarratives = (narrativesRes.data || []).map((n: any) => n.name);
    const topThreats = mentions
      .filter((m: any) => m.severity === "critical" || m.severity === "high")
      .sort((a: any, b: any) => a.severity === "critical" ? -1 : 1)
      .slice(0, 5);

    const dashboardUrl = "https://app.senti.watch";
    const stats = { totalMentions, negativePct, criticalCount, topNarratives, alertCount, escalationCount };
    const { subject, html } = buildDigestEmail(org.name, stats, topThreats, dashboardUrl);

    if (preview_only) {
      return new Response(JSON.stringify({ preview: true, subject, stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!recipients || recipients.length === 0) throw new Error("No recipients provided");

    const results = await Promise.allSettled(
      (recipients as string[]).map((email) =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({ from: "SentiWatch <alerts@senti.watch>", to: [email], subject, html }),
        }).then(r => r.json())
      )
    );

    const sent = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    return new Response(JSON.stringify({ sent, failed, subject, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("send-digest error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
