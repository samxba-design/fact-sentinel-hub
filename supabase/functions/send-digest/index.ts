import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // -- Org info
    const { data: org } = await supabase
      .from("organizations")
      .select("name, slug")
      .eq("id", org_id)
      .maybeSingle();
    if (!org) throw new Error("Organization not found");

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // -- Stats in parallel
    const [mentionsRes, alertsRes, escalationsRes, narrativesRes] = await Promise.all([
      supabase.from("mentions")
        .select("id, sentiment_label, severity, source, content, url, posted_at")
        .eq("org_id", org_id).eq("mention_type", "brand")
        .gte("created_at", since).limit(500),
      supabase.from("alerts")
        .select("id, type, status")
        .eq("org_id", org_id)
        .gte("triggered_at", since),
      supabase.from("escalations")
        .select("id, status")
        .eq("org_id", org_id)
        .not("status", "in", '("closed","resolved")'),
      supabase.from("narratives")
        .select("name, status, confidence")
        .eq("org_id", org_id)
        .in("status", ["active", "emerging", "watch"])
        .order("confidence", { ascending: false })
        .limit(5),
    ]);

    const mentions = mentionsRes.data || [];
    const totalMentions = mentions.length;
    const negMentions = mentions.filter((m: any) => m.sentiment_label === "negative").length;
    const negativePct = totalMentions > 0 ? Math.round((negMentions / totalMentions) * 100) : 0;
    const criticalCount = mentions.filter((m: any) => m.severity === "critical").length;
    const alertCount = (alertsRes.data || []).length;
    const escalationCount = (escalationsRes.data || []).length;
    const topNarratives = (narrativesRes.data || []).map((n: any) => n.name);

    // -- Top threats
    const topThreats = mentions
      .filter((m: any) => m.severity === "critical" || m.severity === "high")
      .sort((a: any, b: any) => (a.severity === "critical" ? -1 : 1))
      .slice(0, 5);

    // -- Source breakdown
    const srcMap: Record<string, number> = {};
    mentions.forEach((m: any) => { srcMap[m.source] = (srcMap[m.source] || 0) + 1; });
    const topSources = Object.entries(srcMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([src, count]) => `${src} (${count})`);

    const dashboardUrl = `https://app.senti.watch`;
    const preferencesUrl = `https://app.senti.watch/settings?tab=alerts`;

    const { buildDigestEmail } = await import("../send-email/index.ts");
    const { subject, html } = buildDigestEmail(
      org.name,
      { totalMentions, negativePct, criticalCount, topNarratives, alertCount, escalationCount },
      dashboardUrl, preferencesUrl, "dark"
    );

    // Inject threat section before closing body tag
    let enrichedHtml = html;
    if (topThreats.length > 0) {
      const threatRows = topThreats.map((t: any) => {
        const snippet = (t.content || "").slice(0, 120)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const sev = t.severity === "critical" ? "#f87171" : "#fbbf24";
        return `<tr>
          <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${sev}22;color:${sev};margin-right:8px;">${(t.severity || "").toUpperCase()}</span>
            <span style="font-size:12px;color:#e2e0ea;">${snippet}${snippet.length < (t.content || "").length ? "\u2026" : ""}</span>
            ${t.url ? `<br><a href="${t.url}" style="font-size:10px;color:#818cf8;text-decoration:none;">View source \u2192</a>` : ""}
          </td>
        </tr>`;
      }).join("");

      const threatSection = `
        <table width="580" cellpadding="0" cellspacing="0" align="center" style="margin:16px auto;padding:16px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:8px;">
          <tr><td>
            <p style="margin:0 0 12px;font-size:11px;color:#9b97b0;text-transform:uppercase;letter-spacing:0.5px;">\u26a0 Top Threats This Period</p>
            <table width="100%" cellpadding="0" cellspacing="0">${threatRows}</table>
          </td></tr>
        </table>`;
      enrichedHtml = enrichedHtml.replace("</body>", `${threatSection}</body>`);
    }

    if (preview_only) {
      return new Response(JSON.stringify({
        preview: true, subject,
        stats: { totalMentions, negativePct, criticalCount, alertCount, escalationCount, topNarratives, topSources },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!recipients || recipients.length === 0) throw new Error("No recipients provided");

    const results = await Promise.allSettled(
      recipients.map((email: string) =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({ from: "SentiWatch <alerts@senti.watch>", to: [email], subject, html: enrichedHtml }),
        }).then(r => r.json())
      )
    );

    const sent = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    return new Response(JSON.stringify({
      sent, failed, subject,
      stats: { totalMentions, negativePct, criticalCount, alertCount, escalationCount, topNarratives },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("send-digest error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
