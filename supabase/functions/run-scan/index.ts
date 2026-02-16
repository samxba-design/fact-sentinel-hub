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

// Clean raw markdown/HTML into usable text
function cleanContent(raw: string): string {
  let text = raw;
  text = text.replace(/!\[.*?\]\(data:[^)]*\)/g, "");
  text = text.replace(/!\[.*?\]\([^)]*\)/g, "");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/data:image\/[^,]+,[^\s)]+/g, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[#*_~`>|]/g, "");
  text = text.replace(/[-=]{3,}/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  // Strip leading boilerplate
  text = text.replace(/^skip to (content|main|navigation)\s*/i, "");
  text = text.replace(/^(menu|navigation|home|about|contact|sign in|log in|subscribe)(\s+(menu|navigation|home|about|contact|sign in|log in|subscribe))*\s*/i, "");
  return text.trim();
}

// Convert date_from to Firecrawl tbs time filter
function dateToTbs(dateFrom: string | undefined): string | undefined {
  if (!dateFrom) return undefined;
  const diffMs = Date.now() - new Date(dateFrom).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays <= 1) return "qdr:d";
  if (diffDays <= 7) return "qdr:w";
  if (diffDays <= 30) return "qdr:m";
  if (diffDays <= 365) return "qdr:y";
  return undefined;
}

// Detect blocked/error pages and non-article junk
function isJunkContent(text: string): boolean {
  const blockers = [
    "blocked by an extension", "enable javascript", "access denied",
    "403 forbidden", "captcha", "please verify you are a human",
    "cloudflare", "just a moment", "checking your browser", "ray id",
    "please turn javascript on", "ERR_BLOCKED", "error 403",
    "that's an error", "you do not have access", "skip navigation",
    "sign in to youtube", "playback doesn't begin", "try restarting your device",
    "videos you watch may be added", "tap to unmute", "search with your voice",
    "cookie policy", "accept cookies", "we use cookies",
    "page not found", "404 not found", "500 internal server error",
    "view original source",
  ];
  const lower = text.toLowerCase();
  // If 2+ blockers match, definitely junk
  const matchCount = blockers.filter(b => lower.includes(b)).length;
  if (matchCount >= 2) return true;
  // Single match + short content = junk
  if (matchCount >= 1 && text.length < 200) return true;
  return false;
}

// Detect content that is a ticker/price list, sitemap, or navigation dump
function isNonArticleContent(text: string): boolean {
  const lower = text.toLowerCase();
  
  // Ticker/price pattern: repeated currency symbols with numbers (e.g. "$68,723.81 2.41%")
  const priceMatches = text.match(/\$[\d,]+\.?\d*\s+[\d.]+%/g);
  if (priceMatches && priceMatches.length >= 3) return true;
  
  // Crypto ticker pattern: repeated short uppercase tokens with % values
  const tickerMatches = text.match(/\b[A-Z]{2,5}\b\s+\$?[\d,]+\.?\d*\s+[\d.]+%/g);
  if (tickerMatches && tickerMatches.length >= 3) return true;
  
  // Sitemap-like: mostly URLs or link lists
  const urlCount = (text.match(/https?:\/\//g) || []).length;
  const wordCount = text.split(/\s+/).length;
  if (urlCount > 5 && urlCount > wordCount * 0.3) return true;
  
  // Navigation dump: very short "sentences" that are mostly nav labels
  const navPatterns = ["home", "about", "contact", "login", "sign up", "subscribe", "menu", "search", "privacy", "terms"];
  const navMatchCount = navPatterns.filter(p => lower.includes(p)).length;
  if (navMatchCount >= 5 && text.length < 500) return true;
  
  // Repetitive structure: same pattern repeated many times (like price tickers)
  // Split by common delimiters and check for pattern repetition
  const segments = text.split(/\\\\|[\n\r]+/).map(s => s.trim()).filter(s => s.length > 0);
  if (segments.length > 20) {
    // Check if >60% of segments are very short (typical of ticker/nav data)
    const shortSegments = segments.filter(s => s.length < 15);
    if (shortSegments.length > segments.length * 0.6) return true;
  }
  
  return false;
}

// Validate that content has enough substance to be a real article/post
function hasSubstantiveContent(text: string): boolean {
  // Must have at least some sentences (periods, question marks, etc.)
  const sentenceEnders = (text.match(/[.!?]/g) || []).length;
  if (sentenceEnders < 2 && text.length > 200) return false;
  
  // Must have a reasonable ratio of actual words vs symbols/numbers
  const words = text.split(/\s+/).filter(w => /[a-zA-Z]{3,}/.test(w));
  const totalTokens = text.split(/\s+/).length;
  if (totalTokens > 20 && words.length / totalTokens < 0.3) return false;
  
  return true;
}

// Classify source from URL
function classifySource(url: string, fallback: string): string {
  if (!url) return fallback;
  const lower = url.toLowerCase();
  if (lower.includes("trustpilot.com")) return "trustpilot";
  if (lower.includes("g2.com")) return "g2";
  if (lower.includes("glassdoor.com")) return "glassdoor";
  if (lower.includes("capterra.com")) return "capterra";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "twitter";
  if (lower.includes("reddit.com")) return "reddit";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("facebook.com")) return "facebook";
  if (lower.includes("linkedin.com")) return "linkedin";
  if (lower.includes("medium.com") || lower.includes("substack.com") || lower.includes("blog")) return "blog";
  if (lower.includes("forum") || lower.includes("community") || lower.includes("discuss")) return "forum";
  // Known news outlets override "review" label
  const newsOutlets = ["bbc.com", "bbc.co.uk", "cnn.com", "reuters.com", "nytimes.com", "theguardian.com", 
    "bloomberg.com", "forbes.com", "techcrunch.com", "wsj.com", "ft.com", "cnbc.com", "apnews.com"];
  if (newsOutlets.some(n => lower.includes(n))) return "news";
  return fallback;
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

    const { org_id, keywords, sources, date_from, date_to, review_urls, sentiment_filter } = await req.json();
    if (!org_id) throw new Error("org_id required");

    // Get org domain to filter out self-published content
    const { data: orgData } = await supabase
      .from("organizations")
      .select("domain, name")
      .eq("id", org_id)
      .single();
    const orgDomain = orgData?.domain?.toLowerCase() || "";
    const orgName = orgData?.name?.toLowerCase() || "";

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
    const configSnapshot = { keywords, sources, date_from, date_to, sentiment_filter };
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

    // Helper to call edge functions internally with timeout
    const callFunction = async (fnName: string, body: any): Promise<any> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout per source
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        return res.json();
      } finally {
        clearTimeout(timeout);
      }
    };

    // Run all source scans in PARALLEL to avoid timeout
    const scanPromises: Promise<void>[] = [];

    // Web/News via Firecrawl
    if (selectedSources.some(s => ["news", "blogs", "forums", "web"].includes(s))) {
      scanPromises.push((async () => {
        try {
          const webResult = await callFunction("scan-web", {
            keywords: keywords?.length > 0 ? keywords : ["brand"],
            limit: 10,
            tbs: dateToTbs(date_from),
          });
          if (webResult.success && webResult.results) {
            allResults.push(...webResult.results);
          } else if (webResult.error) {
            errors.push(`Web: ${webResult.error}`);
          }
        } catch (e: any) {
          errors.push(`Web: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // Reddit
    if (selectedSources.includes("reddit")) {
      scanPromises.push((async () => {
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
          errors.push(`Reddit: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // Twitter
    if (selectedSources.includes("twitter")) {
      scanPromises.push((async () => {
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
          errors.push(`Twitter: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // YouTube
    if (selectedSources.includes("youtube")) {
      scanPromises.push((async () => {
        try {
          const ytResult = await callFunction("scan-youtube", {
            org_id,
            keywords: keywords?.length > 0 ? keywords : ["brand"],
            limit: 15,
            include_comments: true,
            date_from,
            date_to,
          });
          if (ytResult.success && ytResult.results) {
            allResults.push(...ytResult.results);
          } else if (ytResult.error) {
            errors.push(`YouTube: ${ytResult.error}`);
          }
        } catch (e: any) {
          errors.push(`YouTube: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // Review sites
    if (selectedSources.includes("reviews")) {
      scanPromises.push((async () => {
        try {
          const reviewResult = await callFunction("scan-reviews", {
            keywords: keywords?.length > 0 ? keywords : ["brand"],
            review_urls: review_urls || [],
            limit: 10,
          });
          if (reviewResult.success && reviewResult.results) {
            allResults.push(...reviewResult.results);
          } else if (reviewResult.error) {
            errors.push(`Reviews: ${reviewResult.error}`);
          }
        } catch (e: any) {
          errors.push(`Reviews: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // Wait for all sources in parallel
    await Promise.all(scanPromises);

    // === CLEAN & FILTER results before AI analysis ===
    const dateFromMs = date_from ? new Date(date_from).getTime() : 0;
    const dateToMs = date_to ? new Date(date_to).getTime() : 0;
    const cleanedResults: RawResult[] = [];
    for (const r of allResults) {
      // Enforce date range across ALL sources
      if (dateFromMs > 0 && r.posted_at) {
        const postedMs = new Date(r.posted_at).getTime();
        if (postedMs < dateFromMs) {
          console.log("Filtering out-of-range result:", r.url, r.posted_at);
          continue;
        }
      }
      if (dateToMs > 0 && r.posted_at) {
        const postedMs = new Date(r.posted_at).getTime();
        if (postedMs > dateToMs) continue;
      }
      const cleaned = cleanContent(r.content || "");
      if (isJunkContent(r.content || "") || isJunkContent(cleaned)) {
        console.log("Filtering out blocked/junk content from:", r.url);
        continue;
      }
      if (isNonArticleContent(cleaned)) {
        console.log("Filtering out non-article content (ticker/sitemap/nav):", r.url);
        continue;
      }
      if (cleaned.length < 40) {
        console.log("Filtering out low-quality content:", r.url);
        continue;
      }
      if (!hasSubstantiveContent(cleaned)) {
        console.log("Filtering out non-substantive content:", r.url);
        continue;
      }
      // Filter out self-published content (from the org's own domain)
      const urlLower = (r.url || "").toLowerCase();
      if (orgDomain && urlLower.includes(orgDomain)) {
        console.log("Filtering out self-published content from org domain:", r.url);
        continue;
      }

      const correctedSource = classifySource(r.url || "", r.source);
      cleanedResults.push({ ...r, content: cleaned.slice(0, 800), source: correctedSource });
    }

    if (cleanedResults.length === 0) {
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
          message: errors.length > 0 ? errors.join("; ") : "No quality results found — sources may have blocked access",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use AI to analyze sentiment, severity, AND generate clean summaries
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
            content: `You are a reputation intelligence engine. For each mention, analyze AND rewrite the content.

For each mention, return:
- clean_summary: A clear 2-4 sentence summary of WHAT the article/post actually says. Focus on claims, facts, and opinions. NEVER include navigation text, cookie notices, ticker data, website UI elements, or boilerplate. If the raw text is mostly junk/navigation, write "Unable to extract meaningful content from this source."
- sentiment_label: "positive", "negative", "neutral", or "mixed"
- sentiment_score: number between -1 (very negative) and 1 (very positive)
- sentiment_confidence: number between 0 and 1
- severity: "low", "medium", "high", or "critical" based on reputational risk
- flags: { misinformation: bool, coordinated: bool, bot_likely: bool, viral_potential: bool }

CRITICAL rules for coordinated/bot detection:
- coordinated=true ONLY if mentions from DIFFERENT authors/domains share near-identical phrasing suggesting an organized campaign
- Do NOT flag multiple articles from the same website/news outlet as coordinated — that's just one source publishing multiple articles
- bot_likely=true only if the content appears auto-generated or the author seems non-human
- viral_potential=true if the content has high engagement potential or emotional charge

Return JSON: { "analyses": [ { "clean_summary": "...", "sentiment_label": "...", "sentiment_score": 0.5, "sentiment_confidence": 0.9, "severity": "low", "flags": {...} } ] }
Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Analyze these ${cleanedResults.length} mentions:\n${JSON.stringify(
              cleanedResults.map((r, i) => ({ index: i, source: r.source, url: r.url, author_name: r.author_name, title: r.title || "", content: r.content?.slice(0, 500) }))
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

    // Filter by sentiment if requested, then insert mentions
    let filteredResults = cleanedResults.map((r, i) => ({ result: r, analysis: analyses[i] || {} }));
    
    if (sentiment_filter && sentiment_filter !== "all") {
      filteredResults = filteredResults.filter(({ analysis }) => {
        const label = analysis.sentiment_label || "neutral";
        if (sentiment_filter === "negative") return label === "negative" || label === "mixed";
        if (sentiment_filter === "positive") return label === "positive";
        return true;
      });
    }

    // Filter out mentions where AI couldn't extract meaningful content
    filteredResults = filteredResults.filter(({ analysis }) => {
      const summary = analysis.clean_summary || "";
      return !summary.toLowerCase().includes("unable to extract meaningful content");
    });

    const mentionRows = filteredResults.map(({ result: r, analysis }) => {
      // Use AI-generated clean summary instead of raw scraped text
      const cleanSummary = analysis.clean_summary || r.content || "";
      return {
        org_id,
        scan_run_id: scanRun.id,
        source: r.source || "unknown",
        content: cleanSummary,
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

    if (mentionRows.length === 0) {
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
          message: sentiment_filter ? `No ${sentiment_filter} mentions found in results` : "No quality results found after AI filtering",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: insertedMentions, error: insertErr } = await supabase.from("mentions").insert(mentionRows).select("id");
    if (insertErr) throw insertErr;

    // === Narrative Auto-Clustering ===
    // Ask AI to cluster the mentions into narrative themes
    try {
      const narrativeRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: `You are a narrative intelligence engine. Given a set of mentions, identify distinct narrative themes.
For each narrative, provide:
- name: short descriptive name (e.g. "Security breach rumors")
- description: 1-2 sentence summary
- status: "active" or "watch"
- confidence: number 0-1
- example_phrases: array of 2-3 key phrases from the mentions
- mention_indices: array of indices (0-based) of mentions belonging to this narrative

Return JSON: { "narratives": [...] }
Only return narratives with 2+ mentions. Return ONLY valid JSON, no markdown.`,
            },
            {
              role: "user",
              content: `Cluster these ${filteredResults.length} mentions into narrative themes:\n${JSON.stringify(
                filteredResults.map(({ result: r, analysis }, i) => ({ index: i, source: r.source, content: (analysis.clean_summary || r.content)?.slice(0, 200) }))
              )}`,
            },
          ],
        }),
      });

      if (narrativeRes.ok) {
        const narrativeData = await narrativeRes.json();
        let rawNarr = narrativeData.choices?.[0]?.message?.content || "{}";
        rawNarr = rawNarr.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        try {
          const parsed = JSON.parse(rawNarr);
          const narrativeClusters = parsed.narratives || [];
          const mentionIds = (insertedMentions || []).map((m: any) => m.id);

          for (const cluster of narrativeClusters) {
            if (!cluster.name || !cluster.mention_indices?.length) continue;

            // Check if a similar narrative already exists
            const { data: existing } = await supabase
              .from("narratives")
              .select("id")
              .eq("org_id", org_id)
              .ilike("name", `%${cluster.name.slice(0, 20)}%`)
              .limit(1);

            let narrativeId: string;

            if (existing && existing.length > 0) {
              narrativeId = existing[0].id;
              // Update last_seen
              await supabase.from("narratives").update({
                last_seen: new Date().toISOString(),
                confidence: cluster.confidence || 0.5,
              }).eq("id", narrativeId);
            } else {
              const { data: newNarr } = await supabase.from("narratives").insert({
                org_id,
                name: cluster.name,
                description: cluster.description || "",
                status: cluster.status || "active",
                confidence: cluster.confidence || 0.5,
                example_phrases: cluster.example_phrases || [],
                first_seen: new Date().toISOString(),
                last_seen: new Date().toISOString(),
              }).select("id").single();
              if (!newNarr) continue;
              narrativeId = newNarr.id;
            }

            // Link mentions to narrative
            const links = cluster.mention_indices
              .filter((idx: number) => idx >= 0 && idx < mentionIds.length)
              .map((idx: number) => ({ mention_id: mentionIds[idx], narrative_id: narrativeId }));
            if (links.length > 0) {
              await supabase.from("mention_narratives").insert(links);
            }
          }
        } catch (e) {
          console.error("Failed to parse narrative clusters:", e);
        }
      }
    } catch (e: any) {
      console.error("Narrative clustering failed:", e.message);
      // Non-fatal — scan still succeeds
    }

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
    // Try to mark any running scan as failed
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);
      const body = await req.clone().json().catch(() => ({}));
      if (body.org_id) {
        await sb.from("scan_runs").update({
          status: "failed",
          finished_at: new Date().toISOString(),
        }).eq("org_id", body.org_id).eq("status", "running");
      }
    } catch { /* best effort */ }
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
