import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_KEY = Deno.env.get("GOOGLE_API_KEY") ?? "";
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

async function aiChat(messages: Array<{role: string; content: string}>, jsonMode = false): Promise<string> {
  if (GEMINI_KEY) {
    try {
      const prompt = messages.map(m => `${m.role === "system" ? "Instructions" : "User"}: ${m.content}`).join("\n\n");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              ...(jsonMode ? { responseMimeType: "application/json" } : {}),
            },
          }),
        }
      );
      if (res.ok) {
        const d = await res.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text) return text;
      }
    } catch (_) {}
  }
  if (!LOVABLE_KEY) throw new Error("No AI key configured. Set GOOGLE_API_KEY or LOVABLE_API_KEY in Supabase Edge Function secrets.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? "";
}

const PAYWALL_INDICATORS = [
  "subscribe to read", "subscribers only", "premium content", "paywall",
  "sign in to continue reading", "this article is for subscribers",
  "to continue reading", "unlock this article", "membership required",
  "create a free account to continue", "already a subscriber",
  "exclusive to subscribers", "premium article", "paid content",
  "meter has been exhausted", "you've reached your limit",
  "free articles remaining", "register to continue",
];

const JS_BLOCK_INDICATORS = [
  "enable javascript", "javascript is not available", "javascript needs to be enabled",
  "please enable javascript", "please turn javascript on", "javascript is required",
  "this site requires javascript", "browser doesn't support javascript",
  "disable your ad blocker", "ad blocker", "adblocker detected",
  "turn off your ad blocker", "please disable adblock",
  "checking your browser", "just a moment", "verifying you are human",
  "access denied", "403 forbidden", "captcha",
];

function isJsBlocked(content: string): boolean {
  const lower = content.toLowerCase();
  const matches = JS_BLOCK_INDICATORS.filter(i => lower.includes(i));
  return matches.length >= 1 && content.length < 1500;
}

// Paywall bypass services — try each in order until one works
const BYPASS_REJECT_PATTERNS = [
  "captcha", "checking your browser", "just a moment", "access denied",
  "403 forbidden", "service unavailable", "cloudflare", "verifying you are human",
  "enable javascript", "please turn javascript on", "ray id",
  "this site can't be reached", "page not found", "404 not found",
  "we're sorry", "something went wrong", "error occurred",
  "subscribe to continue", "sign up to read", "create an account",
];

function isErrorPage(html: string): boolean {
  const lower = html.toLowerCase();
  const matchCount = BYPASS_REJECT_PATTERNS.filter(p => lower.includes(p)).length;
  return matchCount >= 2 || (html.length < 800 && matchCount >= 1);
}

const BYPASS_SERVICES = [
  {
    name: "google_cache",
    buildUrl: (url: string) => `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}&strip=1`,
    rejectIf: (html: string) => html.toLowerCase().includes("did not match any documents") || html.length < 500 || isErrorPage(html),
  },
  {
    name: "12ft_proxy",
    buildUrl: (url: string) => `https://12ft.io/api/proxy?q=${encodeURIComponent(url)}`,
    rejectIf: (html: string) => isErrorPage(html) || html.toLowerCase().includes("12ft.io") && html.length < 1000,
  },
  {
    name: "archive_is",
    buildUrl: (url: string) => `https://archive.is/newest/${url}`,
    rejectIf: (html: string) => isErrorPage(html) || html.toLowerCase().includes("no results found") || html.toLowerCase().includes("archive.is"),
  },
  {
    name: "removepaywall",
    buildUrl: (url: string) => `https://www.removepaywall.com/search?url=${encodeURIComponent(url)}`,
    rejectIf: (html: string) => isErrorPage(html) || html.toLowerCase().includes("removepaywall") && html.length < 1000,
  },
  {
    name: "1ft_io",
    buildUrl: (url: string) => `https://1ft.io/proxy?q=${encodeURIComponent(url)}`,
    rejectIf: (html: string) => isErrorPage(html) || html.toLowerCase().includes("1ft.io") && html.length < 1000,
  },
];

function extractTextFromHtml(html: string): { text: string; title: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, title: titleMatch?.[1] || "" };
}

async function fetchArchiveFallback(url: string): Promise<{ content: string; title: string; source: string } | null> {
  // Try each bypass service in order
  for (const service of BYPASS_SERVICES) {
    try {
      const serviceUrl = service.buildUrl(url);
      const res = await fetch(serviceUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        if (service.rejectIf && service.rejectIf(html)) continue;
        const { text, title } = extractTextFromHtml(html);
        if (text.length > 300) {
          console.log(`[ARCHIVE-FALLBACK] ${service.name} hit for:`, url, "length:", text.length);
          return { content: text.slice(0, 8000), title, source: service.name };
        }
      }
    } catch (e: any) {
      console.log(`[ARCHIVE-FALLBACK] ${service.name} failed:`, e.message);
    }
  }

  // Last resort: Archive.org Wayback Machine (needs 2 requests)
  try {
    const wbAvail = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const wbData = await wbAvail.json();
    const snapshot = wbData?.archived_snapshots?.closest;
    if (snapshot?.available && snapshot.url) {
      const archiveRes = await fetch(snapshot.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SentiWatch/1.0)" },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (archiveRes.ok) {
        const html = await archiveRes.text();
        const { text, title } = extractTextFromHtml(html);
        if (text.length > 300) {
          console.log("[ARCHIVE-FALLBACK] Archive.org hit for:", url, "snapshot:", snapshot.timestamp);
          return { content: text.slice(0, 8000), title, source: "archive_org" };
        }
      }
    }
  } catch (e: any) {
    console.log("[ARCHIVE-FALLBACK] Archive.org failed:", e.message);
  }

  return null;
}

function detectPaywall(content: string, html?: string): { is_paywalled: boolean; paywall_type: string | null } {
  const lower = (content + " " + (html || "")).toLowerCase();
  for (const indicator of PAYWALL_INDICATORS) {
    if (lower.includes(indicator)) {
      if (lower.includes("subscribe") || lower.includes("subscription")) return { is_paywalled: true, paywall_type: "subscription" };
      if (lower.includes("register") || lower.includes("sign in") || lower.includes("free account")) return { is_paywalled: true, paywall_type: "registration" };
      if (lower.includes("meter") || lower.includes("limit") || lower.includes("remaining")) return { is_paywalled: true, paywall_type: "metered" };
      return { is_paywalled: true, paywall_type: "hard" };
    }
  }
  if (content.length < 200 && (lower.includes("vanity fair") || lower.includes("new york times") || lower.includes("wall street journal") || lower.includes("financial times") || lower.includes("washington post") || lower.includes("the athletic"))) {
    return { is_paywalled: true, paywall_type: "likely" };
  }
  return { is_paywalled: false, paywall_type: null };
}

function sanitizeUrl(raw: string): string {
  let u = raw.trim();
  const httpsIdx = u.indexOf("https://", 1);
  const httpIdx = u.indexOf("http://", 1);
  const dupIdx = Math.min(
    httpsIdx > 0 ? httpsIdx : Infinity,
    httpIdx > 0 ? httpIdx : Infinity
  );
  if (dupIdx !== Infinity) {
    u = u.slice(0, dupIdx);
  }
  if (!u.startsWith("http://") && !u.startsWith("https://")) {
    u = `https://${u}`;
  }
  return u;
}

// Known publication names for generic title detection
const KNOWN_PUBLICATIONS = [
  "new york times", "nytimes", "washington post", "wall street journal", "wsj",
  "financial times", "ft", "bloomberg", "reuters", "cnn", "bbc", "fox news",
  "guardian", "the guardian", "forbes", "vanity fair", "the atlantic", "the economist",
  "politico", "axios", "the verge", "techcrunch", "wired", "ars technica",
  "the hill", "huffpost", "huffington post", "daily mail", "telegraph",
  "independent", "observer", "times", "sun", "mirror", "express",
  "usa today", "los angeles times", "la times", "chicago tribune",
  "associated press", "ap news", "abc news", "nbc news", "cbs news",
  "msnbc", "cnbc", "business insider", "insider", "buzzfeed",
];

const GENERIC_TAGLINE_WORDS = [
  "breaking news", "latest news", "news", "world news", "us news",
  "opinion", "live", "homepage", "home", "subscribe", "sign in", "log in",
  "multimedia", "international", "politics", "business", "technology",
  "entertainment", "sports", "health", "science", "travel", "style",
  "investigations", "analysis", "video", "photos",
];

// Detect if a title is generic (just the site/domain name, not article-specific)
function isGenericTitle(title: string, url: string): boolean {
  if (!title || title.length < 5) return true;
  const lower = title.toLowerCase().trim();

  // Check if title matches domain name
  try {
    const domain = new URL(url).hostname.replace("www.", "").replace(/\..+$/, "");
    if (lower === domain || lower === `the ${domain}` || lower.replace(/[^a-z]/g, "") === domain.replace(/[^a-z]/g, "")) return true;
  } catch {}

  // Check exact match or "Site Name - Tagline" format for known publications
  // Split on common separators: -, |, ·, –, —, :
  const separatorPattern = /\s*[-|·–—:]\s*/;
  const parts = lower.split(separatorPattern).map(p => p.trim()).filter(Boolean);

  // If any part is a known publication name, check if remaining parts are generic
  for (const pub of KNOWN_PUBLICATIONS) {
    if (parts.some(part => part === pub || part === `the ${pub}`)) {
      // Title contains a publication name — check if remaining parts are generic taglines
      const otherParts = parts.filter(part => part !== pub && part !== `the ${pub}`);
      if (otherParts.length === 0) return true; // Just the publication name
      // Check if all other parts are generic tagline words
      const allGeneric = otherParts.every(part => {
        const words = part.split(/[\s,&]+/).filter(w => w.length > 1);
        return words.every(w => GENERIC_TAGLINE_WORDS.some(g => g.includes(w) || w.includes(g)));
      });
      if (allGeneric) return true;
    }
  }

  // Check simple generic patterns
  const simpleGenericPatterns = [
    /^(home|homepage|breaking news|latest news|news|subscribe|sign in|log in)$/i,
    /^.{1,4}$/,
  ];
  return simpleGenericPatterns.some(p => p.test(lower));
}

// Check if a description is generic site-level boilerplate rather than article-specific
function isGenericDescription(desc: string, url: string): boolean {
  if (!desc || desc.length < 20) return true;
  const lower = desc.toLowerCase();
  const genericDescPatterns = [
    "breaking news", "latest news", "live news", "read the latest",
    "find breaking news", "news and analysis", "trusted source",
    "the leading source", "delivering the best", "stay informed",
    "all the news that's fit", "your source for", "comprehensive coverage",
    "independent journalism", "quality journalism", "subscribe today",
  ];
  const matchCount = genericDescPatterns.filter(p => lower.includes(p)).length;
  if (matchCount >= 2) return true;
  // If description doesn't mention any specific nouns/names beyond publication
  try {
    const domain = new URL(url).hostname.replace("www.", "").replace(/\..+$/, "");
    // If desc is essentially about the publication itself, not an article
    if (lower.includes(domain) && desc.length < 80) return true;
  } catch {}
  return false;
}

// Extract a meaningful title from URL slug when page title is generic
function titleFromUrlSlug(url: string): string {
  try {
    const path = new URL(url).pathname;
    const segments = path.split("/").filter(Boolean);
    const slug = segments.reverse().find(s => s.length > 5 && !/^\d{4}$/.test(s) && !/^\d+$/.test(s));
    if (slug) {
      return slug.replace(/[-_]/g, " ").replace(/\.html?$/i, "").replace(/\b\w/g, c => c.toUpperCase());
    }
  } catch {}
  return "";
}

// Extract YouTube video ID
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractJson(raw: string): any {
  // Strip markdown code fences
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let jsonStr = cleaned.slice(start, end + 1);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
  jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch) => ch === "\n" || ch === "\r" || ch === "\t" ? ch : "");
  try {
    return JSON.parse(jsonStr);
  } catch {
    try {
      jsonStr = jsonStr.replace(/[\n\r\t]/g, " ");
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }
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
    const lovableKey = LOVABLE_KEY;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { url, org_id } = await req.json();
    if (!url) throw new Error("URL is required");

    const formattedUrl = sanitizeUrl(url);
    console.log("[ANALYZE-LINK] Scraping URL:", formattedUrl);

    // Step 1: Scrape the page
    let markdown = "";
    let html = "";
    let pageTitle = "";
    let pageDescription = "";
    let scrapeSuccess = false;
    let isYouTube = false;

    // Step 1a: YouTube special handling via oEmbed + noembed
    const ytId = extractYouTubeId(formattedUrl);
    if (ytId) {
      isYouTube = true;
      console.log("[ANALYZE-LINK] YouTube video detected, ID:", ytId);
      try {
        const oembedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytId}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          pageTitle = oembed.title || "";
          pageDescription = `YouTube video by ${oembed.author_name || "unknown"}: ${pageTitle}`;
          markdown = `# ${pageTitle}\n\nBy: ${oembed.author_name || "Unknown"}\nChannel: ${oembed.author_url || ""}\n\nThis is a YouTube video. Transcript not available via scraping.`;
          scrapeSuccess = true;
        }
      } catch (e: any) {
        console.log("[ANALYZE-LINK] YouTube oEmbed failed:", e.message);
      }
      // Try Firecrawl for richer content (may get transcript/comments)
      if (firecrawlKey) {
        try {
          const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url: formattedUrl, formats: ["markdown"], onlyMainContent: true, waitFor: 5000 }),
          });
          const scrapeData = await scrapeRes.json();
          if ((scrapeData.success || scrapeData.data) && (scrapeData.data?.markdown || scrapeData.markdown || "").length > 100) {
            const d = scrapeData.data || scrapeData;
            markdown = d.markdown || markdown;
            if (d.metadata?.title && !isGenericTitle(d.metadata.title, formattedUrl)) pageTitle = d.metadata.title;
            if (d.metadata?.description) pageDescription = d.metadata.description;
            scrapeSuccess = true;
          }
        } catch (e: any) {
          console.log("[ANALYZE-LINK] YouTube Firecrawl scrape failed:", e.message);
        }
      }
    }

    // Step 1b: Standard Firecrawl scrape (non-YouTube)
    if (!scrapeSuccess && firecrawlKey) {
      try {
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: formattedUrl,
            formats: ["markdown", "html"],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });
        const scrapeData = await scrapeRes.json();
        if (scrapeData.success || scrapeData.data) {
          const d = scrapeData.data || scrapeData;
          markdown = d.markdown || "";
          html = d.html || "";
          pageTitle = d.metadata?.title || "";
          pageDescription = d.metadata?.description || "";
          scrapeSuccess = true;
        }
      } catch (e: any) {
        console.log("[ANALYZE-LINK] Firecrawl scrape failed, falling back:", e.message);
      }
    }

    if (!scrapeSuccess) {
      try {
        const res = await fetch(formattedUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SentiWatch/1.0)" },
          redirect: "follow",
        });
        const rawHtml = await res.text();
        const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
        pageTitle = titleMatch?.[1] || "";
        const descMatch = rawHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        pageDescription = descMatch?.[1] || "";
        markdown = rawHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 5000);
        html = rawHtml.slice(0, 3000);
      } catch (e: any) {
        console.log("[ANALYZE-LINK] Direct fetch failed:", e.message);
        markdown = `Could not access ${formattedUrl}: ${e.message}`;
      }
    }

    // Step 1c: Fix generic titles — if title is just the site name, derive from URL slug or content
    if (isGenericTitle(pageTitle, formattedUrl)) {
      console.log(`[ANALYZE-LINK] Generic title detected: "${pageTitle}". Attempting to extract article-specific title.`);
      const slugTitle = titleFromUrlSlug(formattedUrl);
      if (slugTitle && slugTitle.length > 8) {
        pageTitle = slugTitle;
        console.log(`[ANALYZE-LINK] Using URL slug title: "${pageTitle}"`);
      } else if (markdown.length > 100) {
        // Ask AI to extract the real headline from content
        try {
          const extracted = (await aiChat([
            { role: "system", content: "Extract the article/page headline from this content. Return ONLY the headline text, nothing else. If no headline is identifiable, return the main topic in 5-10 words." },
            { role: "user", content: markdown.slice(0, 2000) },
          ])).trim().replace(/^["']|["']$/g, "");
          if (extracted.length > 5 && extracted.length < 200) {
            pageTitle = extracted;
            console.log(`[ANALYZE-LINK] AI-extracted title: "${pageTitle}"`);
          }
        } catch (e: any) {
          console.log("[ANALYZE-LINK] AI title extraction failed:", e.message);
        }
      }
    }

    // Step 2: Paywall & JS-block detection
    const paywallResult = detectPaywall(markdown, html);
    const jsBlocked = isJsBlocked(markdown);
    let contentSource = "direct";

    // Step 2b: If paywalled or JS-blocked, try archive fallbacks
    if (paywallResult.is_paywalled || jsBlocked || markdown.length < 200) {
      console.log(`[ANALYZE-LINK] Content issue detected — paywalled: ${paywallResult.is_paywalled}, jsBlocked: ${jsBlocked}, length: ${markdown.length}. Trying archive fallbacks...`);
      const fallback = await fetchArchiveFallback(formattedUrl);
      if (fallback && fallback.content.length > markdown.length) {
        console.log(`[ANALYZE-LINK] Archive fallback succeeded via ${fallback.source}, content length: ${fallback.content.length} (was ${markdown.length})`);
        markdown = fallback.content;
        if (fallback.title && !pageTitle) pageTitle = fallback.title;
        contentSource = fallback.source;
        // Re-check paywall on new content
        const recheck = detectPaywall(markdown, "");
        if (!recheck.is_paywalled) {
          paywallResult.is_paywalled = false;
          paywallResult.paywall_type = null;
        }
      }
    }

    // Step 3: Related coverage search with AI relevance filtering
    let socialPickup: any[] = [];
    let mediaPickup: any[] = [];

    if (firecrawlKey) {
      const domain = new URL(formattedUrl).hostname.replace("www.", "");
      const pathSlug = new URL(formattedUrl).pathname.split("/").filter(Boolean).pop() || "";
      const searchQuery = pageTitle || pathSlug;

      if (searchQuery && searchQuery.length > 3) {
        try {
          const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `"${searchQuery}"`,
              limit: 15,
              tbs: "qdr:m",
            }),
          });
          const searchData = await searchRes.json();
          if (searchData.success && searchData.data) {
            const candidates: any[] = [];
            for (const result of searchData.data) {
              const resUrl = (result.url || "").toLowerCase();
              if (resUrl === formattedUrl.toLowerCase()) continue;
              try {
                const resDomain = new URL(result.url).hostname.replace("www.", "");
                if (resDomain === domain) continue;
              } catch {}
              candidates.push(result);
            }

            if (candidates.length > 0) {
              try {
                const rawFilter = await aiChat([
                  {
                    role: "system",
                    content: `You are a strict relevance judge. Given an article title and search results, return ONLY indices of results that discuss the EXACT SAME specific story, event, or subject. Results must be directly about the same topic — not just sharing a vague theme, keyword, or industry. If a result is about a different story even if it mentions the same person/company, it is NOT relevant. Return a JSON array of integers like [0, 2]. If none are relevant, return [].`,
                  },
                  {
                    role: "user",
                    content: `Article: "${pageTitle}"\nDescription: "${pageDescription}"\nSource: ${domain}\n\nResults:\n${candidates.map((c, i) => `[${i}] ${c.title} — ${c.description || ""} (${c.url})`).join("\n")}`,
                  },
                ]);
                const jsonMatch = rawFilter.match(/\[[\s\S]*?\]/);
                const relevantIndices: number[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

                const relevant = relevantIndices
                  .filter(i => i >= 0 && i < candidates.length)
                  .map(i => candidates[i]);

                for (const result of relevant) {
                  const resUrl = (result.url || "").toLowerCase();
                  if (resUrl.includes("twitter.com") || resUrl.includes("x.com")) {
                    socialPickup.push({ platform: "twitter", url: result.url, title: result.title, snippet: result.description });
                  } else if (resUrl.includes("reddit.com")) {
                    socialPickup.push({ platform: "reddit", url: result.url, title: result.title, snippet: result.description });
                  } else if (resUrl.includes("linkedin.com")) {
                    socialPickup.push({ platform: "linkedin", url: result.url, title: result.title, snippet: result.description });
                  } else if (resUrl.includes("facebook.com")) {
                    socialPickup.push({ platform: "facebook", url: result.url, title: result.title, snippet: result.description });
                  } else if (resUrl.includes("youtube.com") || resUrl.includes("youtu.be")) {
                    socialPickup.push({ platform: "youtube", url: result.url, title: result.title, snippet: result.description });
                  } else {
                    mediaPickup.push({ url: result.url, title: result.title, snippet: result.description, domain: new URL(result.url).hostname.replace("www.", "") });
                  }
                }
              } catch (e: any) {
                console.log("[ANALYZE-LINK] Relevance filter failed:", e.message);
              }
            }
          }
        } catch (e: any) {
          console.log("[ANALYZE-LINK] Coverage search failed:", e.message);
        }
      }
    }

    // Step 4: Search engine visibility + keyword discovery
    let searchVisibility: any = null;
    let searchDiscovery: any = null;
    
    if (firecrawlKey && pageTitle && pageTitle.length > 5) {
      const domain = new URL(formattedUrl).hostname.replace("www.", "");
      
      // 4a: Title-based visibility check — article-specific
      try {
        const seoRes = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `"${pageTitle.slice(0, 80)}"`,
            limit: 10,
          }),
        });
        const seoData = await seoRes.json();
        if (seoData.success && seoData.data) {
           const targetUrl = formattedUrl.toLowerCase().replace(/\/$/, "");
          const exactUrlMatches = seoData.data.filter((r: any) => {
            try { return r.url.toLowerCase().replace(/\/$/, "") === targetUrl; } catch { return false; }
          });
          const domainMatches = seoData.data.filter((r: any) => {
            try { return new URL(r.url).hostname.replace("www.", "") === domain; } catch { return false; }
          });
          const isIndexed = exactUrlMatches.length > 0 || domainMatches.length > 0;
          const rankPosition = seoData.data.findIndex((r: any) => {
            try { return r.url.toLowerCase().replace(/\/$/, "") === targetUrl; } catch { return false; }
          });
          const domainRank = rankPosition >= 0 ? rankPosition : seoData.data.findIndex((r: any) => {
            try { return new URL(r.url).hostname.replace("www.", "") === domain; } catch { return false; }
          });

          // Competing results: filter by AI for relevance to THIS article's topic
          const otherResults = seoData.data
            .filter((r: any) => {
              try { return new URL(r.url).hostname.replace("www.", "") !== domain; } catch { return false; }
            })
            .slice(0, 8);

          let competingResults: any[] = [];
          if (otherResults.length > 0) {
            try {
              const rawIdx = await aiChat([
                {
                  role: "system",
                  content: `You judge whether search results are about the SAME SPECIFIC story/topic as a given article. Return ONLY a JSON array of indices of results that cover the same specific event, claim, or subject. Not just same industry/company — must be the same story. If none match, return [].`,
                },
                {
                  role: "user",
                  content: `Article: "${pageTitle}"\nDescription: "${pageDescription}"\n\nResults:\n${otherResults.map((c: any, i: number) => `[${i}] ${c.title} — ${c.description || ""} (${c.url})`).join("\n")}`,
                },
              ]);
              const idxMatch = rawIdx.match(/\[[\s\S]*?\]/);
              const relevantIdx: number[] = idxMatch ? JSON.parse(idxMatch[0]) : [];
              competingResults = relevantIdx
                .filter(i => i >= 0 && i < otherResults.length)
                .map(i => ({
                  title: otherResults[i].title,
                  url: otherResults[i].url,
                  domain: (() => { try { return new URL(otherResults[i].url).hostname.replace("www.", ""); } catch { return otherResults[i].url; } })(),
                }));
            } catch (e: any) {
              console.log("[ANALYZE-LINK] Competing filter failed:", e.message);
            }
          }

          // Search snippet: prefer article-specific metadata, reject generic site descriptions
          let articleSnippet: string | null = null;
          if (pageDescription && !isGenericDescription(pageDescription, formattedUrl)) {
            articleSnippet = pageDescription;
          } else if (exactUrlMatches[0]?.description) {
            articleSnippet = exactUrlMatches[0].description;
          } else if (markdown.length > 100) {
            // Extract first 1-2 sentences from content as fallback
            const sentences = markdown.replace(/^#.*\n/gm, "").trim().split(/[.!?]\s+/);
            const firstSentences = sentences.slice(0, 2).join(". ").slice(0, 200);
            if (firstSentences.length > 30) articleSnippet = firstSentences + ".";
          }

          searchVisibility = {
            is_indexed: isIndexed,
            search_rank: domainRank >= 0 ? domainRank + 1 : null,
            title_search_query: pageTitle.slice(0, 80),
            exact_match_count: exactUrlMatches.length,
            competing_results: competingResults,
            search_snippet: articleSnippet,
          };
        }
      } catch (e: any) {
        console.log("[ANALYZE-LINK] SEO check failed:", e.message);
      }

      // 4b: Search keyword discovery — extract keywords via AI, then verify in search
      try {
        const rawKw = await aiChat([
          {
            role: "system",
            content: `You extract search keywords that would lead someone to find THIS SPECIFIC ARTICLE on Google — not the website's homepage or other articles on the same site.

CRITICAL RULES:
- Keywords MUST be about the specific story/topic of THIS article, NOT about the publication (e.g. never "new york times", "nytimes", "breaking news", "homepage")
- Keywords should reflect what someone curious about THIS STORY would search for
- Include the specific subject matter, people, companies, or events discussed
- Do NOT include generic news terms, publication names, or broad category terms
- Each keyword phrase should be 2-6 words

Return ONLY a JSON array of 6-10 keyword phrases. Example for an article about Binance regulatory issues: ["binance SEC lawsuit", "binance crypto regulation 2025", "CZ binance legal troubles", "crypto exchange compliance crackdown"]. Return ONLY the JSON array.`,
          },
          {
            role: "user",
            content: `Title: ${pageTitle}\nDescription: ${pageDescription}\nContent (first 1500 chars): ${markdown.slice(0, 1500)}`,
          },
        ]);
        const jsonMatch = rawKw.match(/\[[\s\S]*?\]/);
        const extractedKeywords: string[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
          
          if (extractedKeywords.length > 0) {
            console.log("[ANALYZE-LINK] Extracted search keywords:", extractedKeywords.join(", "));
            
            // Verify top keywords by searching and checking if the article appears
            const verifiedKeywords: Array<{
              keyword: string;
              surfaces_article: boolean;
              rank: number | null;
              competing_count: number;
              top_competitor: string | null;
            }> = [];
            
            // Verify up to 5 keywords in parallel
            const kwsToVerify = extractedKeywords.slice(0, 5);
            const verifyPromises = kwsToVerify.map(async (kw) => {
              try {
                const verifyRes = await fetch("https://api.firecrawl.dev/v1/search", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${firecrawlKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ query: kw, limit: 10 }),
                });
                const verifyData = await verifyRes.json();
                if (verifyData.success && verifyData.data) {
                  const targetUrl = formattedUrl.toLowerCase().replace(/\/$/, "");
                  // Check exact URL match first
                  const exactRank = verifyData.data.findIndex((r: any) => {
                    try { return r.url.toLowerCase().replace(/\/$/, "") === targetUrl; } catch { return false; }
                  });
                  // Fallback to domain match only if exact not found
                  const domainRank = exactRank >= 0 ? exactRank : verifyData.data.findIndex((r: any) => {
                    try { return new URL(r.url).hostname.replace("www.", "") === domain; } catch { return false; }
                  });
                  const rank = exactRank >= 0 ? exactRank : domainRank;
                  const competitors = verifyData.data.filter((r: any) => {
                    try { return new URL(r.url).hostname.replace("www.", "") !== domain; } catch { return false; }
                  });
                  return {
                    keyword: kw,
                    surfaces_article: exactRank >= 0,
                    surfaces_domain: domainRank >= 0 && exactRank < 0,
                    rank: rank >= 0 ? rank + 1 : null,
                    competing_count: competitors.length,
                    top_competitor: competitors[0]?.title || null,
                  };
                }
              } catch (e: any) {
                console.log("[ANALYZE-LINK] Keyword verify failed for:", kw, e.message);
              }
              return { keyword: kw, surfaces_article: false, surfaces_domain: false, rank: null, competing_count: 0, top_competitor: null };
            });
            
            const verified = await Promise.all(verifyPromises);
            verifiedKeywords.push(...verified);
            
            // Include remaining unverified keywords
            const unverified = extractedKeywords.slice(5).map(kw => ({
              keyword: kw,
              surfaces_article: null as boolean | null,
              rank: null,
              competing_count: 0,
              top_competitor: null,
            }));
            
            searchDiscovery = {
              extracted_keywords: extractedKeywords,
              verified_keywords: verifiedKeywords,
              unverified_keywords: unverified,
              surfacing_count: verifiedKeywords.filter(k => k.surfaces_article).length,
              total_verified: verifiedKeywords.length,
            };
            
            console.log(`[ANALYZE-LINK] Search discovery: ${searchDiscovery.surfacing_count}/${searchDiscovery.total_verified} keywords surface the article`);
          }
      } catch (e: any) {
        console.log("[ANALYZE-LINK] Search keyword discovery failed:", e.message);
      }
    }

    // Step 5: Check API connections
    const serviceClient = createClient(supabaseUrl, supabaseKey);
    let twitterConnected = false;
    let redditConnected = false;
    if (org_id) {
      const { data: keys } = await serviceClient
        .from("org_api_keys")
        .select("provider")
        .eq("org_id", org_id)
        .in("provider", ["twitter", "reddit"]);
      if (keys) {
        twitterConnected = keys.some(k => k.provider === "twitter");
        redditConnected = keys.some(k => k.provider === "reddit");
      }
    }

    // Step 6: Similar mentions
    let similarMentions: any[] = [];
    if (org_id && pageTitle) {
      const keywords = pageTitle.toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 3 && !["this", "that", "with", "from", "have", "been", "their", "about", "which", "would", "could", "should", "after", "before", "other", "these", "those", "than", "then", "into", "over", "also", "some", "more", "most", "very", "just", "even", "only"].includes(w));

      if (keywords.length >= 2) {
        const searchTerms = keywords.slice(0, 4).join(" & ");
        try {
          const { data: mentions } = await serviceClient
            .from("mentions")
            .select("id, content, url, source, sentiment_label, severity, posted_at, author_name")
            .eq("org_id", org_id)
            .neq("url", formattedUrl)
            .textSearch("content", searchTerms, { type: "plain" })
            .order("posted_at", { ascending: false })
            .limit(5);

          if (mentions && mentions.length > 0) {
            similarMentions = mentions.map(m => ({
              id: m.id,
              content: (m.content || "").slice(0, 150),
              url: m.url,
              source: m.source,
              sentiment: m.sentiment_label,
              severity: m.severity,
              posted_at: m.posted_at,
              author: m.author_name,
            }));
          }
        } catch (e: any) {
          console.log("[ANALYZE-LINK] Similar mentions search failed:", e.message);
        }
      }
    }

    // Step 7: AI Analysis — enhanced prompt
    const contentForAI = markdown.slice(0, 6000);
    const socialContext = socialPickup.length > 0
      ? `\n\nVerified social pickup: ${socialPickup.map(s => `${s.platform}: ${s.title}`).join(", ")}`
      : "\n\nNo verified social pickup found.";
    const mediaContext = mediaPickup.length > 0
      ? `\nVerified media coverage: ${mediaPickup.map(m => `${m.domain}: ${m.title}`).join(", ")}`
      : "\nNo additional media coverage found.";

    const analysisSystemPrompt = `You are an expert media intelligence analyst. Analyze the article content thoroughly and return a JSON object. Be precise — if information is unknown say "Unknown" or null. Never fabricate data.

IMPORTANT: If the content appears to be from a paywalled or access-restricted article with only partial/limited text available, clearly state this in the summary (e.g., "This is a paywalled article. Based on the available excerpt:..."). For sections where you cannot make accurate assessments due to limited content, use null values or state "Insufficient content — paywalled article" rather than guessing.

Return ONLY valid JSON (no markdown fences, no extra text) with this exact structure:
{"headline":"article headline","summary":"4-6 sentence detailed summary","content_breakdown":{"main_topic":"primary subject","key_points":["point1","point2"],"tone":"neutral reporting|investigative|promotional|opinion|analytical","target_audience":"who this is for"},"brand_impact":{"brands_mentioned":[{"name":"X","context":"how discussed","sentiment_toward":"positive|negative|neutral|mixed"}],"overall_brand_risk":"none|low|medium|high|critical","brand_opportunities":["opportunity"],"brand_threats":["threat"],"reputation_implications":"what this means for brands"},"reach_and_impact":{"estimated_reach":"audience estimate","virality_potential":"low|medium|high","virality_reasoning":"why","shareability_factors":["factor"]},"sentiment":{"label":"positive|negative|neutral|mixed","score":0.5,"confidence":80,"reasoning":"why"},"narratives":["narrative thread"],"claims":[{"text":"claim","category":"fact|opinion|allegation|statistic","verifiable":true}],"key_entities":[{"name":"entity","role":"their role","sentiment_toward":"positive|negative|neutral"}],"potential_impact":{"level":"low|medium|high|critical","reasoning":"why","affected_parties":["who"]},"regional_scope":{"primary_region":"region","relevant_regions":["region"],"is_global":false},"content_type":"news|opinion|analysis|press_release|blog|report|interview|other","publication_date":"ISO date or null","author":"name or null","reliability":{"score":70,"factors":["factor"],"source_type":"mainstream|independent|trade|social|unknown"},"recommended_actions":["action"]}`;
    const analysisUserPrompt = `Analyze this content from ${formattedUrl}:\n\nTitle: ${pageTitle}\nDescription: ${pageDescription}\n${paywallResult.is_paywalled ? `⚠️ PAYWALL (${paywallResult.paywall_type}): Content may be partial.` : ""}${socialContext}${mediaContext}\n\nContent:\n${contentForAI}`;

    let analysis: any = {};
    try {
      const raw = await aiChat([
        { role: "system", content: analysisSystemPrompt },
        { role: "user", content: analysisUserPrompt },
      ], true);
      const parsed = extractJson(raw);
      if (parsed) {
        analysis = parsed;
      } else {
        try { analysis = JSON.parse(raw); } catch {
          analysis = { summary: raw.slice(0, 500), error: "parse_error" };
        }
      }
      console.log("[ANALYZE-LINK] AI analysis keys:", Object.keys(analysis).join(", "));
    } catch (aiErr: any) {
      console.log("[ANALYZE-LINK] AI request failed:", aiErr.message);
      analysis = { summary: "AI analysis temporarily unavailable. Content was scraped successfully.", error: "ai_failed" };
    }

        const knownUnknown = {
      content_accessible: scrapeSuccess && markdown.length > 100,
      paywall_status: paywallResult.is_paywalled ? `Paywalled (${paywallResult.paywall_type})` : "Accessible",
      content_source: contentSource,
      js_blocked: jsBlocked,
      social_pickup_found: socialPickup.length > 0,
      media_pickup_found: mediaPickup.length > 0,
      twitter_connected: twitterConnected,
      reddit_connected: redditConnected,
      twitter_connection_needed: !twitterConnected,
      reddit_connection_needed: !redditConnected,
      content_length: markdown.length,
    };

    const result = {
      success: true,
      url: formattedUrl,
      title: pageTitle || analysis.headline || "Unknown",
      description: pageDescription,
      paywall: paywallResult,
      analysis,
      social_pickup: socialPickup,
      media_pickup: mediaPickup,
      similar_mentions: similarMentions,
      search_visibility: searchVisibility,
      search_discovery: searchDiscovery,
      data_confidence: knownUnknown,
      scanned_at: new Date().toISOString(),
    };

    console.log("[ANALYZE-LINK] Complete:", formattedUrl, `| Social: ${socialPickup.length} | Media: ${mediaPickup.length} | Similar: ${similarMentions.length} | SEO: ${searchVisibility?.is_indexed ?? "N/A"}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[ANALYZE-LINK] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
