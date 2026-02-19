import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Paywall indicators in HTML/content
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

// Sanitize URL — prevent doubling, clean whitespace
function sanitizeUrl(raw: string): string {
  let u = raw.trim();
  // Remove URL duplication (e.g. "https://example.comhttps://example.com")
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

    // Fallback: use fetch directly
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

    // Step 3: Search for related coverage — with AI relevance filtering
    let socialPickup: any[] = [];
    let mediaPickup: any[] = [];
    
    if (firecrawlKey) {
      const domain = new URL(formattedUrl).hostname.replace("www.", "");
      const pathSlug = new URL(formattedUrl).pathname.split("/").filter(Boolean).pop() || "";
      // Use the page title for search if available, otherwise path slug
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
              query: searchQuery,
              limit: 15,
              tbs: "qdr:m",
            }),
          });
          const searchData = await searchRes.json();
          if (searchData.success && searchData.data) {
            // Collect raw candidates — exclude self
            const candidates: any[] = [];
            for (const result of searchData.data) {
              const resUrl = (result.url || "").toLowerCase();
              if (resUrl === formattedUrl.toLowerCase()) continue;
              // Skip same-domain results (not really "pickup")
              try {
                const resDomain = new URL(result.url).hostname.replace("www.", "");
                if (resDomain === domain) continue;
              } catch {}
              candidates.push(result);
            }

            // AI relevance filter — ask the model to filter only truly related results
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
                        content: `You are a relevance judge. Given an article title and a list of search results, return ONLY the indices (0-based) of results that are DIRECTLY about the same topic, event, or story as the article. A result must discuss the same specific subject matter — not just share a vague theme or keyword.

Return a JSON array of integers like [0, 2, 5]. If none are relevant, return [].`,
                      },
                      {
                        role: "user",
                        content: `Article: "${pageTitle}"\nDescription: "${pageDescription}"\nSource domain: ${domain}\n\nSearch results:\n${candidates.map((c, i) => `[${i}] ${c.title} — ${c.description || ""} (${c.url})`).join("\n")}`,
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
                console.log("[ANALYZE-LINK] Relevance filter failed, skipping:", e.message);
                // Don't show unfiltered results — better to show nothing than inaccurate data
              }
            }
          }
        } catch (e: any) {
          console.log("[ANALYZE-LINK] Social search failed:", e.message);
        }
      }
    }

    // Step 4: Check for Twitter/Reddit API availability
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

    // Step 5: Find similar content from existing mentions
    let similarMentions: any[] = [];
    if (org_id && pageTitle) {
      // Search mentions that share keywords with this article
      const keywords = pageTitle.toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 3 && !["this", "that", "with", "from", "have", "been", "their", "about", "which", "would", "could", "should", "after", "before", "other", "these", "those", "than", "then", "into", "over", "also", "some", "more", "most", "very", "just", "even", "only"].includes(w));

      if (keywords.length >= 2) {
        // Use the top 4 most distinctive keywords for a text search
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
          // Non-critical — continue
        }
      }
    }

    // Step 6: AI Analysis
    const contentForAI = markdown.slice(0, 4000);
    const socialContext = socialPickup.length > 0
      ? `\n\nVerified social pickup found on: ${socialPickup.map(s => `${s.platform} (${s.title})`).join(", ")}`
      : "\n\nNo verified social pickup found.";
    const mediaContext = mediaPickup.length > 0
      ? `\nVerified media coverage: ${mediaPickup.map(m => `${m.domain}: ${m.title}`).join(", ")}`
      : "\nNo verified additional media coverage found.";

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
            content: `You are a media intelligence analyst. Analyze the given article/content and return a JSON report. Be precise and factual. If information is unknown, explicitly say "Unknown" or "Could not determine". Never fabricate data.

Return valid JSON with this structure:
{
  "headline": "string - main headline or title",
  "summary": "string - 3-4 sentence summary of the content",
  "sentiment": { "label": "positive|negative|neutral|mixed", "score": -1.0 to 1.0, "confidence": 0-100, "reasoning": "why this sentiment" },
  "narratives": ["string - key narrative threads identified"],
  "claims": [{ "text": "specific factual claim", "category": "fact|opinion|allegation|statistic", "verifiable": true/false }],
  "key_entities": [{ "name": "person/org name", "role": "their role in the story", "sentiment_toward": "positive|negative|neutral" }],
  "potential_impact": { "level": "low|medium|high|critical", "reasoning": "why this impact level", "affected_parties": ["who is affected"] },
  "regional_scope": { "primary_region": "country/region or Global", "relevant_regions": ["list of regions where this matters"], "is_global": true/false },
  "content_type": "news|opinion|analysis|press_release|social_post|blog|report|other",
  "publication_date": "ISO date if detectable or null",
  "author": "author name if detectable or null",
  "reliability": { "score": 0-100, "factors": ["what affects reliability"], "source_type": "mainstream|independent|social|unknown" },
  "social_sharing_assessment": "string - assessment of social spread potential and current sharing activity",
  "recommended_actions": ["string - what should be done about this content"]
}`,
          },
          {
            role: "user",
            content: `Analyze this content from ${formattedUrl}:

Title: ${pageTitle}
Description: ${pageDescription}
${paywallResult.is_paywalled ? `⚠️ PAYWALL DETECTED (${paywallResult.paywall_type}): Content may be partial.` : ""}
${socialContext}
${mediaContext}

Content:
${contentForAI}`,
          },
        ],
      }),
    });

    let analysis: any = {};
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const raw = aiData.choices?.[0]?.message?.content || "";
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
      } catch {
        analysis = { summary: raw, error: "Could not parse structured analysis" };
      }
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
      data_confidence: knownUnknown,
      scanned_at: new Date().toISOString(),
    };

    console.log("[ANALYZE-LINK] Analysis complete for:", formattedUrl, `| Social: ${socialPickup.length} | Media: ${mediaPickup.length} | Similar: ${similarMentions.length}`);

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
