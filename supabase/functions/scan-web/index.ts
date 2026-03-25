import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// === Google News RSS Parser ===
// Free, no API key needed, always available as fallback
async function googleNewsRss(query: string, limit: number): Promise<any[]> {
  try {
    const encoded = encodeURIComponent(`${query}`);
    const rssUrl = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
    
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    
    const text = await res.text();
    const results: any[] = [];
    
    // Parse RSS items
    const itemMatches = text.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const itemXml of itemMatches.slice(0, limit)) {
      try {
        const titleMatch = itemXml.match(/<title[^>]*>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/title>/) || 
                          itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/);
        const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
        const descMatch = itemXml.match(/<description[^>]*>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/description>/) ||
                         itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/);
        const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        
        if (!linkMatch?.[1]) continue;
        
        const title = titleMatch?.[1]?.trim() || "";
        const link = linkMatch[1].trim();
        const desc = descMatch?.[1]?.trim() || "";
        const pubDate = pubDateMatch?.[1]?.trim() || null;
        
        // Decode HTML entities
        const decode = (s: string) => s
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        
        const decodedTitle = decode(title);
        const decodedDesc = decode(desc);
        const content = `${decodedTitle}. ${decodedDesc}`.trim();
        
        if (content.length < 30) continue;
        
        let publishDate: string | null = null;
        if (pubDate) {
          try {
            publishDate = new Date(pubDate).toISOString();
          } catch {}
        }
        
        results.push({
          source: "news",
          content: content.slice(0, 800),
          title: decodedTitle,
          url: link,
          author_name: (() => { try { return new URL(link).hostname.replace("www.", ""); } catch { return "news"; } })(),
          posted_at: publishDate,
          date_verified: !!publishDate,
          date_source: publishDate ? "rss-pubdate" : "none",
          matched_query: query,
        });
      } catch (e) {
        console.error("RSS item parse error:", e);
      }
    }
    
    return results;
  } catch (e: any) {
    console.error("Google News RSS error:", e.message);
    return [];
  }
}

function classifySourceFromUrl(url: string): string {
  if (!url) return "news";
  const lower = url.toLowerCase();
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "twitter";
  if (lower.includes("reddit.com")) return "reddit";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("linkedin.com")) return "linkedin";
  if (lower.includes("facebook.com")) return "facebook";
  if (lower.includes("trustpilot.com")) return "trustpilot";
  if (lower.includes("g2.com")) return "g2";
  if (lower.includes("glassdoor.com")) return "glassdoor";
  if (lower.includes("capterra.com")) return "capterra";
  if (lower.includes("medium.com") || lower.includes("substack.com") || lower.includes("blog")) return "blog";
  if (lower.includes("forum") || lower.includes("community") || lower.includes("discuss")) return "forum";
  return "news";
}

const BLOCK_DOMAINS = new Set([
  "en.wikipedia.org", "wikipedia.org", "investopedia.com", "www.investopedia.com",
  "help.wealthsimple.com", "apps.apple.com", "play.google.com",
  "ca.investing.com", "investing.com", "support.google.com", "support.apple.com",
  "howstuffworks.com", "about.com", "dictionary.com", "merriam-webster.com",
  "britannica.com", "www.britannica.com", "corporatefinanceinstitute.com",
  "nerdwallet.com", "bankrate.com", "academy.binance.com",
]);

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace("www.", "").toLowerCase();
    return BLOCK_DOMAINS.has(hostname);
  } catch { return false; }
}

function cleanContent(raw: string): string {
  let text = raw;
  text = text.replace(/!\[.*?\]\([^)]*\)/g, "");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[#*_~`>|]/g, "");
  text = text.replace(/[-=]{3,}/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/^skip to (content|main|navigation)\s*/i, "");
  return text;
}

// Brave Search fallback when Firecrawl unavailable
async function braveSearchFallback(query: string, limit: number): Promise<any[]> {
  const apiKey = Deno.env.get("BRAVE_SEARCH_API_KEY");
  if (!apiKey) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(limit, 20)),
      search_lang: "en",
      safesearch: "off",
      text_decorations: "false",
    });

    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("Brave Search error:", res.status);
      return [];
    }
    const data = await res.json();
    const combined = [...(data.web?.results || []), ...(data.news?.results || [])];
    
    return combined
      .filter((r: any) => r.url && !isBlockedDomain(r.url))
      .map((r: any) => ({
        source: classifySourceFromUrl(r.url),
        content: r.description || r.extra_snippets?.join(" ") || "",
        title: r.title || "",
        url: r.url,
        author_name: (() => { try { return new URL(r.url).hostname.replace("www.", ""); } catch { return ""; } })(),
        posted_at: r.age ? (() => {
          const age = r.age.toLowerCase();
          const num = parseInt(age);
          if (age.includes("hour")) return new Date(Date.now() - num * 3600000).toISOString();
          if (age.includes("day")) return new Date(Date.now() - num * 86400000).toISOString();
          if (age.includes("week")) return new Date(Date.now() - num * 7 * 86400000).toISOString();
          if (age.includes("month")) return new Date(Date.now() - num * 30 * 86400000).toISOString();
          return null;
        })() : null,
        date_verified: !!r.age,
        date_source: r.age ? "brave-age" : "none",
        matched_query: query,
      }));
  } catch (e: any) {
    console.error("Brave fallback error:", e.message);
    return [];
  }
}

// Firecrawl search with retry
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429 && attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    return response;
  }
  return fetch(url, options);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, sites, limit, date_from, date_to, search_type } = await req.json();
    if (!keywords || keywords.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const maxResults = Math.min(limit || 15, 30);
    let allResults: any[] = [];

    // === Try Firecrawl first (if configured) ===
    if (firecrawlKey) {
      try {
        console.log("Attempting Firecrawl search...");
        const searchQueries = [keywords.map((k: string) => `"${k}"`).join(" OR ")];
        const siteFilter = sites?.length > 0 ? ` site:${sites.join(" OR site:")}` : "";
        const fullQuery = `${searchQueries[0]}${siteFilter}`;
        
        const response = await fetchWithRetry("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: fullQuery,
            limit: maxResults,
            scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.data?.length > 0) {
            allResults = data.data.map((item: any) => ({
              source: classifySourceFromUrl(item.url),
              content: item.markdown || item.description || "",
              title: item.title || "",
              url: item.url,
              author_name: (() => { try { return new URL(item.url).hostname.replace("www.", ""); } catch { return ""; } })(),
              posted_at: item.metadata?.publishedTime || null,
              date_verified: !!item.metadata?.publishedTime,
              date_source: "firecrawl",
              matched_query: fullQuery,
            }));
            console.log(`Firecrawl returned ${allResults.length} results`);
          }
        } else if (response.status === 402) {
          console.log("Firecrawl out of credits (402), falling back to Brave");
        } else {
          console.log(`Firecrawl error: ${response.status}`);
        }
      } catch (e: any) {
        console.error("Firecrawl exception:", e.message);
      }
    }

    // === If Firecrawl didn't return enough, try Brave ===
    if (allResults.length < maxResults / 2) {
      console.log("Insufficient Firecrawl results, trying Brave Search...");
      const braveResults = await braveSearchFallback(keywords.join(" OR "), maxResults);
      const seenUrls = new Set(allResults.map(r => r.url?.toLowerCase()));
      for (const r of braveResults) {
        if (!seenUrls.has(r.url?.toLowerCase())) {
          allResults.push(r);
          seenUrls.add(r.url?.toLowerCase());
          if (allResults.length >= maxResults) break;
        }
      }
      console.log(`After Brave: ${allResults.length} results`);
    }

    // === If still nothing, try Google News RSS (free, no auth needed) ===
    if (allResults.length < maxResults / 2) {
      console.log("Still insufficient results, trying Google News RSS...");
      const rssResults = await googleNewsRss(keywords[0] || keywords.join(" "), maxResults);
      const seenUrls = new Set(allResults.map(r => r.url?.toLowerCase()));
      for (const r of rssResults) {
        if (!seenUrls.has(r.url?.toLowerCase())) {
          allResults.push(r);
          seenUrls.add(r.url?.toLowerCase());
          if (allResults.length >= maxResults) break;
        }
      }
      console.log(`After RSS: ${allResults.length} results`);
    }

    // === Filter results ===
    const dateFromMs = date_from ? new Date(date_from).getTime() : 0;
    const dateToMs = date_to ? new Date(date_to).getTime() : 0;
    const results: any[] = [];

    for (const r of allResults) {
      if (!r.url || !r.content) continue;
      if (isBlockedDomain(r.url)) continue;

      const cleaned = cleanContent(r.content);
      if (cleaned.length < 50) continue;

      // Date filtering
      if (r.posted_at && dateFromMs > 0) {
        const postMs = new Date(r.posted_at).getTime();
        if (postMs < dateFromMs) continue;
      }
      if (r.posted_at && dateToMs > 0) {
        const postMs = new Date(r.posted_at).getTime();
        if (postMs > dateToMs) continue;
      }

      results.push({
        source: r.source,
        content: cleaned.slice(0, 800),
        title: r.title,
        url: r.url,
        author_name: r.author_name || "unknown",
        posted_at: r.posted_at,
        date_verified: r.date_verified ?? true,
        date_source: r.date_source,
        matched_query: r.matched_query || keywords.join(", "),
      });
    }

    console.log(`scan-web: ${allResults.length} raw → ${results.length} after filtering`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        results, 
        query_used: keywords.join(" | "),
        discovery_engine: "multi-source (firecrawl/brave/rss)",
        sources_tried: ["firecrawl", "brave", "google-news-rss"],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("scan-web error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
