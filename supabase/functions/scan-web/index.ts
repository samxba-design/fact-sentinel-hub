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

// Use Lovable AI (Gemini) as a grounded search discovery engine
// Gemini has access to web search via grounding and returns cited results
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: "LOVABLE_API_KEY not configured" }),
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

    const maxResults = Math.min(limit || 15, 30);
    const queryTerms = keywords.join(", ");
    
    // Build date context for the prompt
    const now = new Date();
    const currentDate = now.toISOString().split("T")[0];
    let dateContext = `today is ${currentDate}.`;
    if (date_from) {
      dateContext += ` Only include articles published after ${date_from}.`;
    }
    if (date_to) {
      dateContext += ` Only include articles published before ${date_to}.`;
    }
    if (!date_from) {
      // Default to last 7 days
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
      dateContext += ` Focus on the last 7 days (since ${weekAgo}).`;
    }

    // Build site restriction context
    let siteContext = "";
    if (sites?.length > 0) {
      siteContext = `\nPrioritize results from these domains: ${sites.join(", ")}. But also include other credible news sources.`;
    }

    // Determine search focus based on search_type
    let searchFocus = "";
    if (search_type === "risk") {
      searchFocus = `Focus on NEGATIVE coverage: lawsuits, controversies, regulatory actions, security breaches, customer complaints, executive scandals, data leaks, fraud allegations, boycotts, or any reputational threats.`;
    } else if (search_type === "social") {
      searchFocus = `Focus on social media discussions, viral posts, trending opinions, and community sentiment.`;
    } else {
      searchFocus = `Find the most important and recent news stories, developments, and public discussions.`;
    }

    const systemPrompt = `You are a real-time news intelligence researcher. Your job is to find REAL, RECENT, SPECIFIC news articles and reports about the given topics.

CRITICAL RULES:
1. Every result MUST be a REAL article that EXISTS on the internet right now. Do NOT fabricate or hallucinate URLs or articles.
2. Every result MUST have a REAL, working URL from a credible source.
3. Every result MUST describe a SPECIFIC recent event, not a generic company description.
4. Do NOT include: Wikipedia pages, encyclopedia entries, "What is X" explainers, app store listings, help docs, tutorials, company "About" pages, or product marketing pages.
5. ${dateContext}
6. ${searchFocus}${siteContext}

For each article found, provide:
- title: the actual article headline
- url: the real, full URL of the article  
- published_date: the publication date in ISO format (YYYY-MM-DD) if known, or null
- source_domain: the domain name (e.g. "reuters.com")
- summary: 2-3 sentence summary of WHAT specifically happened, focusing on facts
- relevance_note: why this is relevant to the search terms

Return EXACTLY this JSON format:
{ "results": [ { "title": "...", "url": "...", "published_date": "...", "source_domain": "...", "summary": "...", "relevance_note": "..." } ] }

Find up to ${maxResults} results. Quality over quantity — only include articles you are confident are real and recent. Return ONLY valid JSON, no markdown.`;

    const userPrompt = `Find recent news and coverage about: ${queryTerms}

Search for real articles published recently. I need actual news stories with real URLs.`;

    console.log("Gemini discovery search for:", queryTerms, "type:", search_type || "general");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Gemini discovery error:", aiRes.status, errText);
      
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "AI rate limit exceeded, try again shortly" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: `AI discovery failed (${aiRes.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiRes.json();
    let rawContent = aiData.choices?.[0]?.message?.content || "{}";
    rawContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let discoveredArticles: any[] = [];
    try {
      const parsed = JSON.parse(rawContent);
      discoveredArticles = parsed.results || [];
    } catch (e) {
      console.error("Failed to parse Gemini discovery results:", e, "raw:", rawContent.slice(0, 500));
      return new Response(
        JSON.stringify({ success: false, error: "Failed to parse discovery results", results: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Now optionally use Firecrawl to deep-scrape the discovered URLs for richer content
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    
    // Convert discovered articles to scan results format
    const results = [];
    
    // If we have Firecrawl, scrape top URLs for better content; otherwise use Gemini summaries
    if (firecrawlKey && discoveredArticles.length > 0) {
      // Scrape top articles in parallel for richer content (limit to avoid timeouts)
      const urlsToScrape = discoveredArticles.slice(0, 10).map(a => a.url).filter(Boolean);
      
      if (urlsToScrape.length > 0) {
        console.log("Deep-scraping", urlsToScrape.length, "discovered URLs via Firecrawl");
        
        // Scrape in parallel batches
        const scrapePromises = urlsToScrape.map(async (url: string) => {
          try {
            const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${firecrawlKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url,
                formats: ["markdown"],
                onlyMainContent: true,
                timeout: 15000,
              }),
            });
            if (scrapeRes.ok) {
              const scrapeData = await scrapeRes.json();
              return { url, content: scrapeData.data?.markdown || null, metadata: scrapeData.data?.metadata || null };
            }
            return { url, content: null, metadata: null };
          } catch {
            return { url, content: null, metadata: null };
          }
        });
        
        const scrapeResults = await Promise.all(scrapePromises);
        const scrapeMap = new Map(scrapeResults.map(s => [s.url, s]));
        
        for (const article of discoveredArticles) {
          const scraped = scrapeMap.get(article.url);
          let content = article.summary || "";
          let postedAt = article.published_date || null;
          
          if (scraped?.content) {
            // Clean and use scraped content (richer than AI summary)
            let scrapedText = scraped.content;
            scrapedText = scrapedText.replace(/!\[.*?\]\([^)]*\)/g, "");
            scrapedText = scrapedText.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
            scrapedText = scrapedText.replace(/<[^>]+>/g, " ");
            scrapedText = scrapedText.replace(/[#*_~`>|]/g, "");
            scrapedText = scrapedText.replace(/\s+/g, " ").trim();
            if (scrapedText.length > 60) {
              content = scrapedText.slice(0, 800);
            }
            
            // Try to get better date from metadata
            if (!postedAt && scraped.metadata) {
              const meta = scraped.metadata;
              const dateFields = [meta.publishedTime, meta["article:published_time"], meta.datePublished, meta["date"]];
              for (const raw of dateFields) {
                if (!raw) continue;
                try {
                  const d = new Date(raw);
                  if (!isNaN(d.getTime()) && d.getFullYear() >= 2015) {
                    postedAt = d.toISOString();
                    break;
                  }
                } catch { /* skip */ }
              }
            }
          }

          if (postedAt && !postedAt.includes("T")) {
            postedAt = new Date(postedAt + "T00:00:00Z").toISOString();
          }
          
          results.push({
            source: classifySourceFromUrl(article.url || ""),
            content,
            title: article.title || "",
            url: article.url || "",
            author_name: article.source_domain || (() => {
              try { return new URL(article.url).hostname.replace("www.", ""); } catch { return "unknown"; }
            })(),
            posted_at: postedAt,
            date_verified: !!postedAt,
            date_source: postedAt ? "metadata" : "none",
            matched_query: queryTerms,
          });
        }
      }
    }
    
    // Fallback: if no Firecrawl or no scrape results, use Gemini summaries directly
    if (results.length === 0) {
      for (const article of discoveredArticles) {
        let postedAt = article.published_date || null;
        if (postedAt && !postedAt.includes("T")) {
          postedAt = new Date(postedAt + "T00:00:00Z").toISOString();
        }
        
        results.push({
          source: classifySourceFromUrl(article.url || ""),
          content: article.summary || "",
          title: article.title || "",
          url: article.url || "",
          author_name: article.source_domain || "unknown",
          posted_at: postedAt,
          date_verified: !!postedAt,
          date_source: postedAt ? "ai" : "none",
          matched_query: queryTerms,
        });
      }
    }

    console.log(`Gemini discovery: found ${discoveredArticles.length} articles, returned ${results.length} results`);

    return new Response(
      JSON.stringify({ success: true, results, query_used: queryTerms, discovery_engine: "gemini" }),
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
