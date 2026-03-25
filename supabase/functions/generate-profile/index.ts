const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { company_name, domain, industry, regions, languages } = await req.json();
    if (!company_name) throw new Error("Missing company_name");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a tracking profile builder for an enterprise brand monitoring platform. Given a company name, domain, industry, regions, and languages, generate a comprehensive monitoring profile. Be thorough and realistic. Include confidence scores (0-1) and evidence/reasoning for each suggestion.`,
          },
          {
            role: "user",
            content: `Build a monitoring profile for:\nCompany: ${company_name}\nDomain: ${domain || "unknown"}\nIndustry: ${industry || "unknown"}\nRegions: ${(regions || []).join(", ") || "Global"}\nLanguages: ${(languages || []).join(", ") || "English"}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "build_profile",
              description: "Generate a comprehensive tracking profile",
              parameters: {
                type: "object",
                properties: {
                  aliases: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        value: { type: "string" },
                        confidence: { type: "number" },
                        evidence: { type: "string" },
                      },
                      required: ["value", "confidence", "evidence"],
                    },
                  },
                  brand_keywords: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        value: { type: "string" },
                        confidence: { type: "number" },
                      },
                      required: ["value", "confidence"],
                    },
                  },
                  product_keywords: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        value: { type: "string" },
                        confidence: { type: "number" },
                      },
                      required: ["value", "confidence"],
                    },
                  },
                  risk_keywords: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        value: { type: "string" },
                        confidence: { type: "number" },
                      },
                      required: ["value", "confidence"],
                    },
                  },
                  topics: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["name", "description"],
                    },
                  },
                  narratives: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        example_phrases: { type: "array", items: { type: "string" } },
                        confidence: { type: "number" },
                      },
                      required: ["name", "description", "confidence"],
                    },
                  },
                  people: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        title: { type: "string" },
                        tier: { type: "string", enum: ["executive", "spokesperson", "security", "compliance", "product", "other"] },
                        confidence: { type: "number" },
                      },
                      required: ["name", "tier", "confidence"],
                    },
                  },
                  sources: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["news", "reddit", "twitter", "app_store_ios", "app_store_google", "forums"] },
                        reason: { type: "string" },
                      },
                      required: ["type", "reason"],
                    },
                  },
                },
                required: ["aliases", "brand_keywords", "product_keywords", "risk_keywords", "topics", "narratives", "people", "sources"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "build_profile" } },
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
      throw new Error("No profile generated");
    }

    const profile = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(profile), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-profile error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
