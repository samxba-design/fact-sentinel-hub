import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Scan review sites (Trustpilot, G2, Glassdoor) using Firecrawl
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

    const { keywords, review_urls, limit } = await req.json();

    const results: any[] = [];

    // Strategy 1: Search review sites by keywords
    if (keywords?.length > 0) {
      const reviewSites = [
        "site:trustpilot.com",
        "site:g2.com",
        "site:glassdoor.com",
        "site:capterra.com",
      ];

      const query = `(${keywords.join(" OR ")}) (${reviewSites.join(" OR ")})`;

      console.log("Review site search:", query);

      const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: limit || 10,
          scrapeOptions: { formats: ["markdown"] },
        }),
      });

      const searchData = await searchRes.json();
      if (searchRes.ok && searchData.data) {
        for (const item of searchData.data) {
          const url = item.url || "";
          let platform = "review";
          if (url.includes("trustpilot.com")) platform = "trustpilot";
          else if (url.includes("g2.com")) platform = "g2";
          else if (url.includes("glassdoor.com")) platform = "glassdoor";
          else if (url.includes("capterra.com")) platform = "capterra";

          results.push({
            source: platform,
            content: item.markdown?.slice(0, 600) || item.description || "",
            title: item.title || "",
            url,
            author_name: platform.charAt(0).toUpperCase() + platform.slice(1),
            posted_at: new Date().toISOString(),
            metrics: {},
          });
        }
      }
    }

    // Strategy 2: Scrape specific review URLs if provided
    if (review_urls?.length > 0) {
      for (const url of review_urls.slice(0, 5)) {
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
            }),
          });

          const scrapeData = await scrapeRes.json();
          if (scrapeRes.ok) {
            const content = scrapeData.data?.markdown || scrapeData.markdown || "";
            let platform = "review";
            if (url.includes("trustpilot.com")) platform = "trustpilot";
            else if (url.includes("g2.com")) platform = "g2";
            else if (url.includes("glassdoor.com")) platform = "glassdoor";
            else if (url.includes("capterra.com")) platform = "capterra";

            results.push({
              source: platform,
              content: content.slice(0, 600),
              title: scrapeData.data?.metadata?.title || scrapeData.metadata?.title || "",
              url,
              author_name: platform.charAt(0).toUpperCase() + platform.slice(1),
              posted_at: new Date().toISOString(),
              metrics: {},
            });
          }
        } catch (e) {
          console.error(`Scrape failed for ${url}:`, e);
        }
      }
    }

    console.log(`Review scan complete: ${results.length} results`);
    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("scan-reviews error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
