import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GEMINI_KEY = Deno.env.get("GOOGLE_API_KEY") ?? "";
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

async function aiChat(messages: Array<{role: string; content: string}>, jsonMode = false): Promise<string> {
  // Try Gemini direct first
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
  // Fallback to Lovable gateway
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { org_id } = await req.json();
    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify org membership
    const { data: isMember } = await supabase.rpc("is_org_member", { _user_id: userId, _org_id: org_id });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get recent mentions (last 7 days for clustering)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
    const { data: mentions, error: mentionErr } = await supabase
      .from("mentions")
      .select("id, content, source, sentiment_label, severity, posted_at, author_name")
      .eq("org_id", org_id)
      .gte("created_at", sevenDaysAgo)
      .not("content", "is", null)
      .order("created_at", { ascending: false })
      .eq("mention_type", "brand").limit(500);

    if (mentionErr) throw mentionErr;
    if (!mentions || mentions.length < 3) {
      return new Response(
        JSON.stringify({ narratives_created: 0, message: "Not enough mentions to detect narratives (minimum 3)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing narratives to avoid duplicates
    const { data: existingNarratives } = await supabase
      .from("narratives")
      .select("name")
      .eq("org_id", org_id);
    const existingNames = new Set((existingNarratives || []).map((n: any) => n.name.toLowerCase()));

    // Prepare mention summaries for AI
    const mentionSummaries = mentions.slice(0, 200).map((m, i) => 
      `[${i + 1}] ${m.source} | ${m.sentiment_label || "neutral"} | ${m.severity || "low"} | ${(m.content || "").slice(0, 300)}`
    ).join("\n");

    // Call AI to cluster mentions into narratives
    const systemPrompt = `You are a narrative intelligence analyst. Given a list of mentions, identify 2-6 distinct narrative themes or storylines. Each narrative should represent a coherent story or talking point that appears across multiple mentions.

Return a JSON object with a "narratives" array. Each narrative must have:
- "name": short descriptive name (3-8 words)
- "description": 1-2 sentence description of the narrative
- "confidence": 0-100 (how clear the pattern is)
- "mention_indices": array of mention numbers [1,2,...] that belong to this narrative
- "example_phrases": 2-3 short representative phrases from the mentions
- "status": "active" if ongoing, "emerging" if just starting

Only return narratives with at least 2 mentions. Focus on reputation-relevant themes.`;

    const userPrompt = `Analyze these ${mentions.length} mentions and identify narrative clusters:\n\n${mentionSummaries}`;

    const rawContent = await aiChat([{role: "system", content: systemPrompt}, {role: "user", content: userPrompt}], true);

    let narratives: any[] = [];
    try {
      const parsed = JSON.parse(rawContent);
      narratives = parsed.narratives || parsed.clusters || (Array.isArray(parsed) ? parsed : []);
    } catch {
      throw new Error("Failed to parse AI response");
    }

    // Filter out duplicates and insert
    const newNarratives = narratives.filter((n: any) => 
      n.name && !existingNames.has(n.name.toLowerCase())
    );

    let created = 0;
    const mentionNarrativeLinks: { mention_id: string; narrative_id: string }[] = [];

    for (const n of newNarratives) {
      const { data: inserted, error: insertErr } = await supabase
        .from("narratives")
        .insert({
          org_id,
          name: n.name,
          description: n.description || null,
          confidence: n.confidence || 50,
          status: n.status || "active",
          example_phrases: n.example_phrases || [],
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertErr || !inserted) continue;
      created++;

      // Link mentions to narrative
      const indices = (n.mention_indices || []) as number[];
      for (const idx of indices) {
        const mention = mentions[idx - 1];
        if (mention) {
          mentionNarrativeLinks.push({
            mention_id: mention.id,
            narrative_id: inserted.id,
          });
        }
      }
    }

    // Bulk insert mention-narrative links
    if (mentionNarrativeLinks.length > 0) {
      await supabase.from("mention_narratives").upsert(mentionNarrativeLinks, {
        onConflict: "mention_id,narrative_id",
      });
    }

    return new Response(
      JSON.stringify({
        narratives_created: created,
        narratives_detected: narratives.length,
        mentions_linked: mentionNarrativeLinks.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("detect-narratives error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
