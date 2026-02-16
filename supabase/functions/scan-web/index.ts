import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isBlockedOrErrorContent(text: string): boolean {
  const blockers = [
    "blocked by an extension", "enable javascript", "access denied",
    "403 forbidden", "captcha", "please verify you are a human",
    "cloudflare", "just a moment", "checking your browser", "ray id",
    "please turn javascript on", "this site requires javascript",
    "ERR_BLOCKED", "not available in your region", "error 403",
    "that's an error", "you do not have access", "skip navigation",
    "playback doesn't begin", "try restarting your device",
    "tap to unmute", "search with your voice",
    "page not found", "404 not found", "500 internal server error",
  ];
  const lower = text.toLowerCase();
  const matchCount = blockers.filter(b => lower.includes(b)).length;
  if (matchCount >= 2) return true;
  if (matchCount >= 1 && text.length < 200) return true;
  return false;
}

function cleanExtractedContent(raw: string): string {
  let text = raw;
  text = text.replace(/!\[.*?\]\(data:[^)]*\)/g, "");
  text = text.replace(/!\[.*?\]\([^)]*\)/g, "");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/data:image\/[^,]+,[^\s)]+/g, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[#*_~`>|]/g, "");
  text = text.replace(/[-=]{3,}/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  const boilerplateStarts = [
    /^skip to (content|main|navigation)\s*/i,
    /^(menu|navigation|home|about|contact|sign in|log in|subscribe)\s+(menu|navigation|home|about|contact|sign in|log in|subscribe|\s)*\s*/i,
    /^(cookie|privacy|we use cookies)[^.]*\.\s*/i,
  ];
  for (const pattern of boilerplateStarts) {
    text = text.replace(pattern, "");
  }

  return text.trim();
}

function classifySourceFromUrl(url: string): string {
  if (!url) return "news";
  const lower = url.toLowerCase();
  if (lower.includes("trustpilot.com")) return "trustpilot";
  if (lower.includes("g2.com")) return "g2";
  if (lower.includes("glassdoor.com")) return "glassdoor";
  if (lower.includes("capterra.com")) return "capterra";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "twitter";
  if (lower.includes("reddit.com")) return "reddit";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("facebook.com")) return "facebook";
  if (lower.includes("linkedin.com")) return "linkedin";
  if (lower.includes("t.me") || lower.includes("telegram")) return "telegram";
  if (lower.includes("medium.com") || lower.includes("substack.com") || lower.includes("blog")) return "blog";
  if (lower.includes("forum") || lower.includes("community") || lower.includes("discuss")) return "forum";
  if (lower.includes("news.google.com")) return "google-news";
  return "news";
}

// Extract publish date from Firecrawl metadata (HTML meta tags - reliable)
function extractDateFromMetadata(metadata: any): string | null {
  if (!metadata) return null;
  
  const dateFields = [
    metadata.publishedTime,
    metadata["article:published_time"],
    metadata["og:article:published_time"],
    metadata.datePublished,
    metadata["date"],
    metadata.modifiedTime,
    metadata["article:modified_time"],
    metadata["og:updated_time"],
    metadata["dcterms.date"],
    metadata["sailthru.date"],
    metadata["DC.date.issued"],
  ];

  for (const raw of dateFields) {
    if (!raw) continue;
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2015 && d.getTime() <= Date.now() + 86400000) {
        return d.toISOString();
      }
    } catch { /* skip */ }
  }

  return null;
}

// Extract publish date from article content text (fallback when metadata is missing)
function extractDateFromContent(text: string): string | null {
  if (!text || text.length < 20) return null;
  
  // Check the first ~800 chars where dates typically appear (byline/header area)
  const header = text.slice(0, 800);
  
  const monthNames = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
  
  const patterns = [
    // "December 15, 2025" or "Dec 15, 2025"
    new RegExp(`(${monthNames})\\s+(\\d{1,2}),?\\s+(20[12]\\d)`, "i"),
    // "15 December 2025"
    new RegExp(`(\\d{1,2})\\s+(${monthNames})\\s+(20[12]\\d)`, "i"),
    // "2025-12-15" or "2025/12/15"  
    /\b(20[12]\d)[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/,
    // "12/15/2025" or "12-15-2025"
    /\b(0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])[-/](20[12]\d)\b/,
    // "Published: Dec 2025", "Updated December 2025"
    new RegExp(`(?:Published|Updated|Posted|Date|Modified)[:\\s]+(${monthNames})\\s+(\\d{1,2}),?\\s+(20[12]\\d)`, "i"),
    // Relative dates in text: "2 days ago", "3 hours ago" etc.
    /(\d{1,2})\s+(hours?|days?|weeks?|months?)\s+ago/i,
  ];

  for (const pattern of patterns) {
    const match = header.match(pattern);
    if (match) {
      // Handle relative dates
      if (match[0].toLowerCase().includes("ago")) {
        const num = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const now = Date.now();
        let ms = 0;
        if (unit.startsWith("hour")) ms = num * 3600000;
        else if (unit.startsWith("day")) ms = num * 86400000;
        else if (unit.startsWith("week")) ms = num * 7 * 86400000;
        else if (unit.startsWith("month")) ms = num * 30 * 86400000;
        return new Date(now - ms).toISOString();
      }
      
      try {
        // Try parsing the matched date string
        const cleanedMatch = match[0].replace(/Published|Updated|Posted|Date|Modified|[:\\s]+/gi, " ").trim();
        const d = new Date(cleanedMatch);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2015 && d.getTime() <= Date.now() + 86400000) {
          return d.toISOString();
        }
        // Try joining capture groups
        const d2 = new Date(match.slice(1).join(" "));
        if (!isNaN(d2.getTime()) && d2.getFullYear() >= 2015 && d2.getTime() <= Date.now() + 86400000) {
          return d2.toISOString();
        }
      } catch { /* skip */ }
    }
  }

  return null;
}

// Also try to extract date from the URL itself (common pattern: /2025/12/15/)
function extractDateFromUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/(20[12]\d)\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\//);
  if (match) {
    try {
      const d = new Date(`${match[1]}-${match[2]}-${match[3]}`);
      if (!isNaN(d.getTime()) && d.getTime() <= Date.now() + 86400000) {
        return d.toISOString();
      }
    } catch { /* skip */ }
  }
  // Also try /2025/12/ without day
  const match2 = url.match(/\/(20[12]\d)\/(0[1-9]|1[0-2])\//);
  if (match2) {
    try {
      const d = new Date(`${match2[1]}-${match2[2]}-15`);
      if (!isNaN(d.getTime()) && d.getTime() <= Date.now() + 86400000) {
        return d.toISOString();
      }
    } catch { /* skip */ }
  }
  return null;
}

// Scan websites/news using Firecrawl search API
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { keywords, sites, limit, tbs, date_from, accept_undated } = await req.json();
    if (!keywords || keywords.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const query = keywords.join(" OR ");
    const siteFilter = sites?.length > 0 ? ` site:${sites.join(" OR site:")}` : "";
    const searchQuery = `${query}${siteFilter}`;

    console.log("Firecrawl search:", searchQuery, "tbs:", tbs, "limit:", limit);

    const searchBody: any = {
      query: searchQuery,
      limit: limit || 15,
      scrapeOptions: { formats: ["markdown"] },
    };

    if (tbs) {
      searchBody.tbs = tbs;
    }

    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchBody),
    });

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      const textResponse = await response.text();
      console.error("Expected JSON but got:", contentType, "Preview:", textResponse.substring(0, 200));
      return new Response(
        JSON.stringify({ success: false, error: `Firecrawl returned non-JSON response (status ${response.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("Firecrawl error:", data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Firecrawl error ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse date_from for secondary filtering
    const dateFromMs = date_from ? new Date(date_from).getTime() : 0;

    const results = (data.data || [])
      .map((item: any) => {
        const rawContent = item.markdown || item.description || "";
        const cleanedContent = cleanExtractedContent(rawContent);
        const url = item.url || "";
        const source = classifySourceFromUrl(url);

        if (isBlockedOrErrorContent(rawContent)) {
          console.log("Skipping blocked/error page:", url);
          return null;
        }

        if (cleanedContent.length < 40) {
          console.log("Skipping low-quality content:", url);
          return null;
        }

        // Extract publish date: try metadata → URL → content text
        const metadataDate = extractDateFromMetadata(item.metadata);
        const urlDate = !metadataDate ? extractDateFromUrl(url) : null;
        const contentDate = !metadataDate && !urlDate ? extractDateFromContent(rawContent) : null;
        const publishDate = metadataDate || urlDate || contentDate;
        const dateSource = metadataDate ? "metadata" : urlDate ? "url" : contentDate ? "content" : "none";
        
        // If we have a publish date AND a date_from filter, reject articles outside the range
        if (publishDate && dateFromMs > 0) {
          const publishedMs = new Date(publishDate).getTime();
          if (publishedMs < dateFromMs) {
            console.log("Filtering out-of-range article:", url, "published:", publishDate, "date_from:", date_from);
            return null;
          }
        }
        
        // CHANGED: Accept undated articles when accept_undated is true (default behavior now)
        // Mark them with date_verified: false so the UI can show a badge
        const shouldAcceptUndated = accept_undated !== false; // default true
        if (!publishDate && dateFromMs > 0 && !shouldAcceptUndated) {
          console.log("Filtering undated article (can't verify recency):", url);
          return null;
        }

        return {
          source,
          content: cleanedContent.slice(0, 800),
          title: item.title || "",
          url,
          author_name: (() => {
            try { return new URL(url).hostname.replace("www.", ""); } catch { return "unknown"; }
          })(),
          posted_at: publishDate,
          date_verified: !!publishDate,
          date_source: dateSource,
          matched_query: keywords.join(", "),
        };
      })
      .filter(Boolean);

    return new Response(
      JSON.stringify({ success: true, results, query_used: searchQuery }),
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
