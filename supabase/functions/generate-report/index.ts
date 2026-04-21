import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_KEY = Deno.env.get("GOOGLE_API_KEY") ?? "";
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

async function aiChat(messages: Array<{role: string; content: string}>, jsonMode = false): Promise<string> {
  if (GEMINI_KEY) {
    try {
      const prompt = messages.map(m => `${m.role === "system" ? "Instructions" : "User"}: ${m.content}`).join("\n\n");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              ...(jsonMode ? { responseMimeType: "application/json" } : {}),
            },
          }),
        }
      );
      if (res.ok) {
        const d = await res.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text) return text;
      }
    } catch (_) {}
  }
  throw new Error("Gemini call failed. Ensure GOOGLE_API_KEY is set and valid in Supabase Edge Function secrets.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? "";
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { org_id, report_type, sections, days = 7 } = await req.json();
    if (!org_id) throw new Error("Missing org_id");

    // Verify org membership
    const { data: isMember } = await supabase.rpc("is_org_member", { _user_id: userId, _org_id: org_id });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const rangeAgo = new Date(now.getTime() - days * 86400000).toISOString();

    const allSections = sections || ["overview", "sentiment", "narratives", "competitors", "incidents", "escalations", "risks"];
    
    const [orgRes, mentionsRes, narrativesRes, incidentsRes, escalationsRes, competitorKwRes] = await Promise.all([
      supabase.from("organizations").select("name, domain, industry").eq("id", org_id).single(),
      supabase.from("mentions").select("id, sentiment_label, severity, source, posted_at, content, author_name").eq("org_id", org_id).gte("posted_at", rangeAgo).order("posted_at", { ascending: false }).limit(500),
      supabase.from("narratives").select("id, name, description, status, confidence").eq("org_id", org_id).order("last_seen", { ascending: false }).limit(20),
      supabase.from("incidents").select("id, name, status, description, started_at").eq("org_id", org_id).order("created_at", { ascending: false }).limit(10),
      supabase.from("escalations").select("id, title, status, priority, department").eq("org_id", org_id).order("created_at", { ascending: false }).limit(10),
      supabase.from("keywords").select("value").eq("org_id", org_id).eq("type", "competitor"),
    ]);

    const org = orgRes.data;
    if (!org) throw new Error("Organization not found");
    
    const mentions = mentionsRes.data || [];
    const narratives = narrativesRes.data || [];
    const incidents = incidentsRes.data || [];
    const escalations = escalationsRes.data || [];
    const competitors = (competitorKwRes.data || []).map(k => k.value);

    const totalMentions = mentions.length;
    const sentimentCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    const severityCounts: Record<string, number> = {};
    
    mentions.forEach(m => {
      const s = m.sentiment_label || "neutral";
      sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
      const src = m.source || "unknown";
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      const sev = m.severity || "normal";
      severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    });

    const negPct = totalMentions > 0 ? Math.round((sentimentCounts["negative"] || 0) / totalMentions * 100) : 0;
    const emergencies = severityCounts["critical"] || 0;
    const riskScore = Math.min(100, Math.round(negPct + emergencies * 10));

    const reportTitles: Record<string, string> = {
      executive: "Executive Summary",
      competitor: "Competitor Intelligence Report", 
      incident: "Incident & Crisis Report",
      weekly: "Weekly Digest Report",
      full: "Full Overview Report",
      custom: "Custom Report",
    };

    const reportTitle = reportTitles[report_type] || reportTitles.full;

    const aiPrompt = `Generate a professional ${reportTitle} for ${org.name}.

Period: Last ${days} days
Total Mentions: ${totalMentions}
Sentiment: ${JSON.stringify(sentimentCounts)}
Sources: ${JSON.stringify(sourceCounts)}
Risk Score: ${riskScore}/100
Emergencies: ${emergencies}
Active Narratives: ${narratives.filter(n => n.status === "active").length}
Active Incidents: ${incidents.filter(i => i.status === "active").length}
Open Escalations: ${escalations.filter(e => e.status !== "resolved").length}
Competitors tracked: ${competitors.join(", ") || "None"}

Top narratives: ${narratives.slice(0, 5).map(n => `${n.name} (${n.status}, ${n.confidence}% confidence)`).join("; ")}

Report sections to include: ${allSections.join(", ")}

Generate the report content with these sections. Use markdown formatting with headers. Be data-driven and professional. Include actionable recommendations.`;

    const reportContent = await aiChat([
      { role: "system", content: "You are a professional analyst writing branded intelligence reports. Write in clear, executive-friendly language. Use markdown with proper headers (##), bullet points, and bold text. Be concise but thorough." },
      { role: "user", content: aiPrompt },
    ]);

    return new Response(JSON.stringify({
      title: reportTitle,
      org_name: org.name,
      period_days: days,
      generated_at: now.toISOString(),
      stats: {
        total_mentions: totalMentions,
        sentiment: sentimentCounts,
        sources: sourceCounts,
        risk_score: riskScore,
        emergencies,
        active_narratives: narratives.filter(n => n.status === "active").length,
        active_incidents: incidents.filter(i => i.status === "active").length,
        open_escalations: escalations.filter(e => e.status !== "resolved").length,
      },
      content: reportContent,
      sections: allSections,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-report error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
