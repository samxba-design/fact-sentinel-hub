import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { geminiChat } from "../_lib/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const systemPrompt = `You are a competitive intelligence analyst. Given a company's profile, existing keywords, and recent mention samples, identify key competitors.
Focus on:
1. Direct competitors in the same industry/market
2. Companies frequently mentioned alongside this brand in the mention samples
3. Emerging competitors or disruptors in their space

Do NOT suggest companies already tracked. Return ONLY valid JSON: {"competitors":[{"name":"...","domain":"...","reason":"...","confidence":0.8,"category":"direct|indirect|emerging|mentioned"}]}`;

    const userPrompt = `Company: ${org.name}
Domain: ${org.domain || "unknown"}
Industry: ${org.industry || "unknown"}
Regions: ${(org.regions || []).join(", ") || "Global"}
Languages: ${(org.languages || []).join(", ") || "English"}

Already tracked keywords: ${existingKeywords.join(", ") || "none"}
Already tracked competitors: ${existingCompetitors.join(", ") || "none"}

Recent mention samples:
${mentionSamples || "No mentions yet"}`;

    const rawText = await geminiChat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], true);

    let result: any;
    try {
      result = JSON.parse(rawText);
    } catch {
      const stripped = rawText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      result = JSON.parse(stripped);
    }

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
