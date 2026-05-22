import { geminiChat } from "../_lib/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { company_name, domain, industry, regions, languages } = await req.json();
    if (!company_name) throw new Error("Missing company_name");

    const responseText = await geminiChat([
      {
            role: "system",
            content: `You are a tracking profile builder for an enterprise brand monitoring platform. Given a company name, domain, industry, regions, and languages, generate a comprehensive monitoring profile. Be thorough and realistic. Include confidence scores (0-1) and evidence/reasoning for each suggestion.`,
          },
          {
            role: "user",
            content: `Build a monitoring profile for:\nCompany: ${company_name}\nDomain: ${domain || "unknown"}\nIndustry: ${industry || "unknown"}\nRegions: ${(regions || []).join(", ") || "Global"}\nLanguages: ${(languages || []).join(", ") || "English"}`,
          },
    ], true);

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
