import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

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
  if (!LOVABLE_KEY) throw new Error("No AI key configured. Set GOOGLE_API_KEY or LOVABLE_API_KEY in Supabase Edge Function secrets.");
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader! } },
    });
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { org_id, context, format, tone, mention_id, narrative_context } = await req.json();
    if (!org_id || !context) throw new Error("Missing org_id or context");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load approved facts and org info in parallel
    const [factsRes, orgRes, mentionRes] = await Promise.all([
      supabase.from("approved_facts").select("title, statement_text, category, source_link")
        .eq("org_id", org_id).eq("status", "active").limit(50),
      supabase.from("organizations").select("name, domain, industry").eq("id", org_id).single(),
      mention_id
        ? supabase.from("mentions").select("content, source, sentiment_label, url").eq("id", mention_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const facts = factsRes.data || [];
    const org = orgRes.data;
    const mention = mentionRes.data;

    const formatInstructions: Record<string, string> = {
      tweet: "Generate a tweet (max 280 characters). Must be punchy and shareable. Include relevant hashtag if appropriate.",
      press_statement: "Generate a formal press statement with headline, dateline, body, and boilerplate. Professional and comprehensive.",
      internal_memo: "Generate an internal memo with To/From/Subject/Date fields, situation summary, key facts, recommended actions, and talking points.",
      email_reply: "Generate a professional email reply with subject line, greeting, body, and sign-off.",
      social_post: "Generate a social media post suitable for LinkedIn or Facebook. Conversational but professional, 1-3 paragraphs.",
    };

    const factsBlock = facts.length > 0
      ? facts.map((f, i) => `[${f.category || "General"}] ${f.title}: "${f.statement_text}"${f.source_link ? ` (Source: ${f.source_link})` : ""}`).join("\n")
      : "No approved facts available — generate based on best practices.";

    const mentionBlock = mention
      ? `\n\nOriginal mention (${mention.source}, sentiment: ${mention.sentiment_label}):\n"${mention.content?.slice(0, 500)}"\nURL: ${mention.url || "N/A"}`
      : "";

    const narrativeBlock = narrative_context ? `\nNarrative context: ${narrative_context}` : "";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        tools: [{
          type: "function",
          function: {
            name: "generate_responses",
            description: "Generate response variants for a specific platform/format",
            parameters: {
              type: "object",
              properties: {
                variants: {
                  type: "array",
                  items: { type: "string" },
                  description: "2-3 response variants, each complete and ready to use",
                },
              },
              required: ["variants"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_responses" } },
        messages: [
          {
            role: "system",
            content: `You are a crisis communications AI copilot for "${org?.name || "the organization"}" (${org?.industry || "technology"}).

Generate 2-3 response variants grounded in approved facts. Each variant should be complete, ready to copy-paste, and tailored to the format.

FORMAT: ${formatInstructions[format] || formatInstructions.social_post}
TONE: ${tone}

APPROVED FACTS (use these as source of truth — do not invent information):
${factsBlock}

RULES:
1. Stay grounded in approved facts when available
2. Never fabricate statistics or claims
3. Each variant should take a slightly different angle/approach
4. Be ${tone} in tone throughout
5. If format is tweet, MUST be under 280 characters${mentionBlock}${narrativeBlock}`,
          },
          {
            role: "user",
            content: `Situation to respond to:\n\n${context}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No response generated");

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ variants: parsed.variants || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("copilot error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
