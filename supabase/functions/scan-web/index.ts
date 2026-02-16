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
  // Remove markdown images with data URIs
  text = text.replace(/!\[.*?\]\(data:[^)]*\)/g, "");
  text = text.replace(/!\[.*?\]\([^)]*\)/g, "");
  // Remove markdown links but keep link text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Remove raw URLs
  text = text.replace(/https?:\/\/\S+/g, "");
  // Remove SVG/data URI fragments
  text = text.replace(/data:image\/[^,]+,[^\s)]+/g, "");
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Remove markdown formatting
  text = text.replace(/[#*_~`>|]/g, "");
  // Remove repeated dashes/equals
  text = text.replace(/[-=]{3,}/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Strip common leading boilerplate phrases
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
  return "news";
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

    const { keywords, sites, limit, tbs } = await req.json();
    if (!keywords || keywords.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const query = keywords.join(" OR ");
    const siteFilter = sites?.length > 0 ? ` site:${sites.join(" OR site:")}` : "";
    const searchQuery = `${query}${siteFilter}`;

    console.log("Firecrawl search:", searchQuery, "tbs:", tbs);

    const searchBody: any = {
      query: searchQuery,
      limit: limit || 10,
      scrapeOptions: { formats: ["markdown"] },
    };

    // Apply time-based search filter
    // tbs values: 'qdr:d' (day), 'qdr:w' (week), 'qdr:m' (month)
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

        return {
          source,
          content: cleanedContent.slice(0, 800),
          title: item.title || "",
          url,
          author_name: (() => {
            try { return new URL(url).hostname.replace("www.", ""); } catch { return "unknown"; }
          })(),
          // Web-scraped dates are unreliable - set to null so UI shows "Unknown"
          // Firecrawl's tbs parameter already handles time filtering
          posted_at: null,
        };
      })
      .filter(Boolean);

    return new Response(
      JSON.stringify({ success: true, results }),
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
