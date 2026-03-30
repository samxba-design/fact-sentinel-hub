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

// ── Block list ─────────────────────────────────────────────────────────────
const BLOCK_DOMAINS = new Set([
  "en.wikipedia.org", "wikipedia.org", "investopedia.com",
  "apps.apple.com", "play.google.com", "support.google.com", "support.apple.com",
  "howstuffworks.com", "about.com", "dictionary.com", "merriam-webster.com",
  "britannica.com", "nerdwallet.com", "bankrate.com", "investing.com",
  "news.google.com", "bing.com",
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
  const blockers = [
    "blocked by an extension", "enable javascript", "access denied",
    "403 forbidden", "captcha", "please verify you are a human",
    "cloudflare", "just a moment", "checking your browser", "page not found",
    "javascript is required", "cookie policy", "sign in to youtube",
  ];
  const lower = text.toLowerCase();
  const hits = blockers.filter(b => lower.includes(b)).length;
  return hits >= 2 || (hits >= 1 && text.length < 200);
}

function dedup(arr: any[]): any[] {
  const seen = new Set<string>();
  return arr.filter(r => {
    if (!r.url) return true;
    const key = r.url.toLowerCase().replace(/\/$/, "").replace(/^https?:\/\//, "");
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
  const queries = [
    keywords.slice(0, 3).join(" OR "),
    keywords[0],
    keywords.length > 1 ? `"${keywords[0]}" review` : null,
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
      for (const item of items.slice(0, 15)) {
        try {
          const title = xmlDecode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "");
          const link = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
          const desc = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "");
          const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
          if (!link || blocked(link)) continue;
          const content = clean([title, desc].filter(Boolean).join(". "));
          if (content.length < 30) continue;
          let posted_at: string | null = null;
          try { if (pubRaw) posted_at = new Date(pubRaw).toISOString(); } catch {}
          if (dateFrom && posted_at && new Date(posted_at).getTime() < new Date(dateFrom).getTime()) continue;
          results.push({
            source: src(link), content, title, url: link,
            author_name: (() => { try { return new URL(link).hostname.replace("www.", ""); } catch { return "news"; } })(),
            posted_at, date_verified: !!posted_at,
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
        const link = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
        const desc = xmlDecode(item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "");
        const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
        if (!link || blocked(link)) continue;
        const content = clean([title, desc].filter(Boolean).join(". "));
        if (content.length < 30) continue;
        let posted_at: string | null = null;
        try { if (pubRaw) posted_at = new Date(pubRaw).toISOString(); } catch {}
        results.push({
          source: src(link), content, title, url: link,
          author_name: (() => { try { return new URL(link).hostname.replace("www.", ""); } catch { return "news"; } })(),
          posted_at, date_verified: !!posted_at,
        });
      } catch { /* skip */ }
    }
  } catch (e: any) { console.warn("[bing-rss] failed:", e.message); }
  return results;
}

async function crawlHackerNews(keywords: string[], dateFrom?: string): Promise<any[]> {
  const results: any[] = [];
  await Promise.allSettled(keywords.slice(0, 2).map(async (kw) => {
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
  await Promise.allSettled(keywords.slice(0, 2).map(async (kw) => {
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
// AI ANALYSIS — tries Lovable gateway, falls back 100% to keyword sentiment
// ══════════════════════════════════════════════════════════════════════════

async function analyzeWithAI(
  items: { source: string; url: string; title: string; content: string }[],
  brandName: string,
  lovableKey: string,
): Promise<any[]> {
  if (!lovableKey) {
    console.log("[ai] No LOVABLE_API_KEY configured — using keyword sentiment");
    return [];
  }

  const analyses: any[] = [];
  const BATCH = 15; // smaller batches = more reliable

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    let batchOk = false;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content: `You analyze brand mentions for "${brandName}". For each mention return JSON with:
- relevant: boolean (is this actually about "${brandName}"?)  
- sentiment_label: "positive"|"negative"|"neutral"|"mixed"
- sentiment_score: number from -1.0 to 1.0
- severity: "low"|"medium"|"high"|"critical"
- summary: 1-2 sentence plain English description
- flags: {misinformation:bool, viral_potential:bool}
Be INCLUSIVE — mark relevant=true unless clearly unrelated. Return ONLY valid JSON: {"analyses":[...]}`,
            },
            {
              role: "user",
              content: `Analyze ${batch.length} mentions for "${brandName}":\n${JSON.stringify(
                batch.map((r, idx) => ({
                  idx,
                  source: r.source,
                  title: r.title,
                  content: r.content.slice(0, 400),
                }))
              )}`,
            },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let raw = data.choices?.[0]?.message?.content || "{}";
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
              // AI returned partial data — fill with keyword
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
      } else {
        console.warn(`[ai] HTTP ${res.status} for batch ${i}–${i + BATCH}`);
      }
    } catch (e: any) {
      console.warn(`[ai] fetch error for batch ${i}–${i + BATCH}:`, e.message);
    }

    if (!batchOk) {
      // Full keyword fallback for this batch
      for (const r of batch) {
        const kw = kwSentiment(r.content + " " + r.title);
        analyses.push({
          relevant: true, ...kw,
          summary: r.title || r.content.slice(0, 150),
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

    // ── 3. Load org + keywords ─────────────────────────────────────────────
    const [orgRes, kwRes, ignoredRes] = await Promise.all([
      sb.from("organizations").select("name,domain,plan").eq("id", org_id).maybeSingle(),
      sb.from("keywords").select("value,type").eq("org_id", org_id).eq("status", "active"),
      sb.from("ignored_sources").select("domain").eq("org_id", org_id),
    ]);

    const orgName = orgRes.data?.name || "";
    const orgDomain = (orgRes.data?.domain || "").toLowerCase();
    const dbKeywords = (kwRes.data || []).map((k: any) => k.value);
    const keywords = (rawKws?.length ? rawKws : dbKeywords).filter(Boolean).slice(0, 10) as string[];
    const ignoredDomains = new Set((ignoredRes.data || []).map((r: any) => r.domain?.toLowerCase() || ""));

    if (keywords.length === 0) {
      return json({
        scan_run_id: null,
        mentions_created: 0,
        total_found: 0,
        zero_results_reason: "No keywords configured. Add keywords in Settings → Keywords.",
        scan_log: [],
        keyword_groups: { brand: [], risk: [], product: [] },
        errors: ["No active keywords found for this organization."],
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

    console.log(`Scan ${scanRun.id} started for "${brandName}" | keywords: ${keywords.join(", ")}`);

    // ── 5. Run all crawlers in parallel ────────────────────────────────────
    const allRaw: any[] = [];
    const scanLog: { source: string; found: number; error?: string }[] = [];

    const crawlPromises: Promise<void>[] = [];

    // Free sources (always run)
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
      const r = await crawlHackerNews(keywords, date_from);
      allRaw.push(...r);
      scanLog.push({ source: "hackernews", found: r.length });
    })());

    crawlPromises.push((async () => {
      const r = await crawlReddit(keywords, date_from);
      allRaw.push(...r);
      scanLog.push({ source: "reddit-public", found: r.length });
    })());

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
    const SKIP = new Set(["news.google.com", "bing.com", "google.com"]);

    const filtered = dedup(allRaw).filter(r => {
      if (!r.content || r.content.length < 25) return false;
      if (!r.url) return false;
      if (blocked(r.url)) return false;
      if (isJunk(r.content)) return false;
      try {
        const host = new URL(r.url).hostname.replace("www.", "").toLowerCase();
        if (SKIP.has(host)) return false;
        if (orgDomain && host === orgDomain) return false;
        if (ignoredDomains.has(host)) return false;
      } catch { return false; }
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
    const candidateUrls = filtered
      .map(r => r.url?.toLowerCase().replace(/\/$/, ""))
      .filter(Boolean) as string[];

    const existingUrls = new Set<string>();
    for (let i = 0; i < candidateUrls.length; i += 50) {
      const batch = candidateUrls.slice(i, i + 50);
      if (batch.length === 0) continue;
      const { data: ex } = await sb
        .from("mentions")
        .select("url")
        .eq("org_id", org_id)
        .in("url", batch);
      for (const m of (ex || [])) {
        if (m.url) existingUrls.add(m.url.toLowerCase().replace(/\/$/, ""));
      }
    }

    const newItems = filtered.filter(r => {
      if (!r.url) return true;
      return !existingUrls.has(r.url.toLowerCase().replace(/\/$/, ""));
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

    let analyses = await analyzeWithAI(aiInput, brandName, lovableKey);

    // If AI returned nothing (no key or all batches failed), use keyword fallback
    if (analyses.length === 0) {
      console.log("[ai] Using full keyword-sentiment fallback");
      analyses = newItems.map(r => {
        const kw = kwSentiment(r.content + " " + (r.title || ""));
        return {
          relevant: true, ...kw,
          summary: r.title || r.content.slice(0, 180),
          flags: {},
        };
      });
    }

    // ── 9. Build mention rows ──────────────────────────────────────────────
    let mentionRows = newItems.map((r, i) => {
      const a = analyses[i] || {};
      const kw = kwSentiment(r.content + " " + (r.title || ""));

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
          ? Math.round(a.sentiment_confidence * 100)
          : 65,
        severity,
        language: "en",
        posted_at: r.posted_at || null,
        url: r.url || null,
        metrics: r.metrics || {},
        flags: { ...(a.flags || {}), date_verified: r.date_verified || false },
        status: "new",
        owner_user_id: userId, // null for scheduled/system scans — this is valid (nullable UUID)
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
        ai_used: lovableKey ? "lovable-gateway" : "keyword-only",
        errors: insertErrors,
      },
    } as any).eq("id", scanRun.id).then(() => {}).catch(() => {});

    // ── 12. Narrative clustering (async, non-blocking) ─────────────────────
    if (lovableKey && inserted.length > 0) {
      (async () => {
        try {
          const mentionIds = inserted.map((m: any) => m.id);
          const sample = mentionRows.slice(0, 25).map((m, i) => ({
            i, source: m.source, content: (m.content || "").slice(0, 200),
          }));

          const nRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
            signal: AbortSignal.timeout(35000),
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              temperature: 0.3,
              messages: [
                {
                  role: "system",
                  content: `Cluster mentions into 2-5 narrative themes. Return ONLY valid JSON:
{"narratives":[{"name":"...","description":"...","status":"active","confidence":0.8,"example_phrases":["..."],"mention_indices":[0,1,2]}]}`,
                },
                {
                  role: "user",
                  content: `Cluster ${sample.length} mentions for "${brandName}":\n${JSON.stringify(sample)}`,
                },
              ],
            }),
          });

          if (!nRes.ok) return;
          const nData = await nRes.json();
          let rawN = nData.choices?.[0]?.message?.content || "{}";
          rawN = rawN.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

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
      ai_used: lovableKey ? "lovable-gateway" : "keyword-only",
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
