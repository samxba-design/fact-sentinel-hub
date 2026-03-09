import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { org_id } = await req.json();
    if (!org_id) throw new Error("Missing org_id");

    // Get all unique domains from mentions
    const { data: mentions } = await supabase
      .from("mentions")
      .select("url, sentiment_label, severity, source")
      .eq("org_id", org_id)
      .not("url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!mentions || mentions.length === 0) {
      return new Response(JSON.stringify({ scores: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aggregate by domain
    const domainStats: Record<string, { total: number; negative: number; high_severity: number; sources: Set<string> }> = {};
    for (const m of mentions) {
      if (!m.url) continue;
      try {
        const hostname = new URL(m.url).hostname.replace("www.", "").toLowerCase();
        if (!domainStats[hostname]) domainStats[hostname] = { total: 0, negative: 0, high_severity: 0, sources: new Set() };
        domainStats[hostname].total++;
        if (m.sentiment_label === "negative") domainStats[hostname].negative++;
        if (m.severity === "high" || m.severity === "critical") domainStats[hostname].high_severity++;
        domainStats[hostname].sources.add(m.source);
      } catch { /* skip invalid URLs */ }
    }

    // Get top 20 domains by volume
    const topDomains = Object.entries(domainStats)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 20);

    const domainSummaries = topDomains.map(([domain, stats]) => ({
      domain,
      total_mentions: stats.total,
      negative_pct: Math.round((stats.negative / stats.total) * 100),
      high_severity_pct: Math.round((stats.high_severity / stats.total) * 100),
      source_types: [...stats.sources].join(", "),
    }));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        tools: [{
          type: "function",
          function: {
            name: "score_sources",
            description: "Score source credibility for each domain",
            parameters: {
              type: "object",
              properties: {
                scores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      domain: { type: "string" },
                      credibility_score: { type: "number", description: "0-100 credibility score" },
                      credibility_label: { type: "string", enum: ["high", "medium", "low", "unknown"] },
                      bias_direction: { type: "string", description: "e.g. neutral, consumer-advocacy, industry-friendly, sensationalist" },
                      accuracy_rating: { type: "string", enum: ["reliable", "mostly_reliable", "mixed", "unreliable", "unknown"] },
                      category: { type: "string", description: "e.g. mainstream news, trade publication, blog, social media, forum, review site" },
                      risk_level: { type: "string", enum: ["low", "medium", "high"] },
                      reasoning: { type: "string", description: "1-2 sentence explanation" },
                    },
                    required: ["domain", "credibility_score", "credibility_label", "bias_direction", "accuracy_rating", "category", "risk_level", "reasoning"],
                  },
                },
              },
              required: ["scores"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "score_sources" } },
        messages: [
          {
            role: "system",
            content: "You are a media credibility analyst. Score each domain for credibility, bias, and accuracy based on your knowledge of the publication and the internal monitoring data provided. Be objective and evidence-based.",
          },
          {
            role: "user",
            content: `Score credibility for these sources:\n${JSON.stringify(domainSummaries, null, 2)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No scores generated");

    const parsed = JSON.parse(toolCall.function.arguments);

    // Merge AI scores with internal stats
    const enrichedScores = (parsed.scores || []).map((score: any) => {
      const stats = domainStats[score.domain];
      return {
        ...score,
        total_mentions: stats?.total || 0,
        negative_pct: stats ? Math.round((stats.negative / stats.total) * 100) : 0,
        high_severity_pct: stats ? Math.round((stats.high_severity / stats.total) * 100) : 0,
      };
    });

    return new Response(JSON.stringify({ scores: enrichedScores }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("score-source error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
