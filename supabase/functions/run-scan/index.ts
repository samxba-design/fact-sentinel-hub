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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { org_id, keywords, sources, date_from, date_to } = await req.json();
    if (!org_id) throw new Error("org_id required");

    // Verify membership
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("org_id", org_id)
      .not("accepted_at", "is", null)
      .maybeSingle();
    if (!membership) throw new Error("Not a member of this org");

    // Create scan_run
    const configSnapshot = { keywords, sources, date_from, date_to };
    const { data: scanRun, error: scanErr } = await supabase
      .from("scan_runs")
      .insert({
        org_id,
        status: "running",
        started_at: new Date().toISOString(),
        config_snapshot: configSnapshot,
      })
      .select()
      .single();
    if (scanErr) throw scanErr;

    // Get org info for context
    const { data: org } = await supabase
      .from("organizations")
      .select("name, domain, industry")
      .eq("id", org_id)
      .single();

    const keywordList = (keywords || []).join(", ") || "general brand mentions";
    const sourceList = (sources || []).join(", ") || "twitter, reddit, news, forums";
    const dateRange = date_from && date_to ? `between ${date_from} and ${date_to}` : "in the last 7 days";

    // Generate mentions via AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: `You are a social media monitoring simulator. Generate realistic synthetic mentions for a brand scan.
            
Organization: ${org?.name || "Unknown"} (${org?.industry || "technology"}, domain: ${org?.domain || "unknown"})
Keywords being tracked: ${keywordList}
Sources to scan: ${sourceList}
Date range: ${dateRange}

Generate 8-12 realistic mentions. Each mention should have varied sentiment (mix of positive, negative, neutral, mixed).
Include a realistic mix of severity levels. Some should be critical/high (controversial claims, misinformation, security concerns).
Make content realistic - include typos, slang, hashtags for social media posts. News articles should be more formal.
Ensure variety in author names, handle styles, and follower counts.

Return a JSON array of mentions with this schema:
{
  "mentions": [
    {
      "source": "twitter|reddit|news|forum|blog|tiktok|youtube",
      "content": "the post/article text (50-200 words)",
      "author_name": "Display Name",
      "author_handle": "@handle or u/username",
      "author_verified": boolean,
      "author_follower_count": number,
      "sentiment_label": "positive|negative|neutral|mixed",
      "sentiment_score": number between -1 and 1,
      "sentiment_confidence": number between 0 and 1,
      "severity": "low|medium|high|critical",
      "language": "en",
      "posted_at": "ISO date string within the date range",
      "url": "https://fake-but-realistic-url",
      "metrics": { "likes": number, "shares": number, "comments": number },
      "flags": { "misinformation": boolean, "coordinated": boolean, "bot_likely": boolean, "viral_potential": boolean }
    }
  ]
}

Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Run a scan for ${org?.name || "the organization"} now. Generate realistic mentions.`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI error: ${errText}`);
    }

    const aiData = await aiRes.json();
    let rawContent = aiData.choices?.[0]?.message?.content || "{}";
    
    // Strip markdown code fences if present
    rawContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      throw new Error("Failed to parse AI response");
    }

    const mentions = parsed.mentions || parsed;
    if (!Array.isArray(mentions) || mentions.length === 0) {
      throw new Error("No mentions generated");
    }

    // Insert mentions
    const mentionRows = mentions.map((m: any) => ({
      org_id,
      scan_run_id: scanRun.id,
      source: m.source || "unknown",
      content: m.content,
      author_name: m.author_name,
      author_handle: m.author_handle,
      author_verified: m.author_verified || false,
      author_follower_count: m.author_follower_count || 0,
      sentiment_label: m.sentiment_label,
      sentiment_score: m.sentiment_score,
      sentiment_confidence: m.sentiment_confidence,
      severity: m.severity || "low",
      language: m.language || "en",
      posted_at: m.posted_at,
      url: m.url,
      metrics: m.metrics || {},
      flags: m.flags || {},
      status: "new",
      owner_user_id: user.id,
    }));

    const { error: insertErr } = await supabase.from("mentions").insert(mentionRows);
    if (insertErr) throw insertErr;

    // Calculate stats
    const negCount = mentions.filter((m: any) =>
      m.sentiment_label === "negative" || m.sentiment_label === "mixed"
    ).length;
    const emergencyCount = mentions.filter((m: any) =>
      m.severity === "critical" || m.severity === "high"
    ).length;

    // Update scan_run with results
    await supabase
      .from("scan_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        total_mentions: mentions.length,
        negative_pct: Math.round((negCount / mentions.length) * 100),
        emergencies_count: emergencyCount,
      })
      .eq("id", scanRun.id);

    return new Response(
      JSON.stringify({
        scan_run_id: scanRun.id,
        mentions_created: mentions.length,
        negative_pct: Math.round((negCount / mentions.length) * 100),
        emergencies: emergencyCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("run-scan error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
