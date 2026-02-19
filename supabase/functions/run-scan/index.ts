import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
  date_verified?: boolean;
  date_source?: string;
  matched_query?: string;
}

// Group keywords by type for focused searches
function groupKeywords(allKeywords: { value: string; type: string }[]): { brand: string[]; risk: string[]; product: string[] } {
  const brand: string[] = [];
  const risk: string[] = [];
  const product: string[] = [];
  for (const kw of allKeywords) {
    if (kw.type === "brand" || kw.type === "alias") brand.push(kw.value);
    else if (kw.type === "risk") risk.push(kw.value);
    else if (kw.type === "product") product.push(kw.value);
    else brand.push(kw.value); // default to brand
  }
  return { brand, risk, product };
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
  // Strip nav fragments anywhere: "Digital Assets - News - Crypto Prices - NFT Prices"
  text = text.replace(/(?:^|\s)(?:[A-Z][a-zA-Z&]{0,20}\s*-\s*){2,}[A-Z][a-zA-Z&]{0,20}(?:\s|$)/g, " ");
  // Strip crypto ticker bars
  text = text.replace(/\b[A-Z]{2,5}\s+\$[\d,]+\.?\d*\s+[\d.]+%\s*/g, "");
  // Strip common UI junk
  text = text.replace(/\b(sign up|log in|sign in|create account|get started|download app)\b[^.]{0,30}(sign up|log in|sign in|create account|get started)\b/gi, " ");
  text = text.replace(/\b(cookie|privacy) (policy|notice|settings)\b[^.]*\./gi, " ");
  text = text.replace(/\b(share|tweet|pin|email)\s+(this|on|via)\b[^.]{0,30}/gi, " ");
  text = text.replace(/©\s*\d{4}[^.]*\./g, " ");
  text = text.replace(/all rights reserved[^.]*\.?/gi, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

// (dateToTbs removed — no longer needed with Gemini discovery)

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

// Detect content that is PRIMARILY a ticker/price list, sitemap, or navigation dump
// Only reject if the content is MOSTLY junk, not if it has a few tickers mixed with real article text
function isNonArticleContent(text: string): boolean {
  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).length;
  
  // Ticker/price pattern: only reject if tickers dominate (>50% of content)
  const priceMatches = text.match(/\$[\d,]+\.?\d*\s+[\d.]+%/g);
  if (priceMatches && priceMatches.length >= 5 && wordCount < priceMatches.length * 15) return true;
  
  // Sitemap-like: mostly URLs or link lists
  const urlCount = (text.match(/https?:\/\//g) || []).length;
  if (urlCount > 10 && urlCount > wordCount * 0.3) return true;
  
  // Navigation dump: very short content that is mostly nav labels
  const navPatterns = ["home", "about", "contact", "login", "sign up", "subscribe", "menu", "search", "privacy", "terms"];
  const navMatchCount = navPatterns.filter(p => lower.includes(p)).length;
  if (navMatchCount >= 6 && text.length < 300) return true;
  
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

// Paywall detection indicators
const PAYWALL_INDICATORS = [
  "subscribe to read", "subscribers only", "premium content", "paywall",
  "sign in to continue reading", "this article is for subscribers",
  "to continue reading", "unlock this article", "membership required",
  "create a free account to continue", "already a subscriber",
  "exclusive to subscribers", "premium article", "paid content",
  "meter has been exhausted", "you've reached your limit",
  "free articles remaining", "register to continue",
];

function detectPaywall(content: string): { is_paywalled: boolean; paywall_type: string | null } {
  const lower = content.toLowerCase();
  for (const indicator of PAYWALL_INDICATORS) {
    if (lower.includes(indicator)) {
      if (lower.includes("subscribe") || lower.includes("subscription")) return { is_paywalled: true, paywall_type: "subscription" };
      if (lower.includes("register") || lower.includes("sign in") || lower.includes("free account")) return { is_paywalled: true, paywall_type: "registration" };
      if (lower.includes("meter") || lower.includes("limit") || lower.includes("remaining")) return { is_paywalled: true, paywall_type: "metered" };
      return { is_paywalled: true, paywall_type: "hard" };
    }
  }
  // Short content from known paywall sites
  if (content.length < 200) {
    const paywallDomains = ["vanity fair", "new york times", "wall street journal", "financial times", "washington post", "the athletic"];
    if (paywallDomains.some(d => lower.includes(d))) return { is_paywalled: true, paywall_type: "likely" };
  }
  return { is_paywalled: false, paywall_type: null };
}

// Blocklist of evergreen/reference domains that are never "news" or "threats"
const EVERGREEN_DOMAINS = new Set([
  "en.wikipedia.org", "wikipedia.org",
  "investopedia.com", "www.investopedia.com",
  "help.wealthsimple.com", "wealthsimple.com",
  "apps.apple.com", "play.google.com",
  "ca.investing.com", "investing.com",
  "support.google.com", "support.apple.com",
  "docs.google.com", "help.coinbase.com",
  "academy.binance.com", "www.binance.com",
  "kraken.com", "support.kraken.com",
  "gemini.com", "support.gemini.com",
  "howstuffworks.com", "about.com",
  "dictionary.com", "merriam-webster.com",
  "britannica.com", "www.britannica.com",
  "corporatefinanceinstitute.com",
  "nerdwallet.com", "bankrate.com",
]);

// Known review site homepages (not individual review pages)
function isGenericReviewPage(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  // Block generic Glassdoor/Capterra/G2 overview pages (not review-specific pages with dates)
  if ((lower.includes("glassdoor.com/Overview") || lower.includes("glassdoor.com/Reviews")) && !lower.includes("?sort.sortType=RD")) return true;
  if (lower.includes("capterra.com/p/") && lower.endsWith("/reviews/")) return false; // actual reviews OK
  if (lower.includes("capterra.com") && !lower.includes("/reviews/")) return true;
  if (lower.includes("g2.com/products/") && !lower.includes("/reviews")) return true;
  if (lower.includes("trustpilot.com/review/") && lower.includes("?page=")) return false; // paginated reviews OK
  return false;
}

function isEvergreenDomain(url: string): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.replace("www.", "").toLowerCase();
    return EVERGREEN_DOMAINS.has(hostname);
  } catch { return false; }
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

    const { org_id, keywords: rawKeywords, sources, date_from, date_to, review_urls, sentiment_filter } = await req.json();
    // rawKeywords can be string[] (legacy) or we load structured keywords from DB
    if (!org_id) throw new Error("org_id required");

    // Get org domain to filter out self-published content
    const { data: orgData } = await supabase
      .from("organizations")
      .select("domain, name")
      .eq("id", org_id)
      .single();
    const orgDomain = orgData?.domain?.toLowerCase() || "";
    const orgName = orgData?.name?.toLowerCase() || "";

    // Load ignored source domains
    const { data: ignoredSourcesData } = await supabase
      .from("ignored_sources")
      .select("domain")
      .eq("org_id", org_id);
    const ignoredDomains = new Set((ignoredSourcesData || []).map((s: any) => s.domain.toLowerCase()));

    // Verify membership
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("org_id", org_id)
      .not("accepted_at", "is", null)
      .maybeSingle();
    if (!membership) throw new Error("Not a member of this org");

    // Load structured keywords from DB for smart grouping
    const { data: keywordRows } = await supabase
      .from("keywords")
      .select("value, type")
      .eq("org_id", org_id)
      .eq("status", "active");
    
    const structuredKws = keywordRows || [];
    const keywords = rawKeywords?.length > 0 ? rawKeywords : structuredKws.map((k: any) => k.value);
    const kwGroups = groupKeywords(structuredKws.length > 0 ? structuredKws : keywords.map((v: string) => ({ value: v, type: "brand" })));
    
    // Create scan_run with keyword groups for transparency
    const configSnapshot = { keywords, sources, date_from, date_to, sentiment_filter, keyword_groups: kwGroups };
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
    const scanLog: { source: string; query: string; found: number }[] = [];
    const selectedSources: string[] = sources || ["news", "google-news", "reddit", "social"];

    // Helper to call edge functions internally with timeout
    const callFunction = async (fnName: string, body: any): Promise<any> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
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

    // Run all source scans in PARALLEL
    const scanPromises: Promise<void>[] = [];
    const brandKws = kwGroups.brand.length > 0 ? kwGroups.brand.slice(0, 7) : keywords.slice(0, 7);

    // === SMART KEYWORD GROUPING for Web/News ===
    if (selectedSources.some(s => ["news", "blogs", "forums", "web"].includes(s))) {
      // Search 1: Brand keywords — general news discovery via Gemini
      scanPromises.push((async () => {
        try {
          const webResult = await callFunction("scan-web", {
            keywords: brandKws,
            limit: 20,
            date_from,
            date_to,
            search_type: "general",
          });
          if (webResult.success && webResult.results) {
            allResults.push(...webResult.results);
            scanLog.push({ source: "web-brand", query: webResult.query_used || brandKws.join(", "), found: webResult.results.length });
          } else if (webResult.error) {
            errors.push(`Web (brand): ${webResult.error}`);
          }
        } catch (e: any) {
          errors.push(`Web (brand): ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());

      // Search 2: Brand + Risk keywords — threat-focused discovery via Gemini
      if (kwGroups.risk.length > 0 && kwGroups.brand.length > 0) {
        const primaryBrand = kwGroups.brand[0];
        const riskKws = kwGroups.risk.slice(0, 4).map(r => `${primaryBrand} ${r}`);
        scanPromises.push((async () => {
          try {
            const webResult = await callFunction("scan-web", {
              keywords: riskKws,
              limit: 15,
              date_from,
              date_to,
              search_type: "risk",
            });
            if (webResult.success && webResult.results) {
              allResults.push(...webResult.results);
              scanLog.push({ source: "web-risk", query: webResult.query_used || riskKws.join(", "), found: webResult.results.length });
            } else if (webResult.error) {
              errors.push(`Web (risk): ${webResult.error}`);
            }
          } catch (e: any) {
            errors.push(`Web (risk): ${e.name === "AbortError" ? "Timed out" : e.message}`);
          }
        })());
      }
    }

    // === Google News — Gemini discovery with site prioritization ===
    if (selectedSources.includes("google-news")) {
      scanPromises.push((async () => {
        try {
          const gnResult = await callFunction("scan-web", {
            keywords: brandKws.slice(0, 3),
            sites: ["reuters.com", "bloomberg.com", "cnbc.com", "bbc.com", "techcrunch.com", "forbes.com", "coindesk.com", "cointelegraph.com", "theblock.co", "decrypt.co", "theverge.com", "wired.com"],
            limit: 15,
            date_from,
            date_to,
            search_type: "general",
          });
          if (gnResult.success && gnResult.results) {
            allResults.push(...gnResult.results);
            scanLog.push({ source: "google-news", query: gnResult.query_used || "", found: gnResult.results.length });
          } else if (gnResult.error) {
            errors.push(`Google News: ${gnResult.error}`);
          }
        } catch (e: any) {
          errors.push(`Google News: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // === Reddit: try API first, fallback to web search ===
    if (selectedSources.includes("reddit")) {
      scanPromises.push((async () => {
        try {
          // Try Reddit API first
          const diffDays = date_from ? (Date.now() - new Date(date_from).getTime()) / (1000 * 60 * 60 * 24) : 7;
          const redditTimeFilter = diffDays <= 1 ? "day" : diffDays <= 7 ? "week" : diffDays <= 30 ? "month" : "year";
          const redditResult = await callFunction("scan-reddit", {
            org_id,
            keywords: brandKws,
            limit: 25,
            time_filter: redditTimeFilter,
          });
          if (redditResult.success && redditResult.results?.length > 0) {
            allResults.push(...redditResult.results);
            scanLog.push({ source: "reddit-api", query: brandKws.join(" OR "), found: redditResult.results.length });
          } else {
            // Fallback: search Reddit via Gemini discovery
            console.log("Reddit API unavailable or returned no results, falling back to AI discovery");
            const redditQueries = brandKws.slice(0, 3).map(k => `${k} reddit discussion`);
            const webRedditResult = await callFunction("scan-web", {
              keywords: redditQueries,
              limit: 20,
              date_from,
              search_type: "social",
            });
            if (webRedditResult.success && webRedditResult.results) {
              allResults.push(...webRedditResult.results);
              scanLog.push({ source: "reddit-web", query: webRedditResult.query_used || "", found: webRedditResult.results.length });
            }
          }
        } catch (e: any) {
          // Fallback on error too
          try {
            const redditQueries2 = brandKws.slice(0, 3).map(k => `${k} reddit discussion`);
            const webRedditResult = await callFunction("scan-web", {
              keywords: redditQueries2,
              limit: 20,
              date_from,
              search_type: "social",
            });
            if (webRedditResult.success && webRedditResult.results) {
              allResults.push(...webRedditResult.results);
              scanLog.push({ source: "reddit-web", query: webRedditResult.query_used || "", found: webRedditResult.results.length });
            }
          } catch { /* skip */ }
          errors.push(`Reddit: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // === Social Media via web search (Twitter/X, LinkedIn) ===
    // Note: Facebook is manual-only — no public search API or scraping available
    if (selectedSources.includes("social") || selectedSources.some(s => ["twitter", "linkedin"].includes(s))) {
      scanPromises.push((async () => {
        try {
          const socialQueries = brandKws.slice(0, 3).map(k => `${k} social media discussion`);
          const socialResult = await callFunction("scan-web", {
            keywords: socialQueries,
            limit: 15,
            date_from,
            date_to,
            search_type: "social",
          });
          if (socialResult.success && socialResult.results) {
            allResults.push(...socialResult.results);
            scanLog.push({ source: "social-web", query: socialResult.query_used || "", found: socialResult.results.length });
          } else if (socialResult.error) {
            errors.push(`Social: ${socialResult.error}`);
          }
        } catch (e: any) {
          errors.push(`Social: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // Twitter (dedicated API)
    if (selectedSources.includes("twitter")) {
      scanPromises.push((async () => {
        try {
          const twitterResult = await callFunction("scan-twitter", {
            org_id,
            keywords: brandKws,
            max_results: 15,
            date_from,
            date_to,
          });
          if (twitterResult.success && twitterResult.results) {
            allResults.push(...twitterResult.results);
            scanLog.push({ source: "twitter", query: "", found: twitterResult.results.length });
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
            keywords: brandKws,
            limit: 15,
            include_comments: true,
            date_from,
            date_to,
          });
          if (ytResult.success && ytResult.results) {
            allResults.push(...ytResult.results);
            scanLog.push({ source: "youtube", query: "", found: ytResult.results.length });
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
            keywords: brandKws,
            review_urls: review_urls || [],
            limit: 10,
          });
          if (reviewResult.success && reviewResult.results) {
            allResults.push(...reviewResult.results);
            scanLog.push({ source: "reviews", query: "", found: reviewResult.results.length });
          } else if (reviewResult.error) {
            errors.push(`Reviews: ${reviewResult.error}`);
          }
        } catch (e: any) {
          errors.push(`Reviews: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // App Store reviews (Apple App Store & Google Play)
    if (selectedSources.includes("app-store")) {
      scanPromises.push((async () => {
        try {
          const appResult = await callFunction("scan-app-store", {
            keywords: brandKws,
            limit: 10,
          });
          if (appResult.success && appResult.results) {
            allResults.push(...appResult.results);
            scanLog.push({ source: "app-store", query: brandKws.join(", "), found: appResult.results.length });
          } else if (appResult.error) {
            errors.push(`App Store: ${appResult.error}`);
          }
        } catch (e: any) {
          errors.push(`App Store: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // Podcasts
    if (selectedSources.includes("podcasts")) {
      scanPromises.push((async () => {
        try {
          const podResult = await callFunction("scan-podcasts", {
            keywords: brandKws,
            limit: 10,
          });
          if (podResult.success && podResult.results) {
            allResults.push(...podResult.results);
            scanLog.push({ source: "podcasts", query: brandKws.join(", "), found: podResult.results.length });
          } else if (podResult.error) {
            errors.push(`Podcasts: ${podResult.error}`);
          }
        } catch (e: any) {
          errors.push(`Podcasts: ${e.name === "AbortError" ? "Timed out" : e.message}`);
        }
      })());
    }

    // Wait for all sources in parallel
    await Promise.all(scanPromises);

    // === CLEAN & FILTER results before AI analysis ===
    const dateFromMs = date_from ? new Date(date_from).getTime() : 0;
    const dateToMs = date_to ? new Date(date_to).getTime() : 0;
    const cleanedResults: RawResult[] = [];
    const seenUrls = new Set<string>();
    for (const r of allResults) {
      // Block evergreen/reference domains
      if (isEvergreenDomain(r.url || "")) {
        console.log("Filtering evergreen domain:", r.url);
        continue;
      }
      // Block generic review site overview pages
      if (isGenericReviewPage(r.url || "")) {
        console.log("Filtering generic review page:", r.url);
        continue;
      }
      // Deduplicate by URL
      if (r.url) {
        const normalizedUrl = r.url.toLowerCase().replace(/\/$/, "");
        if (seenUrls.has(normalizedUrl)) {
          console.log("Filtering duplicate URL:", r.url);
          continue;
        }
        seenUrls.add(normalizedUrl);
      }
      // Enforce date range for ALL sources that have a posted_at date
      if (dateFromMs > 0 && r.posted_at) {
        const postedMs = new Date(r.posted_at).getTime();
        if (postedMs < dateFromMs) {
          console.log("Filtering out-of-range result:", r.url, r.posted_at);
          continue;
        }
      }
      if (dateToMs > 0 && r.posted_at) {
        const postedMs = new Date(r.posted_at).getTime();
        if (postedMs > dateToMs) {
          console.log("Filtering future result:", r.url, r.posted_at);
          continue;
        }
      }
      // Accept undated results — they were already accepted by scan-web with accept_undated: true
      // Mark them with date_verified: false (already in flags) so the UI can badge them
      if (!r.posted_at && !r.date_verified) {
        r.date_verified = false;
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
      // Filter out ignored source domains
      try {
        const urlDomain = new URL(r.url || "").hostname.replace("www.", "").toLowerCase();
        if (ignoredDomains.has(urlDomain)) {
          console.log("Filtering out ignored source domain:", r.url);
          continue;
        }
      } catch { /* skip URL parse errors */ }

      const correctedSource = classifySource(r.url || "", r.source);
      cleanedResults.push({ ...r, content: cleaned.slice(0, 800), source: correctedSource });
    }

    if (cleanedResults.length === 0) {
      // Build descriptive reason for zero results
      const reasons: string[] = [];
      if (allResults.length === 0) {
        reasons.push("No content found from any source. This can happen if keywords are too specific or sources are inaccessible.");
      } else {
        reasons.push(`${allResults.length} raw results were found but all were filtered out.`);
        const evergreenCount = allResults.filter(r => isEvergreenDomain(r.url || "")).length;
        const junkCount = allResults.filter(r => isJunkContent(r.content || "") || isJunkContent(cleanContent(r.content || ""))).length;
        const shortCount = allResults.filter(r => cleanContent(r.content || "").length < 40).length;
        const selfCount = orgDomain ? allResults.filter(r => (r.url || "").toLowerCase().includes(orgDomain)).length : 0;
        const ignoredCount = allResults.filter(r => { try { return ignoredDomains.has(new URL(r.url || "").hostname.replace("www.", "").toLowerCase()); } catch { return false; } }).length;
        if (evergreenCount > 0) reasons.push(`${evergreenCount} were reference/evergreen pages (Wikipedia, etc.)`);
        if (junkCount > 0) reasons.push(`${junkCount} were blocked/error pages`);
        if (shortCount > 0) reasons.push(`${shortCount} had insufficient content`);
        if (selfCount > 0) reasons.push(`${selfCount} were from your own domain`);
        if (ignoredCount > 0) reasons.push(`${ignoredCount} were from ignored sources`);
      }

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
          total_found: allResults.length,
          negative_pct: 0,
          emergencies: 0,
          errors,
          scan_log: scanLog,
          keyword_groups: kwGroups,
          zero_results_reason: reasons.join(" "),
          message: reasons.join(" "),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === TWO-PASS AI ANALYSIS ===
    // Pass 1: Relevance + Sentiment (combined for efficiency)
    const brandContext = orgData?.name || brandKws[0] || "the brand";
    const brandAliases = kwGroups.brand.join(", ");
    
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: `You are a reputation intelligence engine monitoring "${brandContext}" (also known as: ${brandAliases}).

For each mention, you MUST first determine RELEVANCE then analyze sentiment.

RELEVANCE RULES (CRITICAL — be VERY strict):
- relevant=true ONLY if the content describes a SPECIFIC, RECENT EVENT, NEWS STORY, USER EXPERIENCE, or OPINION about "${brandContext}"
- relevant=false if ANY of these apply:
  - The content is an evergreen/reference page (Wikipedia, encyclopedia, "what is X", explainer, tutorial, FAQ, help doc)
  - The content is a product listing, app store description, or marketing page
  - The content is a company overview, career page, or investor page
  - The content merely lists "${brandContext}" in a table, sidebar, menu, or comparison chart
  - The content is a generic review site page (Glassdoor overview, Capterra overview, G2 overview) — NOT a specific review with a date
  - The content is primarily about a DIFFERENT entity and only mentions "${brandContext}" in passing (e.g., an article about CZ's investments that tangentially mentions Binance)
  - The content describes a historical event (>3 months old) without new developments
  - The content is a tag page, category page, or index page
  - The content is a market data / price ticker page
- PRECISION over RECALL: when in doubt, reject. It is better to miss one real mention than to include 5 irrelevant ones.

For RELEVANT mentions only, also return:
- clean_summary: 2-4 sentence summary of a SPECIFIC event/opinion about "${brandContext}". Must describe WHAT happened, WHEN, and WHY it matters to the brand's reputation. NEVER include boilerplate.
- sentiment_label: "positive", "negative", "neutral", or "mixed" (relative to "${brandContext}")
- sentiment_score: -1 (very negative) to 1 (very positive)
- sentiment_confidence: 0 to 1
- severity: "low", "medium", "high", or "critical" based on reputational risk to "${brandContext}"
- flags: { misinformation: bool, coordinated: bool, bot_likely: bool, viral_potential: bool }
- rejection_reason: null for relevant, or a short reason

Return JSON: { "analyses": [ { "relevant": true/false, "rejection_reason": "..." or null, "clean_summary": "...", "sentiment_label": "...", "sentiment_score": 0.5, "sentiment_confidence": 0.9, "severity": "low", "flags": {...} } ] }
Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Analyze these ${cleanedResults.length} mentions for "${brandContext}":\n${JSON.stringify(
              cleanedResults.map((r, i) => ({ index: i, source: r.source, url: r.url, author_name: r.author_name, title: r.title || "", content: r.content?.slice(0, 600) }))
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
    } else {
      console.error("AI analysis failed with status:", aiRes.status);
    }

    // Filter by relevance first, then sentiment
    let filteredResults = cleanedResults
      .map((r, i) => ({ result: r, analysis: analyses[i] || {} }))
      .filter(({ analysis, result }) => {
        // AI relevance gate: reject irrelevant content
        if (analysis.relevant === false) {
          console.log("AI rejected as irrelevant:", result.url, "reason:", analysis.rejection_reason || "not about brand");
          return false;
        }
        // Also reject if AI couldn't extract meaningful content
        const summary = analysis.clean_summary || "";
        if (summary.toLowerCase().includes("unable to extract meaningful content")) {
          console.log("AI couldn't extract content:", result.url);
          return false;
        }
        return true;
      });
    
    if (sentiment_filter && sentiment_filter !== "all") {
      filteredResults = filteredResults.filter(({ analysis }) => {
        const label = analysis.sentiment_label || "neutral";
        if (sentiment_filter === "negative") return label === "negative" || label === "mixed";
        if (sentiment_filter === "positive") return label === "positive";
        return true;
      });
    }

    // === URL DEDUP: Check existing mentions in DB to avoid re-adding ===
    const candidateUrls = filteredResults
      .map(({ result: r }) => r.url?.toLowerCase().replace(/\/$/, ""))
      .filter(Boolean) as string[];
    
    const existingUrlSet = new Set<string>();
    if (candidateUrls.length > 0) {
      // Query in batches of 50 to avoid URL list being too long
      for (let i = 0; i < candidateUrls.length; i += 50) {
        const batch = candidateUrls.slice(i, i + 50);
        const { data: existingMentions } = await supabase
          .from("mentions")
          .select("url")
          .eq("org_id", org_id)
          .in("url", batch);
        if (existingMentions) {
          for (const m of existingMentions) {
            if (m.url) existingUrlSet.add(m.url.toLowerCase().replace(/\/$/, ""));
          }
        }
      }
      if (existingUrlSet.size > 0) {
        console.log(`URL dedup: found ${existingUrlSet.size} existing URLs, will skip duplicates`);
      }
    }

    // Filter out already-existing URLs
    const dedupedResults = filteredResults.filter(({ result: r }) => {
      if (!r.url) return true; // keep mentions without URLs
      const normalized = r.url.toLowerCase().replace(/\/$/, "");
      if (existingUrlSet.has(normalized)) {
        console.log("Skipping duplicate URL (already in DB):", r.url);
        return false;
      }
      return true;
    });

    const mentionRows = dedupedResults.map(({ result: r, analysis }) => {
      const cleanSummary = analysis.clean_summary || r.content || "";
      // Detect paywall on content
      const paywallResult = detectPaywall(r.content || "");
      // Store date verification, matched query, and paywall info in flags
      const flags = {
        ...(analysis.flags || {}),
        date_verified: r.date_verified ?? true,
        date_source: r.date_source || "unknown",
        matched_query: r.matched_query || "",
        paywall: paywallResult.is_paywalled,
        paywall_type: paywallResult.paywall_type,
      };
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
        posted_at: r.posted_at || null,
        url: r.url || null,
        metrics: r.metrics || {},
        flags,
        status: "new",
        owner_user_id: user.id,
      };
    });

    if (mentionRows.length === 0) {
      const aiRejections = analyses.filter((a: any) => a?.relevant === false);
      const reasons: string[] = [];
      reasons.push(`${cleanedResults.length} results passed quality filters, but all ${aiRejections.length} were rejected by AI as not relevant to "${brandContext}".`);
      const topReasons = aiRejections.map((a: any) => a?.rejection_reason).filter(Boolean).slice(0, 3);
      if (topReasons.length > 0) reasons.push(`Top rejection reasons: ${topReasons.join("; ")}`);
      reasons.push("Try broadening your keywords or date range, or check that your brand keywords match how your brand appears in media.");

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
          total_found: allResults.length,
          negative_pct: 0,
          emergencies: 0,
          errors,
          scan_log: scanLog,
          keyword_groups: kwGroups,
          zero_results_reason: reasons.join(" "),
          message: reasons.join(" "),
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
        total_found: allResults.length,
        quality_filtered: allResults.length - cleanedResults.length,
        ai_irrelevant: cleanedResults.length - filteredResults.length - (sentiment_filter && sentiment_filter !== "all" ? 0 : 0),
        relevance_rejections: analyses.filter((a: any) => a?.relevant === false).map((a: any) => a?.rejection_reason).filter(Boolean),
        negative_pct: Math.round((negCount / mentionRows.length) * 100),
        emergencies: emergencyCount,
        scan_log: scanLog,
        keyword_groups: kwGroups,
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
