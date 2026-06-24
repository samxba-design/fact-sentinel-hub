import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { geminiChat } from "../_lib/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};



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

    // ── Step 1: Extract claims using Gemini ─────────────────────────────
    const claimRaw = await geminiChat([
      {
        role: "system",
        content:
          "You are a claim extraction engine. Extract distinct factual claims, accusations, or questions from the given text. Return ONLY valid JSON.",
      },
      { role: "user", content: `Extract claims from this text:\n\n${input_text}\n\nReturn JSON: {"claims":[{"claim_text":"...","category":"Security|Compliance|Fees/Pricing|Leadership|Product|General"}]}` },
    ], { jsonMode: true });

    let claims: { claim_text: string; category: string }[] = [];
    try {
      const raw = claimRaw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      claims = JSON.parse(raw).claims || [];
    } catch {
      claims = [{ claim_text: input_text.slice(0, 200), category: "General" }];
    }

    if (claims.length === 0) {
      claims = [{ claim_text: input_text.slice(0, 200), category: "General" }];
    }

    // ── Step 2: Fetch approved facts and templates for this org ─────────
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

    // ── Step 3: Match claims to facts ───────────────────────────────────
    const matchRaw = await geminiChat([
      {
        role: "system",
        content: `You are a fact-matching engine. Given claims and a library of approved facts, return JSON with matched fact IDs and unmatched claims.\n\nApproved Facts:\n${JSON.stringify(facts.map((f) => ({ id: f.id, title: f.title, statement: f.statement_text, category: f.category })))}\n\nApproved Templates:\n${JSON.stringify(templates.map((t) => ({ id: t.id, name: t.name, scenario: t.scenario_type, tone: t.tone, platform: t.platform_length })))}\n\nIntent: ${intent || "general"}\nPlatform: ${platform || "general"}\n\nReturn ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `Match these claims to facts:\n${JSON.stringify(claims)}\n\nReturn JSON: {"matched_fact_ids":["..."],"unmatched_claims":["..."],"selected_template_id":"","all_claims_covered":true|false}`,
      },
    ], { jsonMode: true });

    const matchResult = {
      matched_fact_ids: [] as string[],
      unmatched_claims: [] as string[],
      selected_template_id: "",
      all_claims_covered: false,
    };
    try {
      const raw = matchRaw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      const parsed = JSON.parse(raw);
      if (parsed.matched_fact_ids) matchResult.matched_fact_ids = parsed.matched_fact_ids;
      if (parsed.unmatched_claims) matchResult.unmatched_claims = parsed.unmatched_claims;
      if (parsed.selected_template_id) matchResult.selected_template_id = parsed.selected_template_id;
      if (typeof parsed.all_claims_covered === "boolean") matchResult.all_claims_covered = parsed.all_claims_covered;
    } catch {
      matchResult.all_claims_covered = false;
      matchResult.unmatched_claims = claims.map((c) => c.claim_text);
    }

    const matchedFacts = facts.filter((f) => matchResult.matched_fact_ids.includes(f.id));
    const selectedTemplate = templates.find((t) => t.id === matchResult.selected_template_id);

    // ── Step 4: BLOCK or DRAFT ─────────────────────────────────────────
    if (!matchResult.all_claims_covered || matchedFacts.length === 0) {
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

    // ── DRAFT: Generate response using approved facts verbatim ──────────
    const factsBlock = matchedFacts
      .map((f, i) => `FACT_${i + 1}: "${f.statement_text}"${f.source_link ? ` [Source: ${f.source_link}]` : ""}`)
      .join("\n");

    const templateBlock = selectedTemplate
      ? `\nUse this approved template structure:\n${selectedTemplate.template_text}`
      : "";

    const draftRaw = await geminiChat([
      {
        role: "system",
        content: `You are a strict corporate response drafter. You MUST ONLY use the approved facts provided below verbatim or near-verbatim. Do NOT add any claims, statistics, or information not present in the approved facts.\n\nApproved facts:\n${factsBlock}${templateBlock}\n\nPlatform: ${platform || "general"}\nIntent: ${intent || "clarify"}\n\nRules:\n1. Use approved fact text verbatim.\n2. Include source links where available.\n3. Be professional and concise.\n4. Do NOT invent or assume any information.\n5. Generate 2 variants if possible.`,
      },
      {
        role: "user",
        content: `Draft a response to this:\n\n${input_text}\n\nReturn JSON: {"variants":["variant 1 text here","variant 2 text here"]}`,
      },
    ], { jsonMode: true });

    let outputText = "";
    try {
      const raw = draftRaw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      const parsed = JSON.parse(raw);
      outputText = (parsed.variants && Array.isArray(parsed.variants)) ? parsed.variants.join("\n\n---\n\n") : (parsed.response || draftRaw);
    } catch {
      outputText = draftRaw;
    }

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
      JSON.stringify({ error: e instanceof Error ? (e as Error).message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});