import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  return text;
}

function isBlockedOrErrorContent(text: string): boolean {
  const blockers = [
    "blocked by an extension", "enable javascript", "access denied",
    "403 forbidden", "captcha", "please verify you are a human",
    "cloudflare", "just a moment", "checking your browser", "ray id",
  ];
  const lower = text.toLowerCase();
  return blockers.some(b => lower.includes(b));
}

function classifyStore(url: string): string {
  if (!url) return "app-store";
  const lower = url.toLowerCase();
  if (lower.includes("apps.apple.com")) return "apple-app-store";
  if (lower.includes("play.google.com")) return "google-play";
  return "app-store";
}

// Scan Apple App Store and Google Play reviews using Firecrawl
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

    const { keywords, app_urls, limit } = await req.json();
    const results: any[] = [];

    // Strategy 1: Search app stores by keywords
    if (keywords?.length > 0) {
      const storeQueries = [
        `(${keywords.join(" OR ")}) site:apps.apple.com reviews`,
        `(${keywords.join(" OR ")}) site:play.google.com reviews`,
      ];

      for (const query of storeQueries) {
        try {
          console.log("App store search:", query);
          const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query,
              limit: limit || 8,
              scrapeOptions: { formats: ["markdown"] },
            }),
          });

          const ct = searchRes.headers.get("content-type");
          if (!ct?.includes("application/json")) continue;

          const searchData = await searchRes.json();
          if (searchRes.ok && searchData.data) {
            for (const item of searchData.data) {
              const url = item.url || "";
              const rawContent = item.markdown || item.description || "";
              if (isBlockedOrErrorContent(rawContent)) continue;

              const cleaned = cleanExtractedContent(rawContent);
              if (cleaned.length < 40) continue;

              results.push({
                source: classifyStore(url),
                content: cleaned.slice(0, 600),
                title: item.title || "",
                url,
                author_name: (() => {
                  try { return new URL(url).hostname.replace("www.", ""); } catch { return "app-store"; }
                })(),
                posted_at: null,
                metrics: {},
              });
            }
          }
        } catch (e) {
          console.error("App store search failed:", e);
        }
      }
    }

    // Strategy 2: Scrape specific app URLs if provided
    if (app_urls?.length > 0) {
      for (const url of app_urls.slice(0, 5)) {
        try {
          const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url,
              formats: ["markdown"],
              onlyMainContent: true,
              waitFor: 3000,
            }),
          });

          const ct = scrapeRes.headers.get("content-type");
          if (!ct?.includes("application/json")) continue;

          const scrapeData = await scrapeRes.json();
          if (scrapeRes.ok) {
            const rawContent = scrapeData.data?.markdown || scrapeData.markdown || "";
            if (isBlockedOrErrorContent(rawContent)) continue;

            const cleaned = cleanExtractedContent(rawContent);
            if (cleaned.length < 40) continue;

            results.push({
              source: classifyStore(url),
              content: cleaned.slice(0, 600),
              title: scrapeData.data?.metadata?.title || scrapeData.metadata?.title || "",
              url,
              author_name: (() => {
                try { return new URL(url).hostname.replace("www.", ""); } catch { return "app-store"; }
              })(),
              posted_at: null,
              metrics: {},
            });
          }
        } catch (e) {
          console.error(`Scrape failed for ${url}:`, e);
        }
      }
    }

    console.log(`App store scan complete: ${results.length} results`);
    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("scan-app-store error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
