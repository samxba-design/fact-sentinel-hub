import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ── types ── */
interface RawResult {
  source: string;
  content: string;
  title: string;
  url: string;
  author_name: string;
  posted_at: string | null;
  date_verified: boolean;
  metrics?: { likes?: number; shares?: number; comments?: number };
}

/* ── helpers ── */
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
  if (h.includes("hackernews") || h.includes("news.ycombinator")) return "forum";
  return "news";
}

const BLOCK_DOMAINS = new Set([
  "en.wikipedia.org","wikipedia.org","investopedia.com","apps.apple.com",
  "play.google.com","support.google.com","support.apple.com","docs.google.com",
  "help.coinbase.com","academy.binance.com","howstuffworks.com","about.com",
  "dictionary.com","merriam-webster.com","britannica.com","corporatefinanceinstitute.com",
  "nerdwallet.com","bankrate.com","investing.com","ca.investing.com",
]);

function blocked(url: string): boolean {
  try { return BLOCK_DOMAINS.has(new URL(url).hostname.replace("www.","").toLowerCase()); }
  catch { return false; }
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

function isJunk(text: string): boolean {
  const lower = text.toLowerCase();
  const blockers = ["blocked by an extension","enable javascript","access denied",
    "403 forbidden","captcha","please verify you are a human","cloudflare",
    "just a moment","checking your browser","page not found","404 not found",
    "javascript is required","disable your ad blocker","cookie policy",
    "sign in to youtube","playback doesn't begin","skip navigation"];
  const hits = blockers.filter(b => lower.includes(b)).length;
  if (hits >= 2) return true;
  if (hits >= 1 && text.length < 200) return true;
  return false;
}

function dedup(arr: RawResult[]): RawResult[] {
  const seen = new Set<string>();
  return arr.filter(r => {
    if (!r.url) return true;
    const key = r.url.toLowerCase().replace(/\/$/, "").replace(/^https?:\/\//,"");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ──────────────────────────────────────────────
   CRAWLERS (all inline — no sub-function calls)
   ────────────────────────────────────────────── */

/* 1. Google News RSS — free, no key */
async function crawlGoogleNews(keywords: string[], dateFrom?: string): Promise<RawResult[]> {
  const results: RawResult[] = [];
  // Run one query per keyword to maximise coverage
  const queries = [
    keywords.slice(0,3).join(" OR "),
    keywords[0],
    keywords.length > 1 ? `"${keywords[0]}" review` : null,
    keywords.length > 1 ? `"${keywords[0]}" news` : null,
  ].filter(Boolean) as string[];

  await Promise.allSettled(queries.map(async (q) => {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SentinelBot/2.0)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0,15)) {
        try {
          const title  = xmlDecode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "");
          const link   = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
          const desc   = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "");
          const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
          if (!link || blocked(link)) continue;
          const content = clean([title, desc].filter(Boolean).join(". "));
          if (content.length < 30) continue;
          let posted_at: string | null = null;
          if (pubRaw) { try { posted_at = new Date(pubRaw).toISOString(); } catch {} }
          if (dateFrom && posted_at) {
            if (new Date(posted_at).getTime() < new Date(dateFrom).getTime()) continue;
          }
          results.push({ source: src(link), content, title, url: link,
            author_name: (() => { try { return new URL(link).hostname.replace("www.",""); } catch { return "news"; } })(),
            posted_at, date_verified: !!posted_at });
        } catch {}
      }
    } catch (e: any) { console.warn("[google-rss] failed:", e.message); }
  }));
  return results;
}

/* 2. Bing News RSS — free, no key */
async function crawlBingNews(keywords: string[]): Promise<RawResult[]> {
  const results: RawResult[] = [];
  const query = keywords.slice(0,3).join(" ");
  try {
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SentinelBot/2.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return results;
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const item of items.slice(0,20)) {
      try {
        const title  = xmlDecode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "");
        const link   = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
        const desc   = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "");
        const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
        if (!link || blocked(link)) continue;
        const content = clean([title, desc].filter(Boolean).join(". "));
        if (content.length < 30) continue;
        let posted_at: string | null = null;
        if (pubRaw) { try { posted_at = new Date(pubRaw).toISOString(); } catch {} }
        results.push({ source: src(link), content, title, url: link,
          author_name: (() => { try { return new URL(link).hostname.replace("www.",""); } catch { return "news"; } })(),
          posted_at, date_verified: !!posted_at });
      } catch {}
    }
  } catch (e: any) { console.warn("[bing-rss] failed:", e.message); }
  return results;
}

/* 3. Hacker News — free, Algolia API */
async function crawlHackerNews(keywords: string[], dateFrom?: string): Promise<RawResult[]> {
  const results: RawResult[] = [];
  await Promise.allSettled(keywords.slice(0,3).map(async (kw) => {
    try {
      const params = new URLSearchParams({ query: kw, hitsPerPage: "20", tags: "story,comment" });
      if (dateFrom) params.set("numericFilters", `created_at_i>${Math.floor(new Date(dateFrom).getTime()/1000)}`);
      const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const data = await res.json();
      for (const h of (data.hits || [])) {
        const raw = h.story_text || h.comment_text || h.title || "";
        if (!raw) continue;
        const content = clean(raw.slice(0,600));
        if (content.length < 30) continue;
        results.push({
          source: "forum",
          content,
          title: h.title || kw,
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

/* 4. Reddit public JSON — free, no OAuth */
async function crawlReddit(keywords: string[], dateFrom?: string): Promise<RawResult[]> {
  const results: RawResult[] = [];
  const dateMs = dateFrom ? new Date(dateFrom).getTime() : 0;
  await Promise.allSettled(keywords.slice(0,3).map(async (kw) => {
    try {
      const params = new URLSearchParams({ q: kw, sort: "new", limit: "25", t: "month" });
      const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
        headers: { "User-Agent": "FactSentinel/2.0 (+https://factsentinel.app)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const child of (data.data?.children || [])) {
        const p = child.data;
        if (dateMs && p.created_utc * 1000 < dateMs) continue;
        const raw = p.selftext || p.title || "";
        const content = clean(raw.slice(0,600));
        if (content.length < 20) continue;
        results.push({
          source: "reddit",
          content,
          title: p.title || kw,
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

/* 5. Brave Search — paid, optional */
async function crawlBrave(keywords: string[], limit: number, apiKey: string, dateFrom?: string): Promise<RawResult[]> {
  const results: RawResult[] = [];
  const query = keywords.map(k=>`"${k}"`).slice(0,4).join(" OR ");
  let freshness = "pw";
  if (dateFrom) {
    const d = (Date.now() - new Date(dateFrom).getTime()) / 86400000;
    if (d<=1) freshness="pd"; else if (d<=7) freshness="pw"; else if (d<=30) freshness="pm"; else freshness="py";
  }
  try {
    const params = new URLSearchParams({ q: query, count: String(Math.min(limit,20)), search_lang: "en", safesearch: "off", freshness });
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { "Accept": "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return results;
    const data = await res.json();
    for (const r of [...(data.web?.results||[]),(data.news?.results||[])]) {
      if (!r.url || blocked(r.url)) continue;
      const snippets = [r.title, r.description, ...(r.extra_snippets||[])].filter(Boolean);
      const content = clean(snippets.join(" ").slice(0,800));
      if (content.length < 30) continue;
      const age = r.age?.toLowerCase() || "";
      let posted_at: string | null = null;
      if (age) {
        const n = parseInt(age)||1;
        if (age.includes("hour")) posted_at = new Date(Date.now()-n*3600000).toISOString();
        else if (age.includes("day")) posted_at = new Date(Date.now()-n*86400000).toISOString();
        else if (age.includes("week")) posted_at = new Date(Date.now()-n*7*86400000).toISOString();
        else if (age.includes("month")) posted_at = new Date(Date.now()-n*30*86400000).toISOString();
      }
      results.push({ source: src(r.url), content, title: r.title||"", url: r.url,
        author_name: (() => { try { return new URL(r.url).hostname.replace("www.",""); } catch { return ""; } })(),
        posted_at, date_verified: !!posted_at });
    }
    console.log(`[brave] Got ${results.length} results`);
  } catch (e: any) { console.warn("[brave] failed:", e.message); }
  return results;
}

/* 6. NewsAPI — paid, optional */
async function crawlNewsAPI(keywords: string[], limit: number, apiKey: string, dateFrom?: string): Promise<RawResult[]> {
  const results: RawResult[] = [];
  const query = keywords.slice(0,5).map(k=>`"${k}"`).join(" OR ");
  try {
    const params = new URLSearchParams({ q: query, pageSize: String(Math.min(limit,100)), language: "en", sortBy: "publishedAt" });
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString().split("T")[0]);
    const res = await fetch(`https://newsapi.org/v2/everything?${params}`, {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return results;
    const data = await res.json();
    if (data.status !== "ok") return results;
    for (const a of (data.articles||[])) {
      if (!a.url || !a.title || blocked(a.url)) continue;
      const content = clean([a.title, a.description, a.content?.replace(/\[\+\d+ chars\]/,"")].filter(Boolean).join(" ").slice(0,700));
      if (content.length < 30) continue;
      results.push({ source: src(a.url), content, title: a.title||"", url: a.url,
        author_name: a.source?.name || (() => { try { return new URL(a.url).hostname.replace("www.",""); } catch { return ""; } })(),
        posted_at: a.publishedAt||null, date_verified: !!a.publishedAt });
    }
    console.log(`[newsapi] Got ${results.length} results`);
  } catch (e: any) { console.warn("[newsapi] failed:", e.message); }
  return results;
}

/* 7. Firecrawl — paid, optional */
async function crawlFirecrawl(keywords: string[], limit: number, apiKey: string): Promise<RawResult[]> {
  const results: RawResult[] = [];
  const query = keywords.slice(0,4).map(k=>`"${k}"`).join(" OR ");
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: Math.min(limit,15), scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.status === 402 || res.status === 429 || !res.ok) {
      console.log(`[firecrawl] Error ${res.status}`);
      return results;
    }
    const data = await res.json();
    for (const item of (data.data||data.results||[])) {
      if (!item.url || blocked(item.url)) continue;
      const raw = item.markdown || item.content || item.description || "";
      const content = clean(raw.slice(0,1000));
      if (content.length < 30) continue;
      results.push({ source: src(item.url), content, title: item.title||item.metadata?.title||"", url: item.url,
        author_name: (() => { try { return new URL(item.url).hostname.replace("www.",""); } catch { return ""; } })(),
        posted_at: item.metadata?.publishedTime||null, date_verified: !!item.metadata?.publishedTime });
    }
    console.log(`[firecrawl] Got ${results.length} results`);
  } catch (e: any) { console.warn("[firecrawl] failed:", e.message); }
  return results;
}

/* ────────────────────────────────
   KEYWORD SENTIMENT FALLBACK
   (used when AI is unavailable)
   ──────────────────────────────── */
const POS_WORDS = ["award","growth","launch","partnership","milestone","record","upgrade","trusted",
  "excellent","proud","innovative","leader","success","safe","reliable","invest","positive","profit",
  "expand","improve","strong","winning","hire","funding","certified","best","loved","popular","secure"];
const NEG_WORDS = ["fraud","scam","breach","hack","lawsuit","penalty","fine","suspend","ban","fail",
  "layoff","shutdown","bankrupt","corrupt","mislead","lie","complaint","violated","unsafe","worst",
  "toxic","illegal","investigation","SEC","recall","outage","loss","decline","crash","warning","alert",
  "problem","issue","crisis","scandal","controversy","bad","poor","terrible","awful","horrible"];
const CRIT_WORDS = ["fraud","scam","breach","lawsuit","penalty","SEC","bankrupt","illegal","shutdown","ban"];

function kwSentiment(text: string): { label: string; score: number; severity: string } {
  const lower = text.toLowerCase();
  const posHits = POS_WORDS.filter(w => lower.includes(w)).length;
  const negHits = NEG_WORDS.filter(w => lower.includes(w)).length;
  const critHits = CRIT_WORDS.filter(w => lower.includes(w)).length;
  if (negHits === 0 && posHits === 0) return { label: "neutral", score: 0, severity: "low" };
  if (negHits > posHits) {
    const score = -Math.min(0.9, negHits * 0.2);
    const severity = critHits >= 2 ? "critical" : critHits >= 1 ? "high" : negHits >= 3 ? "medium" : "low";
    return { label: "negative", score, severity };
  }
  if (posHits > negHits) return { label: "positive", score: Math.min(0.9, posHits*0.2), severity: "low" };
  return { label: "mixed", score: 0, severity: negHits >= 2 ? "medium" : "low" };
}

/* ────────────────────────────────
   AI ANALYSIS (with full fallback)
   ──────────────────────────────── */
async function analyzeWithAI(
  items: { source: string; url: string; title: string; content: string }[],
  brandName: string,
  apiKey: string
): Promise<any[]> {
  if (!apiKey || apiKey === "undefined") {
    console.log("[ai] No API key — using keyword fallback for all items");
    return [];
  }

  // Batch into groups of 20 to avoid token limits
  const BATCH = 20;
  const allAnalyses: any[] = [];

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(55000),
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0.1,
          messages: [{
            role: "system",
            content: `You are a reputation intelligence engine monitoring "${brandName}".
Analyze each mention. For each return:
- relevant: true if about "${brandName}" specifically (not just a generic mention)
- sentiment_label: "positive" | "negative" | "neutral" | "mixed"
- sentiment_score: -1.0 to 1.0
- severity: "low" | "medium" | "high" | "critical"
- summary: 2-3 sentence plain English summary of what happened
- flags: { misinformation: bool, viral_potential: bool }
Be INCLUSIVE — include borderline content. Only mark relevant=false for clearly unrelated pages.
Return JSON: { "analyses": [{ "relevant": true, "sentiment_label": "negative", "sentiment_score": -0.7, "severity": "medium", "summary": "...", "flags": {} }] }
Return ONLY valid JSON, no markdown.`,
          }, {
            role: "user",
            content: `Analyze these ${batch.length} mentions for "${brandName}":\n${JSON.stringify(batch.map((r,i)=>({i, source:r.source, url:r.url, title:r.title, content:r.content.slice(0,500)})))}`,
          }],
        }),
      });

      if (!res.ok) {
        console.warn(`[ai] HTTP ${res.status} for batch ${i}—${i+BATCH}`);
        // Fill with keyword fallbacks for this batch
        for (const r of batch) { const k = kwSentiment(r.content + " " + r.title); allAnalyses.push({ relevant: true, ...k, summary: r.content.slice(0,200), flags: {} }); }
        continue;
      }

      const data = await res.json();
      let raw = data.choices?.[0]?.message?.content || "{}";
      raw = raw.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
      try {
        const parsed = JSON.parse(raw);
        const analyses = parsed.analyses || (Array.isArray(parsed) ? parsed : []);
        // Pad with keyword fallbacks if AI returned fewer items than batch
        for (let j = 0; j < batch.length; j++) {
          const a = analyses[j];
          if (a && typeof a === "object") {
            allAnalyses.push(a);
          } else {
            const k = kwSentiment(batch[j].content + " " + batch[j].title);
            allAnalyses.push({ relevant: true, ...k, summary: batch[j].content.slice(0,200), flags: {} });
          }
        }
      } catch {
        console.warn("[ai] JSON parse failed, using keyword fallback for batch");
        for (const r of batch) { const k = kwSentiment(r.content + " " + r.title); allAnalyses.push({ relevant: true, ...k, summary: r.content.slice(0,200), flags: {} }); }
      }
    } catch (e: any) {
      console.warn("[ai] fetch failed:", e.message, "— using keyword fallback for batch");
      for (const r of batch) { const k = kwSentiment(r.content + " " + r.title); allAnalyses.push({ relevant: true, ...k, summary: r.content.slice(0,200), flags: {} }); }
    }
  }

  return allAnalyses;
}

/* ══════════════════════════════════════════
   MAIN HANDLER
   ══════════════════════════════════════════ */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabaseUrl   = Deno.env.get("SUPABASE_URL")!;
  const serviceKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey       = Deno.env.get("SUPABASE_ANON_KEY")!;
  const lovableKey    = Deno.env.get("LOVABLE_API_KEY") || "";
  const firecrawlKey  = Deno.env.get("FIRECRAWL_API_KEY") || "";
  const braveKey      = Deno.env.get("BRAVE_SEARCH_API_KEY") || "";
  const newsApiKey    = Deno.env.get("NEWSAPI_KEY") || "";

  const sb = createClient(supabaseUrl, serviceKey);

  // Capture body text early so the catch block can read org_id for cleanup
  let bodyText = "";
  try { bodyText = await req.text(); } catch {}

  try {
    /* ── Auth ── */
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ","");
    const isService = token === serviceKey;
    let userId: string | null = null; // null = system/scheduled scan (valid UUID null for owner_user_id)
    if (!isService) {
      const anonSb = createClient(supabaseUrl, anonKey);
      const { data: { user }, error } = await anonSb.auth.getUser(token);
      if (error || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
      userId = user.id;
    }

    const body = JSON.parse(bodyText || "{}");
    const { org_id, keywords: rawKws, sources, date_from, date_to, sentiment_filter } = body;
    if (!org_id) return new Response(JSON.stringify({ error: "org_id required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    /* ── Load org + keywords ── */
    const [orgRes, kwRes, memberRes] = await Promise.all([
      sb.from("organizations").select("name,domain").eq("id",org_id).single(),
      sb.from("keywords").select("value,type").eq("org_id",org_id).eq("status","active"),
      isService ? Promise.resolve({ data: true }) : sb.from("org_memberships").select("id").eq("user_id",userId).eq("org_id",org_id).not("accepted_at","is",null).maybeSingle(),
    ]);

    if (!isService && !memberRes.data) return new Response(JSON.stringify({ error: "Not a member" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });

    const orgName   = orgRes.data?.name || "";
    const orgDomain = (orgRes.data?.domain || "").toLowerCase();
    const dbKws     = (kwRes.data || []).map((k:any) => k.value);
    const keywords  = (rawKws?.length ? rawKws : dbKws).filter(Boolean).slice(0,10) as string[];

    if (keywords.length === 0) return new Response(JSON.stringify({ error: "No keywords configured. Add keywords in Settings first." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const brandName = orgName || keywords[0];
    const selectedSources: string[] = sources || ["news","google-news","reddit","social"];

    /* ── Create scan_run ── */
    const { data: scanRun, error: scanErr } = await sb
      .from("scan_runs").insert({ org_id, status: "running", started_at: new Date().toISOString(), config_snapshot: { keywords, sources: selectedSources, date_from, date_to } }).select().single();
    if (scanErr) throw scanErr;

    /* ── Load ignored domains ── */
    const { data: ignoredRows } = await sb.from("ignored_sources").select("domain").eq("org_id",org_id);
    const ignoredDomains = new Set((ignoredRows||[]).map((r:any)=>r.domain.toLowerCase()));

    const scanLog: { source: string; found: number }[] = [];
    const allRaw: RawResult[] = [];

    /* ── Run ALL crawlers in parallel ── */
    console.log(`Starting scan for "${brandName}" with keywords: ${keywords.join(", ")}`);

    const crawlPromises: Promise<void>[] = [];

    // === FREE SOURCES (always run, no keys needed) ===

    // Google News RSS — always run
    crawlPromises.push((async () => {
      const r = await crawlGoogleNews(keywords, date_from);
      console.log(`[google-rss] ${r.length} results`);
      scanLog.push({ source: "google-news-rss", found: r.length });
      allRaw.push(...r);
    })());

    // Bing News RSS — always run
    crawlPromises.push((async () => {
      const r = await crawlBingNews(keywords);
      console.log(`[bing-rss] ${r.length} results`);
      scanLog.push({ source: "bing-news-rss", found: r.length });
      allRaw.push(...r);
    })());

    // HackerNews — always run
    if (selectedSources.some(s => ["forums","web","news","google-news"].includes(s))) {
      crawlPromises.push((async () => {
        const r = await crawlHackerNews(keywords, date_from);
        console.log(`[hackernews] ${r.length} results`);
        scanLog.push({ source: "hackernews", found: r.length });
        allRaw.push(...r);
      })());
    }

    // Reddit public — always run
    if (selectedSources.includes("reddit") || selectedSources.includes("social") || selectedSources.includes("forums")) {
      crawlPromises.push((async () => {
        const r = await crawlReddit(keywords, date_from);
        console.log(`[reddit-public] ${r.length} results`);
        scanLog.push({ source: "reddit-public", found: r.length });
        allRaw.push(...r);
      })());
    }

    // === PAID SOURCES (run if keys are configured) ===

    if (braveKey) {
      crawlPromises.push((async () => {
        const r = await crawlBrave(keywords, 25, braveKey, date_from);
        scanLog.push({ source: "brave-search", found: r.length });
        allRaw.push(...r);
      })());
    }

    if (newsApiKey) {
      crawlPromises.push((async () => {
        const r = await crawlNewsAPI(keywords, 25, newsApiKey, date_from);
        scanLog.push({ source: "newsapi", found: r.length });
        allRaw.push(...r);
      })());
    }

    if (firecrawlKey) {
      crawlPromises.push((async () => {
        const r = await crawlFirecrawl(keywords, 20, firecrawlKey);
        scanLog.push({ source: "firecrawl", found: r.length });
        allRaw.push(...r);
      })());
    }

    await Promise.all(crawlPromises);
    console.log(`Total raw results: ${allRaw.length}`);

    /* ── Filter ── */
    const dateFromMs = date_from ? new Date(date_from).getTime() : 0;
    const dateToMs   = date_to   ? new Date(date_to).getTime()   : 0;
    const SKIP_DOMAINS = new Set(["google.com","news.google.com","bing.com"]);

    const filtered: RawResult[] = dedup(allRaw).filter(r => {
      if (!r.content || r.content.length < 25) return false;
      if (blocked(r.url)) return false;
      if (isJunk(r.content)) return false;
      // Skip news aggregator domains
      try {
        const host = new URL(r.url).hostname.replace("www.","");
        if (SKIP_DOMAINS.has(host)) return false;
        if (orgDomain && host.includes(orgDomain)) return false; // self-published
        if (ignoredDomains.has(host)) return false;
      } catch {}
      // Date filter (only for items with known dates)
      if (dateFromMs && r.posted_at) {
        if (new Date(r.posted_at).getTime() < dateFromMs) return false;
      }
      if (dateToMs && r.posted_at) {
        if (new Date(r.posted_at).getTime() > dateToMs) return false;
      }
      return true;
    });

    console.log(`After filtering: ${filtered.length} results`);

    if (filtered.length === 0) {
      await sb.from("scan_runs").update({
        status: "completed", finished_at: new Date().toISOString(),
        total_mentions: 0, negative_pct: 0, emergencies_count: 0,
      } as any).eq("id", scanRun.id);

      const rawCount = allRaw.length;
      const msg = rawCount === 0
        ? `No results found from any source. Ensure your keywords match how "${brandName}" appears in news (e.g., exact brand name or product name). Sources tried: ${scanLog.map(s=>s.source).join(", ")}.`
        : `${rawCount} results found but all filtered out (duplicates, error pages, out-of-date-range, or self-published content from ${orgDomain}).`;

      return new Response(JSON.stringify({
        scan_run_id: scanRun.id,
        mentions_created: 0,
        total_found: rawCount,
        message: msg,
        zero_results_reason: msg,
        scan_log: scanLog,
        keyword_groups: { brand: keywords.slice(0,5), risk: [], product: [] },
        errors: [],
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    /* ── Dedup against existing DB mentions ── */
    const candidateUrls = filtered.map(r => r.url?.toLowerCase().replace(/\/$/,"")).filter(Boolean);
    const existingUrls = new Set<string>();
    for (let i = 0; i < candidateUrls.length; i += 50) {
      const batch = candidateUrls.slice(i, i+50);
      const { data: ex } = await sb.from("mentions").select("url").eq("org_id",org_id).in("url",batch as string[]);
      for (const m of (ex||[])) { if (m.url) existingUrls.add(m.url.toLowerCase().replace(/\/$/,"")); }
    }
    const newItems = filtered.filter(r => {
      if (!r.url) return true;
      return !existingUrls.has(r.url.toLowerCase().replace(/\/$/,""));
    });
    const dedupSkipped = filtered.length - newItems.length;
    console.log(`New items to analyze: ${newItems.length} (${dedupSkipped} already in DB)`);

    // All items already exist in DB — still a successful scan
    if (newItems.length === 0) {
      await sb.from("scan_runs").update({ status:"completed", finished_at:new Date().toISOString(), total_mentions:0, negative_pct:0, emergencies_count:0 } as any).eq("id",scanRun.id);
      return new Response(JSON.stringify({
        scan_run_id: scanRun.id,
        mentions_created: 0,
        total_found: allRaw.length,
        message: `Scan complete — ${filtered.length} mentions found but all already exist in your database (no new mentions since last scan).`,
        zero_results_reason: `All ${filtered.length} results already exist in database.`,
        scan_log: scanLog,
        keyword_groups: { brand: keywords.slice(0,5), risk: [], product: [] },
      }), { headers: { ...CORS, "Content-Type":"application/json" } });
    }

    /* ── AI Analysis with keyword fallback ── */
    const aiInput = newItems.map(r => ({ source: r.source, url: r.url, title: r.title, content: r.content }));
    let analyses: any[] = [];

    if (lovableKey) {
      analyses = await analyzeWithAI(aiInput, brandName, lovableKey);
    }

    // If AI returned nothing at all, fill with keyword sentiment
    if (analyses.length === 0) {
      console.log("[ai] Falling back to full keyword sentiment");
      analyses = newItems.map(r => {
        const k = kwSentiment(r.content + " " + r.title);
        return { relevant: true, ...k, summary: r.title || r.content.slice(0,200), flags: {} };
      });
    }

    /* ── Build mention rows ── */
    let mentionRows = newItems.map((r, i) => {
      const a = analyses[i] || {};
      const kw = kwSentiment(r.content + " " + r.title); // always have a fallback
      const sentiment_label = a.sentiment_label || kw.label;
      const sentiment_score = typeof a.sentiment_score === "number" ? a.sentiment_score : kw.score;
      const severity        = a.severity || kw.severity;
      const summary         = a.summary || r.title || r.content.slice(0,200);
      return {
        org_id,
        scan_run_id: scanRun.id,
        source: r.source,
        content: summary,
        author_name: r.author_name || null,
        author_handle: null,
        author_verified: false,
        author_follower_count: 0,
        sentiment_label,
        sentiment_score,
        sentiment_confidence: Math.round((a.sentiment_confidence || 0.65) * 100),
        severity,
        language: "en",
        posted_at: r.posted_at || null,
        url: r.url || null,
        metrics: r.metrics || {},
        flags: { ...(a.flags||{}), date_verified: r.date_verified },
        status: "new",
        owner_user_id: userId || null,
      };
    });

    // Apply sentiment filter if requested
    if (sentiment_filter && sentiment_filter !== "all") {
      mentionRows = mentionRows.filter(m =>
        sentiment_filter === "negative" ? (m.sentiment_label==="negative"||m.sentiment_label==="mixed")
        : sentiment_filter === "positive" ? m.sentiment_label==="positive"
        : true
      );
    }

    /* ── Insert mentions ── */
    if (mentionRows.length === 0) {
      await sb.from("scan_runs").update({ status:"completed", finished_at:new Date().toISOString(), total_mentions:0, negative_pct:0, emergencies_count:0 } as any).eq("id",scanRun.id);
      return new Response(JSON.stringify({
        scan_run_id: scanRun.id,
        mentions_created: 0,
        total_found: filtered.length,
        message: "All mentions matched the sentiment filter or were filtered out.",
        zero_results_reason: "All mentions matched the sentiment filter or were filtered out.",
        scan_log: scanLog,
        keyword_groups: { brand: keywords.slice(0,5), risk: [], product: [] },
      }), { headers: { ...CORS, "Content-Type":"application/json" } });
    }

    /* ── Insert mentions (batched to avoid payload limits) ── */
    const INSERT_BATCH = 50;
    const allInserted: { id: string }[] = [];
    for (let i = 0; i < mentionRows.length; i += INSERT_BATCH) {
      const batch = mentionRows.slice(i, i + INSERT_BATCH);
      const { data: batchInserted, error: insErr } = await sb.from("mentions").insert(batch).select("id");
      if (insErr) {
        console.error(`Insert batch ${i}–${i+INSERT_BATCH} error:`, insErr.message);
        // Continue with next batch rather than crashing entire scan
        continue;
      }
      if (batchInserted) allInserted.push(...batchInserted);
    }
    const inserted = allInserted;

    /* ── Stats ── */
    const negCount  = mentionRows.filter(m=>m.sentiment_label==="negative"||m.sentiment_label==="mixed").length;
    const critCount = mentionRows.filter(m=>m.severity==="critical"||m.severity==="high").length;
    const negPct    = Math.round((negCount / mentionRows.length) * 100);

    await sb.from("scan_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      total_mentions: mentionRows.length,
      negative_pct: negPct,
      emergencies_count: critCount,
    } as any).eq("id", scanRun.id);

    // Save scan snapshot (best-effort — column may not exist in all deployments)
    try {
      await sb.from("scan_runs").update({ result_snapshot: {
        scan_log: scanLog, total_found: allRaw.length,
        filtered_to: filtered.length, dedup_skipped: dedupSkipped,
        mentions_saved: mentionRows.length, negative_pct: negPct,
        sources_used: [...new Set(scanLog.map(s=>s.source))],
        ai_used: lovableKey ? "lovable-gateway" : "keyword-fallback",
      }} as any).eq("id", scanRun.id);
    } catch (_) { /* column may not exist — non-fatal */ }

    // Trigger narrative clustering async (non-blocking — won't crash scan if it fails)
    (async () => {
      try {
        const mentionIds = (inserted||[]).map((m:any)=>m.id);
        const sample = mentionRows.slice(0,30).map((m,i)=>({ index:i, source:m.source, content:(m.content||"").slice(0,200) }));
        const nRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization":`Bearer ${lovableKey}`, "Content-Type":"application/json" },
          signal: AbortSignal.timeout(40000),
          body: JSON.stringify({
            model: "google/gemini-2.5-flash", temperature: 0.3,
            messages: [
              { role:"system", content:`Cluster these mentions into 2-5 narrative themes. Return JSON: { "narratives": [{ "name":"...", "description":"...", "status":"active", "confidence":0.8, "example_phrases":["..."], "mention_indices":[0,1,2] }] }` },
              { role:"user", content:`Cluster mentions for "${brandName}":\n${JSON.stringify(sample)}` },
            ],
          }),
        });
        if (!nRes.ok) return;
        const nData = await nRes.json();
        let rawN = nData.choices?.[0]?.message?.content||"{}";
        rawN = rawN.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
        const parsed = JSON.parse(rawN);
        for (const c of (parsed.narratives||[])) {
          if (!c.name || !c.mention_indices?.length) continue;
          const { data: ex } = await sb.from("narratives").select("id").eq("org_id",org_id).eq("name",c.name).limit(1);
          let nid: string;
          if (ex?.length) {
            nid = ex[0].id;
            await sb.from("narratives").update({ last_seen:new Date().toISOString(), confidence:c.confidence||0.5 }).eq("id",nid);
          } else {
            const { data: newN } = await sb.from("narratives").insert({ org_id, name:c.name, description:c.description||"", status:c.status||"active", confidence:c.confidence||0.5, example_phrases:c.example_phrases||[], first_seen:new Date().toISOString(), last_seen:new Date().toISOString() }).select("id").single();
            if (!newN) continue;
            nid = newN.id;
          }
          const links = c.mention_indices.filter((i:number)=>i>=0&&i<mentionIds.length).map((i:number)=>({ mention_id:mentionIds[i], narrative_id:nid }));
          if (links.length>0) await sb.from("mention_narratives").insert(links);
        }
      } catch (e:any) { console.warn("Narrative clustering failed (non-fatal):", e.message); }
    })();

    console.log(`Scan complete: ${mentionRows.length} mentions saved, ${negPct}% negative, ${critCount} high/critical`);

    return new Response(JSON.stringify({
      scan_run_id: scanRun.id,
      mentions_created: mentionRows.length,
      total_found: allRaw.length,
      filtered_to: filtered.length,
      dedup_skipped: dedupSkipped,
      negative_pct: negPct,
      emergencies: critCount,
      scan_log: scanLog,
      keyword_groups: { brand: keywords.slice(0,5), risk: [], product: [] },
      ai_used: lovableKey ? "lovable-gateway" : "keyword-fallback",
    }), { headers: { ...CORS, "Content-Type":"application/json" } });

  } catch (err: any) {
    console.error("run-scan fatal error:", err);
    // Try to mark any running scan as failed
    try {
      const parsed = JSON.parse(bodyText || "{}");
      if (parsed.org_id) {
        await sb.from("scan_runs").update({ status:"failed", finished_at:new Date().toISOString() }).eq("org_id",parsed.org_id).eq("status","running");
      }
    } catch {}
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type":"application/json" } });
  }
});
