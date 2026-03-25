import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function is a lightweight wrapper that delegates to scan-web
// It exists for backward compatibility and as an additional search channel
// scan-web now handles all search engines in parallel

function classifySource(url: string): string {
  if (!url) return "news";
  const h = url.toLowerCase();
  if (h.includes("reddit.com")) return "reddit";
  if (h.includes("twitter.com") || h.includes("x.com")) return "twitter";
  if (h.includes("youtube.com")) return "youtube";
  if (h.includes("linkedin.com")) return "linkedin";
  if (h.includes("medium.com") || h.includes("substack.com")) return "blog";
  if (h.includes("forum") || h.includes("community") || h.includes("discuss")) return "forum";
  return "news";
}

const BLOCK_DOMAINS = new Set([
  "en.wikipedia.org", "wikipedia.org", "investopedia.com",
  "apps.apple.com", "play.google.com", "support.google.com",
  "dictionary.com", "merriam-webster.com", "britannica.com",
]);

function isBlocked(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return BLOCK_DOMAINS.has(host);
  } catch { return false; }
}

async function braveSearch(query: string, count: number, apiKey: string, freshness?: string): Promise<any[]> {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(count, 20)),
    search_lang: "en",
    safesearch: "off",
    text_decorations: "false",
  });
  if (freshness) params.set("freshness", freshness);

  try {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const combined = [...(data.web?.results || []), ...(data.news?.results || [])];
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
          if (age.includes("hour")) return new Date(Date.now() - num * 3600000).toISOString();
          if (age.includes("day")) return new Date(Date.now() - num * 86400000).toISOString();
          if (age.includes("week")) return new Date(Date.now() - num * 7 * 86400000).toISOString();
          if (age.includes("month")) return new Date(Date.now() - num * 30 * 86400000).toISOString();
          return null;
        })(),
        _engine: "brave",
      }));
  } catch (e: any) {
    console.error("[brave] Error:", e.message);
    return [];
  }
}

async function newsApiSearch(query: string, count: number, apiKey: string, dateFrom?: string): Promise<any[]> {
  const params = new URLSearchParams({
    q: query,
    pageSize: String(Math.min(count, 100)),
    language: "en",
    sortBy: "publishedAt",
  });
  if (dateFrom) params.set("from", new Date(dateFrom).toISOString().split("T")[0]);

  try {
    const res = await fetch(`https://newsapi.org/v2/everything?${params}`, {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "ok") return [];
    return (data.articles || [])
      .filter((a: any) => a.url && a.title && !isBlocked(a.url))
      .map((a: any) => ({
        source: classifySource(a.url),
        content: [a.title, a.description, a.content?.replace(/\[\+\d+ chars\]/, "")].filter(Boolean).join(" "),
        title: a.title || "",
        url: a.url,
        author_name: a.source?.name || "",
        posted_at: a.publishedAt || null,
        _engine: "newsapi",
      }));
  } catch (e: any) {
    console.error("[newsapi] Error:", e.message);
    return [];
  }
}

async function hackerNewsSearch(query: string, dateFrom?: string): Promise<any[]> {
  const params = new URLSearchParams({ query, hitsPerPage: "15", tags: "story,comment" });
  if (dateFrom) params.set("numericFilters", `created_at_i>${Math.floor(new Date(dateFrom).getTime() / 1000)}`);
  try {
    const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits || [])
      .filter((h: any) => h.story_text || h.comment_text || h.title)
      .map((h: any) => ({
        source: "forum",
        content: (h.story_text || h.comment_text || h.title || "").slice(0, 500),
        title: h.title || "",
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        author_name: h.author || "HackerNews",
        posted_at: h.created_at || null,
        _engine: "hackernews",
      }));
  } catch (e: any) {
    console.error("[hackernews] Error:", e.message);
    return [];
  }
}

async function redditPublicSearch(query: string, dateFrom?: string): Promise<any[]> {
  const params = new URLSearchParams({ q: query, sort: "new", limit: "25", t: "month" });
  try {
    const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
      headers: { "User-Agent": "FactSentinel/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const dateFromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    return (data.data?.children || [])
      .filter((c: any) => dateFromMs === 0 || c.data.created_utc * 1000 >= dateFromMs)
      .map((c: any) => {
        const p = c.data;
        return {
          source: "reddit",
          content: (p.selftext || p.title || "").slice(0, 500),
          title: p.title || "",
          url: `https://reddit.com${p.permalink}`,
          author_name: p.author || "reddit",
          posted_at: new Date(p.created_utc * 1000).toISOString(),
          metrics: { likes: p.ups || 0, comments: p.num_comments || 0, shares: 0 },
          _engine: "reddit-public",
        };
      });
  } catch (e: any) {
    console.error("[reddit-public] Error:", e.message);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, limit, date_from, date_to, include_hn, include_reddit } = await req.json();
    if (!keywords?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY");
    const newsApiKey = Deno.env.get("NEWSAPI_KEY");
    const maxResults = Math.min(limit || 25, 50);
    const query = keywords.slice(0, 5).map((k: string) => `"${k}"`).join(" OR ");

    let braveFreshness: string | undefined;
    if (date_from) {
      const diff = (Date.now() - new Date(date_from).getTime()) / 86400000;
      if (diff <= 1) braveFreshness = "pd";
      else if (diff <= 7) braveFreshness = "pw";
      else if (diff <= 30) braveFreshness = "pm";
      else braveFreshness = "py";
    } else {
      braveFreshness = "pw";
    }

    // Run all in parallel
    const [braveResults, newsResults, hnResults, redditResults] = await Promise.all([
      braveKey ? braveSearch(query, maxResults, braveKey, braveFreshness) : Promise.resolve([]),
      newsApiKey ? newsApiSearch(query, Math.min(maxResults, 20), newsApiKey, date_from) : Promise.resolve([]),
      include_hn !== false ? hackerNewsSearch(keywords[0], date_from) : Promise.resolve([]),
      include_reddit !== false ? redditPublicSearch(keywords[0], date_from) : Promise.resolve([]),
    ]);

    // Merge + deduplicate by URL
    const seen = new Set<string>();
    const results: any[] = [];
    for (const r of [...braveResults, ...newsResults, ...hnResults, ...redditResults]) {
      if (!r.url || !r.content || r.content.length < 30) continue;
      const key = r.url.toLowerCase().replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(r);
    }

    const engineBreakdown = {
      brave: braveResults.length,
      newsapi: newsResults.length,
      hackernews: hnResults.length,
      reddit_public: redditResults.length,
    };

    console.log(`scan-search: ${results.length} results | ${JSON.stringify(engineBreakdown)}`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        discovery_engine: "multi-source",
        engine_breakdown: engineBreakdown,
        query_used: query,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("scan-search error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
