import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function src(url: string): string {
  if (!url) return "news";
  const h = url.toLowerCase();
  if (h.includes("reddit.com")) return "reddit";
  if (h.includes("twitter.com") || h.includes("x.com")) return "twitter";
  if (h.includes("youtube.com")) return "youtube";
  if (h.includes("linkedin.com")) return "linkedin";
  if (h.includes("trustpilot.com")) return "trustpilot";
  if (h.includes("g2.com")) return "g2";
  if (h.includes("glassdoor.com")) return "glassdoor";
  if (h.includes("medium.com") || h.includes("substack.com")) return "blog";
  if (h.includes("forum") || h.includes("discuss") || h.includes("community")) return "forum";
  if (h.includes("ycombinator")) return "forum";
  return "news";
}

const BLOCK_DOMAINS = new Set([
  "en.wikipedia.org","wikipedia.org","investopedia.com","apps.apple.com",
  "play.google.com","support.google.com","support.apple.com","howstuffworks.com",
  "dictionary.com","merriam-webster.com","britannica.com","nerdwallet.com",
  "bankrate.com","investing.com","news.google.com","bing.com",
]);

function blocked(url: string): boolean {
  try { return BLOCK_DOMAINS.has(new URL(url).hostname.replace("www.","").toLowerCase()); } catch { return false; }
}

function clean(raw: string): string {
  return raw
    .replace(/!\[.*?\]\([^)]*\)/g," ").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1")
    .replace(/https?:\/\/\S+/g," ").replace(/<[^>]+>/g," ")
    .replace(/[#*_~`>|]/g," ").replace(/[-=]{3,}/g," ")
    .replace(/\s+/g," ").trim();
}

function xmlDecode(s: string): string {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}

function dedup(arr: any[]): any[] {
  const seen = new Set<string>();
  return arr.filter(r => {
    if (!r.url) return true;
    const key = r.url.toLowerCase().replace(/\/$/,"").replace(/^https?:\/\//,"");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Google News RSS ──
async function googleNewsRss(query: string, limit: number, dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SentinelBot/2.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return results;
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const item of items.slice(0,limit)) {
      try {
        const title  = xmlDecode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "");
        const link   = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
        const desc   = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "");
        const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
        if (!link || blocked(link)) continue;
        const content = clean([title,desc].filter(Boolean).join(". "));
        if (content.length < 30) continue;
        let posted_at: string|null = null;
        if (pubRaw) { try { posted_at = new Date(pubRaw).toISOString(); } catch {} }
        if (dateFrom && posted_at && new Date(posted_at).getTime() < new Date(dateFrom).getTime()) continue;
        results.push({ source: src(link), content, title, url: link,
          author_name: (() => { try { return new URL(link).hostname.replace("www.",""); } catch { return "news"; } })(),
          posted_at, date_verified: !!posted_at, _engine: "google-rss" });
      } catch {}
    }
  } catch (e: any) { console.warn("[google-rss] failed:", e.message); }
  return results;
}

// ── Bing News RSS ──
async function bingNewsRss(query: string, limit: number): Promise<any[]> {
  const results: any[] = [];
  try {
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SentinelBot/2.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return results;
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const item of items.slice(0,limit)) {
      try {
        const title  = xmlDecode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "");
        const link   = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
        const desc   = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "");
        const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
        if (!link || blocked(link)) continue;
        const content = clean([title,desc].filter(Boolean).join(". "));
        if (content.length < 30) continue;
        let posted_at: string|null = null;
        if (pubRaw) { try { posted_at = new Date(pubRaw).toISOString(); } catch {} }
        results.push({ source: src(link), content, title, url: link,
          author_name: (() => { try { return new URL(link).hostname.replace("www.",""); } catch { return "news"; } })(),
          posted_at, date_verified: !!posted_at, _engine: "bing-rss" });
      } catch {}
    }
  } catch (e: any) { console.warn("[bing-rss] failed:", e.message); }
  return results;
}

// ── HackerNews ──
async function hackerNews(query: string, limit: number, dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  try {
    const params = new URLSearchParams({ query, hitsPerPage: String(limit), tags: "story,comment" });
    if (dateFrom) params.set("numericFilters",`created_at_i>${Math.floor(new Date(dateFrom).getTime()/1000)}`);
    const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return results;
    const data = await res.json();
    for (const h of (data.hits||[])) {
      const raw = h.story_text||h.comment_text||h.title||"";
      if (!raw) continue;
      const content = clean(raw.slice(0,600));
      if (content.length < 30) continue;
      results.push({ source:"forum", content, title:h.title||query, url:h.url||`https://news.ycombinator.com/item?id=${h.objectID}`,
        author_name: h.author||"HackerNews", posted_at:h.created_at||null, date_verified:!!h.created_at,
        metrics:{ comments:h.num_comments||0, likes:h.points||0 }, _engine:"hackernews" });
    }
  } catch (e: any) { console.warn("[hackernews] failed:", e.message); }
  return results;
}

// ── Reddit public ──
async function redditPublic(query: string, limit: number, dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  const dateMs = dateFrom ? new Date(dateFrom).getTime() : 0;
  try {
    const params = new URLSearchParams({ q: query, sort:"new", limit:String(limit), t:"month" });
    const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
      headers: { "User-Agent":"FactSentinel/2.0 (+https://factsentinel.app)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return results;
    const data = await res.json();
    for (const child of (data.data?.children||[])) {
      const p = child.data;
      if (dateMs && p.created_utc*1000 < dateMs) continue;
      const content = clean((p.selftext||p.title||"").slice(0,600));
      if (content.length < 20) continue;
      results.push({ source:"reddit", content, title:p.title||query,
        url:`https://reddit.com${p.permalink}`, author_name:p.author||"reddit",
        posted_at:new Date(p.created_utc*1000).toISOString(), date_verified:true,
        metrics:{ likes:p.ups||0, comments:p.num_comments||0 }, _engine:"reddit-public" });
    }
  } catch (e: any) { console.warn("[reddit-public] failed:", e.message); }
  return results;
}

// ── Brave Search ──
async function braveSearch(query: string, limit: number, apiKey: string, freshness?: string): Promise<any[]> {
  const results: any[] = [];
  try {
    const params = new URLSearchParams({ q:query, count:String(Math.min(limit,20)), search_lang:"en", safesearch:"off" });
    if (freshness) params.set("freshness", freshness);
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { "Accept":"application/json", "X-Subscription-Token":apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return results;
    const data = await res.json();
    for (const r of [...(data.web?.results||[]),...(data.news?.results||[])]) {
      if (!r.url||blocked(r.url)) continue;
      const content = clean([r.title,r.description,...(r.extra_snippets||[])].filter(Boolean).join(" ").slice(0,700));
      if (content.length < 30) continue;
      const age = r.age?.toLowerCase()||"";
      let posted_at: string|null = null;
      if (age) {
        const n=parseInt(age)||1;
        if (age.includes("hour")) posted_at=new Date(Date.now()-n*3600000).toISOString();
        else if (age.includes("day")) posted_at=new Date(Date.now()-n*86400000).toISOString();
        else if (age.includes("week")) posted_at=new Date(Date.now()-n*7*86400000).toISOString();
        else if (age.includes("month")) posted_at=new Date(Date.now()-n*30*86400000).toISOString();
      }
      results.push({ source:src(r.url), content, title:r.title||"", url:r.url,
        author_name:(() => { try { return new URL(r.url).hostname.replace("www.",""); } catch { return ""; } })(),
        posted_at, date_verified:!!posted_at, _engine:"brave" });
    }
  } catch (e: any) { console.warn("[brave] failed:", e.message); }
  return results;
}

// ── NewsAPI ──
async function newsApi(query: string, limit: number, apiKey: string, dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  try {
    const params = new URLSearchParams({ q:query, pageSize:String(Math.min(limit,100)), language:"en", sortBy:"publishedAt" });
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString().split("T")[0]);
    const res = await fetch(`https://newsapi.org/v2/everything?${params}`, {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return results;
    const data = await res.json();
    if (data.status !== "ok") return results;
    for (const a of (data.articles||[])) {
      if (!a.url||!a.title||blocked(a.url)) continue;
      const content = clean([a.title,a.description,a.content?.replace(/\[\+\d+ chars\]/,"")].filter(Boolean).join(" ").slice(0,700));
      if (content.length < 30) continue;
      results.push({ source:src(a.url), content, title:a.title||"", url:a.url,
        author_name:a.source?.name||(() => { try { return new URL(a.url).hostname.replace("www.",""); } catch { return ""; } })(),
        posted_at:a.publishedAt||null, date_verified:!!a.publishedAt, _engine:"newsapi" });
    }
  } catch (e: any) { console.warn("[newsapi] failed:", e.message); }
  return results;
}

// ── Firecrawl ──
async function firecrawl(query: string, limit: number, apiKey: string): Promise<any[]> {
  const results: any[] = [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
      body: JSON.stringify({ query, limit:Math.min(limit,15), scrapeOptions:{ formats:["markdown"], onlyMainContent:true } }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.status===402||res.status===429||!res.ok) return results;
    const data = await res.json();
    for (const item of (data.data||data.results||[])) {
      if (!item.url||blocked(item.url)) continue;
      const content = clean((item.markdown||item.content||item.description||"").slice(0,1000));
      if (content.length < 30) continue;
      results.push({ source:src(item.url), content, title:item.title||item.metadata?.title||"", url:item.url,
        author_name:(() => { try { return new URL(item.url).hostname.replace("www.",""); } catch { return ""; } })(),
        posted_at:item.metadata?.publishedTime||null, date_verified:!!item.metadata?.publishedTime, _engine:"firecrawl" });
    }
  } catch (e: any) { console.warn("[firecrawl] failed:", e.message); }
  return results;
}

/* ── MAIN ── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { keywords, sites, limit, date_from, date_to, include_hn, include_reddit } = await req.json();
    if (!keywords?.length) return new Response(JSON.stringify({ success:false, error:"Keywords required" }), { status:400, headers: { ...CORS, "Content-Type":"application/json" } });

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";
    const braveKey     = Deno.env.get("BRAVE_SEARCH_API_KEY") || "";
    const newsApiKey   = Deno.env.get("NEWSAPI_KEY") || "";
    const maxResults   = Math.min(limit||20,30);

    const primary = keywords.length===1 ? keywords[0] : keywords.slice(0,4).map((k:string)=>`"${k}"`).join(" OR ");
    const siteFilter = sites?.length ? ` (${sites.slice(0,8).map((s:string)=>`site:${s}`).join(" OR ")})` : "";
    const query = `${primary}${siteFilter}`;

    let freshness = "pw";
    if (date_from) {
      const d=(Date.now()-new Date(date_from).getTime())/86400000;
      if (d<=1) freshness="pd"; else if (d<=7) freshness="pw"; else if (d<=30) freshness="pm"; else freshness="py";
    }

    // Run all sources in parallel
    const promises: Promise<{ engine: string; results: any[] }>[] = [
      googleNewsRss(query, maxResults, date_from).then(r=>({ engine:"google-rss", results:r })),
      bingNewsRss(query, maxResults).then(r=>({ engine:"bing-rss", results:r })),
    ];
    if (include_hn !== false)     promises.push(hackerNews(keywords[0]||query, maxResults, date_from).then(r=>({ engine:"hackernews", results:r })));
    if (include_reddit !== false) promises.push(redditPublic(keywords[0]||query, maxResults, date_from).then(r=>({ engine:"reddit-public", results:r })));
    if (braveKey)     promises.push(braveSearch(query, maxResults, braveKey, freshness).then(r=>({ engine:"brave", results:r })));
    if (newsApiKey)   promises.push(newsApi(primary, maxResults, newsApiKey, date_from).then(r=>({ engine:"newsapi", results:r })));
    if (firecrawlKey) promises.push(firecrawl(query, maxResults, firecrawlKey).then(r=>({ engine:"firecrawl", results:r })));

    const settled = await Promise.allSettled(promises);
    const engineBreakdown: Record<string,number> = {};
    let all: any[] = [];
    for (const s of settled) {
      if (s.status==="fulfilled") {
        engineBreakdown[s.value.engine] = s.value.results.length;
        all.push(...s.value.results);
      }
    }

    all = dedup(all);

    const dateFromMs = date_from ? new Date(date_from).getTime() : 0;
    const dateToMs   = date_to   ? new Date(date_to).getTime()   : 0;
    const results = all.filter(r => {
      if (!r.content || r.content.length < 25) return false;
      if (blocked(r.url||"")) return false;
      if (r.posted_at && dateFromMs && new Date(r.posted_at).getTime() < dateFromMs) return false;
      if (r.posted_at && dateToMs   && new Date(r.posted_at).getTime() > dateToMs)   return false;
      return true;
    });

    console.log(`scan-web: ${all.length} raw → ${results.length} final | ${JSON.stringify(engineBreakdown)}`);

    return new Response(JSON.stringify({
      success: true, results, query_used: query,
      engine_breakdown: engineBreakdown,
      engines_used: Object.keys(engineBreakdown).filter(k=>engineBreakdown[k]>0).length,
    }), { headers: { ...CORS, "Content-Type":"application/json" } });

  } catch (err: any) {
    console.error("scan-web error:", err);
    return new Response(JSON.stringify({ success:false, error:err.message }), { status:500, headers: { ...CORS, "Content-Type":"application/json" } });
  }
});
