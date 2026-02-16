import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RawResult {
  source: string;
  content: string;
  title?: string;
  url?: string;
  author_name?: string;
  author_handle?: string;
  author_verified?: boolean;
  author_follower_count?: number;
  posted_at?: string;
  metrics?: { likes?: number; shares?: number; comments?: number };
  subreddit?: string;
}

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

    // Collect results from real sources
    const allResults: RawResult[] = [];
    const errors: string[] = [];
    const selectedSources: string[] = sources || ["news"];

    // Helper to call edge functions internally
    const callFunction = async (fnName: string, body: any): Promise<any> => {
      const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return res.json();
    };

    // Web/News via Firecrawl
    if (selectedSources.some(s => ["news", "blogs", "forums", "web"].includes(s))) {
      try {
        const webResult = await callFunction("scan-web", {
          keywords: keywords?.length > 0 ? keywords : ["brand"],
          limit: 10,
        });
        if (webResult.success && webResult.results) {
          allResults.push(...webResult.results);
        } else if (webResult.error) {
          errors.push(`Web: ${webResult.error}`);
        }
      } catch (e: any) {
        errors.push(`Web: ${e.message}`);
      }
    }

    // Reddit
    if (selectedSources.includes("reddit")) {
      try {
        const redditResult = await callFunction("scan-reddit", {
          org_id,
          keywords: keywords?.length > 0 ? keywords : ["brand"],
          limit: 25,
          time_filter: "week",
        });
        if (redditResult.success && redditResult.results) {
          allResults.push(...redditResult.results);
        } else if (redditResult.error) {
          errors.push(`Reddit: ${redditResult.error}`);
        }
      } catch (e: any) {
        errors.push(`Reddit: ${e.message}`);
      }
    }

    // Twitter
    if (selectedSources.includes("twitter")) {
      try {
        const twitterResult = await callFunction("scan-twitter", {
          org_id,
          keywords: keywords?.length > 0 ? keywords : ["brand"],
          max_results: 10,
          date_from,
          date_to,
        });
        if (twitterResult.success && twitterResult.results) {
          allResults.push(...twitterResult.results);
        } else if (twitterResult.error) {
          errors.push(`Twitter: ${twitterResult.error}`);
        }
      } catch (e: any) {
        errors.push(`Twitter: ${e.message}`);
      }
    }

    if (allResults.length === 0) {
      // Update scan as failed
      await supabase
        .from("scan_runs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          total_mentions: 0,
          negative_pct: 0,
          emergencies_count: 0,
        })
        .eq("id", scanRun.id);

      return new Response(
        JSON.stringify({
          scan_run_id: scanRun.id,
          mentions_created: 0,
          negative_pct: 0,
          emergencies: 0,
          errors,
          message: errors.length > 0 ? errors.join("; ") : "No results found",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use AI to analyze sentiment and severity of real results
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `You are a sentiment analysis engine. Analyze each mention and return structured data.
For each mention, determine:
- sentiment_label: "positive", "negative", "neutral", or "mixed"
- sentiment_score: number between -1 (very negative) and 1 (very positive)
- sentiment_confidence: number between 0 and 1
- severity: "low", "medium", "high", or "critical" based on reputational risk
- flags: { misinformation: bool, coordinated: bool, bot_likely: bool, viral_potential: bool }

Return a JSON array matching the input order:
{ "analyses": [ { "sentiment_label": "...", "sentiment_score": 0.5, "sentiment_confidence": 0.9, "severity": "low", "flags": {...} } ] }

Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Analyze these ${allResults.length} mentions:\n${JSON.stringify(
              allResults.map((r, i) => ({ index: i, source: r.source, content: r.content?.slice(0, 300) }))
            )}`,
          },
        ],
      }),
    });

    let analyses: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      let rawContent = aiData.choices?.[0]?.message?.content || "{}";
      rawContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      try {
        const parsed = JSON.parse(rawContent);
        analyses = parsed.analyses || parsed || [];
      } catch {
        console.error("Failed to parse AI analysis, using defaults");
      }
    }

    // Insert mentions with real data + AI analysis
    const mentionRows = allResults.map((r, i) => {
      const analysis = analyses[i] || {};
      return {
        org_id,
        scan_run_id: scanRun.id,
        source: r.source || "unknown",
        content: r.content || "",
        author_name: r.author_name || null,
        author_handle: r.author_handle || null,
        author_verified: r.author_verified || false,
        author_follower_count: r.author_follower_count || 0,
        sentiment_label: analysis.sentiment_label || "neutral",
        sentiment_score: analysis.sentiment_score || 0,
        sentiment_confidence: analysis.sentiment_confidence || 0.5,
        severity: analysis.severity || "low",
        language: "en",
        posted_at: r.posted_at || new Date().toISOString(),
        url: r.url || null,
        metrics: r.metrics || {},
        flags: analysis.flags || {},
        status: "new",
        owner_user_id: user.id,
      };
    });

    const { error: insertErr } = await supabase.from("mentions").insert(mentionRows);
    if (insertErr) throw insertErr;

    // Calculate stats
    const negCount = mentionRows.filter(m =>
      m.sentiment_label === "negative" || m.sentiment_label === "mixed"
    ).length;
    const emergencyCount = mentionRows.filter(m =>
      m.severity === "critical" || m.severity === "high"
    ).length;

    await supabase
      .from("scan_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        total_mentions: mentionRows.length,
        negative_pct: Math.round((negCount / mentionRows.length) * 100),
        emergencies_count: emergencyCount,
      })
      .eq("id", scanRun.id);

    return new Response(
      JSON.stringify({
        scan_run_id: scanRun.id,
        mentions_created: mentionRows.length,
        negative_pct: Math.round((negCount / mentionRows.length) * 100),
        emergencies: emergencyCount,
        errors: errors.length > 0 ? errors : undefined,
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
