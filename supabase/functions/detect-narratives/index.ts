import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { org_id } = await req.json();
    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call AI to cluster mentions into narratives
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a narrative intelligence analyst. Given a list of mentions, identify 2-6 distinct narrative themes or storylines. Each narrative should represent a coherent story or talking point that appears across multiple mentions.

Return a JSON array of narratives. Each must have:
- "name": short descriptive name (3-8 words)
- "description": 1-2 sentence description of the narrative
- "confidence": 0-100 (how clear the pattern is)
- "mention_indices": array of mention numbers [1,2,...] that belong to this narrative
- "example_phrases": 2-3 short representative phrases from the mentions
- "status": "active" if ongoing, "emerging" if just starting

Only return narratives with at least 2 mentions. Focus on reputation-relevant themes.`,
          },
          {
            role: "user",
            content: `Analyze these ${mentions.length} mentions and identify narrative clusters:\n\n${mentionSummaries}`,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI API error [${aiResponse.status}]: ${errText}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";

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
