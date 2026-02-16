import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { domain, org_id } = await req.json();
    if (!domain || !org_id) throw new Error("Missing domain or org_id");

    // Gather internal data about this source
    const [orgRes, mentionsRes, keywordsRes] = await Promise.all([
      supabase.from("organizations").select("name, domain, industry").eq("id", org_id).single(),
      supabase.from("mentions").select("content, sentiment_label, severity, author_name, posted_at, url")
        .eq("org_id", org_id)
        .ilike("url", `%${domain}%`)
        .order("posted_at", { ascending: false })
        .limit(50),
      supabase.from("keywords").select("value, type").eq("org_id", org_id).eq("type", "competitor"),
    ]);

    const org = orgRes.data;
    const mentions = mentionsRes.data || [];
    const competitors = (keywordsRes.data || []).map(k => k.value);

    // Build stats from internal data
    const sentimentCounts: Record<string, number> = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
    const severityCounts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    const authors = new Set<string>();
    const contentSamples: string[] = [];

    for (const m of mentions) {
      if (m.sentiment_label) sentimentCounts[m.sentiment_label] = (sentimentCounts[m.sentiment_label] || 0) + 1;
      if (m.severity) severityCounts[m.severity] = (severityCounts[m.severity] || 0) + 1;
      if (m.author_name) authors.add(m.author_name);
      if (m.content && contentSamples.length < 5) {
        contentSamples.push(m.content.slice(0, 300));
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0.3,
        tools: [{
          type: "function",
          function: {
            name: "source_intelligence",
            description: "Generate an intelligence profile for a media source/domain",
            parameters: {
              type: "object",
              properties: {
                identity: { type: "string", description: "1-2 sentence summary of what this source/outlet is (news site, blog, social platform, trade pub, etc.)" },
                audience: { type: "string", description: "Who reads/follows this source — their typical audience" },
                credibility: { type: "string", enum: ["high", "medium", "low", "unknown"], description: "General credibility/reliability assessment" },
                reach_estimate: { type: "string", description: "Rough estimate of reach/influence (e.g. 'Major outlet, millions of monthly visitors' or 'Niche blog, small audience')" },
                bias_tendency: { type: "string", description: "Any known editorial bias or tendency — 'neutral', 'industry-friendly', 'consumer-advocacy', etc." },
                competitor_connections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      competitor: { type: "string" },
                      relationship: { type: "string", description: "How this source relates to the competitor — covers them, is owned by them, etc." },
                    },
                    required: ["competitor", "relationship"],
                  },
                  description: "Known connections between this source and tracked competitors",
                },
                key_topics: {
                  type: "array",
                  items: { type: "string" },
                  description: "Main topics this source typically covers",
                },
                risk_assessment: { type: "string", description: "1-2 sentence assessment of reputational risk this source poses based on its coverage patterns and internal data" },
                recommendation: { type: "string", description: "What should the monitoring team do about this source — monitor closely, deprioritize, engage, etc." },
              },
              required: ["identity", "audience", "credibility", "reach_estimate", "key_topics", "risk_assessment", "recommendation"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "source_intelligence" } },
        messages: [
          {
            role: "system",
            content: `You are a media intelligence analyst. Given a domain/source and internal monitoring data, produce a concise intelligence profile. Use your knowledge about the source AND the internal data provided. Be specific and actionable.`,
          },
          {
            role: "user",
            content: `Analyze this source for ${org?.name || "our organization"} (Industry: ${org?.industry || "unknown"}):

Domain: ${domain}

Internal monitoring data:
- Total mentions from this source: ${mentions.length}
- Sentiment breakdown: ${JSON.stringify(sentimentCounts)}
- Severity breakdown: ${JSON.stringify(severityCounts)}
- Known authors: ${[...authors].slice(0, 10).join(", ") || "none identified"}
- Tracked competitors: ${competitors.join(", ") || "none"}

Sample content from this source:
${contentSamples.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No profile generated");

    const profile = JSON.parse(toolCall.function.arguments);

    // Attach internal stats to the response
    const result = {
      ...profile,
      internal_stats: {
        total_mentions: mentions.length,
        sentiment: sentimentCounts,
        severity: severityCounts,
        unique_authors: authors.size,
        first_seen: mentions.length > 0 ? mentions[mentions.length - 1].posted_at : null,
        last_seen: mentions.length > 0 ? mentions[0].posted_at : null,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-source error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
