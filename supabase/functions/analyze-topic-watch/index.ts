import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function tableExists(supabase: any): Promise<boolean> {
  const { error } = await supabase.from("topic_watches").select("id").limit(1);
  if (error?.code === "42P01") return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { action = "analyze", text, org_id, watch_data } = body;

    // ─────────────────────────────────────────────────────────────────
    // ACTION: analyze — parse free-form text into a Topic Watch config
    // ─────────────────────────────────────────────────────────────────
    if (action === "analyze") {
      if (!text) throw new Error("text is required");

      const [orgRes, keywordsRes, watchesRes] = await Promise.all([
        supabase.from("organizations").select("name, domain, industry").eq("id", org_id).maybeSingle(),
        supabase.from("keywords").select("value, type").eq("org_id", org_id).limit(50),
        (async () => {
          const ready = await tableExists(supabase);
          if (!ready) return { data: [] };
          return supabase.from("topic_watches").select("name, query").eq("org_id", org_id).limit(20);
        })(),
      ]);

      const orgName = orgRes.data?.name ?? "Binance";
      const existingKw = (keywordsRes.data ?? []).map((k: any) => k.value).join(", ") || "none";
      const existingWatches = ((watchesRes as any).data ?? []).map((w: any) => w.name).join(", ") || "none";

      const systemPrompt = `You are a crypto threat intelligence analyst for ${orgName}, a major global exchange. Analyse the provided intelligence text and extract a structured monitoring configuration called a "Topic Watch".

Context:
- Organisation: ${orgName}
- Already monitored keywords: ${existingKw}
- Existing topic watches: ${existingWatches}

A Topic Watch monitors incoming social/news mentions for a specific narrative, and alerts when that narrative starts co-appearing with ${orgName} mentions above a threshold.

Return ONLY valid JSON (no markdown wrapper) matching this exact schema:
{
  "name": "Concise watch name, max 40 chars, title-case",
  "query": "Comma-separated match terms. Include: entity names, ticker symbols ($RAVE), key phrases, handles (@ZachXBT). 5-10 terms. These are OR-matched against mention content.",
  "description": "2-sentence plain-English description: what is this narrative, and why does it matter for ${orgName}?",
  "threat_type": "regulatory | market_manipulation | insider_trading | reputation | competitor | scam | unknown",
  "severity": "critical | high | medium | low",
  "alert_threshold": <integer 1-50, the % co-occurrence with ${orgName} that should trigger an alert>,
  "reasoning": "3-sentence explanation: (1) nature of the threat, (2) specific ${orgName} exposure, (3) why these keywords and threshold were chosen",
  "named_entities": ["array of key people, orgs, tickers mentioned in the text"],
  "binance_connection": "direct | indirect | potential | none",
  "suggested_color": "one hex color that conveys the threat severity: #ef4444 for critical, #f97316 for high, #f59e0b for medium, #3b82f6 for low"
}`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Analyse this intelligence text and generate a Topic Watch:\n\n---\n${text}\n---` },
          ],
        }),
      });

      if (!aiRes.ok) {
        const errBody = await aiRes.text();
        throw new Error(`AI call failed ${aiRes.status}: ${errBody.slice(0, 300)}`);
      }

      const aiJson = await aiRes.json();
      const rawContent = aiJson.choices?.[0]?.message?.content ?? "{}";
      let analysis: any;
      try { analysis = JSON.parse(rawContent); }
      catch { throw new Error("AI returned malformed JSON: " + rawContent.slice(0, 200)); }

      const ready = await tableExists(supabase);

      return new Response(JSON.stringify({
        analysis,
        tableReady: ready,
        tableError: ready ? null : "Run supabase/migrations/20240420000001_intel_features.sql to create the topic_watches table.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────────────
    // ACTION: create — insert a reviewed/confirmed watch
    // ─────────────────────────────────────────────────────────────────
    if (action === "create") {
      if (!org_id || !watch_data) throw new Error("org_id and watch_data are required");

      const ready = await tableExists(supabase);
      if (!ready) {
        throw new Error("topic_watches table does not exist. Apply the migration first.");
      }

      const { data, error } = await supabase
        .from("topic_watches")
        .insert({
          org_id,
          name: watch_data.name,
          query: watch_data.query,
          description: watch_data.description,
          alert_threshold: watch_data.alert_threshold ?? 20,
          color: watch_data.suggested_color ?? watch_data.color ?? "#f97316",
          status: "active",
          tags: watch_data.named_entities ?? [],
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ watch: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (err: any) {
    console.error("[analyze-topic-watch]", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
