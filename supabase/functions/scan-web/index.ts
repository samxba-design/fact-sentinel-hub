import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (lower.includes("medium.com") || lower.includes("substack.com") || lower.includes("blog")) return "blog";
  if (lower.includes("forum") || lower.includes("community") || lower.includes("discuss")) return "forum";
  return "news";
}

// Evergreen/reference domains to auto-reject
const BLOCK_DOMAINS = new Set([
  "en.wikipedia.org", "wikipedia.org", "investopedia.com", "www.investopedia.com",
  "help.wealthsimple.com", "apps.apple.com", "play.google.com",
  "ca.investing.com", "investing.com", "support.google.com", "support.apple.com",
  "howstuffworks.com", "about.com", "dictionary.com", "merriam-webster.com",
  "britannica.com", "www.britannica.com", "corporatefinanceinstitute.com",
  "nerdwallet.com", "bankrate.com", "academy.binance.com",
]);

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace("www.", "").toLowerCase();
    return BLOCK_DOMAINS.has(hostname);
  } catch { return false; }
}

// Clean scraped content
function cleanContent(raw: string): string {
  let text = raw;
  text = text.replace(/!\[.*?\]\([^)]*\)/g, "");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[#*_~`>|]/g, "");
  text = text.replace(/[-=]{3,}/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/^skip to (content|main|navigation)\s*/i, "");
  text = text.replace(/(?:^|\s)(?:[A-Z][a-zA-Z&]{0,20}\s*-\s*){2,}[A-Z][a-zA-Z&]{0,20}(?:\s|$)/g, " ");
  text = text.replace(/\b[A-Z]{2,5}\s+\$[\d,]+\.?\d*\s+[\d.]+%\s*/g, "");
  text = text.replace(/\b(cookie|privacy) (policy|notice|settings)\b[^.]*\./gi, " ");
  text = text.replace(/©\s*\d{4}[^.]*\./g, " ");
  text = text.replace(/all rights reserved[^.]*\.?/gi, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

// Extract publish date from Firecrawl metadata
function extractDate(metadata: any, url: string, content: string): { date: string | null; source: string } {
  // 1. Metadata
  if (metadata) {
    const fields = [
      metadata.publishedTime, metadata["article:published_time"],
      metadata["og:article:published_time"], metadata.datePublished,
      metadata["date"], metadata.modifiedTime, metadata["article:modified_time"],
    ];
    for (const raw of fields) {
      if (!raw) continue;
      try {
        const d = new Date(raw);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2015 && d.getTime() <= Date.now() + 86400000) {
          return { date: d.toISOString(), source: "metadata" };
        }
      } catch { /* skip */ }
    }
  }
  // 2. URL pattern /2025/02/16/
  if (url) {
    const m = url.match(/\/(20[12]\d)\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\//);
    if (m) {
      try {
        const d = new Date(`${m[1]}-${m[2]}-${m[3]}`);
        if (!isNaN(d.getTime())) return { date: d.toISOString(), source: "url" };
      } catch { /* skip */ }
    }
  }
  // 3. Content text (first 500 chars)
  if (content) {
    const header = content.slice(0, 500);
    const relMatch = header.match(/(\d{1,2})\s+(hours?|days?|weeks?)\s+ago/i);
    if (relMatch) {
      const num = parseInt(relMatch[1]);
      const unit = relMatch[2].toLowerCase();
      let ms = 0;
      if (unit.startsWith("hour")) ms = num * 3600000;
      else if (unit.startsWith("day")) ms = num * 86400000;
      else if (unit.startsWith("week")) ms = num * 7 * 86400000;
      return { date: new Date(Date.now() - ms).toISOString(), source: "content" };
    }
  }
  return { date: null, source: "none" };
}

// Two-layer approach:
// Layer 1: Firecrawl SEARCH for real URLs + content (the search engine)
// Layer 2: Post-processing to clean/filter (done here + AI relevance in run-scan)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { keywords, sites, limit, date_from, date_to, search_type } = await req.json();
    if (!keywords || keywords.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build smart search queries based on search_type
    const maxResults = Math.min(limit || 15, 30);
    let searchQueries: string[] = [];

    if (search_type === "risk") {
      // Threat-focused: each keyword pair gets its own search
      searchQueries = keywords.map((k: string) => `${k} latest news`);
    } else if (search_type === "social") {
      searchQueries = keywords.map((k: string) => k);
    } else {
      // General: combine with OR
      searchQueries = [keywords.map((k: string) => `"${k}"`).join(" OR ") + " latest news"];
    }

    // Add site filters if provided
    const siteFilter = sites?.length > 0 ? ` site:${sites.join(" OR site:")}` : "";

    // Calculate time filter from date_from
    let tbs: string | undefined;
    if (date_from) {
      const diffMs = Date.now() - new Date(date_from).getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays <= 1) tbs = "qdr:d";
      else if (diffDays <= 7) tbs = "qdr:w";
      else if (diffDays <= 30) tbs = "qdr:m";
      else if (diffDays <= 365) tbs = "qdr:y";
    } else {
      tbs = "qdr:w"; // Default to last week
    }

    const dateFromMs = date_from ? new Date(date_from).getTime() : 0;
    const dateToMs = date_to ? new Date(date_to).getTime() : 0;

    // Run all search queries in parallel
    const allResults: any[] = [];
    const perQueryLimit = Math.ceil(maxResults / searchQueries.length);

    console.log(`Firecrawl search: ${searchQueries.length} queries, tbs=${tbs}, limit=${perQueryLimit} each`);

    const searchPromises = searchQueries.map(async (query) => {
      const fullQuery = `${query}${siteFilter}`;
      try {
        const response = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: fullQuery,
            limit: perQueryLimit,
            tbs,
            scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
          }),
        });

        const contentType = response.headers.get("content-type");
        if (!contentType?.includes("application/json")) {
          console.error("Firecrawl non-JSON response for:", fullQuery);
          return [];
        }

        const data = await response.json();
        if (!response.ok) {
          console.error("Firecrawl error:", data.error || response.status, "for:", fullQuery);
          return [];
        }

        return (data.data || []).map((item: any) => ({ ...item, _query: fullQuery }));
      } catch (e: any) {
        console.error("Firecrawl fetch error:", e.message, "for:", fullQuery);
        return [];
      }
    });

    const queryResults = await Promise.all(searchPromises);
    for (const batch of queryResults) {
      allResults.push(...batch);
    }

    // Process and filter results
    const seenUrls = new Set<string>();
    const results: any[] = [];

    for (const item of allResults) {
      const url = item.url || "";
      const rawContent = item.markdown || item.description || "";

      // Skip blocked domains
      if (isBlockedDomain(url)) {
        console.log("Blocked domain:", url);
        continue;
      }

      // Deduplicate
      const normalizedUrl = url.toLowerCase().replace(/\/$/, "");
      if (seenUrls.has(normalizedUrl)) continue;
      seenUrls.add(normalizedUrl);

      // Clean content
      const cleaned = cleanContent(rawContent);
      if (cleaned.length < 50) {
        console.log("Too short:", url);
        continue;
      }

      // Extract date
      const { date: publishDate, source: dateSource } = extractDate(item.metadata, url, rawContent);

      // Date range filtering
      if (publishDate && dateFromMs > 0) {
        const pubMs = new Date(publishDate).getTime();
        if (pubMs < dateFromMs) {
          console.log("Out of date range:", url, publishDate);
          continue;
        }
      }
      if (publishDate && dateToMs > 0) {
        const pubMs = new Date(publishDate).getTime();
        if (pubMs > dateToMs) continue;
      }

      results.push({
        source: classifySourceFromUrl(url),
        content: cleaned.slice(0, 800),
        title: item.title || "",
        url,
        author_name: (() => {
          try { return new URL(url).hostname.replace("www.", ""); } catch { return "unknown"; }
        })(),
        posted_at: publishDate,
        date_verified: !!publishDate,
        date_source: dateSource,
        matched_query: item._query || keywords.join(", "),
      });
    }

    console.log(`Firecrawl: ${allResults.length} raw → ${results.length} after filtering`);

    return new Response(
      JSON.stringify({ success: true, results, query_used: searchQueries.join(" | "), discovery_engine: "firecrawl" }),
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
