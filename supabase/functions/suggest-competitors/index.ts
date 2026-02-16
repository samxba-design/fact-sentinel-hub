import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { org_id } = await req.json();
    if (!org_id) throw new Error("Missing org_id");

    // Gather org context
    const [orgRes, keywordsRes, mentionsRes] = await Promise.all([
      supabase.from("organizations").select("name, domain, industry, regions, languages").eq("id", org_id).single(),
      supabase.from("keywords").select("value, type").eq("org_id", org_id),
      supabase.from("mentions").select("content, author_name").eq("org_id", org_id).order("posted_at", { ascending: false }).limit(100),
    ]);

    const org = orgRes.data;
    if (!org) throw new Error("Organization not found");

    const existingKeywords = (keywordsRes.data || []).map(k => k.value);
    const existingCompetitors = (keywordsRes.data || []).filter(k => k.type === "competitor").map(k => k.value);

    // Sample mention content for context
    const mentionSamples = (mentionsRes.data || [])
      .filter(m => m.content)
      .slice(0, 30)
      .map(m => m.content!.slice(0, 200))
      .join("\n---\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a competitive intelligence analyst. Given a company's profile, existing keywords, and recent mention samples, identify key competitors. 
Focus on:
1. Direct competitors in the same industry/market
2. Companies frequently mentioned alongside this brand in the mention samples
3. Emerging competitors or disruptors in their space

Do NOT suggest companies already tracked. Be specific with company names - use their commonly known brand name.
Provide a confidence score (0-1) and reasoning for each suggestion.`,
          },
          {
            role: "user",
            content: `Company: ${org.name}
Domain: ${org.domain || "unknown"}
Industry: ${org.industry || "unknown"}  
Regions: ${(org.regions || []).join(", ") || "Global"}
Languages: ${(org.languages || []).join(", ") || "English"}

Already tracked keywords: ${existingKeywords.join(", ") || "none"}
Already tracked competitors: ${existingCompetitors.join(", ") || "none"}

Recent mention samples:
${mentionSamples || "No mentions yet"}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_competitors",
              description: "Return a list of suggested competitors with reasoning",
              parameters: {
                type: "object",
                properties: {
                  competitors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Company/brand name" },
                        domain: { type: "string", description: "Website domain if known" },
                        reason: { type: "string", description: "Why this is a competitor" },
                        confidence: { type: "number", description: "Confidence score 0-1" },
                        category: { type: "string", enum: ["direct", "indirect", "emerging", "mentioned"], description: "Type of competitive relationship" },
                      },
                      required: ["name", "reason", "confidence", "category"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["competitors"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_competitors" } },
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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No suggestions generated");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-competitors error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
