import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { org_id } = await req.json();
    if (!org_id) throw new Error("Missing org_id");

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

    // Get recent mentions and narratives
    const [recentMentions, olderMentions, narrativesRes] = await Promise.all([
      supabase.from("mentions")
        .select("id, sentiment_label, severity, source, posted_at, content, author_follower_count, metrics")
        .eq("org_id", org_id)
        .gte("posted_at", sevenDaysAgo)
        .order("posted_at", { ascending: false })
        .limit(300),
      supabase.from("mentions")
        .select("id, sentiment_label, severity")
        .eq("org_id", org_id)
        .gte("posted_at", fourteenDaysAgo)
        .lt("posted_at", sevenDaysAgo)
        .limit(300),
      supabase.from("narratives")
        .select("id, name, status, confidence, first_seen, last_seen")
        .eq("org_id", org_id)
        .eq("status", "active")
        .order("last_seen", { ascending: false })
        .limit(10),
    ]);

    const recent = recentMentions.data || [];
    const older = olderMentions.data || [];
    const narratives = narrativesRes.data || [];

    // Compute trajectory metrics
    const recentNeg = recent.filter(m => m.sentiment_label === "negative").length;
    const olderNeg = older.filter(m => m.sentiment_label === "negative").length;
    const recentCrit = recent.filter(m => m.severity === "critical").length;
    const volumeChange = older.length > 0 ? ((recent.length - older.length) / older.length * 100) : 0;
    const negChange = olderNeg > 0 ? ((recentNeg - olderNeg) / olderNeg * 100) : 0;

    // High-reach mentions
    const highReach = recent.filter(m => (m.author_follower_count || 0) > 10000);

    const prompt = `Analyze these reputation intelligence metrics and predict risk for the next 48 hours.

Current Week (last 7 days):
- Total mentions: ${recent.length}
- Negative mentions: ${recentNeg} (${recent.length > 0 ? Math.round(recentNeg/recent.length*100) : 0}%)
- Critical severity: ${recentCrit}
- High-reach mentions (>10K followers): ${highReach.length}
- Volume change vs prior week: ${volumeChange > 0 ? '+' : ''}${Math.round(volumeChange)}%
- Negative sentiment change: ${negChange > 0 ? '+' : ''}${Math.round(negChange)}%

Active Narratives (${narratives.length}):
${narratives.map(n => `- "${n.name}" (confidence: ${n.confidence}%, last seen: ${n.last_seen})`).join('\n')}

Top negative content samples:
${recent.filter(m => m.sentiment_label === "negative").slice(0, 5).map(m => `- "${(m.content || '').slice(0, 100)}"`).join('\n')}

Return a JSON object with this exact structure (no markdown, just JSON):
{
  "overall_risk_prediction": number 0-100,
  "viral_probability": number 0-100,
  "escalation_likelihood": number 0-100,
  "predicted_volume_change": number (percentage),
  "risk_factors": [{"factor": "string", "severity": "low|medium|high|critical", "probability": number 0-100}],
  "recommendations": ["string"],
  "narrative_predictions": [{"narrative": "string", "prediction": "growing|stable|declining", "viral_risk": number 0-100}],
  "time_horizon": "48 hours",
  "confidence": number 0-100
}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a predictive risk analytics engine. Return ONLY valid JSON, no markdown formatting." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content || "{}";
    
    // Strip markdown code fences if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    let prediction;
    try {
      prediction = JSON.parse(content);
    } catch {
      prediction = {
        overall_risk_prediction: Math.min(100, Math.round((recentNeg / Math.max(recent.length, 1)) * 100 + recentCrit * 10)),
        viral_probability: highReach.length > 0 ? 40 + highReach.length * 10 : 15,
        escalation_likelihood: recentCrit > 0 ? 50 + recentCrit * 15 : 20,
        predicted_volume_change: Math.round(volumeChange),
        risk_factors: [],
        recommendations: ["Continue monitoring active narratives"],
        narrative_predictions: [],
        time_horizon: "48 hours",
        confidence: 50,
        error: "AI response parsing failed, using heuristic fallback",
      };
    }

    return new Response(JSON.stringify({
      ...prediction,
      computed_at: now.toISOString(),
      data_points: {
        recent_mentions: recent.length,
        recent_negative: recentNeg,
        recent_critical: recentCrit,
        volume_change_pct: Math.round(volumeChange),
        neg_change_pct: Math.round(negChange),
        active_narratives: narratives.length,
        high_reach_mentions: highReach.length,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("predict-risk error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
