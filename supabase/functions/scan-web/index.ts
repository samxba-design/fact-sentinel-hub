import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===== SOURCE CLASSIFIER =====
function classifySource(url: string): string {
  if (!url) return "news";
  const h = url.toLowerCase();
  if (h.includes("twitter.com") || h.includes("x.com")) return "twitter";
  if (h.includes("reddit.com")) return "reddit";
  if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
  if (h.includes("linkedin.com")) return "linkedin";
  if (h.includes("facebook.com")) return "facebook";
  if (h.includes("trustpilot.com")) return "trustpilot";
  if (h.includes("g2.com")) return "g2";
  if (h.includes("glassdoor.com")) return "glassdoor";
  if (h.includes("capterra.com")) return "capterra";
  if (h.includes("medium.com") || h.includes("substack.com")) return "blog";
  if (h.includes("forum") || h.includes("community") || h.includes("discuss") || h.includes("board")) return "forum";
  return "news";
}

// ===== BLOCK LIST =====
const BLOCK_DOMAINS = new Set([
  "en.wikipedia.org", "wikipedia.org",
  "investopedia.com", "www.investopedia.com",
  "apps.apple.com", "play.google.com",
  "ca.investing.com", "investing.com",
  "support.google.com", "support.apple.com",
  "howstuffworks.com", "about.com",
  "dictionary.com", "merriam-webster.com",
  "britannica.com", "corporatefinanceinstitute.com",
  "nerdwallet.com", "bankrate.com",
  "academy.binance.com",
]);

function isBlocked(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace("www.", "").toLowerCase();
    return BLOCK_DOMAINS.has(hostname);
  } catch { return false; }
}

// ===== CONTENT CLEANER =====
function cleanContent(raw: string): string {
  if (!raw) return "";
  let text = raw;
  text = text.replace(/!\[.*?\]\([^)]*\)/g, " ");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[#*_~`>|]/g, " ");
  text = text.replace(/[-=]{3,}/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

// ===== FIRECRAWL SEARCH =====
// Uses /v1/search endpoint — searches the web and returns scraped content
async function firecrawlSearch(query: string, limit: number, apiKey: string): Promise<any[]> {
  console.log(`[firecrawl] Searching: "${query}" (limit ${limit})`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 402) {
      console.log("[firecrawl] Out of credits (402)");
      return [];
    }
    if (res.status === 429) {
      console.log("[firecrawl] Rate limited (429)");
      return [];
    }
    if (!res.ok) {
      console.error(`[firecrawl] Error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const items = data.data || data.results || [];
    console.log(`[firecrawl] Got ${items.length} results`);

    return items
      .filter((item: any) => item.url && !isBlocked(item.url))
      .map((item: any) => {
        const content = item.markdown || item.content || item.description || "";
        const cleaned = cleanContent(content);
        return {
          source: classifySource(item.url),
          content: cleaned.slice(0, 1000),
          title: item.title || item.metadata?.title || "",
          url: item.url,
          author_name: (() => { try { return new URL(item.url).hostname.replace("www.", ""); } catch { return ""; } })(),
          posted_at: item.metadata?.publishedTime || item.metadata?.modifiedTime || null,
          date_verified: !!(item.metadata?.publishedTime),
          date_source: "firecrawl",
          _engine: "firecrawl",
        };
      })
      .filter((r: any) => r.content.length >= 40);
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error("[firecrawl] Timed out after 25s");
    } else {
      console.error("[firecrawl] Exception:", e.message);
    }
    return [];
  }
}

// ===== BRAVE SEARCH =====
// Uses Brave Search API for web/news results
async function braveSearch(query: string, limit: number, apiKey: string, freshness?: string): Promise<any[]> {
  console.log(`[brave] Searching: "${query}" (freshness: ${freshness || "none"})`);
  try {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(limit, 20)),
      search_lang: "en",
      safesearch: "off",
      text_decorations: "false",
    });
    if (freshness) params.set("freshness", freshness);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[brave] Error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const combined = [...(data.web?.results || []), ...(data.news?.results || [])];
    console.log(`[brave] Got ${combined.length} results`);

    return combined
      .filter((r: any) => r.url && !isBlocked(r.url))
      .map((r: any) => ({
        source: classifySource(r.url),
        content: [r.title, r.description, ...(r.extra_snippets || [])].filter(Boolean).join(" "),
        title: r.title || "",
        url: r.url,
        author_name: (() => { try { return new URL(r.url).hostname.replace("www.", ""); } catch { return ""; } })(),
        posted_at: (() => {
          if (!r.age) return null;
          const age = r.age.toLowerCase();
          const num = parseInt(age) || 1;
          if (age.includes("minute")) return new Date(Date.now() - num * 60000).toISOString();
          if (age.includes("hour")) return new Date(Date.now() - num * 3600000).toISOString();
          if (age.includes("day")) return new Date(Date.now() - num * 86400000).toISOString();
          if (age.includes("week")) return new Date(Date.now() - num * 7 * 86400000).toISOString();
          if (age.includes("month")) return new Date(Date.now() - num * 30 * 86400000).toISOString();
          return null;
        })(),
        date_verified: !!r.age,
        date_source: "brave-age",
        _engine: "brave",
      }))
      .filter((r: any) => r.content.length >= 30);
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error("[brave] Timed out after 10s");
    } else {
      console.error("[brave] Exception:", e.message);
    }
    return [];
  }
}

// ===== GOOGLE NEWS RSS =====
// Free, no key needed — parses Google News RSS feed
async function googleNewsRss(query: string, limit: number): Promise<any[]> {
  console.log(`[google-news-rss] Searching: "${query}"`);
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; bot/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[google-news-rss] Error: ${res.status}`);
      return [];
    }

    const text = await res.text();
    const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];
    console.log(`[google-news-rss] Got ${items.length} items`);

    const decode = (s: string) => s
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    const results: any[] = [];
    for (const itemXml of items.slice(0, limit)) {
      try {
        const titleRaw = itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "";
        const linkRaw = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] ||
                        itemXml.match(/<link\/>([\s\S]*?)<\/link>/)?.[1] || "";
        const descRaw = itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "";
        const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";

        const link = linkRaw.trim();
        if (!link || isBlocked(link)) continue;

        const title = decode(titleRaw);
        const desc = decode(descRaw);
        const content = [title, desc].filter(Boolean).join(". ");
        if (content.length < 30) continue;

        let posted_at: string | null = null;
        if (pubDate) {
          try { posted_at = new Date(pubDate).toISOString(); } catch {}
        }

        results.push({
          source: classifySource(link),
          content: content.slice(0, 600),
          title,
          url: link,
          author_name: (() => { try { return new URL(link).hostname.replace("www.", ""); } catch { return "news"; } })(),
          posted_at,
          date_verified: !!posted_at,
          date_source: posted_at ? "rss-pubdate" : "none",
          _engine: "google-rss",
        });
      } catch { /* skip malformed */ }
    }

    return results;
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error("[google-news-rss] Timed out after 8s");
    } else {
      console.error("[google-news-rss] Exception:", e.message);
    }
    return [];
  }
}

// ===== HACKER NEWS =====
// Free public API, no key needed
async function hackerNewsSearch(query: string, dateFrom?: string): Promise<any[]> {
  console.log(`[hackernews] Searching: "${query}"`);
  try {
    const params = new URLSearchParams({
      query,
      hitsPerPage: "15",
      tags: "story,comment",
    });
    if (dateFrom) {
      const ts = Math.floor(new Date(dateFrom).getTime() / 1000);
      params.set("numericFilters", `created_at_i>${ts}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    const hits = (data.hits || []).filter((h: any) => h.story_text || h.comment_text || h.title);
    console.log(`[hackernews] Got ${hits.length} results`);

    return hits.map((h: any) => ({
      source: "forum",
      content: (h.story_text || h.comment_text || h.title || "").slice(0, 500),
      title: h.title || "",
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      author_name: h.author || "HackerNews",
      posted_at: h.created_at || null,
      date_verified: !!h.created_at,
      date_source: "hackernews",
      _engine: "hackernews",
    }));
  } catch (e: any) {
    console.error("[hackernews] Exception:", e.message);
    return [];
  }
}

// ===== REDDIT PUBLIC =====
// No key needed — uses public JSON endpoint
async function redditPublicSearch(query: string, dateFrom?: string): Promise<any[]> {
  console.log(`[reddit-public] Searching: "${query}"`);
  try {
    const params = new URLSearchParams({
      q: query,
      sort: "new",
      limit: "25",
      t: "month",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
      headers: { "User-Agent": "FactSentinel/1.0 (monitoring bot)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[reddit-public] Error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const posts = data.data?.children || [];
    const dateFromMs = dateFrom ? new Date(dateFrom).getTime() : 0;

    const results = posts
      .filter((c: any) => {
        if (dateFromMs > 0) return c.data.created_utc * 1000 >= dateFromMs;
        return true;
      })
      .map((c: any) => {
        const p = c.data;
        return {
          source: "reddit",
          content: (p.selftext || p.title || "").slice(0, 500),
          title: p.title || "",
          url: `https://reddit.com${p.permalink}`,
          author_name: p.author || "reddit",
          posted_at: new Date(p.created_utc * 1000).toISOString(),
          date_verified: true,
          date_source: "reddit-utc",
          metrics: { likes: p.ups || 0, comments: p.num_comments || 0 },
          _engine: "reddit-public",
        };
      });

    console.log(`[reddit-public] Got ${results.length} results`);
    return results;
  } catch (e: any) {
    console.error("[reddit-public] Exception:", e.message);
    return [];
  }
}

// ===== NEWS API =====
async function newsApiSearch(query: string, limit: number, apiKey: string, dateFrom?: string): Promise<any[]> {
  console.log(`[newsapi] Searching: "${query}"`);
  try {
    const params = new URLSearchParams({
      q: query,
      pageSize: String(Math.min(limit, 100)),
      language: "en",
      sortBy: "publishedAt",
    });
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString().split("T")[0]);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`https://newsapi.org/v2/everything?${params}`, {
      headers: { "X-Api-Key": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[newsapi] Error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (data.status !== "ok") return [];

    const results = (data.articles || [])
      .filter((a: any) => a.url && a.title && !isBlocked(a.url))
      .map((a: any) => ({
        source: classifySource(a.url),
        content: [a.title, a.description, a.content?.replace(/\[\+\d+ chars\]/, "")].filter(Boolean).join(" ").slice(0, 600),
        title: a.title || "",
        url: a.url,
        author_name: a.source?.name || (() => { try { return new URL(a.url).hostname.replace("www.", ""); } catch { return ""; } })(),
        posted_at: a.publishedAt || null,
        date_verified: !!a.publishedAt,
        date_source: "newsapi",
        _engine: "newsapi",
      }));

    console.log(`[newsapi] Got ${results.length} results`);
    return results;
  } catch (e: any) {
    console.error("[newsapi] Exception:", e.message);
    return [];
  }
}

// ===== DEDUPLICATE =====
function deduplicateByUrl(results: any[]): any[] {
  const seen = new Set<string>();
  return results.filter((r: any) => {
    if (!r.url) return true;
    const key = r.url.toLowerCase().replace(/\/$/, "").replace(/^https?:\/\//, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ===== MAIN HANDLER =====
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { keywords, sites, limit, date_from, date_to, search_type, include_hn, include_reddit } = body;

    if (!keywords?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY");
    const newsApiKey = Deno.env.get("NEWSAPI_KEY");
    const maxResults = Math.min(limit || 20, 30);

    // Build query string
    const primaryQuery = keywords.length === 1
      ? keywords[0]
      : keywords.slice(0, 5).map((k: string) => `"${k}"`).join(" OR ");

    // Add site filter for google-news mode
    const siteFilter = sites?.length > 0 ? ` (${sites.slice(0, 8).map((s: string) => `site:${s}`).join(" OR ")})` : "";
    const fullQuery = `${primaryQuery}${siteFilter}`;

    // Determine date freshness for Brave
    let braveFreshness: string | undefined;
    if (date_from) {
      const diffDays = (Date.now() - new Date(date_from).getTime()) / 86400000;
      if (diffDays <= 1) braveFreshness = "pd";
      else if (diffDays <= 7) braveFreshness = "pw";
      else if (diffDays <= 30) braveFreshness = "pm";
      else braveFreshness = "py";
    } else {
      braveFreshness = "pw"; // Default: past week
    }

    const engineBreakdown: Record<string, number> = {};
    let allResults: any[] = [];

    // ===== PARALLEL EXECUTION =====
    // Run Firecrawl + fallbacks in parallel for maximum coverage
    const searchPromises: Promise<{ engine: string; results: any[] }>[] = [];

    // 1. Firecrawl (if key configured)
    if (firecrawlKey) {
      searchPromises.push(
        firecrawlSearch(fullQuery, maxResults, firecrawlKey)
          .then(r => ({ engine: "firecrawl", results: r }))
      );
    }

    // 2. Brave Search (if key configured)  
    if (braveKey) {
      searchPromises.push(
        braveSearch(fullQuery, maxResults, braveKey, braveFreshness)
          .then(r => ({ engine: "brave", results: r }))
      );
    }

    // 3. NewsAPI (if key configured)
    if (newsApiKey) {
      searchPromises.push(
        newsApiSearch(primaryQuery, Math.min(maxResults, 20), newsApiKey, date_from)
          .then(r => ({ engine: "newsapi", results: r }))
      );
    }

    // 4. Google News RSS (always free, run in parallel)
    searchPromises.push(
      googleNewsRss(primaryQuery, maxResults)
        .then(r => ({ engine: "google-rss", results: r }))
    );

    // 5. HackerNews (always free, for forums/tech)
    if (include_hn !== false) {
      searchPromises.push(
        hackerNewsSearch(keywords[0] || primaryQuery, date_from)
          .then(r => ({ engine: "hackernews", results: r }))
      );
    }

    // 6. Reddit public (free, run in parallel)
    if (include_reddit !== false) {
      searchPromises.push(
        redditPublicSearch(keywords[0] || primaryQuery, date_from)
          .then(r => ({ engine: "reddit-public", results: r }))
      );
    }

    // Wait for all in parallel
    const settled = await Promise.allSettled(searchPromises);
    for (const result of settled) {
      if (result.status === "fulfilled") {
        const { engine, results } = result.value;
        engineBreakdown[engine] = results.length;
        allResults.push(...results);
      } else {
        console.error("Engine failed:", result.reason);
      }
    }

    // Deduplicate
    allResults = deduplicateByUrl(allResults);

    // Date filter (only for results that have a date)
    const dateFromMs = date_from ? new Date(date_from).getTime() : 0;
    const dateToMs = date_to ? new Date(date_to).getTime() : 0;

    const results = allResults.filter((r: any) => {
      if (r.posted_at && dateFromMs > 0) {
        const ms = new Date(r.posted_at).getTime();
        if (ms < dateFromMs) return false;
      }
      if (r.posted_at && dateToMs > 0) {
        const ms = new Date(r.posted_at).getTime();
        if (ms > dateToMs) return false;
      }
      return r.content && r.content.length >= 30;
    });

    const totalEnginesUsed = Object.keys(engineBreakdown).filter(k => engineBreakdown[k] > 0).length;
    console.log(`scan-web complete: ${allResults.length} raw → ${results.length} after dedup+filter | engines: ${JSON.stringify(engineBreakdown)}`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        query_used: fullQuery,
        engine_breakdown: engineBreakdown,
        engines_used: totalEnginesUsed,
        discovery_engine: `multi-source (${Object.keys(engineBreakdown).filter(k => engineBreakdown[k] > 0).join(", ")})`,
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
