import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAYWALL_INDICATORS = [
  "subscribe to read", "subscribers only", "premium content", "paywall",
  "sign in to continue reading", "this article is for subscribers",
  "to continue reading", "unlock this article", "membership required",
  "create a free account to continue", "already a subscriber",
  "exclusive to subscribers", "premium article", "paid content",
  "meter has been exhausted", "you've reached your limit",
  "free articles remaining", "register to continue",
];

function detectPaywall(content: string, html?: string): { is_paywalled: boolean; paywall_type: string | null } {
  const lower = (content + " " + (html || "")).toLowerCase();
  for (const indicator of PAYWALL_INDICATORS) {
    if (lower.includes(indicator)) {
      if (lower.includes("subscribe") || lower.includes("subscription")) return { is_paywalled: true, paywall_type: "subscription" };
      if (lower.includes("register") || lower.includes("sign in") || lower.includes("free account")) return { is_paywalled: true, paywall_type: "registration" };
      if (lower.includes("meter") || lower.includes("limit") || lower.includes("remaining")) return { is_paywalled: true, paywall_type: "metered" };
      return { is_paywalled: true, paywall_type: "hard" };
    }
  }
  if (content.length < 200 && (lower.includes("vanity fair") || lower.includes("new york times") || lower.includes("wall street journal") || lower.includes("financial times") || lower.includes("washington post") || lower.includes("the athletic"))) {
    return { is_paywalled: true, paywall_type: "likely" };
  }
  return { is_paywalled: false, paywall_type: null };
}

function sanitizeUrl(raw: string): string {
  let u = raw.trim();
  const httpsIdx = u.indexOf("https://", 1);
  const httpIdx = u.indexOf("http://", 1);
  const dupIdx = Math.min(
    httpsIdx > 0 ? httpsIdx : Infinity,
    httpIdx > 0 ? httpIdx : Infinity
  );
  if (dupIdx !== Infinity) {
    u = u.slice(0, dupIdx);
  }
  if (!u.startsWith("http://") && !u.startsWith("https://")) {
    u = `https://${u}`;
  }
  return u;
}

function extractJson(raw: string): any {
  // Strip markdown code fences
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  // Find JSON object boundaries
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let jsonStr = cleaned.slice(start, end + 1);
  // Fix trailing commas before } or ]
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
  // Remove control characters
  jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch) => ch === "\n" || ch === "\r" || ch === "\t" ? ch : "");
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try a more aggressive cleanup
    try {
      jsonStr = jsonStr.replace(/[\n\r\t]/g, " ");
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }
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
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { url, org_id } = await req.json();
    if (!url) throw new Error("URL is required");

    const formattedUrl = sanitizeUrl(url);
    console.log("[ANALYZE-LINK] Scraping URL:", formattedUrl);

    // Step 1: Scrape the page
    let markdown = "";
    let html = "";
    let pageTitle = "";
    let pageDescription = "";
    let scrapeSuccess = false;

    if (firecrawlKey) {
      try {
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: formattedUrl,
            formats: ["markdown", "html"],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });
        const scrapeData = await scrapeRes.json();
        if (scrapeData.success || scrapeData.data) {
          const d = scrapeData.data || scrapeData;
          markdown = d.markdown || "";
          html = d.html || "";
          pageTitle = d.metadata?.title || "";
          pageDescription = d.metadata?.description || "";
          scrapeSuccess = true;
        }
      } catch (e: any) {
        console.log("[ANALYZE-LINK] Firecrawl scrape failed, falling back:", e.message);
      }
    }

    if (!scrapeSuccess) {
      try {
        const res = await fetch(formattedUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SentiWatch/1.0)" },
          redirect: "follow",
        });
        const rawHtml = await res.text();
        const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
        pageTitle = titleMatch?.[1] || "";
        const descMatch = rawHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        pageDescription = descMatch?.[1] || "";
        markdown = rawHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 5000);
        html = rawHtml.slice(0, 3000);
      } catch (e: any) {
        console.log("[ANALYZE-LINK] Direct fetch failed:", e.message);
        markdown = `Could not access ${formattedUrl}: ${e.message}`;
      }
    }

    // Step 2: Paywall detection
    const paywallResult = detectPaywall(markdown, html);

    // Step 3: Related coverage search with AI relevance filtering
    let socialPickup: any[] = [];
    let mediaPickup: any[] = [];

    if (firecrawlKey) {
      const domain = new URL(formattedUrl).hostname.replace("www.", "");
      const pathSlug = new URL(formattedUrl).pathname.split("/").filter(Boolean).pop() || "";
      const searchQuery = pageTitle || pathSlug;

      if (searchQuery && searchQuery.length > 3) {
        try {
          const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `"${searchQuery}"`,
              limit: 15,
              tbs: "qdr:m",
            }),
          });
          const searchData = await searchRes.json();
          if (searchData.success && searchData.data) {
            const candidates: any[] = [];
            for (const result of searchData.data) {
              const resUrl = (result.url || "").toLowerCase();
              if (resUrl === formattedUrl.toLowerCase()) continue;
              try {
                const resDomain = new URL(result.url).hostname.replace("www.", "");
                if (resDomain === domain) continue;
              } catch {}
              candidates.push(result);
            }

            if (candidates.length > 0) {
              try {
                const filterRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${lovableKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "google/gemini-2.5-flash-lite",
                    temperature: 0,
                    messages: [
                      {
                        role: "system",
                        content: `You are a strict relevance judge. Given an article title and search results, return ONLY indices of results that discuss the EXACT SAME specific story, event, or subject. Results must be directly about the same topic — not just sharing a vague theme, keyword, or industry. If a result is about a different story even if it mentions the same person/company, it is NOT relevant. Return a JSON array of integers like [0, 2]. If none are relevant, return [].`,
                      },
                      {
                        role: "user",
                        content: `Article: "${pageTitle}"\nDescription: "${pageDescription}"\nSource: ${domain}\n\nResults:\n${candidates.map((c, i) => `[${i}] ${c.title} — ${c.description || ""} (${c.url})`).join("\n")}`,
                      },
                    ],
                  }),
                });
                if (filterRes.ok) {
                  const filterData = await filterRes.json();
                  const rawFilter = filterData.choices?.[0]?.message?.content || "[]";
                  const jsonMatch = rawFilter.match(/\[[\s\S]*?\]/);
                  const relevantIndices: number[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

                  const relevant = relevantIndices
                    .filter(i => i >= 0 && i < candidates.length)
                    .map(i => candidates[i]);

                  for (const result of relevant) {
                    const resUrl = (result.url || "").toLowerCase();
                    if (resUrl.includes("twitter.com") || resUrl.includes("x.com")) {
                      socialPickup.push({ platform: "twitter", url: result.url, title: result.title, snippet: result.description });
                    } else if (resUrl.includes("reddit.com")) {
                      socialPickup.push({ platform: "reddit", url: result.url, title: result.title, snippet: result.description });
                    } else if (resUrl.includes("linkedin.com")) {
                      socialPickup.push({ platform: "linkedin", url: result.url, title: result.title, snippet: result.description });
                    } else if (resUrl.includes("facebook.com")) {
                      socialPickup.push({ platform: "facebook", url: result.url, title: result.title, snippet: result.description });
                    } else if (resUrl.includes("youtube.com") || resUrl.includes("youtu.be")) {
                      socialPickup.push({ platform: "youtube", url: result.url, title: result.title, snippet: result.description });
                    } else {
                      mediaPickup.push({ url: result.url, title: result.title, snippet: result.description, domain: new URL(result.url).hostname.replace("www.", "") });
                    }
                  }
                }
              } catch (e: any) {
                console.log("[ANALYZE-LINK] Relevance filter failed:", e.message);
              }
            }
          }
        } catch (e: any) {
          console.log("[ANALYZE-LINK] Coverage search failed:", e.message);
        }
      }
    }

    // Step 4: Search engine visibility check
    let searchVisibility: any = null;
    if (firecrawlKey && pageTitle && pageTitle.length > 5) {
      try {
        // Search for the exact title to see how the article appears
        const seoRes = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `"${pageTitle.slice(0, 80)}"`,
            limit: 10,
          }),
        });
        const seoData = await seoRes.json();
        if (seoData.success && seoData.data) {
          const domain = new URL(formattedUrl).hostname.replace("www.", "");
          const exactMatches = seoData.data.filter((r: any) => {
            try {
              return new URL(r.url).hostname.replace("www.", "") === domain;
            } catch { return false; }
          });
          const isIndexed = exactMatches.length > 0;
          const rankPosition = seoData.data.findIndex((r: any) => {
            try {
              return new URL(r.url).hostname.replace("www.", "") === domain;
            } catch { return false; }
          });

          // Also search with key entity/topic terms to see how the content appears in related searches
          const competingResults = seoData.data
            .filter((r: any) => {
              try { return new URL(r.url).hostname.replace("www.", "") !== domain; } catch { return false; }
            })
            .slice(0, 5)
            .map((r: any) => ({
              title: r.title,
              url: r.url,
              domain: (() => { try { return new URL(r.url).hostname.replace("www.", ""); } catch { return r.url; } })(),
            }));

          searchVisibility = {
            is_indexed: isIndexed,
            search_rank: rankPosition >= 0 ? rankPosition + 1 : null,
            title_search_query: pageTitle.slice(0, 80),
            exact_match_count: exactMatches.length,
            competing_results: competingResults,
            search_snippet: exactMatches[0]?.description || null,
          };
        }
      } catch (e: any) {
        console.log("[ANALYZE-LINK] SEO check failed:", e.message);
      }
    }

    // Step 5: Check API connections
    const serviceClient = createClient(supabaseUrl, supabaseKey);
    let twitterConnected = false;
    let redditConnected = false;
    if (org_id) {
      const { data: keys } = await serviceClient
        .from("org_api_keys")
        .select("provider")
        .eq("org_id", org_id)
        .in("provider", ["twitter", "reddit"]);
      if (keys) {
        twitterConnected = keys.some(k => k.provider === "twitter");
        redditConnected = keys.some(k => k.provider === "reddit");
      }
    }

    // Step 6: Similar mentions
    let similarMentions: any[] = [];
    if (org_id && pageTitle) {
      const keywords = pageTitle.toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 3 && !["this", "that", "with", "from", "have", "been", "their", "about", "which", "would", "could", "should", "after", "before", "other", "these", "those", "than", "then", "into", "over", "also", "some", "more", "most", "very", "just", "even", "only"].includes(w));

      if (keywords.length >= 2) {
        const searchTerms = keywords.slice(0, 4).join(" & ");
        try {
          const { data: mentions } = await serviceClient
            .from("mentions")
            .select("id, content, url, source, sentiment_label, severity, posted_at, author_name")
            .eq("org_id", org_id)
            .neq("url", formattedUrl)
            .textSearch("content", searchTerms, { type: "plain" })
            .order("posted_at", { ascending: false })
            .limit(5);

          if (mentions && mentions.length > 0) {
            similarMentions = mentions.map(m => ({
              id: m.id,
              content: (m.content || "").slice(0, 150),
              url: m.url,
              source: m.source,
              sentiment: m.sentiment_label,
              severity: m.severity,
              posted_at: m.posted_at,
              author: m.author_name,
            }));
          }
        } catch (e: any) {
          console.log("[ANALYZE-LINK] Similar mentions search failed:", e.message);
        }
      }
    }

    // Step 7: AI Analysis — enhanced prompt
    const contentForAI = markdown.slice(0, 6000);
    const socialContext = socialPickup.length > 0
      ? `\n\nVerified social pickup: ${socialPickup.map(s => `${s.platform}: ${s.title}`).join(", ")}`
      : "\n\nNo verified social pickup found.";
    const mediaContext = mediaPickup.length > 0
      ? `\nVerified media coverage: ${mediaPickup.map(m => `${m.domain}: ${m.title}`).join(", ")}`
      : "\nNo additional media coverage found.";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.15,
        messages: [
          {
            role: "system",
            content: `You are an expert media intelligence analyst. Analyze the article content thoroughly and return a JSON object. Be precise — if information is unknown say "Unknown" or null. Never fabricate data.

Return ONLY valid JSON (no markdown fences, no extra text) with this exact structure:
{
  "headline": "article headline",
  "summary": "4-6 sentence detailed summary",
  "content_breakdown": {
    "main_topic": "primary subject",
    "key_points": ["point1", "point2", "point3", "point4"],
    "tone": "neutral reporting|investigative|promotional|opinion|analytical",
    "target_audience": "who this is for"
  },
  "brand_impact": {
    "brands_mentioned": [{"name": "X", "context": "how discussed", "sentiment_toward": "positive|negative|neutral|mixed"}],
    "overall_brand_risk": "none|low|medium|high|critical",
    "brand_opportunities": ["opportunity"],
    "brand_threats": ["threat"],
    "reputation_implications": "what this means for brands"
  },
  "reach_and_impact": {
    "estimated_reach": "audience estimate",
    "virality_potential": "low|medium|high",
    "virality_reasoning": "why",
    "shareability_factors": ["factor"]
  },
  "sentiment": {"label": "positive|negative|neutral|mixed", "score": 0.5, "confidence": 80, "reasoning": "why"},
  "narratives": ["narrative thread"],
  "claims": [{"text": "claim", "category": "fact|opinion|allegation|statistic", "verifiable": true}],
  "key_entities": [{"name": "entity", "role": "their role", "sentiment_toward": "positive|negative|neutral"}],
  "potential_impact": {"level": "low|medium|high|critical", "reasoning": "why", "affected_parties": ["who"]},
  "regional_scope": {"primary_region": "region", "relevant_regions": ["region"], "is_global": false},
  "content_type": "news|opinion|analysis|press_release|blog|report|interview|other",
  "publication_date": "ISO date or null",
  "author": "name or null",
  "reliability": {"score": 70, "factors": ["factor"], "source_type": "mainstream|independent|trade|social|unknown"},
  "recommended_actions": ["action"]
}`,
          },
          {
            role: "user",
            content: `Analyze this content from ${formattedUrl}:\n\nTitle: ${pageTitle}\nDescription: ${pageDescription}\n${paywallResult.is_paywalled ? `⚠️ PAYWALL (${paywallResult.paywall_type}): Content may be partial.` : ""}${socialContext}${mediaContext}\n\nContent:\n${contentForAI}`,
          },
        ],
      }),
    });

    let analysis: any = {};
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      // Try tool call first, then content
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      const raw = toolCall?.function?.arguments || aiData.choices?.[0]?.message?.content || "";
      if (raw) {
        const parsed = extractJson(raw);
        if (parsed) {
          analysis = parsed;
        } else {
          try { analysis = JSON.parse(raw); } catch {
            analysis = { summary: raw.slice(0, 500), error: "parse_error" };
          }
        }
      }
      console.log("[ANALYZE-LINK] AI analysis keys:", Object.keys(analysis).join(", "));
    } else {
      const errText = await aiRes.text();
      console.log("[ANALYZE-LINK] AI request failed:", aiRes.status, errText.slice(0, 300));
      analysis = { summary: "AI analysis temporarily unavailable. Content was scraped successfully.", error: `ai_${aiRes.status}` };
    }

    const knownUnknown = {
      content_accessible: scrapeSuccess && markdown.length > 100,
      paywall_status: paywallResult.is_paywalled ? `Paywalled (${paywallResult.paywall_type})` : "Accessible",
      social_pickup_found: socialPickup.length > 0,
      media_pickup_found: mediaPickup.length > 0,
      twitter_connected: twitterConnected,
      reddit_connected: redditConnected,
      twitter_connection_needed: !twitterConnected,
      reddit_connection_needed: !redditConnected,
      content_length: markdown.length,
    };

    const result = {
      success: true,
      url: formattedUrl,
      title: pageTitle || analysis.headline || "Unknown",
      description: pageDescription,
      paywall: paywallResult,
      analysis,
      social_pickup: socialPickup,
      media_pickup: mediaPickup,
      similar_mentions: similarMentions,
      search_visibility: searchVisibility,
      data_confidence: knownUnknown,
      scanned_at: new Date().toISOString(),
    };

    console.log("[ANALYZE-LINK] Complete:", formattedUrl, `| Social: ${socialPickup.length} | Media: ${mediaPickup.length} | Similar: ${similarMentions.length} | SEO: ${searchVisibility?.is_indexed ?? "N/A"}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[ANALYZE-LINK] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
