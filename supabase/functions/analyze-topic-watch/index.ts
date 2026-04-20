import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function tableExists(supabase: any): Promise<boolean> {
  const { error } = await supabase.from("topic_watches").select("id").limit(1);
  return error?.code !== "42P01";
}

// ── AI call — tries Gemini direct first, falls back to Lovable gateway ────────
async function callAI(
  systemPrompt: string,
  userPrompt: string,
  geminiKey: string,
  lovableKey: string
): Promise<any> {
  // Prefer Gemini direct (more reliable, no extra gateway hop)
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (raw) {
          try { return JSON.parse(raw); }
          catch {
            const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
            return JSON.parse(stripped);
          }
        }
      }
      console.warn("[analyze-topic-watch] Gemini returned non-ok:", res.status);
    } catch (e: any) {
      console.warn("[analyze-topic-watch] Gemini direct failed:", e.message);
    }
  }

  // Fallback: Lovable gateway
  if (lovableKey) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI gateway error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    try { return JSON.parse(raw); }
    catch {
      const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      return JSON.parse(stripped);
    }
  }

  throw new Error(
    "No AI key configured. Set GOOGLE_API_KEY or LOVABLE_API_KEY in your Supabase Edge Function secrets."
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey   = Deno.env.get("GOOGLE_API_KEY") ?? "";
    const lovableKey  = Deno.env.get("LOVABLE_API_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { action = "analyze", text, org_id, watch_data } = body;

    // ── ACTION: analyze ───────────────────────────────────────────────────────
    if (action === "analyze") {
      if (!text) return json({ error: "text is required" }, 400);

      const [orgRes, keywordsRes, watchesRes] = await Promise.all([
        supabase.from("organizations").select("name, domain, industry").eq("id", org_id).maybeSingle(),
        supabase.from("keywords").select("value, type").eq("org_id", org_id).limit(50),
        (async () => {
          const ready = await tableExists(supabase);
          if (!ready) return { data: [] };
          return supabase.from("topic_watches").select("name, query").eq("org_id", org_id).limit(20);
        })(),
      ]);

      const orgName       = orgRes.data?.name ?? "Binance";
      const existingKw    = (keywordsRes.data ?? []).map((k: any) => k.value).join(", ") || "none";
      const existingWatches = ((watchesRes as any).data ?? []).map((w: any) => w.name).join(", ") || "none";

      const systemPrompt = `You are a crypto threat intelligence analyst for ${orgName}, a major global exchange. Analyse the provided intelligence text and extract a structured monitoring configuration called a "Topic Watch".

Context:
- Organisation: ${orgName}
- Already monitored keywords: ${existingKw}
- Existing topic watches: ${existingWatches}

Return ONLY valid JSON matching this exact schema:
{
  "name": "Concise watch name, max 40 chars, title-case",
  "query": "Comma-separated match terms. Include entity names, ticker symbols, key phrases, handles. 5-10 terms. These are OR-matched against mention content.",
  "description": "2-sentence plain-English description: what is this narrative, and why does it matter for ${orgName}?",
  "threat_type": "regulatory | market_manipulation | insider_trading | reputation | competitor | scam | unknown",
  "severity": "critical | high | medium | low",
  "alert_threshold": <integer 1-50, the % co-occurrence with ${orgName} that should trigger an alert>,
  "reasoning": "3-sentence explanation: (1) nature of threat, (2) specific ${orgName} exposure, (3) why these keywords and threshold were chosen",
  "named_entities": ["array of key people, orgs, tickers mentioned"],
  "binance_connection": "direct | indirect | potential | none",
  "suggested_color": "one hex color: #ef4444 for critical, #f97316 for high, #f59e0b for medium, #3b82f6 for low"
}`;

      const analysis = await callAI(
        systemPrompt,
        `Analyse this intelligence text and generate a Topic Watch:\n\n---\n${text}\n---`,
        geminiKey,
        lovableKey
      );

      const ready = await tableExists(supabase);
      return json({
        analysis,
        tableReady: ready,
        tableError: ready
          ? null
          : "topic_watches table missing — apply supabase/migrations/20240420000001_intel_features.sql in Supabase SQL Editor.",
      });
    }

    // ── ACTION: create ────────────────────────────────────────────────────────
    if (action === "create") {
      if (!org_id)      return json({ error: "org_id is required" }, 400);
      if (!watch_data)  return json({ error: "watch_data is required" }, 400);

      const ready = await tableExists(supabase);
      if (!ready) {
        return json({
          error: "topic_watches table does not exist. Apply the migration in Supabase SQL Editor first.",
        }, 400);
      }

      const { data, error } = await supabase
        .from("topic_watches")
        .insert({
          org_id,
          name:            watch_data.name,
          query:           watch_data.query,
          description:     watch_data.description,
          alert_threshold: watch_data.alert_threshold ?? 20,
          color:           watch_data.suggested_color ?? watch_data.color ?? "#f97316",
          status:          "active",
          tags:            watch_data.named_entities ?? [],
        })
        .select()
        .single();

      if (error) return json({ error: error.message }, 400);
      return json({ watch: data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err: any) {
    console.error("[analyze-topic-watch] unhandled:", err.message);
    return json({ error: err.message }, 500);
  }
});
