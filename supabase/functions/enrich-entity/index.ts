import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_PATTERNS: Record<string, RegExp[]> = {
  twitter:   [/twitter\.com\/(@?[\w]+)/, /x\.com\/(@?[\w]+)/],
  youtube:   [/youtube\.com\/(@[\w-]+|channel\/[\w-]+|c\/[\w-]+|user\/[\w-]+)/],
  reddit:    [/reddit\.com\/(r\/[\w-]+|u\/[\w-]+)/],
  instagram: [/instagram\.com\/([\w._]+)/],
  tiktok:    [/tiktok\.com\/@([\w._]+)/],
  telegram:  [/t\.me\/([\w_]+)/],
  substack:  [/([\w-]+)\.substack\.com/],
  linkedin:  [/linkedin\.com\/(in\/[\w-]+|company\/[\w-]+)/],
  discord:   [/discord\.(gg|com\/invite)\/([\w-]+)/],
};

function detectPlatform(url: string): { platform: string; handle: string | null } {
  if (!url) return { platform: "unknown", handle: null };
  const lower = url.toLowerCase();
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    for (const re of patterns) {
      const m = lower.match(re);
      if (m) return { platform, handle: m[1] || null };
    }
  }
  if (lower.startsWith("http")) return { platform: "website", handle: null };
  return { platform: "unknown", handle: null };
}

async function scrapeWithFirecrawl(url: string, firecrawlKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data?.data?.markdown || data?.markdown || "";
  } catch {
    return "";
  }
}

async function analyzeWithAI(content: string, url: string, platform: string, lovableKey: string): Promise<any> {
  const prompt = `You are an intelligence analyst. Given this content scraped from ${platform} (${url}), extract entity profile information.

SCRAPED CONTENT:
${content.slice(0, 4000)}

Return a JSON object with these fields (null if not found, confidence 0-1 for each):
{
  "display_name": string | null,
  "handle": string | null,
  "bio": string | null,
  "follower_count": number | null,
  "following_count": number | null,
  "verified": boolean | null,
  "location": string | null,
  "language": string | null,
  "website_in_bio": string | null,
  "account_created_at": string | null,
  "detected_topics": string[],
  "engagement_pattern": string | null,
  "recent_posts": [{"text": string, "url": string | null}],
  "source_type": "official_brand"|"media"|"journalist"|"influencer"|"customer"|"anonymous"|"activist"|"competitor"|"scam"|"impersonator"|"bot"|"community"|"executive"|"regulator"|"unknown",
  "risk_type": "none"|"misleading"|"false_info"|"malicious"|"impersonation"|"scam_fraud"|"phishing"|"harassment"|"coordinated_attack"|"legal_regulatory"|"suspicious",
  "intent_type": "inform"|"criticize"|"satirize"|"influence"|"promote"|"scam"|"impersonate"|"harass"|"organize"|"spread_political"|"manipulate_market"|"damage_reputation"|"unknown",
  "credibility": "trusted"|"generally_credible"|"mixed"|"low"|"unverified"|"suspicious"|"known_malicious"|"known_scam",
  "risk_flags": {
    "possible_impersonation": boolean,
    "possible_impersonation_reason": string | null,
    "typosquatting": boolean,
    "typosquatting_reason": string | null,
    "fake_giveaway_language": boolean,
    "suspicious_outbound_links": boolean,
    "engagement_mismatch": boolean,
    "high_posting_cadence": boolean,
    "bot_like_behavior": boolean,
    "support_scam_indicators": boolean,
    "coordinated_activity": boolean,
    "copycat_visuals": boolean
  },
  "ai_confidence": number,
  "enrichment_confidence": {
    "display_name": number,
    "bio": number,
    "follower_count": number,
    "source_type": number,
    "risk_type": number
  },
  "suggested_tags": string[],
  "why_flagged": string[]
}
Return only valid JSON, no markdown.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

async function heuristicEnrichment(url: string, platform: string, handle: string | null): Promise<any> {
  // Basic heuristic risk flags without AI
  const flags: Record<string, any> = {};
  const lowerHandle = (handle || "").toLowerCase();
  const lowerUrl = (url || "").toLowerCase();

  // Typosquatting heuristics
  const brandKeywords = ["binance", "coinbase", "ethereum", "bitcoin", "support", "official", "help", "wallet"];
  const hasBrandKw = brandKeywords.some(k => lowerHandle.includes(k));
  flags.possible_impersonation = hasBrandKw;
  flags.possible_impersonation_reason = hasBrandKw ? `Handle contains brand/support keyword: "${lowerHandle}"` : null;

  const supScam = ["support", "help", "recovery", "wallet", "airdrop", "giveaway", "official", "admin"].some(k => lowerHandle.includes(k));
  flags.support_scam_indicators = supScam;
  flags.typosquatting = false;

  return {
    risk_flags: flags,
    suggested_tags: hasBrandKw ? ["possible-impersonation", "manual-review-needed"] : [],
    why_flagged: hasBrandKw ? [`Handle "${handle}" resembles a support/brand account`] : [],
    ai_confidence: 0.3,
    enrichment_confidence: { display_name: 0.1, bio: 0.1, follower_count: 0.1, source_type: 0.3, risk_type: 0.3 },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await anonClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { entity_id, url, platform: inputPlatform, handle: inputHandle, preview } = body;

    if (!entity_id) throw new Error("entity_id required");

    // Preview mode — scrape + analyse but skip DB write (used by AddEntityDialog step 1)
    const isPreview = preview === true || entity_id === "preview";

    // Detect platform from URL
    const detected = detectPlatform(url || "");
    const platform = inputPlatform !== "unknown" ? inputPlatform : detected.platform;
    const handle = inputHandle || detected.handle;

    let enriched: any = {};
    let scrapedContent = "";

    // 1. Try Firecrawl scrape if URL available
    if (url && firecrawlKey) {
      scrapedContent = await scrapeWithFirecrawl(url, firecrawlKey);
    }

    // 2. AI analysis if content available
    if (scrapedContent && lovableKey) {
      enriched = await analyzeWithAI(scrapedContent, url || "", platform, lovableKey) || {};
    }

    // 3. Heuristic fallback always runs
    const heuristics = await heuristicEnrichment(url || "", platform, handle);
    if (!enriched.risk_flags) enriched.risk_flags = heuristics.risk_flags;
    if (!enriched.suggested_tags?.length) enriched.suggested_tags = heuristics.suggested_tags;
    if (!enriched.why_flagged?.length) enriched.why_flagged = heuristics.why_flagged;
    if (!enriched.ai_confidence) enriched.ai_confidence = heuristics.ai_confidence;
    if (!enriched.enrichment_confidence) enriched.enrichment_confidence = heuristics.enrichment_confidence;

    // 4. Build update payload
    const now = new Date().toISOString();
    const patch: Record<string, any> = {
      enriched_at: now,
      enrichment_source: scrapedContent ? (lovableKey ? "firecrawl+ai" : "firecrawl") : "heuristic",
      platform,
      risk_flags: enriched.risk_flags || {},
      ai_suggested_type: enriched.source_type || null,
      ai_suggested_risk: enriched.risk_type || null,
      ai_suggested_flags: enriched.risk_flags || {},
      ai_confidence: enriched.ai_confidence || 0,
      enrichment_confidence: enriched.enrichment_confidence || {},
    };

    // Only set auto-fields that were actually found
    if (enriched.display_name)     patch.display_name = enriched.display_name;
    if (enriched.handle)            patch.handle = enriched.handle || handle;
    if (enriched.bio)               patch.bio = enriched.bio;
    if (enriched.follower_count)    patch.follower_count = enriched.follower_count;
    if (enriched.following_count)   patch.following_count = enriched.following_count;
    if (enriched.verified != null)  patch.verified = enriched.verified;
    if (enriched.location)          patch.region = enriched.location;
    if (enriched.language)          patch.language = enriched.language;
    if (enriched.website_in_bio)    patch.website_in_bio = enriched.website_in_bio;
    if (enriched.account_created_at) patch.account_created_at = enriched.account_created_at;
    if (enriched.detected_topics?.length) patch.detected_topics = enriched.detected_topics;
    if (enriched.engagement_pattern) patch.engagement_pattern = enriched.engagement_pattern;
    if (enriched.recent_posts?.length) patch.recent_posts = enriched.recent_posts.slice(0, 5);
    if (enriched.suggested_tags?.length && !isPreview) {
      // Merge with existing tags
      const { data: existing } = await supabase.from("entity_records").select("tags").eq("id", entity_id).maybeSingle();
      const currentTags: string[] = existing?.tags || [];
      patch.tags = [...new Set([...currentTags, ...enriched.suggested_tags])];
    }

    // In preview mode, return analysis without writing to DB
    if (isPreview) {
      return new Response(JSON.stringify({
        enriched: false,
        preview: true,
        platform,
        handle,
        fields_found: Object.keys(patch),
        ai_confidence: enriched.ai_confidence,
        risk_flags: enriched.risk_flags,
        suggested_tags: enriched.suggested_tags || [],
        why_flagged: enriched.why_flagged || [],
        source_type_suggestion: enriched.source_type,
        risk_type_suggestion: enriched.risk_type,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Persist to DB (delete the no-op audit_log line before patching)
    const { error } = await supabase
      .from("entity_records")
      .update(patch)
      .eq("id", entity_id);

    if (error) throw error;

    // Append audit entry
    await supabase.rpc("jsonb_array_append", {
      table_name: "entity_records",
      column_name: "audit_log",
      row_id: entity_id,
      entry: { action: "enriched", source: patch.enrichment_source, at: now, confidence: enriched.ai_confidence },
    }).catch(() => {}); // non-blocking

    return new Response(JSON.stringify({
      enriched: true,
      platform,
      handle,
      fields_found: Object.keys(patch).filter(k => !["enriched_at", "enrichment_source", "enrichment_confidence", "ai_confidence", "ai_suggested_type", "ai_suggested_risk", "audit_log"].includes(k)),
      ai_confidence: enriched.ai_confidence,
      risk_flags: enriched.risk_flags,
      suggested_tags: enriched.suggested_tags || [],
      why_flagged: enriched.why_flagged || [],
      source_type_suggestion: enriched.source_type,
      risk_type_suggestion: enriched.risk_type,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("enrich-entity error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
