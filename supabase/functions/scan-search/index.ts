import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// scan-search: lightweight multi-source search, delegates to scan-web's engines
// Kept as standalone for backward compatibility and direct calls

function src(url: string): string {
  if (!url) return "news";
  const h = url.toLowerCase();
  if (h.includes("reddit.com")) return "reddit";
  if (h.includes("twitter.com") || h.includes("x.com")) return "twitter";
  if (h.includes("youtube.com")) return "youtube";
  if (h.includes("linkedin.com")) return "linkedin";
  if (h.includes("medium.com") || h.includes("substack.com")) return "blog";
  if (h.includes("forum") || h.includes("discuss") || h.includes("community")) return "forum";
  if (h.includes("ycombinator")) return "forum";
  return "news";
}

const BLOCK = new Set(["en.wikipedia.org","wikipedia.org","investopedia.com","apps.apple.com","play.google.com","support.google.com"]);
function blocked(url: string) { try { return BLOCK.has(new URL(url).hostname.replace("www.","")); } catch { return false; } }

function clean(s: string) { return s.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim(); }

function xmlDecode(s: string) {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}

async function bingRss(query: string): Promise<any[]> {
  try {
    const res = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`, {
      headers: { "User-Agent":"Mozilla/5.0" }, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return (xml.match(/<item>[\s\S]*?<\/item>/g)||[]).slice(0,15).map(item => {
      try {
        const title = xmlDecode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]||"");
        const link  = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1]||"").trim();
        const desc  = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1]||"");
        const pub   = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]||"";
        if (!link||blocked(link)) return null;
        const content = clean([title,desc].filter(Boolean).join(". "));
        if (content.length<30) return null;
        let posted_at: string|null=null; try { if (pub) posted_at=new Date(pub).toISOString(); } catch {}
        return { source:src(link), content, title, url:link, author_name:(() => { try { return new URL(link).hostname.replace("www.",""); } catch { return ""; } })(), posted_at, date_verified:!!posted_at };
      } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

async function hnSearch(query: string, dateFrom?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams({ query, hitsPerPage:"20", tags:"story,comment" });
    if (dateFrom) params.set("numericFilters",`created_at_i>${Math.floor(new Date(dateFrom).getTime()/1000)}`);
    const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`, { signal:AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits||[]).filter((h:any)=>h.story_text||h.comment_text||h.title).map((h:any) => ({
      source:"forum", content:clean((h.story_text||h.comment_text||h.title||"").slice(0,500)),
      title:h.title||"", url:h.url||`https://news.ycombinator.com/item?id=${h.objectID}`,
      author_name:h.author||"HackerNews", posted_at:h.created_at||null, date_verified:!!h.created_at,
    })).filter((r:any)=>r.content.length>=30);
  } catch { return []; }
}

async function redditPublic(query: string, dateFrom?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams({ q:query, sort:"new", limit:"25", t:"month" });
    const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
      headers: { "User-Agent":"FactSentinel/2.0" }, signal:AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const dateMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    return (data.data?.children||[])
      .filter((c:any)=>!dateMs||c.data.created_utc*1000>=dateMs)
      .map((c:any) => {
        const p=c.data;
        const content=clean((p.selftext||p.title||"").slice(0,500));
        if (content.length<20) return null;
        return { source:"reddit", content, title:p.title||"", url:`https://reddit.com${p.permalink}`,
          author_name:p.author||"reddit", posted_at:new Date(p.created_utc*1000).toISOString(), date_verified:true,
          metrics:{ likes:p.ups||0, comments:p.num_comments||0 } };
      }).filter(Boolean);
  } catch { return []; }
}

async function braveSearch(query: string, count: number, apiKey: string, freshness?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams({ q:query, count:String(Math.min(count,20)), search_lang:"en", safesearch:"off" });
    if (freshness) params.set("freshness",freshness);
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { "Accept":"application/json", "X-Subscription-Token":apiKey },
      signal:AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return [...(data.web?.results||[]),...(data.news?.results||[])]
      .filter((r:any)=>r.url&&!blocked(r.url))
      .map((r:any) => {
        const content=clean([r.title,r.description,...(r.extra_snippets||[])].filter(Boolean).join(" ").slice(0,600));
        if (content.length<30) return null;
        return { source:src(r.url), content, title:r.title||"", url:r.url,
          author_name:(() => { try { return new URL(r.url).hostname.replace("www.",""); } catch { return ""; } })(),
          posted_at:null, date_verified:false };
      }).filter(Boolean);
  } catch { return []; }
}

async function newsApiSearch(query: string, count: number, apiKey: string, dateFrom?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams({ q:query, pageSize:String(Math.min(count,100)), language:"en", sortBy:"publishedAt" });
    if (dateFrom) params.set("from",new Date(dateFrom).toISOString().split("T")[0]);
    const res = await fetch(`https://newsapi.org/v2/everything?${params}`, {
      headers: { "X-Api-Key":apiKey }, signal:AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status!=="ok") return [];
    return (data.articles||[]).filter((a:any)=>a.url&&a.title&&!blocked(a.url)).map((a:any) => {
      const content=clean([a.title,a.description].filter(Boolean).join(" ").slice(0,600));
      if (content.length<30) return null;
      return { source:src(a.url), content, title:a.title||"", url:a.url,
        author_name:a.source?.name||"", posted_at:a.publishedAt||null, date_verified:!!a.publishedAt };
    }).filter(Boolean);
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { keywords, limit, date_from, date_to, include_hn, include_reddit } = await req.json();
    if (!keywords?.length) return new Response(JSON.stringify({ success:false, error:"Keywords required" }), { status:400, headers: { ...CORS, "Content-Type":"application/json" } });

    const braveKey   = Deno.env.get("BRAVE_SEARCH_API_KEY")||"";
    const newsApiKey = Deno.env.get("NEWSAPI_KEY")||"";
    const maxResults = Math.min(limit||25,50);
    const query = keywords.slice(0,5).map((k:string)=>`"${k}"`).join(" OR ");

    let freshness="pw";
    if (date_from) {
      const d=(Date.now()-new Date(date_from).getTime())/86400000;
      if (d<=1) freshness="pd"; else if (d<=7) freshness="pw"; else if (d<=30) freshness="pm"; else freshness="py";
    }

    const [bingResults, braveResults, newsResults, hnResults, redditResults] = await Promise.all([
      bingRss(query),
      braveKey   ? braveSearch(query, maxResults, braveKey, freshness)                 : Promise.resolve([]),
      newsApiKey ? newsApiSearch(query, Math.min(maxResults,20), newsApiKey, date_from) : Promise.resolve([]),
      include_hn     !== false ? hnSearch(keywords[0], date_from)       : Promise.resolve([]),
      include_reddit !== false ? redditPublic(keywords[0], date_from)   : Promise.resolve([]),
    ]);

    const seen = new Set<string>();
    const results: any[] = [];
    for (const r of [...bingResults,...braveResults,...newsResults,...hnResults,...redditResults]) {
      if (!r.url||!r.content||r.content.length<25) continue;
      const key = r.url.toLowerCase().replace(/\/$/,"");
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(r);
    }

    const eb = { bing:bingResults.length, brave:braveResults.length, newsapi:newsResults.length, hackernews:hnResults.length, reddit_public:redditResults.length };
    console.log(`scan-search: ${results.length} results | ${JSON.stringify(eb)}`);

    return new Response(JSON.stringify({ success:true, results, discovery_engine:"multi-source", engine_breakdown:eb, query_used:query }),
      { headers: { ...CORS, "Content-Type":"application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ success:false, error:err.message }), { status:500, headers: { ...CORS, "Content-Type":"application/json" } });
  }
});
