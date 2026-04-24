// Supabase Edge Runtime types (REQUIRED - without this Deno.env/Deno.serve may not resolve)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Source classifier ──────────────────────────────────────────────────────
function src(url: string): string {
  if (!url) return "news";
  const h = url.toLowerCase();
  if (h.includes("reddit.com")) return "reddit";
  if (h.includes("twitter.com") || h.includes("x.com")) return "twitter";
  if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
  if (h.includes("linkedin.com")) return "linkedin";
  if (h.includes("trustpilot.com")) return "trustpilot";
  if (h.includes("g2.com")) return "g2";
  if (h.includes("glassdoor.com")) return "glassdoor";
  if (h.includes("medium.com") || h.includes("substack.com")) return "blog";
  if (h.includes("forum") || h.includes("discuss") || h.includes("community")) return "forum";
  if (h.includes("ycombinator")) return "forum";
  return "news";
}

// ── Block list — evergreen/reference sites only, NOT aggregators ───────────
// Do NOT add news.google.com or bing.com — their redirect URLs are valid results
const BLOCK_DOMAINS = new Set([
  "en.wikipedia.org", "wikipedia.org", "investopedia.com",
  "apps.apple.com", "play.google.com", "support.google.com", "support.apple.com",
  "howstuffworks.com", "about.com", "dictionary.com", "merriam-webster.com",
  "britannica.com",
]);

function blocked(url: string): boolean {
  try {
    return BLOCK_DOMAINS.has(new URL(url).hostname.replace("www.", "").toLowerCase());
  } catch { return false; }
}

// ── Text helpers ───────────────────────────────────────────────────────────
function clean(raw: string): string {
  return raw
    .replace(/!\[.*?\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_~`>|]/g, " ")
    .replace(/[-=]{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlDecode(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isJunk(text: string): boolean {
  const lower = text.toLowerCase();
  const length = text.length;

  // Hard-block patterns — 1 hit is enough to discard
  // NOTE: some of these strings (like "sign in to youtube") CAN appear in legitimate transcripts
  // So for longer content (>500 chars) we skip youtube-specific blocks — it's likely real content
  const hardBlockShortContent = [
    "sign in to youtube",
    "this video is private",
    "video unavailable",
  ];
  if (length < 500 && hardBlockShortContent.some(b => lower.includes(b))) return true;

  const hardBlock = [
    "403 forbidden", "access denied", "access is denied",
    "403 error", "http 403", "status 403",
    "captcha", "please verify you are a human", "are you a human",
    "cloudflare", "just a moment", "checking your browser",
    "ray id:", "cf-ray",
    "enable javascript to run this app",
    "javascript is required", "you need javascript",
    "blocked by an extension",
    "page cannot be displayed",
    "service unavailable", "503 service",
    "502 bad gateway", "504 gateway",
    "this page isn't available", "page not found", "404 not found",
    "error establishing a database connection",
    "we couldn't find this page",
  ];
  if (hardBlock.some(b => lower.includes(b))) return true;

  // Soft-block patterns — 2 hits = discard
  const softBlock = [
    "cookie policy", "accept cookies", "we use cookies",
    "access control", "forbidden", "not authorized",
    "please log in", "please sign in", "login required",
    "subscribe to read", "subscribe to continue",
    "paywall", "premium content",
  ];
  const softHits = softBlock.filter(b => lower.includes(b)).length;
  return softHits >= 2;
}

// Normalize URL for dedup — strip tracking params, fragment, trailing slash
function normalizeUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url.toLowerCase());
    // Remove known tracking/utm params
    const TRACKING_PARAMS = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content",
      "ref","source","fbclid","gclid","msclkid","igshid","mc_cid","mc_eid","_ga","_gl",
      "share","from","via","s","t","si"];
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    u.hash = "";
    return (u.origin + u.pathname).replace(/\/$/, "") + (u.search !== "?" ? u.search : "");
  } catch {
    return url.toLowerCase().replace(/\/$/, "").replace(/^https?:\/\//, "");
  }
}

function dedup(arr: any[]): any[] {
  const seen = new Set<string>();
  return arr.filter(r => {
    if (!r.url) return true;
    const key = normalizeUrl(r.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Keyword sentiment fallback ─────────────────────────────────────────────
const POS = ["award","growth","launch","partnership","milestone","record","trusted","excellent",
  "innovative","leader","success","safe","reliable","invest","positive","profit","expand",
  "improve","strong","winning","hire","funding","certified","best","loved","popular","secure",
  "innovation","achievement","breakthrough","leading","recognized","top","premium"];
const NEG = ["fraud","scam","breach","hack","lawsuit","penalty","fine","suspend","ban","fail",
  "layoff","shutdown","bankrupt","corrupt","mislead","lie","complaint","violated","unsafe",
  "toxic","illegal","investigation","sec","recall","outage","loss","decline","crash","warning",
  "crisis","scandal","controversy","bad","poor","terrible","awful","horrible","problem","issue",
  "risk","threat","danger","attack","exposed","leaked","stolen","fired","arrested","charged"];
const CRIT = ["fraud","scam","breach","lawsuit","sec","bankrupt","illegal","shutdown","ban","arrested","charged","leaked","stolen"];

function kwSentiment(text: string) {
  const lower = text.toLowerCase();
  const pos = POS.filter(w => lower.includes(w)).length;
  const neg = NEG.filter(w => lower.includes(w)).length;
  const crit = CRIT.filter(w => lower.includes(w)).length;
  if (neg === 0 && pos === 0) return { sentiment_label: "neutral", sentiment_score: 0, severity: "low" };
  if (neg > pos) {
    const score = -Math.min(0.95, neg * 0.18);
    const severity = crit >= 2 ? "critical" : crit >= 1 ? "high" : neg >= 3 ? "medium" : "low";
    return { sentiment_label: "negative", sentiment_score: score, severity };
  }
  if (pos > neg) return { sentiment_label: "positive", sentiment_score: Math.min(0.9, pos * 0.18), severity: "low" };
  return { sentiment_label: "mixed", sentiment_score: -0.1, severity: neg >= 2 ? "medium" : "low" };
}

// ══════════════════════════════════════════════════════════════════════════
// CRAWLERS — all inline, all independently try/catched
// ══════════════════════════════════════════════════════════════════════════

async function crawlGoogleNews(keywords: string[], dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  // Run multiple keyword combinations to maximize coverage
  const queries: string[] = [
    keywords.slice(0, 4).join(" OR "),       // all main keywords
    keywords[0],                              // primary keyword alone (most relevant)
    keywords.length > 2 ? `"${keywords[0]}" "${keywords[1]}"` : null,  // exact phrase combo
    keywords.length > 1 ? keywords[1] : null, // second keyword alone
  ].filter(Boolean) as string[];

  await Promise.allSettled(queries.map(async (q) => {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FactSentinelBot/2.0)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0, 20)) {
        try {
          const titleRaw = item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "";
          const title = xmlDecode(titleRaw);
          const desc = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "");
          const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";

          // Google News puts a redirect URL in <link>. Extract the real source URL
          // from <source url="..."> attribute — this is the actual publisher domain
          const sourceUrl = item.match(/<source\s+url="([^"]+)"/)?.[1] || "";
          const sourceName = xmlDecode(item.match(/<source[^>]*>([^<]+)<\/source>/)?.[1] || "");

          // The redirect URL itself is fine as the stored URL — it resolves to the article
          const gnLink = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();

          // Use the real publisher URL if available, otherwise the google redirect
          const articleUrl = sourceUrl
            ? `${sourceUrl.replace(/\/$/, "")}` // domain only — we don't have the path
            : gnLink;

          // Skip if blocked
          if (sourceUrl && blocked(sourceUrl)) continue;

          const content = clean([title, desc].filter(Boolean).join(". "));
          if (content.length < 30) continue;

          let posted_at: string | null = null;
          try { if (pubRaw) posted_at = new Date(pubRaw).toISOString(); } catch {}
          if (dateFrom && posted_at && new Date(posted_at).getTime() < new Date(dateFrom).getTime()) continue;

          results.push({
            source: "news",
            content,
            title: title.replace(/\s+-\s+[^-]+$/, "").trim(), // strip "- Publisher Name" suffix
            url: gnLink || articleUrl, // use redirect URL so it's unique per article
            author_name: sourceName || (sourceUrl ? new URL(sourceUrl).hostname.replace("www.", "") : "news"),
            posted_at,
            date_verified: !!posted_at,
          });
        } catch { /* skip malformed item */ }
      }
    } catch (e: any) { console.warn("[google-rss] query failed:", e.message); }
  }));
  return results;
}

async function crawlBingNews(keywords: string[]): Promise<any[]> {
  const results: any[] = [];
  try {
    const query = keywords.slice(0, 3).join(" ");
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FactSentinelBot/2.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return results;
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const item of items.slice(0, 20)) {
      try {
        const title = xmlDecode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "");
        const desc = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "");
        const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";

        // Bing encodes real URL in the redirect link as url=... query param
        const rawLink = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";
        const decodedLink = xmlDecode(rawLink);

        // Extract real URL from Bing redirect: url=https%3a%2f%2f...
        const realUrlMatch = decodedLink.match(/[?&]url=([^&]+)/);
        const articleUrl = realUrlMatch
          ? decodeURIComponent(realUrlMatch[1])
          : decodedLink;

        if (!articleUrl) continue;
        if (blocked(articleUrl)) continue;

        const content = clean([title, desc].filter(Boolean).join(". "));
        if (content.length < 30) continue;

        let posted_at: string | null = null;
        try { if (pubRaw) posted_at = new Date(pubRaw).toISOString(); } catch {}

        results.push({
          source: src(articleUrl),
          content,
          title,
          url: articleUrl, // real article URL, not bing redirect
          author_name: (() => { try { return new URL(articleUrl).hostname.replace("www.", ""); } catch { return "news"; } })(),
          posted_at,
          date_verified: !!posted_at,
        });
      } catch { /* skip */ }
    }
  } catch (e: any) { console.warn("[bing-rss] failed:", e.message); }
  return results;
}

// Direct RSS feeds from publishers — real URLs, real content, no redirects
async function crawlDirectRSS(keywords: string[]): Promise<any[]> {
  const results: any[] = [];

  // General interest feeds — always crawl these for context
  const generalFeeds = [
    { url: "https://techcrunch.com/feed/", name: "TechCrunch" },
    { url: "https://feeds.bbci.co.uk/news/business/rss.xml", name: "BBC Business" },
    { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", name: "BBC Tech" },
    { url: "https://www.theverge.com/rss/index.xml", name: "The Verge" },
    { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", name: "NYT Tech" },
    { url: "https://feeds.arstechnica.com/arstechnica/index", name: "Ars Technica" },
  ];

  // Keyword-based filtering — only keep items mentioning any keyword
  const kwLower = keywords.map(k => k.toLowerCase());

  await Promise.allSettled(generalFeeds.map(async ({ url, name }) => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FactSentinelBot/2.0)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const xml = await res.text();
      // Handle both RSS <item> and Atom <entry>
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) ||
                    xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

      for (const item of items.slice(0, 30)) {
        try {
          const title = xmlDecode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "");
          const desc  = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] ||
                                  item.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] || "");
          const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ||
                         item.match(/<published>([\s\S]*?)<\/published>/)?.[1] ||
                         item.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] || "";

          // Real URL extraction for Atom and RSS
          let link = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ||
                      item.match(/<link href="([^"]+)"/)?.[1] || "").trim();
          link = xmlDecode(link);

          if (!link || blocked(link)) continue;

          const combined = (title + " " + desc).toLowerCase();
          // Only include if item mentions one of our keywords
          if (!kwLower.some(kw => combined.includes(kw))) continue;

          const content = clean([title, desc].filter(Boolean).join(". "));
          if (content.length < 30) continue;

          let posted_at: string | null = null;
          try { if (pubRaw) posted_at = new Date(pubRaw).toISOString(); } catch {}

          results.push({
            source: src(link), content, title, url: link,
            author_name: name,
            posted_at, date_verified: !!posted_at,
          });
        } catch { /* skip */ }
      }
    } catch (e: any) { console.warn(`[rss:${name}] failed:`, e.message); }
  }));
  return results;
}

async function crawlHackerNews(keywords: string[], dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  await Promise.allSettled(keywords.slice(0, 5).map(async (kw) => {
    try {
      const params = new URLSearchParams({ query: kw, hitsPerPage: "20", tags: "story,comment" });
      if (dateFrom) {
        params.set("numericFilters", `created_at_i>${Math.floor(new Date(dateFrom).getTime() / 1000)}`);
      }
      const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const h of (data.hits || [])) {
        const raw = h.story_text || h.comment_text || h.title || "";
        if (!raw) continue;
        const content = clean(raw.slice(0, 600));
        if (content.length < 30) continue;
        results.push({
          source: "forum", content, title: h.title || kw,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          author_name: h.author || "HackerNews",
          posted_at: h.created_at || null,
          date_verified: !!h.created_at,
          metrics: { comments: h.num_comments || 0, likes: h.points || 0 },
        });
      }
    } catch (e: any) { console.warn("[hackernews] failed:", e.message); }
  }));
  return results;
}

async function crawlReddit(keywords: string[], dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  const dateMs = dateFrom ? new Date(dateFrom).getTime() : 0;
  await Promise.allSettled(keywords.slice(0, 5).map(async (kw) => {
    try {
      const params = new URLSearchParams({ q: kw, sort: "new", limit: "25", t: "month" });
      const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
        headers: { "User-Agent": "FactSentinel/2.0 (reputation monitoring bot)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const child of (data.data?.children || [])) {
        const p = child.data;
        if (dateMs && p.created_utc * 1000 < dateMs) continue;
        const content = clean((p.selftext || p.title || "").slice(0, 600));
        if (content.length < 20) continue;
        results.push({
          source: "reddit", content, title: p.title || kw,
          url: `https://reddit.com${p.permalink}`,
          author_name: p.author || "reddit",
          posted_at: new Date(p.created_utc * 1000).toISOString(),
          date_verified: true,
          metrics: { likes: p.ups || 0, comments: p.num_comments || 0 },
        });
      }
    } catch (e: any) { console.warn("[reddit] failed:", e.message); }
  }));
  return results;
}

async function crawlBrave(keywords: string[], limit: number, apiKey: string, dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  const query = keywords.slice(0, 4).map(k => `"${k}"`).join(" OR ");
  let freshness = "pw";
  if (dateFrom) {
    const days = (Date.now() - new Date(dateFrom).getTime()) / 86400000;
    if (days <= 1) freshness = "pd";
    else if (days <= 7) freshness = "pw";
    else if (days <= 30) freshness = "pm";
    else freshness = "py";
  }
  try {
    const params = new URLSearchParams({
      q: query, count: String(Math.min(limit, 20)), search_lang: "en",
      safesearch: "off", freshness,
    });
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { "Accept": "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return results;
    const data = await res.json();
    for (const r of [...(data.web?.results || []), ...(data.news?.results || [])]) {
      if (!r.url || blocked(r.url)) continue;
      const content = clean([r.title, r.description, ...(r.extra_snippets || [])].filter(Boolean).join(" ").slice(0, 700));
      if (content.length < 30) continue;
      const age = r.age?.toLowerCase() || "";
      let posted_at: string | null = null;
      if (age) {
        const n = parseInt(age) || 1;
        if (age.includes("hour")) posted_at = new Date(Date.now() - n * 3600000).toISOString();
        else if (age.includes("day")) posted_at = new Date(Date.now() - n * 86400000).toISOString();
        else if (age.includes("week")) posted_at = new Date(Date.now() - n * 7 * 86400000).toISOString();
        else if (age.includes("month")) posted_at = new Date(Date.now() - n * 30 * 86400000).toISOString();
      }
      results.push({
        source: src(r.url), content, title: r.title || "", url: r.url,
        author_name: (() => { try { return new URL(r.url).hostname.replace("www.", ""); } catch { return ""; } })(),
        posted_at, date_verified: !!posted_at,
      });
    }
    console.log(`[brave] ${results.length} results`);
  } catch (e: any) { console.warn("[brave] failed:", e.message); }
  return results;
}

async function crawlNewsAPI(keywords: string[], limit: number, apiKey: string, dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  const query = keywords.slice(0, 5).map(k => `"${k}"`).join(" OR ");
  try {
    const params = new URLSearchParams({
      q: query, pageSize: String(Math.min(limit, 100)),
      language: "en", sortBy: "publishedAt",
    });
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString().split("T")[0]);
    const res = await fetch(`https://newsapi.org/v2/everything?${params}`, {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return results;
    const data = await res.json();
    if (data.status !== "ok") return results;
    for (const a of (data.articles || [])) {
      if (!a.url || !a.title || blocked(a.url)) continue;
      const content = clean([a.title, a.description, a.content?.replace(/\[\+\d+ chars\]/, "")].filter(Boolean).join(" ").slice(0, 700));
      if (content.length < 30) continue;
      results.push({
        source: src(a.url), content, title: a.title || "", url: a.url,
        author_name: a.source?.name || (() => { try { return new URL(a.url).hostname.replace("www.", ""); } catch { return ""; } })(),
        posted_at: a.publishedAt || null, date_verified: !!a.publishedAt,
      });
    }
    console.log(`[newsapi] ${results.length} results`);
  } catch (e: any) { console.warn("[newsapi] failed:", e.message); }
  return results;
}

async function crawlFirecrawl(keywords: string[], limit: number, apiKey: string): Promise<any[]> {
  const results: any[] = [];
  const query = keywords.slice(0, 4).map(k => `"${k}"`).join(" OR ");
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query, limit: Math.min(limit, 15),
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.status === 402 || res.status === 429 || !res.ok) return results;
    const data = await res.json();
    for (const item of (data.data || data.results || [])) {
      if (!item.url || blocked(item.url)) continue;
      const content = clean((item.markdown || item.content || item.description || "").slice(0, 1000));
      if (content.length < 30) continue;
      results.push({
        source: src(item.url), content, title: item.title || item.metadata?.title || "",
        url: item.url,
        author_name: (() => { try { return new URL(item.url).hostname.replace("www.", ""); } catch { return ""; } })(),
        posted_at: item.metadata?.publishedTime || null,
        date_verified: !!item.metadata?.publishedTime,
      });
    }
    console.log(`[firecrawl] ${results.length} results`);
  } catch (e: any) { console.warn("[firecrawl] failed:", e.message); }
  return results;
}

// ══════════════════════════════════════════════════════════════════════════
// ── Language detection (heuristic, no library needed) ──────────────────────
// Detects obvious non-English text by checking common high-frequency words
function detectLanguage(text: string): string {
  if (!text || text.length < 20) return "en";
  const t = text.toLowerCase();
  // CJK unicode range
  if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(t)) {
    if (/[\u4e00-\u9fff]/.test(t) && /[\u3040-\u30ff]/.test(t)) return "ja";
    if (/[\uac00-\ud7af]/.test(t)) return "ko";
    return "zh";
  }
  if (/[\u0400-\u04ff]/.test(t)) return "ru"; // Cyrillic
  if (/[\u0600-\u06ff]/.test(t)) return "ar"; // Arabic
  // Common non-English Latin words
  const es = ["que","con","para","pero","como","esto","este","una","por","los","las","del","al","se","no","en","es","de","la","el","un"];
  const fr = ["que","avec","pour","mais","comme","dans","sur","les","des","est","une","pas","plus","tout","bien","aussi","très","être","avoir","faire"];
  const de = ["und","der","die","das","ist","mit","für","nicht","auch","sich","nach","auf","des","bei","ein","eine","als","aber","oder","wenn"];
  const pt = ["que","com","para","mas","como","isso","este","uma","por","os","as","do","ao","se","não","em","é","de","a","o","um"];
  const words = t.split(/\s+/);
  const score = (list: string[]) => words.filter(w => list.includes(w)).length / Math.max(words.length, 1);
  const scores = { es: score(es), fr: score(fr), de: score(de), pt: score(pt) };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] > 0.18) return best[0]; // >18% of words match → non-English
  return "en";
}

// ── Twitter/X crawler ─────────────────────────────────────────────────────
async function crawlTwitter(keywords: string[], bearerToken: string, dateFrom?: string, dateTo?: string): Promise<any[]> {
  const results: any[] = [];
  try {
    const query = keywords.slice(0, 5).map(k => `"${k}"`).join(" OR ");
    const params = new URLSearchParams({
      query: `(${query}) -is:retweet lang:en`,
      max_results: "100",
      "tweet.fields": "created_at,public_metrics,author_id,lang",
      "user.fields": "name,username,verified,public_metrics",
      expansions: "author_id",
    });
    if (dateFrom) params.set("start_time", new Date(dateFrom).toISOString());
    if (dateTo) params.set("end_time", new Date(dateTo).toISOString());

    const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn(`[twitter] ${res.status}: ${err.detail || err.title || "API error"}`);
      return results;
    }
    const data = await res.json();
    const tweets = data.data || [];
    const userMap = new Map((data.includes?.users || []).map((u: any) => [u.id, u]));
    for (const tweet of tweets) {
      const author = userMap.get(tweet.author_id) as any;
      const content = clean(tweet.text || "");
      if (content.length < 15) continue;
      results.push({
        source: "twitter",
        content,
        title: `Tweet by @${author?.username || "unknown"}`,
        url: `https://twitter.com/${author?.username || "i"}/status/${tweet.id}`,
        author_name: author?.name || author?.username || "Twitter User",
        author_handle: `@${author?.username || "unknown"}`,
        author_verified: author?.verified || false,
        author_follower_count: author?.public_metrics?.followers_count || 0,
        posted_at: tweet.created_at || null,
        date_verified: !!tweet.created_at,
        language: tweet.lang || "en",
        metrics: {
          likes: tweet.public_metrics?.like_count || 0,
          shares: tweet.public_metrics?.retweet_count || 0,
          comments: tweet.public_metrics?.reply_count || 0,
        },
      });
    }
    console.log(`[twitter] ${results.length} tweets`);
  } catch (e: any) { console.warn("[twitter] failed:", e.message); }
  return results;
}

// ── YouTube crawler ───────────────────────────────────────────────────────
// ── Gemini native YouTube video analysis ──────────────────────────────────
// Uses Gemini's multimodal capability to analyse a YouTube video directly.
// Returns a structured analysis including transcript excerpt, sentiment, and summary.
// Only called when the timedtext transcript fetch fails AND geminiKey is available.
async function analyseYouTubeWithGemini(
  videoId: string,
  title: string,
  brandName: string,
  geminiKey: string
): Promise<{ transcript_excerpt: string; summary: string; content_type: string } | null> {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[youtube-gemini] analysing video ${videoId} natively`);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(90000),
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { fileData: { mimeType: "video/mp4", fileUri: videoUrl } },
              {
                text: `You are a brand monitoring assistant. Analyse this YouTube video and return ONLY valid JSON:
{
  "transcript_excerpt": "150-200 word excerpt of the most brand-relevant spoken content (or best summary of what is spoken if brand not mentioned)",
  "full_summary": "2-3 sentence summary of what this video is about and how it relates to ${brandName}",
  "content_type": "tutorial|review|news|opinion|scam_warning|promotional|other",
  "brand_mentions": ["up to 5 direct quotes or close paraphrases mentioning ${brandName}"],
  "is_relevant": true or false
}
Base your analysis on what is ACTUALLY spoken and shown. Do not guess. If the video is not about or mentioning ${brandName}, set is_relevant=false.`,
              },
            ],
          }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) {
      console.warn(`[youtube-gemini] API error ${res.status} for ${videoId}`);
      return null;
    }
    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawText) return null;
    let parsed: any;
    try { parsed = JSON.parse(rawText); }
    catch {
      const stripped = rawText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      try { parsed = JSON.parse(stripped); } catch { return null; }
    }
    console.log(`[youtube-gemini] success for ${videoId}: content_type=${parsed.content_type}`);
    return {
      transcript_excerpt: parsed.transcript_excerpt || parsed.full_summary || "",
      summary: parsed.full_summary || "",
      content_type: parsed.content_type || "other",
    };
  } catch (e: any) {
    console.warn(`[youtube-gemini] failed for ${videoId}: ${e.message}`);
    return null;
  }
}

// ── YouTube transcript fetcher ────────────────────────────────────────────
// Fetches auto-generated captions via YouTube's innertube API.
// No API key required — same endpoint the web player uses.
// Returns cleaned plain-text transcript, or null if unavailable.
async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    // Step 1: get the initial page to extract ytInitialData which contains caption track info
    // Use a lightweight approach: directly request the timedtext endpoint with known params
    // YouTube's timedtext v3 endpoint is publicly accessible for auto-captioned videos
    const timedtextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3&xorb=2&xobt=3&xovt=3`;
    const r1 = await fetch(timedtextUrl, {
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; SentiWatch/1.0)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (r1.ok) {
      const ct = r1.headers.get("content-type") || "";
      if (ct.includes("application/json") || ct.includes("text/javascript")) {
        const data = await r1.json();
        // json3 format: { events: [{ segs: [{ utf8: "text" }] }] }
        const events: any[] = data.events || [];
        const parts: string[] = [];
        for (const evt of events) {
          for (const seg of (evt.segs || [])) {
            if (seg.utf8 && seg.utf8 !== "\n") parts.push(seg.utf8.trim());
          }
        }
        const transcript = parts.join(" ").replace(/\s+/g, " ").trim();
        if (transcript.length > 100) {
          console.log(`[youtube] transcript for ${videoId}: ${transcript.length} chars`);
          return transcript;
        }
      }
    }

    // Step 2: fallback — try the xml format which has broader availability
    const xmlUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`;
    const r2 = await fetch(xmlUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SentiWatch/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (r2.ok) {
      const xml = await r2.text();
      // Strip XML tags, get text content
      const text = xml.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
      if (text.length > 100) {
        console.log(`[youtube] transcript (xml) for ${videoId}: ${text.length} chars`);
        return text;
      }
    }
  } catch (e: any) {
    console.log(`[youtube] transcript unavailable for ${videoId}: ${e.message}`);
  }
  return null;
}

// Clean transcript to a useful length for AI analysis
// Keep enough to understand what's being said, but cap to avoid token explosion
function truncateTranscript(transcript: string, maxChars = 3000): string {
  if (transcript.length <= maxChars) return transcript;
  // Take opening + closing chunks — context often at start/end
  const head = transcript.slice(0, Math.floor(maxChars * 0.7));
  const tail = transcript.slice(-Math.floor(maxChars * 0.3));
  return `${head} [...] ${tail}`;
}

async function crawlYouTube(keywords: string[], apiKey: string, dateFrom?: string, dateTo?: string, geminiKey?: string, brandName?: string): Promise<any[]> {
  const results: any[] = [];
  try {
    const query = keywords.slice(0, 5).join(" | ");
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", "20"); // slightly fewer to allow time for transcript fetches
    searchUrl.searchParams.set("order", "date");
    searchUrl.searchParams.set("key", apiKey);
    if (dateFrom) searchUrl.searchParams.set("publishedAfter", new Date(dateFrom).toISOString());
    if (dateTo) searchUrl.searchParams.set("publishedBefore", new Date(dateTo).toISOString());

    const searchRes = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(20000) });
    if (!searchRes.ok) { console.warn(`[youtube] search ${searchRes.status}`); return results; }
    const searchData = await searchRes.json();
    const items = searchData.items || [];
    if (items.length === 0) return results;

    // Fetch stats + captions availability in one batch call
    const videoIds = items.map((v: any) => v.id?.videoId).filter(Boolean);
    const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    statsUrl.searchParams.set("part", "statistics,contentDetails");
    statsUrl.searchParams.set("id", videoIds.join(","));
    statsUrl.searchParams.set("key", apiKey);
    const statsRes = await fetch(statsUrl.toString(), { signal: AbortSignal.timeout(10000) });
    const statsData = statsRes.ok ? await statsRes.json() : { items: [] };
    const statsMap: Record<string, any> = {};
    const captionMap: Record<string, boolean> = {}; // whether captions are available
    for (const v of (statsData.items || [])) {
      statsMap[v.id] = v.statistics;
      captionMap[v.id] = v.contentDetails?.caption === "true";
    }

    // Fetch transcripts in parallel (capped at 10 to avoid timeout)
    const transcriptIds = videoIds.slice(0, 10);
    const transcriptResults = await Promise.allSettled(
      transcriptIds.map(vid => fetchYouTubeTranscript(vid))
    );
    const transcriptMap: Record<string, string | null> = {};
    transcriptIds.forEach((vid, i) => {
      const r = transcriptResults[i];
      transcriptMap[vid] = r.status === "fulfilled" ? r.value : null;
    });

    const dateFromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    for (const item of items) {
      const vid = item.id?.videoId;
      const sn = item.snippet || {};
      if (dateFromMs > 0 && new Date(sn.publishedAt).getTime() < dateFromMs) continue;
      const st = statsMap[vid] || {};

      const title = sn.title || "";
      const description = sn.description || "";
      const transcript = transcriptMap[vid] || null;

      // Build content: title + description always, then transcript if available
      // The transcript is the ground truth of what was said — this is what AI must analyse
      let content: string;
      let has_transcript = false;
      let gemini_analysed = false;

      if (transcript) {
        // Timedtext transcript available — best case
        const cleanTranscript = truncateTranscript(transcript, 3000);
        content = clean(`TITLE: ${title}\n\nDESCRIPTION: ${description}\n\nTRANSCRIPT: ${cleanTranscript}`).slice(0, 3500);
        has_transcript = true;
      } else if (geminiKey) {
        // No timedtext transcript — use Gemini native video analysis
        // This gives us real spoken content instead of just metadata
        const geminiResult = await analyseYouTubeWithGemini(vid, title, brandName || keywords[0] || "the brand", geminiKey);
        if (geminiResult && geminiResult.transcript_excerpt.length > 50) {
          content = clean(
            `TITLE: ${title}\n\nDESCRIPTION: ${description}\n\nGEMINI VIDEO ANALYSIS:\n${geminiResult.transcript_excerpt}`
          ).slice(0, 3500);
          has_transcript = true; // treat Gemini analysis as equivalent — it's real content
          gemini_analysed = true;
        } else {
          // Gemini failed too — fall back to title + description only
          content = clean(`${title}. ${description}`.trim()).slice(0, 800);
        }
      } else {
        // No transcript and no Gemini key — use title + description, flag as limited context
        content = clean(`${title}. ${description}`.trim()).slice(0, 800);
      }

      if (content.length < 20) continue;

      results.push({
        source: "youtube",
        content,
        title,
        url: `https://www.youtube.com/watch?v=${vid}`,
        author_name: sn.channelTitle || "",
        author_handle: sn.channelId || "",
        posted_at: sn.publishedAt || null,
        date_verified: !!sn.publishedAt,
        has_transcript,
        gemini_analysed,
        metrics: {
          likes: parseInt(st.likeCount || "0"),
          comments: parseInt(st.commentCount || "0"),
          views: parseInt(st.viewCount || "0"),
        },
      });
    }
    const withTranscript = results.filter(r => r.has_transcript).length;
    const withGemini = results.filter(r => r.gemini_analysed).length;
    console.log(`[youtube] ${results.length} videos, ${withTranscript} with content (${withGemini} via Gemini native)`);
  } catch (e: any) { console.warn("[youtube] failed:", e.message); }
  return results;
}

// ── Trustpilot RSS (free, no scraping, real review data) ─────────────────
// Trustpilot publishes RSS feeds for company pages at /review/{domain}?format=rss
// Also searches their sitemap for keyword-matching companies
async function crawlTrustpilotRSS(keywords: string[], orgDomain: string): Promise<any[]> {
  const results: any[] = [];
  // Build candidate domains to check: org domain + keyword-derived guesses
  const candidateDomains: string[] = [];
  if (orgDomain && !orgDomain.includes(" ")) {
    candidateDomains.push(orgDomain.replace(/^www\./, ""));
  }
  // Derive domain guesses from first keyword (e.g. "Binance" → "binance.com")
  const firstKw = keywords[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (firstKw && firstKw.length > 2 && !candidateDomains.includes(`${firstKw}.com`)) {
    candidateDomains.push(`${firstKw}.com`);
  }

  await Promise.allSettled(candidateDomains.slice(0, 3).map(async (domain) => {
    try {
      const rssUrl = `https://www.trustpilot.com/review/${domain}?format=rss`;
      const res = await fetch(rssUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SentiWatchBot/1.0)" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return; // Company not on Trustpilot or different domain
      const xml = await res.text();
      if (xml.includes("Just a moment") || xml.includes("captcha") || xml.length < 200) return;
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0, 20)) {
        try {
          const title = xmlDecode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "");
          const desc  = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "");
          const link  = xmlDecode((item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim());
          const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
          const author = xmlDecode(item.match(/<author>([\s\S]*?)<\/author>/)?.[1] ||
                                    item.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/)?.[1] || "Trustpilot User");
          if (!link || !desc) continue;
          const content = clean([title, desc].filter(Boolean).join(". "));
          if (content.length < 20) continue;
          let posted_at: string | null = null;
          try { if (pubRaw) posted_at = new Date(pubRaw).toISOString(); } catch {}
          results.push({
            source: "trustpilot",
            content: content.slice(0, 600),
            title,
            url: link,
            author_name: author,
            posted_at,
            date_verified: !!posted_at,
          });
        } catch { /* skip malformed item */ }
      }
      if (items.length > 0) console.log(`[trustpilot] ${domain}: ${items.length} reviews`);
    } catch (e: any) { console.warn(`[trustpilot] ${domain} failed:`, e.message); }
  }));
  return results;
}

// ── iTunes/App Store reviews (free, official API) ─────────────────────────
// Uses iTunes Search API to find apps by keyword, then fetches their RSS review feed
async function crawlAppStoreReviews(keywords: string[]): Promise<any[]> {
  const results: any[] = [];
  try {
    // Search for matching apps
    const query = keywords.slice(0, 2).join(" ");
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=software&limit=5&country=us`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
    if (!searchRes.ok) return results;
    const searchData = await searchRes.json();
    const apps = (searchData.results || []).slice(0, 3); // top 3 matching apps
    if (apps.length === 0) return results;

    await Promise.allSettled(apps.map(async (app: any) => {
      try {
        // RSS feed for App Store reviews (page 1, 10 reviews)
        const rssUrl = `https://itunes.apple.com/rss/customerreviews/page=1/id=${app.trackId}/sortby=mostrecent/json?l=en&cc=us`;
        const rssRes = await fetch(rssUrl, { signal: AbortSignal.timeout(8000) });
        if (!rssRes.ok) return;
        const rssData = await rssRes.json();
        const entries = rssData.feed?.entry || [];
        // First entry is the app info, rest are reviews
        for (const entry of entries.slice(1, 11)) {
          const reviewText = entry.content?.label || entry["im:summary"]?.label || "";
          const title = entry.title?.label || "";
          const rating = entry["im:rating"]?.label;
          const author = entry.author?.name?.label || "App Store User";
          const updated = entry.updated?.label || null;
          if (!reviewText || reviewText.length < 15) continue;
          const content = clean(`${title}. ${reviewText}`.trim()).slice(0, 600);
          results.push({
            source: "apple-app-store",
            content,
            title: `${title} — ${app.trackName}`,
            url: app.trackViewUrl || `https://apps.apple.com/app/id${app.trackId}`,
            author_name: author,
            posted_at: updated ? new Date(updated).toISOString() : null,
            date_verified: !!updated,
            metrics: { rating: rating ? parseInt(rating) : null },
          });
        }
      } catch (e: any) { console.warn(`[appstore] ${app.trackId} failed:`, e.message); }
    }));
    console.log(`[app-store] ${results.length} reviews for "${query}"`);
  } catch (e: any) { console.warn("[app-store] failed:", e.message); }
  return results;
}

// ── Authenticated Reddit (uses OAuth if client_id/secret configured) ──────
async function crawlRedditAuth(keywords: string[], clientId: string, clientSecret: string, dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  try {
    // Get OAuth token
    const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "SentiWatch/2.0 (reputation monitor)",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenRes.ok) {
      console.warn("[reddit-auth] token fetch failed, falling back to public");
      return crawlReddit(keywords, dateFrom);
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) return crawlReddit(keywords, dateFrom);

    const dateMs = dateFrom ? new Date(dateFrom).getTime() : 0;
    await Promise.allSettled(keywords.slice(0, 5).map(async (kw) => { // all keywords, not just 2
      try {
        const params = new URLSearchParams({ q: kw, sort: "new", limit: "25", t: "month" });
        const res = await fetch(`https://oauth.reddit.com/search?${params}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "SentiWatch/2.0 (reputation monitor)",
          },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) return;
        const data = await res.json();
        for (const child of (data.data?.children || [])) {
          const p = child.data;
          if (dateMs && p.created_utc * 1000 < dateMs) continue;
          const content = clean((p.selftext || p.title || "").slice(0, 600));
          if (content.length < 20) continue;
          results.push({
            source: "reddit", content, title: p.title || kw,
            url: `https://reddit.com${p.permalink}`,
            author_name: p.author || "reddit",
            posted_at: new Date(p.created_utc * 1000).toISOString(),
            date_verified: true,
            metrics: { likes: p.ups || 0, comments: p.num_comments || 0 },
          });
        }
      } catch (e: any) { console.warn(`[reddit-auth] kw "${kw}" failed:`, e.message); }
    }));
    console.log(`[reddit-auth] ${results.length} results`);
  } catch (e: any) {
    console.warn("[reddit-auth] failed, falling back to public:", e.message);
    return crawlReddit(keywords, dateFrom);
  }
  return results;
}

// AI ANALYSIS — calls Gemini directly, falls back to keyword sentiment
// ══════════════════════════════════════════════════════════════════════════

async function analyzeWithAI(
  items: { source: string; url: string; title: string; content: string; has_transcript?: boolean }[],
  brandName: string,
  lovableKey: string,
  geminiApiKey?: string,
): Promise<any[]> {
  const activeKey = geminiApiKey || lovableKey;
  if (!activeKey) {
    console.log("[ai] No AI key configured — using keyword sentiment");
    return [];
  }

  const analyses: any[] = [];
  const BATCH = 15; // smaller batches = more reliable

  async function callGemini(messages: { role: string; content: string }[]): Promise<string> {
    const prompt = messages.map(m => `${m.role === "system" ? "Instructions" : "User"}: ${m.content}`).join("\n\n");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${activeKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
    const d = await res.json();
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) throw new Error("Empty Gemini response");
    return text;
  }

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    let batchOk = false;

    try {
      const resText = await callGemini([
        {
          role: "system",
          content: `You analyze brand mentions for "${brandName}". For each mention return JSON with:
- relevant: boolean — true if this mention genuinely discusses "${brandName}" as a brand, product, or company. Mark FALSE only for: HTTP error pages (403/404/500 in the content), login walls, cookie notices, Wikipedia/reference descriptions, empty content. Do NOT mark false just because a video is a tutorial or educational — tutorials that mention the brand are relevant.
- sentiment_label: "positive"|"negative"|"neutral"|"mixed" — base this on actual tone/opinion expressed, not just the topic. A tutorial showing how to use ${brandName} is neutral or positive, not negative.
- sentiment_score: number from -1.0 to 1.0
- severity: "low"|"medium"|"high"|"critical" — severity is about reputational risk. A tutorial video = low. Criticism or complaints = medium/high. Fraud allegations or coordinated attacks = critical.
- summary: 2-3 sentences of what is ACTUALLY being said. For YouTube videos: state what the video covers and how ${brandName} is mentioned or portrayed. If you have a GEMINI VIDEO ANALYSIS or TRANSCRIPT section, summarise the specific claims or content about ${brandName}. NEVER say "the content is an error page" for a YouTube video — if the content field starts with TITLE: and has TRANSCRIPT: or GEMINI VIDEO ANALYSIS: it is real video content.
- flags: {misinformation:bool, viral_potential:bool}

IMPORTANT for YouTube videos (source="youtube"):
- Content may include a TRANSCRIPT: or GEMINI VIDEO ANALYSIS: section — this is actual spoken content. Use it.
- If neither is present, use the title and description to infer the context.
- Never interpret a missing transcript as an error page.
- A YouTube tutorial about how to use ${brandName} is relevant=true, sentiment neutral/positive, severity low.
Return ONLY valid JSON: {"analyses":[...]}`,
        },
        {
          role: "user",
          content: `Analyze ${batch.length} mentions for "${brandName}":\n${JSON.stringify(
            batch.map((r, idx) => ({
              idx,
              source: r.source,
              title: r.title,
              content: (r.source === "youtube" && r.has_transcript)
                ? r.content.slice(0, 2500)
                : r.content.slice(0, 400),
            }))
          )}`,
        },
      ]);
      let raw = resText || "{}";
      // Strip markdown code fences if present
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      try {
        const parsed = JSON.parse(raw);
        const batchAnalyses: any[] = parsed.analyses || (Array.isArray(parsed) ? parsed : []);
        for (let j = 0; j < batch.length; j++) {
          const a = batchAnalyses[j];
          if (a && typeof a.sentiment_label === "string") {
            analyses.push(a);
          } else {
            const kw = kwSentiment(batch[j].content + " " + batch[j].title);
            analyses.push({
              relevant: true, ...kw,
              summary: batch[j].title || batch[j].content.slice(0, 150),
              flags: {},
            });
          }
        }
        batchOk = true;
      } catch {
        console.warn(`[ai] JSON parse failed for batch ${i}–${i + BATCH}`);
      }
    } catch (e: any) {
      console.warn(`[ai] fetch error for batch ${i}–${i + BATCH}:`, e.message);
    }

    if (!batchOk) {
      // Full keyword fallback for this batch
      for (const r of batch) {
        const kw = kwSentiment(r.content + " " + r.title);
        let fallbackSummary = r.title || r.content.slice(0, 150);
        if (r.source === "youtube" && r.has_transcript) {
          const transcriptMatch = r.content.match(/(?:TRANSCRIPT|GEMINI VIDEO ANALYSIS):\s*(.+?)(?:[.!?]|$)/i);
          if (transcriptMatch) {
            fallbackSummary = `${r.title} — ${transcriptMatch[1].trim().slice(0, 200)}`;
          }
        }
        analyses.push({
          relevant: true, ...kw,
          summary: fallbackSummary,
          flags: {},
        });
      }
    }
  }

  return analyses;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Read body early so we can reference org_id in error cleanup
  let bodyText = "";
  try { bodyText = await req.text(); } catch { /* empty body */ }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const geminiKey = Deno.env.get("GOOGLE_API_KEY") || "";
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";
  const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY") || "";
  const newsApiKey = Deno.env.get("NEWSAPI_KEY") || "";

  // Service-role client — bypasses RLS (safe because we do auth ourselves)
  const sb = createClient(supabaseUrl, serviceKey);

  let parsedOrg: string | null = null;

  try {
    // ── 1. Parse body ──────────────────────────────────────────────────────
    let body: any = {};
    try { body = JSON.parse(bodyText || "{}"); } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { org_id, keywords: rawKws, sources, date_from, date_to, sentiment_filter } = body;
    if (!org_id) return json({ error: "org_id is required" }, 400);
    parsedOrg = org_id;

    // ── 2. Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const isService = token === serviceKey;
    let userId: string | null = null;

    if (!isService) {
      // Verify user JWT
      const anonSb = createClient(supabaseUrl, anonKey);
      const { data: { user }, error: authErr } = await anonSb.auth.getUser(token);
      if (authErr || !user) return json({ error: "Unauthorized" }, 401);
      userId = user.id;

      // Check org membership — use service client to bypass RLS
      // Accept both accepted members AND pending invites / direct owners
      const { data: membership } = await sb
        .from("org_memberships")
        .select("id, role")
        .eq("user_id", userId)
        .eq("org_id", org_id)
        .maybeSingle();

      if (!membership) {
        // Fallback: check if user is listed as org creator via organizations table
        const { data: org } = await sb
          .from("organizations")
          .select("id")
          .eq("id", org_id)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        // If org exists but no membership record, allow it (Lovable may not create membership for creator)
        console.warn(`[auth] No membership record for user ${userId} in org ${org_id} — allowing (may be org creator)`);
      }
    }

    // ── 3. Load org + keywords + noise rules + API keys ───────────────────
    const [orgRes, kwRes, ignoredRes, profileRes, apiKeysRes] = await Promise.all([
      sb.from("organizations").select("name,domain,plan").eq("id", org_id).maybeSingle(),
      sb.from("keywords").select("value,type").eq("org_id", org_id).eq("status", "active"),
      sb.from("ignored_sources").select("domain").eq("org_id", org_id),
      sb.from("tracking_profiles").select("settings").eq("org_id", org_id).maybeSingle(),
      sb.from("org_api_keys").select("provider,key_name,key_value").eq("org_id", org_id),
    ]);

    const orgName = orgRes.data?.name || "";
    const orgDomain = (orgRes.data?.domain || "").toLowerCase();
    const ignoredDomains = new Set((ignoredRes.data || []).map((r: any) => r.domain?.toLowerCase() || ""));

    // Extract org API keys
    const apiKeys = apiKeysRes.data || [];
    const getApiKey = (provider: string, keyName: string) =>
      apiKeys.find((k: any) => k.provider === provider && k.key_name === keyName)?.key_value || null;
    const twitterBearerToken = getApiKey("twitter", "bearer_token");
    const youtubeApiKey = getApiKey("youtube", "api_key") || Deno.env.get("YOUTUBE_API_KEY") || null;
    const redditClientId = getApiKey("reddit", "client_id");
    const redditClientSecret = getApiKey("reddit", "client_secret");

    // Load noise filter rules from tracking_profiles.settings
    const noiseRules: Array<{ type: string; value: string; field?: string }> =
      (profileRes.data?.settings as any)?.noise_rules || [];
    const noiseBlockedDomains = new Set(
      noiseRules.filter(r => r.type === "domain").map(r => r.value.toLowerCase())
    );
    const noiseBlockedKeywords = noiseRules
      .filter(r => r.type === "keyword")
      .map(r => r.value.toLowerCase());
    const noiseBlockedAuthors = new Set(
      noiseRules.filter(r => r.type === "author").map(r => r.value.toLowerCase())
    );
    console.log(`[noise] ${noiseRules.length} rules: ${noiseBlockedDomains.size} domains, ${noiseBlockedKeywords.length} keywords, ${noiseBlockedAuthors.size} authors`);

    // Separate competitor keywords from brand/risk/product keywords
    // Competitor scans are always separate — they don't belong in brand health metrics
    const allDbKeywords = kwRes.data || [];
    const competitorKeywords = allDbKeywords
      .filter((k: any) => k.type === "competitor")
      .map((k: any) => k.value as string);
    const brandDbKeywords = allDbKeywords
      .filter((k: any) => k.type !== "competitor")
      .map((k: any) => k.value as string);

    // Determine scan mode:
    // - If rawKws passed AND scan_context="competitor": this is a targeted competitor scan
    // - Otherwise: brand scan using only brand/risk/product keywords (never competitor keywords)
    const isCompetitorScan = body.scan_context === "competitor";
    let keywords: string[];
    let scanMentionType: "brand" | "competitor";
    let scanCompetitorName: string | null = null;

    if (isCompetitorScan && rawKws?.length) {
      // Targeted competitor scan — use passed keywords
      keywords = (rawKws as string[]).filter(Boolean).slice(0, 5);
      scanMentionType = "competitor";
      scanCompetitorName = keywords[0] || null;
    } else {
      // Brand scan — exclude competitor keywords entirely
      const brandKeywords = rawKws?.length
        ? (rawKws as string[]).filter((kw: string) => !competitorKeywords.includes(kw))
        : brandDbKeywords;
      keywords = brandKeywords.filter(Boolean).slice(0, 10);
      scanMentionType = "brand";
    }

    if (keywords.length === 0) {
      return json({
        scan_run_id: null,
        mentions_created: 0,
        total_found: 0,
        zero_results_reason: isCompetitorScan
          ? "No competitor keywords provided."
          : "No brand keywords configured. Add keywords in Settings → Keywords (exclude competitor keywords — those are scanned separately).",
        scan_log: [],
        keyword_groups: { brand: brandDbKeywords.slice(0, 5), risk: [], product: [], competitor: competitorKeywords.slice(0, 5) },
        errors: ["No active keywords found for this scan type."],
      });
    }

    const brandName = orgName || keywords[0];

    // ── 4. Create scan_run record ──────────────────────────────────────────
    const { data: scanRun, error: runErr } = await sb
      .from("scan_runs")
      .insert({
        org_id,
        status: "running",
        started_at: new Date().toISOString(),
        config_snapshot: { keywords, sources: sources || [], date_from, date_to },
      })
      .select()
      .single();

    if (runErr || !scanRun) {
      console.error("scan_runs insert failed:", runErr?.message);
      return json({ error: `Failed to create scan record: ${runErr?.message}` }, 500);
    }

    console.log(`Scan ${scanRun.id} started for "${brandName}" | keywords: ${keywords.join(", ")} | sources: ${(sources || []).join(", ") || "auto"}`);

    // Determine which sources to actually run
    // sources array from request gates optional crawlers; free crawlers always run
    const requestedSources: string[] = sources || [];
    const wantSource = (s: string) => requestedSources.length === 0 || requestedSources.includes(s);

    // ── 5. Run all crawlers in parallel ────────────────────────────────────
    const allRaw: any[] = [];
    const scanLog: { source: string; found: number; error?: string }[] = [];

    const crawlPromises: Promise<void>[] = [];

    // ── Free sources (always run unless specific sources requested) ─────────
    crawlPromises.push((async () => {
      const r = await crawlGoogleNews(keywords, date_from);
      allRaw.push(...r);
      scanLog.push({ source: "google-news-rss", found: r.length });
    })());

    crawlPromises.push((async () => {
      const r = await crawlBingNews(keywords);
      allRaw.push(...r);
      scanLog.push({ source: "bing-news-rss", found: r.length });
    })());

    crawlPromises.push((async () => {
      const r = await crawlDirectRSS(keywords);
      allRaw.push(...r);
      scanLog.push({ source: "direct-rss", found: r.length });
    })());

    crawlPromises.push((async () => {
      const r = await crawlHackerNews(keywords, date_from);
      allRaw.push(...r);
      scanLog.push({ source: "hackernews", found: r.length });
    })());

    // Reddit: public API (always), upgraded to authenticated if keys present
    if (redditClientId && redditClientSecret && wantSource("reddit")) {
      crawlPromises.push((async () => {
        const r = await crawlRedditAuth(keywords, redditClientId, redditClientSecret, date_from);
        allRaw.push(...r);
        scanLog.push({ source: "reddit-auth", found: r.length });
      })());
    } else {
      crawlPromises.push((async () => {
        const r = await crawlReddit(keywords, date_from);
        allRaw.push(...r);
        scanLog.push({ source: "reddit-public", found: r.length });
      })());
    }

    // Twitter/X — only if bearer token configured and source requested
    if (twitterBearerToken && wantSource("twitter")) {
      crawlPromises.push((async () => {
        const r = await crawlTwitter(keywords, twitterBearerToken, date_from, date_to);
        allRaw.push(...r);
        scanLog.push({ source: "twitter", found: r.length });
      })());
    } else if (wantSource("twitter") && !twitterBearerToken) {
      scanLog.push({ source: "twitter", found: 0, error: "Twitter Bearer Token not configured in Settings → Connections" });
    }

    // YouTube — only if API key configured and source requested
    if (youtubeApiKey && wantSource("youtube")) {
      crawlPromises.push((async () => {
        const r = await crawlYouTube(keywords, youtubeApiKey, date_from, date_to, geminiKey || undefined, brandName);
        allRaw.push(...r);
        scanLog.push({ source: "youtube", found: r.length });
      })());
    } else if (wantSource("youtube") && !youtubeApiKey) {
      scanLog.push({ source: "youtube", found: 0, error: "YouTube API Key not configured in Settings → Connections" });
    }

    // Trustpilot RSS — free, no key required, always run when reviews requested
    if (wantSource("reviews")) {
      crawlPromises.push((async () => {
        const r = await crawlTrustpilotRSS(keywords, orgDomain);
        allRaw.push(...r);
        scanLog.push({ source: "trustpilot", found: r.length });
      })());
    }

    // App Store reviews — iTunes Search API, free, no key
    if (wantSource("reviews") || wantSource("app-store")) {
      crawlPromises.push((async () => {
        const r = await crawlAppStoreReviews(keywords);
        allRaw.push(...r);
        scanLog.push({ source: "app-store", found: r.length });
      })());
    }

    // Paid sources (only if keys configured)
    if (braveKey) {
      crawlPromises.push((async () => {
        const r = await crawlBrave(keywords, 25, braveKey, date_from);
        allRaw.push(...r);
        scanLog.push({ source: "brave-search", found: r.length });
      })());
    }

    if (newsApiKey) {
      crawlPromises.push((async () => {
        const r = await crawlNewsAPI(keywords, 25, newsApiKey, date_from);
        allRaw.push(...r);
        scanLog.push({ source: "newsapi", found: r.length });
      })());
    }

    if (firecrawlKey) {
      crawlPromises.push((async () => {
        const r = await crawlFirecrawl(keywords, 20, firecrawlKey);
        allRaw.push(...r);
        scanLog.push({ source: "firecrawl", found: r.length });
      })());
    }

    await Promise.allSettled(crawlPromises);

    console.log(`Crawl complete: ${allRaw.length} raw results from ${scanLog.length} sources`);
    scanLog.forEach(s => console.log(`  ${s.source}: ${s.found}`));

    // ── 6. Filter & deduplicate ────────────────────────────────────────────
    const dateFromMs = date_from ? new Date(date_from).getTime() : 0;
    const dateToMs = date_to ? new Date(date_to).getTime() : 0;

    const filtered = dedup(allRaw).filter(r => {
      if (!r.content || r.content.length < 25) return false;
      if (!r.url) return false;
      if (blocked(r.url)) return false;
      if (isJunk(r.content)) return false;
      try {
        const host = new URL(r.url).hostname.replace("www.", "").toLowerCase();
        // Block self-published content
        if (orgDomain && host === orgDomain) return false;
        if (ignoredDomains.has(host)) return false;
        // Apply noise filter domain rules
        if (noiseBlockedDomains.has(host)) return false;
      } catch { return false; }
      // Apply noise filter keyword rules (block if content matches any blocked keyword)
      if (noiseBlockedKeywords.length > 0) {
        const lc = (r.content + " " + (r.title || "")).toLowerCase();
        if (noiseBlockedKeywords.some(kw => lc.includes(kw))) return false;
      }
      // Apply noise filter author rules
      if (noiseBlockedAuthors.size > 0 && r.author_name) {
        if (noiseBlockedAuthors.has(r.author_name.toLowerCase())) return false;
      }
      if (dateFromMs && r.posted_at) {
        if (new Date(r.posted_at).getTime() < dateFromMs) return false;
      }
      if (dateToMs && r.posted_at) {
        if (new Date(r.posted_at).getTime() > dateToMs) return false;
      }
      return true;
    });

    console.log(`After filter: ${filtered.length} (removed ${allRaw.length - filtered.length})`);

    if (filtered.length === 0) {
      await sb.from("scan_runs").update({
        status: "completed", finished_at: new Date().toISOString(),
        total_mentions: 0, negative_pct: 0, emergencies_count: 0,
      }).eq("id", scanRun.id);

      const rawCount = allRaw.length;
      const zeroReason = rawCount === 0
        ? `No results from any source. Keywords tried: "${keywords.join('", "')}". Make sure your keywords exactly match how your brand appears in news and social media.`
        : `${rawCount} results found but all filtered out (already in database, date out of range, blocked domains, or error pages). Try widening your date range.`;

      return json({
        scan_run_id: scanRun.id,
        mentions_created: 0, total_found: rawCount,
        zero_results_reason: zeroReason, scan_log: scanLog,
        keyword_groups: { brand: keywords.slice(0, 5), risk: [], product: [] },
        errors: [],
      });
    }

    // ── 7. Dedup against existing DB mentions ─────────────────────────────
    // Store normalized URLs for accurate cross-run dedup
    const candidateUrls = filtered
      .map(r => r.url ? normalizeUrl(r.url) : null)
      .filter(Boolean) as string[];
    // Also include the raw URLs so we can match against what's already in DB
    const candidateRawUrls = filtered.map(r => r.url?.toLowerCase().replace(/\/$/, "")).filter(Boolean) as string[];

    const existingUrls = new Set<string>();
    const allBatch = [...new Set([...candidateUrls, ...candidateRawUrls])];
    for (let i = 0; i < allBatch.length; i += 50) {
      const batch = allBatch.slice(i, i + 50);
      if (batch.length === 0) continue;
      const { data: ex } = await sb
        .from("mentions")
        .select("url")
        .eq("org_id", org_id)
        .in("url", batch);
      for (const m of (ex || [])) {
        if (m.url) {
          existingUrls.add(m.url.toLowerCase().replace(/\/$/, ""));
          existingUrls.add(normalizeUrl(m.url));
        }
      }
    }

    const newItems = filtered.filter(r => {
      if (!r.url) return true;
      return !existingUrls.has(r.url.toLowerCase().replace(/\/$/, ""))
          && !existingUrls.has(normalizeUrl(r.url));
    });
    const dedupSkipped = filtered.length - newItems.length;
    console.log(`New items: ${newItems.length} (${dedupSkipped} already in DB)`);

    if (newItems.length === 0) {
      await sb.from("scan_runs").update({
        status: "completed", finished_at: new Date().toISOString(),
        total_mentions: 0, negative_pct: 0, emergencies_count: 0,
      }).eq("id", scanRun.id);

      return json({
        scan_run_id: scanRun.id,
        mentions_created: 0, total_found: allRaw.length,
        zero_results_reason: `Scan complete — all ${filtered.length} results already exist in your database. No new mentions since last scan.`,
        scan_log: scanLog,
        keyword_groups: { brand: keywords.slice(0, 5), risk: [], product: [] },
        errors: [],
      });
    }

    // ── 8. AI analysis (with full keyword fallback) ────────────────────────
    const aiInput = newItems.map(r => ({
      source: r.source, url: r.url, title: r.title || "", content: r.content,
    }));

    let analyses = await analyzeWithAI(aiInput, brandName, lovableKey, geminiKey || undefined);

    // If AI returned nothing (no key or all batches failed), use keyword fallback
    if (analyses.length === 0) {
      console.log("[ai] Using full keyword-sentiment fallback");
      analyses = newItems.map(r => {
        const lang = detectLanguage(r.content);
        const kw = lang === "en" ? kwSentiment(r.content + " " + (r.title || "")) : { sentiment_label: "neutral", sentiment_score: 0, severity: "low" };
        return {
          relevant: true, ...kw,
          summary: r.title || r.content.slice(0, 180),
          flags: {},
          language: lang,
        };
      });
    }

    // ── 8b. Filter irrelevant items (AI explicitly said not relevant) ──────
    // Only filter when AI is actually running — keyword fallback marks everything relevant
    const relevantPairs: Array<{ raw: any; analysis: any }> = [];
    for (let i = 0; i < newItems.length; i++) {
      const a = analyses[i] || {};
      // Only discard if AI explicitly said false (not just missing/undefined)
      if (a.relevant === false) {
        console.log(`[ai] Filtered irrelevant: "${(newItems[i].title || newItems[i].content).slice(0, 80)}"`);
        continue;
      }
      relevantPairs.push({ raw: newItems[i], analysis: a });
    }
    console.log(`After relevance filter: ${relevantPairs.length}/${newItems.length} items kept`);

    // ── 9. Build mention rows ──────────────────────────────────────────────
    let mentionRows = relevantPairs.map(({ raw: r, analysis: a }) => {
      const lang = a.language || r.language || detectLanguage(r.content);
      // Only use kwSentiment for English — non-English gets neutral fallback from keyword matching
      const kw = lang === "en" ? kwSentiment(r.content + " " + (r.title || "")) : { sentiment_label: "neutral", sentiment_score: 0, severity: "low" };

      // Use AI result if valid, otherwise keyword fallback
      const sentiment_label: string = a.sentiment_label || kw.sentiment_label;
      const sentiment_score: number = typeof a.sentiment_score === "number"
        ? a.sentiment_score : kw.sentiment_score;
      const severity: string = a.severity || kw.severity;
      const summary: string = a.summary || r.title || r.content.slice(0, 200);

      return {
        org_id,
        scan_run_id: scanRun.id,
        source: r.source || "news",
        content: summary,
        author_name: r.author_name || null,
        author_handle: null as string | null,
        author_verified: false,
        author_follower_count: 0,
        sentiment_label,
        sentiment_score,
        sentiment_confidence: a.sentiment_confidence != null
          ? Math.min(Math.round(a.sentiment_confidence * 100), 999.99)
          : 65,
        severity,
        language: lang || "en",
        posted_at: r.posted_at || null,
        url: r.url ? normalizeUrl(r.url) || r.url : null,
        metrics: r.metrics || {},
        flags: { ...(a.flags || {}), date_verified: r.date_verified || false, has_transcript: r.has_transcript || false },
        status: "new",
        owner_user_id: userId, // null for scheduled/system scans — this is valid (nullable UUID)
        mention_type: scanMentionType,
        competitor_name: scanCompetitorName,
      };
    });

    // Apply sentiment filter if requested
    if (sentiment_filter && sentiment_filter !== "all") {
      mentionRows = mentionRows.filter(m => {
        if (sentiment_filter === "negative") return m.sentiment_label === "negative" || m.sentiment_label === "mixed";
        if (sentiment_filter === "positive") return m.sentiment_label === "positive";
        return true;
      });
    }

    if (mentionRows.length === 0) {
      await sb.from("scan_runs").update({
        status: "completed", finished_at: new Date().toISOString(),
        total_mentions: 0, negative_pct: 0, emergencies_count: 0,
      }).eq("id", scanRun.id);
      return json({
        scan_run_id: scanRun.id,
        mentions_created: 0, total_found: allRaw.length,
        zero_results_reason: "All mentions were filtered by the sentiment filter.",
        scan_log: scanLog,
        keyword_groups: { brand: keywords.slice(0, 5), risk: [], product: [] },
        errors: [],
      });
    }

    // ── 10. Insert mentions (batched, fail-safe) ───────────────────────────
    const allInserted: { id: string }[] = [];
    const insertErrors: string[] = [];
    const INSERT_BATCH = 50;

    for (let i = 0; i < mentionRows.length; i += INSERT_BATCH) {
      const batch = mentionRows.slice(i, i + INSERT_BATCH);
      const { data: bInserted, error: insErr } = await sb
        .from("mentions")
        .insert(batch)
        .select("id");
      if (insErr) {
        console.error(`Insert batch ${i}–${i + INSERT_BATCH} failed:`, insErr.message);
        insertErrors.push(insErr.message);
      } else if (bInserted) {
        allInserted.push(...bInserted);
      }
    }

    const inserted = allInserted;

    // ── 11a. Entity → mention linking (async, non-blocking) ────────────────
    // For each inserted mention, check if source/author_name matches a tracked entity.
    // If so, update the mention's entity_id field (best-effort, won't block response).
    if (inserted.length > 0) {
      (async () => {
        try {
          const { data: entities } = await sb
            .from("entity_records")
            .select("id, handle, display_name, url")
            .eq("org_id", parsedOrg)
            .not("status", "eq", "archived")
            .limit(100);

          if (!entities || entities.length === 0) return;

          // Build lookup map: lowercase term → entity_id
          const entityLookup: Map<string, string> = new Map();
          for (const e of entities) {
            if (e.handle) entityLookup.set(e.handle.toLowerCase().replace(/^@/, ""), e.id);
            if (e.display_name) entityLookup.set(e.display_name.toLowerCase(), e.id);
          }

          const updates: { id: string; entity_id: string }[] = [];
          for (const mention of inserted) {
            const src = (mention.source || "").toLowerCase();
            const author = (mention.author_name || "").toLowerCase();
            for (const [term, entityId] of entityLookup) {
              if (term.length > 2 && (src.includes(term) || author.includes(term))) {
                updates.push({ id: mention.id, entity_id: entityId });
                break; // first match wins
              }
            }
          }

          if (updates.length > 0) {
            // Batch update — 50 at a time
            for (let i = 0; i < updates.length; i += 50) {
              const batch = updates.slice(i, i + 50);
              await Promise.all(
                batch.map(u => sb.from("mentions").update({ entity_id: u.entity_id } as any).eq("id", u.id))
              );
            }
            console.log(`[entity-link] Linked ${updates.length} mentions to tracked entities`);
          }
        } catch (e: any) {
          console.warn("[entity-link] non-fatal:", e.message);
        }
      })();
    }

    // ── 11. Update scan_run stats ──────────────────────────────────────────
    const negCount = mentionRows.filter(m =>
      m.sentiment_label === "negative" || m.sentiment_label === "mixed"
    ).length;
    const critCount = mentionRows.filter(m =>
      m.severity === "critical" || m.severity === "high"
    ).length;
    const negPct = mentionRows.length > 0 ? Math.round((negCount / mentionRows.length) * 100) : 0;

    await sb.from("scan_runs").update({
      status: insertErrors.length > 0 && inserted.length === 0 ? "failed" : "completed",
      finished_at: new Date().toISOString(),
      total_mentions: inserted.length,
      negative_pct: negPct,
      emergencies_count: critCount,
    }).eq("id", scanRun.id);

    // Save diagnostic snapshot (best-effort — may fail if column doesn't exist)
    sb.from("scan_runs").update({
      result_snapshot: {
        scan_log: scanLog,
        total_raw: allRaw.length,
        filtered_to: filtered.length,
        dedup_skipped: dedupSkipped,
        mentions_saved: inserted.length,
        negative_pct: negPct,
        sources_used: [...new Set(scanLog.map(s => s.source))],
        ai_used: geminiKey ? "gemini-direct" : lovableKey ? "lovable-gateway" : "keyword-only",
        errors: insertErrors,
      },
    } as any).eq("id", scanRun.id).then(() => {}).catch(() => {});

    // ── 12. Narrative clustering (async, non-blocking) ─────────────────────
    if ((lovableKey || geminiKey) && inserted.length > 0) {
      (async () => {
        try {
          const mentionIds = inserted.map((m: any) => m.id);
          const sample = mentionRows.slice(0, 25).map((m, i) => ({
            i, source: m.source, content: (m.content || "").slice(0, 200),
          }));

          const clusteringKey = geminiKey || lovableKey;
          const clusterPrompt = `${`Cluster mentions into 2-5 narrative themes. Return ONLY valid JSON:\n{"narratives":[{"name":"...","description":"...","status":"active","confidence":0.8,"example_phrases":["..."],"mention_indices":[0,1,2]}]}`}\n\nUser: Cluster ${sample.length} mentions for "${brandName}":\n${JSON.stringify(sample)}`;
          const clusterRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${clusteringKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: AbortSignal.timeout(35000),
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: clusterPrompt }] }],
                generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
              }),
            }
          );
          if (!clusterRes.ok) throw new Error(`Gemini cluster error ${clusterRes.status}`);
          const clusterData = await clusterRes.json();
          const rawN = clusterData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

          const parsed = JSON.parse(rawN);
          for (const c of (parsed.narratives || [])) {
            if (!c.name || !Array.isArray(c.mention_indices) || c.mention_indices.length === 0) continue;
            // Upsert narrative
            const { data: existing } = await sb
              .from("narratives")
              .select("id")
              .eq("org_id", org_id)
              .eq("name", c.name)
              .limit(1);

            let narrativeId: string;
            if (existing && existing.length > 0) {
              narrativeId = existing[0].id;
              await sb.from("narratives").update({
                last_seen: new Date().toISOString(),
                confidence: c.confidence || 0.5,
              }).eq("id", narrativeId);
            } else {
              const { data: newN } = await sb.from("narratives").insert({
                org_id, name: c.name, description: c.description || "",
                status: c.status || "active", confidence: c.confidence || 0.5,
                example_phrases: c.example_phrases || [],
                first_seen: new Date().toISOString(),
                last_seen: new Date().toISOString(),
              }).select("id").single();
              if (!newN) continue;
              narrativeId = newN.id;
            }

            // Link mentions to narrative
            const links = c.mention_indices
              .filter((idx: number) => idx >= 0 && idx < mentionIds.length)
              .map((idx: number) => ({ mention_id: mentionIds[idx], narrative_id: narrativeId }));

            if (links.length > 0) {
              await sb.from("mention_narratives").insert(links).then(() => {}).catch(() => {});
            }
          }
        } catch (e: any) {
          console.warn("[narratives] clustering failed (non-fatal):", e.message);
        }
      })();
    }

    console.log(`Scan ${scanRun.id} complete: ${inserted.length} mentions saved, ${negPct}% negative, ${critCount} high/critical`);

    // ── 13a. Fire-and-forget detect-narratives for a thorough narrative pass ─
    // (run-scan already does inline clustering above, but detect-narratives
    //  does a deeper analysis pass — run async so it doesn't block the response)
    if (inserted.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${supabaseUrl}/functions/v1/detect-narratives`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ org_id: parsedOrg }),
        signal: AbortSignal.timeout(5000), // don't wait — just kick it off
      }).catch(() => {}); // fully non-blocking
    }

    // ── 13. Return success ─────────────────────────────────────────────────
    return json({
      scan_run_id: scanRun.id,
      mentions_created: inserted.length,
      total_found: allRaw.length,
      filtered_to: filtered.length,
      dedup_skipped: dedupSkipped,
      negative_pct: negPct,
      emergencies: critCount,
      scan_log: scanLog,
      keyword_groups: { brand: keywords.slice(0, 5), risk: [], product: [] },
      ai_used: geminiKey ? "gemini-direct" : lovableKey ? "lovable-gateway" : "keyword-only",
      errors: insertErrors,
    });

  } catch (err: any) {
    console.error("run-scan FATAL:", err.message, err.stack);

    // Mark scan as failed if we created one
    if (parsedOrg) {
      try {
        await sb.from("scan_runs")
          .update({ status: "failed", finished_at: new Date().toISOString() })
          .eq("org_id", parsedOrg)
          .eq("status", "running");
      } catch { /* ignore cleanup errors */ }
    }

    // Always return 200 with error details — Supabase surfaces 5xx as opaque "edge function error"
    // so we return 200 with error field so the frontend can show the real message
    return json({
      error: `Scan failed: ${err.message}`,
      scan_run_id: null,
      mentions_created: 0,
      total_found: 0,
      zero_results_reason: err.message,
      scan_log: [],
      keyword_groups: { brand: [], risk: [], product: [] },
      errors: [err.message],
    });
  }
});
