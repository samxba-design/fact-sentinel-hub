import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function classifySource(url: string): string {
  if (!url) return "news";
  const h = url.toLowerCase();
  if (h.includes("reddit.com")) return "reddit";
  if (h.includes("twitter.com") || h.includes("x.com")) return "twitter";
  if (h.includes("youtube.com")) return "youtube";
  if (h.includes("linkedin.com")) return "linkedin";
  if (h.includes("facebook.com")) return "facebook";
  if (h.includes("trustpilot") || h.includes("g2.com") || h.includes("glassdoor") || h.includes("capterra")) return "reviews";
  if (h.includes("medium.com") || h.includes("substack.com")) return "blog";
  if (h.includes("forum") || h.includes("community") || h.includes("discuss") || h.includes("board")) return "forum";
  return "news";
}

const BLOCK_DOMAINS = new Set([
  "en.wikipedia.org", "wikipedia.org", "investopedia.com", "britannica.com",
  "support.google.com", "support.apple.com", "apps.apple.com", "play.google.com",
  "dictionary.com", "merriam-webster.com", "howstuffworks.com",
]);

function isBlocked(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return BLOCK_DOMAINS.has(host);
  } catch { return false; }
}

// --- Brave Search ---
async function braveSearch(query: string, count: number, freshness?: string): Promise<any[]> {
  const apiKey = Deno.env.get("BRAVE_SEARCH_API_KEY");
  if (!apiKey) return [];

  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(count, 20)),
    search_lang: "en",
    safesearch: "off",
    text_decorations: "false",
  });
  if (freshness) params.set("freshness", freshness); // pd (day), pw (week), pm (month), py (year)

  try {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("Brave API error:", res.status, await res.text().catch(() => ""));
      return [];
    }
    const data = await res.json();
    const webResults = data.web?.results || [];
    const newsResults = data.news?.results || [];
    const combined = [...webResults, ...newsResults];
    return combined
      .filter((r: any) => r.url && !isBlocked(r.url))
      .map((r: any) => ({
        source: classifySource(r.url),
        content: r.description || r.extra_snippets?.join(" ") || "",
        title: r.title || "",
        url: r.url,
        author_name: (() => { try { return new URL(r.url).hostname.replace("www.", ""); } catch { return ""; } })(),
        posted_at: r.age ? (() => {
          // Brave returns age like "1 week ago", "3 days ago"
          const age = r.age.toLowerCase();
          const num = parseInt(age);
          if (age.includes("hour")) return new Date(Date.now() - num * 3600000).toISOString();
          if (age.includes("day")) return new Date(Date.now() - num * 86400000).toISOString();
          if (age.includes("week")) return new Date(Date.now() - num * 7 * 86400000).toISOString();
          if (age.includes("month")) return new Date(Date.now() - num * 30 * 86400000).toISOString();
          return null;
        })() : null,
        _engine: "brave",
      }));
  } catch (e: any) {
    console.error("Brave search error:", e.message);
    return [];
  }
}

// --- NewsAPI ---
async function newsApiSearch(query: string, count: number, dateFrom?: string): Promise<any[]> {
  const apiKey = Deno.env.get("NEWSAPI_KEY");
  if (!apiKey) return [];

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
    if (!res.ok) {
      console.error("NewsAPI error:", res.status);
      return [];
    }
    const data = await res.json();
    if (data.status !== "ok") return [];
    return (data.articles || [])
      .filter((a: any) => a.url && a.title && !isBlocked(a.url))
      .map((a: any) => ({
        source: classifySource(a.url),
        content: [a.title, a.description, a.content?.slice(0, 500)].filter(Boolean).join(" "),
        title: a.title || "",
        url: a.url,
        author_name: a.source?.name || (() => { try { return new URL(a.url).hostname.replace("www.", ""); } catch { return ""; } })(),
        posted_at: a.publishedAt || null,
        _engine: "newsapi",
      }));
  } catch (e: any) {
    console.error("NewsAPI error:", e.message);
    return [];
  }
}

// --- Hacker News (no key needed) ---
async function hackerNewsSearch(query: string, dateFrom?: string): Promise<any[]> {
  const params = new URLSearchParams({
    query,
    hitsPerPage: "15",
    tags: "story,comment",
  });
  if (dateFrom) {
    params.set("numericFilters", `created_at_i>${Math.floor(new Date(dateFrom).getTime() / 1000)}`);
  }
  try {
    const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits || [])
      .filter((h: any) => (h.story_text || h.comment_text || h.title))
      .map((h: any) => ({
        source: "forum",
        content: h.story_text || h.comment_text || h.title || "",
        title: h.title || "",
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        author_name: h.author || "HackerNews",
        posted_at: h.created_at || null,
        _engine: "hackernews",
      }));
  } catch (e: any) {
    console.error("HN search error:", e.message);
    return [];
  }
}

// --- Reddit public search (no API key needed) ---
async function redditPublicSearch(query: string, dateFrom?: string): Promise<any[]> {
  const params = new URLSearchParams({
    q: query,
    sort: "new",
    limit: "20",
    type: "link,comment",
    t: "month",
  });
  try {
    const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
      headers: { "User-Agent": "FactSentinel/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const posts = data.data?.children || [];
    const dateFromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    return posts
      .filter((child: any) => {
        if (dateFromMs > 0) {
          const postMs = child.data.created_utc * 1000;
          if (postMs < dateFromMs) return false;
        }
        return true;
      })
      .map((child: any) => {
        const post = child.data;
        return {
          source: "reddit",
          content: post.selftext?.slice(0, 500) || post.title || "",
          title: post.title || "",
          url: `https://reddit.com${post.permalink}`,
          author_name: post.author || "reddit",
          posted_at: new Date(post.created_utc * 1000).toISOString(),
          metrics: { likes: post.ups || 0, comments: post.num_comments || 0, shares: 0 },
          _engine: "reddit-public",
        };
      });
  } catch (e: any) {
    console.error("Reddit public search error:", e.message);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, limit, date_from, date_to, search_type, include_hn, include_reddit } = await req.json();
    if (!keywords?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const maxResults = Math.min(limit || 20, 50);
    const query = keywords.map((k: string) => `"${k}"`).join(" OR ");

    // Determine freshness for Brave
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

    // Run all searches in parallel
    const [braveResults, newsResults, hnResults, redditResults] = await Promise.all([
      braveSearch(query, maxResults, braveFreshness),
      newsApiSearch(query, Math.min(maxResults, 20), date_from),
      include_hn !== false ? hackerNewsSearch(keywords[0] || query, date_from) : Promise.resolve([]),
      include_reddit !== false ? redditPublicSearch(keywords[0] || query, date_from) : Promise.resolve([]),
    ]);

    // Merge and deduplicate by URL
    const seenUrls = new Set<string>();
    const results: any[] = [];
    for (const r of [...braveResults, ...newsResults, ...hnResults, ...redditResults]) {
      if (!r.url || !r.content || r.content.length < 30) continue;
      const norm = r.url.toLowerCase().replace(/\/$/, "");
      if (seenUrls.has(norm)) continue;
      seenUrls.add(norm);
      results.push(r);
    }

    const engineBreakdown = {
      brave: braveResults.length,
      newsapi: newsResults.length,
      hackernews: hnResults.length,
      reddit_public: redditResults.length,
    };

    console.log(`scan-search: ${results.length} results (${JSON.stringify(engineBreakdown)})`);

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
