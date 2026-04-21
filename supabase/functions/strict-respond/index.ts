import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader! } },
    });
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { input_text, platform, intent, org_id } = await req.json();
    if (!input_text || !org_id) throw new Error("Missing input_text or org_id");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Extract claims using AI tool calling
    const claimResText = await aiChat([
      {
            role: "system",
            content:
              "You are a claim extraction engine. Extract distinct factual claims, accusations, or questions from the given text. Each claim should be a short statement. Also categorize each claim.",
          },
          { role: "user", content: input_text },
    ], true);

    if (!claimRes.ok) {
      const status = claimRes.status;
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

    const claimData = await claimRes.json();
    const toolCall = claimData.choices?.[0]?.message?.tool_calls?.[0];
    let claims: { claim_text: string; category: string }[] = [];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      claims = parsed.claims || [];
    }

    if (claims.length === 0) {
      claims = [{ claim_text: input_text.slice(0, 200), category: "General" }];
    }

    // Step 2: Fetch approved facts and templates for this org
    const categories = [...new Set(claims.map((c) => c.category))];

    const [factsRes, templatesRes] = await Promise.all([
      supabase
        .from("approved_facts")
        .select("id, title, statement_text, source_link, category")
        .eq("org_id", org_id)
        .eq("status", "active")
        .limit(200),
      supabase
        .from("approved_templates")
        .select("id, name, template_text, scenario_type, tone, platform_length")
        .eq("org_id", org_id)
        .eq("status", "active")
        .limit(100),
    ]);

    const facts = factsRes.data || [];
    const templates = templatesRes.data || [];

    // Step 3: Use AI to match claims to facts
    const matchResText = await aiChat([
      {
            role: "system",
            content: `You are a fact-matching engine for a strict response system. Given a list of claims extracted from negative text and a library of approved facts, determine which approved facts can address each claim. Only match facts that DIRECTLY address the claim. If no fact addresses a claim, mark it as unmatched. Also select the best template if any match the scenario.\n\nApproved Facts:\n${JSON.stringify(facts.map((f) => ({ id: f.id, title: f.title, statement: f.statement_text, category: f.category })))}\n\nApproved Templates:\n${JSON.stringify(templates.map((t) => ({ id: t.id, name: t.name, scenario: t.scenario_type, tone: t.tone, platform: t.platform_length })))}\n\nResponse intent: ${intent || "general"}\nPlatform: ${platform || "general"}`,
          },
          {
            role: "user",
            content: `Claims to address:\n${JSON.stringify(claims)}`,
          },
    ], true);

    if (!matchRes.ok) throw new Error(`AI match error: ${matchRes.status}`);

    const matchData = await matchRes.json();
    const matchCall = matchData.choices?.[0]?.message?.tool_calls?.[0];
    let matchResult = {
      matched_fact_ids: [] as string[],
      unmatched_claims: [] as string[],
      selected_template_id: "",
      all_claims_covered: false,
    };
    if (matchCall?.function?.arguments) {
      matchResult = JSON.parse(matchCall.function.arguments);
    }

    const matchedFacts = facts.filter((f) => matchResult.matched_fact_ids.includes(f.id));
    const selectedTemplate = templates.find((t) => t.id === matchResult.selected_template_id);

    // Step 4: Decision - draft or block
    if (!matchResult.all_claims_covered || matchedFacts.length === 0) {
      // BLOCK: Create escalation + response_draft with status blocked
      const suggestedDept =
        claims[0]?.category === "Security" ? "Security" :
        claims[0]?.category === "Compliance" || claims[0]?.category === "Regulatory" ? "Compliance" :
        claims[0]?.category === "Fees/Pricing" ? "Support" :
        claims[0]?.category === "Leadership" ? "Communications" :
        "Communications";

      const [draftRes, escRes] = await Promise.all([
        supabase.from("response_drafts").insert({
          org_id,
          input_text,
          status: "blocked",
          claims_extracted: claims,
          facts_used: matchedFacts.map((f) => ({ id: f.id, title: f.title })),
          source_type: "paste",
          created_by: user.id,
        }).select("id").single(),
        supabase.from("escalations").insert({
          org_id,
          title: `Response blocked: ${claims[0]?.claim_text?.slice(0, 80) || "Unknown claim"}`,
          department: suggestedDept,
          priority: "high",
          status: "open",
          description: `The strict response engine could not draft a response because approved facts/templates are missing.\n\nUnmatched claims:\n${matchResult.unmatched_claims.map((c) => `- ${c}`).join("\n")}`,
          pasted_text: input_text,
          requester_id: user.id,
        }).select("id").single(),
      ]);

      return new Response(
        JSON.stringify({
          status: "blocked",
          message: "No approved facts/templates found to safely address all claims. An escalation ticket has been created.",
          claims,
          matched_facts: matchedFacts.map((f) => ({ id: f.id, title: f.title, statement: f.statement_text })),
          unmatched_claims: matchResult.unmatched_claims,
          escalation_id: escRes.data?.id,
          draft_id: draftRes.data?.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DRAFT: Generate response using approved facts verbatim
    const factsBlock = matchedFacts
      .map((f, i) => `FACT_${i + 1}: "${f.statement_text}"${f.source_link ? ` [Source: ${f.source_link}]` : ""}`)
      .join("\n");

    const templateBlock = selectedTemplate
      ? `\nUse this approved template structure:\n${selectedTemplate.template_text}`
      : "";

    const draftResText = await aiChat([
      {
            role: "system",
            content: `You are a strict corporate response drafter. You MUST ONLY use the approved facts provided below verbatim or near-verbatim. Do NOT add any claims, statistics, or information not present in the approved facts. Do NOT paraphrase the approved facts — use them as written.\n\nApproved facts:\n${factsBlock}${templateBlock}\n\nPlatform: ${platform || "general"}\nIntent: ${intent || "clarify"}\n\nRules:\n1. Use approved fact text verbatim.\n2. Include source links where available.\n3. Be professional and concise.\n4. Do NOT invent or assume any information.\n5. Generate 2 variants if possible, both strictly using approved facts only.`,
          },
          {
            role: "user",
            content: `Draft a response to this:\n\n${input_text}`,
          },
    ], true);

    if (!draftRes.ok) throw new Error(`AI draft error: ${draftRes.status}`);

    const draftData = await draftRes.json();
    const outputText = draftData.choices?.[0]?.message?.content || "";

    const factsUsed = matchedFacts.map((f) => ({ id: f.id, title: f.title, statement: f.statement_text }));
    const linksUsed = matchedFacts.filter((f) => f.source_link).map((f) => ({ fact_id: f.id, link: f.source_link }));

    // Store the draft
    const { data: savedDraft } = await supabase.from("response_drafts").insert({
      org_id,
      input_text,
      output_text: outputText,
      status: "draft",
      claims_extracted: claims,
      facts_used: factsUsed,
      links_used: linksUsed,
      source_type: "paste",
      created_by: user.id,
    }).select("id").single();

    return new Response(
      JSON.stringify({
        status: "draft",
        message: outputText,
        claims,
        matched_facts: factsUsed,
        links_used: linksUsed,
        template_used: selectedTemplate ? { id: selectedTemplate.id, name: selectedTemplate.name } : null,
        draft_id: savedDraft?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("strict-respond error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
