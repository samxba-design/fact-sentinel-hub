import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Paywall indicators in HTML/content
const PAYWALL_INDICATORS = [
  "subscribe to read", "subscribers only", "premium content", "paywall",
  "sign in to continue reading", "this article is for subscribers",
  "to continue reading", "unlock this article", "membership required",
  "create a free account to continue", "already a subscriber",
  "exclusive to subscribers", "premium article", "paid content",
  "meter has been exhausted", "you've reached your limit",
  "free articles remaining", "register to continue",
];

function detectPaywall(content: string, html?: string): { is_paywalled: boolean; paywall_type: string | null } {
  const lower = (content + " " + (html || "")).toLowerCase();
  for (const indicator of PAYWALL_INDICATORS) {
    if (lower.includes(indicator)) {
      // Determine type
      if (lower.includes("subscribe") || lower.includes("subscription")) return { is_paywalled: true, paywall_type: "subscription" };
      if (lower.includes("register") || lower.includes("sign in") || lower.includes("free account")) return { is_paywalled: true, paywall_type: "registration" };
      if (lower.includes("meter") || lower.includes("limit") || lower.includes("remaining")) return { is_paywalled: true, paywall_type: "metered" };
      return { is_paywalled: true, paywall_type: "hard" };
    }
  }
  // Check for very short content from known paywall sites
  if (content.length < 200 && (lower.includes("vanity fair") || lower.includes("new york times") || lower.includes("wall street journal") || lower.includes("financial times") || lower.includes("washington post") || lower.includes("the athletic"))) {
    return { is_paywalled: true, paywall_type: "likely" };
  }
  return { is_paywalled: false, paywall_type: null };
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
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { url, org_id } = await req.json();
    if (!url) throw new Error("URL is required");

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log("[ANALYZE-LINK] Scraping URL:", formattedUrl);

    // Step 1: Scrape the page with Firecrawl
    let markdown = "";
    let html = "";
    let pageTitle = "";
    let pageDescription = "";
    let pageLinks: string[] = [];
    let scrapeSuccess = false;

    if (firecrawlKey) {
      try {
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: formattedUrl,
            formats: ["markdown", "html", "links"],
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
          pageLinks = (d.links || []).slice(0, 50);
          scrapeSuccess = true;
        }
      } catch (e: any) {
        console.log("[ANALYZE-LINK] Firecrawl scrape failed, falling back:", e.message);
      }
    }

    // Fallback: use fetch directly
    if (!scrapeSuccess) {
      try {
        const res = await fetch(formattedUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SentiWatch/1.0)" },
          redirect: "follow",
        });
        const rawHtml = await res.text();
        // Extract title
        const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
        pageTitle = titleMatch?.[1] || "";
        // Extract meta description
        const descMatch = rawHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        pageDescription = descMatch?.[1] || "";
        // Strip HTML for basic content
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

    // Step 2: Paywall detection
    const paywallResult = detectPaywall(markdown, html);

    // Step 3: Search for social pickup / media coverage
    let socialPickup: any[] = [];
    let mediaPickup: any[] = [];
    
    if (firecrawlKey) {
      // Search for social sharing of this URL
      const domain = new URL(formattedUrl).hostname.replace("www.", "");
      const pathSlug = new URL(formattedUrl).pathname.split("/").filter(Boolean).pop() || "";
      const searchQuery = `${pageTitle || pathSlug} ${domain}`;
      
      try {
        const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 15,
            tbs: "qdr:m", // last month
          }),
        });
        const searchData = await searchRes.json();
        if (searchData.success && searchData.data) {
          for (const result of searchData.data) {
            const resUrl = (result.url || "").toLowerCase();
            if (resUrl === formattedUrl.toLowerCase()) continue; // skip self
            
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
        }
      } catch (e: any) {
        console.log("[ANALYZE-LINK] Social search failed:", e.message);
      }
    }

    // Step 4: AI Analysis with Gemini
    const contentForAI = markdown.slice(0, 4000);
    const socialContext = socialPickup.length > 0
      ? `\n\nSocial pickup found on: ${socialPickup.map(s => `${s.platform} (${s.title})`).join(", ")}`
      : "\n\nNo social pickup found yet.";
    const mediaContext = mediaPickup.length > 0
      ? `\nMedia coverage: ${mediaPickup.map(m => `${m.domain}: ${m.title}`).join(", ")}`
      : "\nNo additional media coverage found.";

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
          {
            role: "system",
            content: `You are a media intelligence analyst. Analyze the given article/content and return a JSON report. Be precise and factual. If information is unknown, explicitly say "Unknown" or "Could not determine". Never fabricate data.

Return valid JSON with this structure:
{
  "headline": "string - main headline or title",
  "summary": "string - 3-4 sentence summary of the content",
  "sentiment": { "label": "positive|negative|neutral|mixed", "score": -1.0 to 1.0, "confidence": 0-100, "reasoning": "why this sentiment" },
  "narratives": ["string - key narrative threads identified"],
  "claims": [{ "text": "specific factual claim", "category": "fact|opinion|allegation|statistic", "verifiable": true/false }],
  "key_entities": [{ "name": "person/org name", "role": "their role in the story", "sentiment_toward": "positive|negative|neutral" }],
  "potential_impact": { "level": "low|medium|high|critical", "reasoning": "why this impact level", "affected_parties": ["who is affected"] },
  "regional_scope": { "primary_region": "country/region or Global", "relevant_regions": ["list of regions where this matters"], "is_global": true/false },
  "content_type": "news|opinion|analysis|press_release|social_post|blog|report|other",
  "publication_date": "ISO date if detectable or null",
  "author": "author name if detectable or null",
  "reliability": { "score": 0-100, "factors": ["what affects reliability"], "source_type": "mainstream|independent|social|unknown" },
  "social_sharing_assessment": "string - assessment of social spread potential and current sharing activity",
  "recommended_actions": ["string - what should be done about this content"]
}`,
          },
          {
            role: "user",
            content: `Analyze this content from ${formattedUrl}:

Title: ${pageTitle}
Description: ${pageDescription}
${paywallResult.is_paywalled ? `⚠️ PAYWALL DETECTED (${paywallResult.paywall_type}): Content may be partial.` : ""}
${socialContext}
${mediaContext}

Content:
${contentForAI}`,
          },
        ],
      }),
    });

    let analysis: any = {};
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const raw = aiData.choices?.[0]?.message?.content || "";
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
      } catch {
        analysis = { summary: raw, error: "Could not parse structured analysis" };
      }
    }

    // Determine what we know vs don't know
    const knownUnknown = {
      content_accessible: scrapeSuccess && markdown.length > 100,
      paywall_status: paywallResult.is_paywalled ? `Paywalled (${paywallResult.paywall_type})` : "Accessible",
      social_pickup_found: socialPickup.length > 0,
      media_pickup_found: mediaPickup.length > 0,
      twitter_data_available: socialPickup.some(s => s.platform === "twitter"),
      twitter_connection_needed: !socialPickup.some(s => s.platform === "twitter"),
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
      data_confidence: knownUnknown,
      scanned_at: new Date().toISOString(),
    };

    console.log("[ANALYZE-LINK] Analysis complete for:", formattedUrl);

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
