import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Retry with exponential backoff ────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelayMs = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const isRateLimit = e.message?.includes("429") || e.message?.includes("rate limit") || e.message?.includes("too many");
      if (!isRateLimit && i > 0) throw e; // Only retry on rate limits after first attempt
      if (i < retries - 1) {
        const delay = baseDelayMs * Math.pow(2, i) + Math.random() * 500;
        console.log(`[retry] attempt ${i + 1} failed, retrying in ${Math.round(delay)}ms:`, e.message);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clean(t: string) {
  return t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function srcFromUrl(url: string) {
  try {
    const h = new URL(url).hostname.replace("www.", "");
    if (h.includes("twitter.com") || h.includes("x.com")) return "twitter";
    if (h.includes("reddit.com")) return "reddit";
    if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
    if (h.includes("coindesk.com")) return "coindesk";
    if (h.includes("cointelegraph.com")) return "cointelegraph";
    if (h.includes("decrypt.co")) return "decrypt";
    if (h.includes("bloomberg.com")) return "bloomberg";
    if (h.includes("reuters.com")) return "reuters";
    if (h.includes("theblock.co")) return "theblock";
    return h.split(".")[0];
  } catch { return "web"; }
}

// ── Brave web search ──────────────────────────────────────────────────────────

async function braveSearch(query: string, apiKey: string, count = 10, freshness = "pm"): Promise<any[]> {
  if (!apiKey) return [];
  try {
    const params = new URLSearchParams({ q: query, count: String(count), search_lang: "en", safesearch: "off", freshness });
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { "Accept": "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) { console.log("[brave] non-ok:", res.status); return []; }
    const data = await res.json();
    const items = [...(data.web?.results || []), ...(data.news?.results || [])];
    return items.map((r: any) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: clean([r.title, r.description, ...(r.extra_snippets || [])].filter(Boolean).join(" ").slice(0, 600)),
      source: srcFromUrl(r.url),
      age: r.age || null,
    })).filter(r => r.url && r.snippet.length > 20);
  } catch (e: any) {
    console.log("[brave] failed:", e.message);
    return [];
  }
}

// ── Firecrawl scrape ──────────────────────────────────────────────────────────

async function scrapeUrl(url: string, firecrawlKey: string, maxChars = 3000): Promise<string> {
  if (!firecrawlKey) return "";
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 2000 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const md = data.data?.markdown || data.markdown || "";
    return clean(md.slice(0, maxChars));
  } catch (e: any) {
    console.log("[scrape] failed for", url, ":", e.message);
    return "";
  }
}

// ── AI call helper ────────────────────────────────────────────────────────────

async function aiCall(lovableKey: string, systemPrompt: string, userPrompt: string, jsonMode = true): Promise<any> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`AI call failed: ${res.status}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  if (!jsonMode) return raw;
  try { return JSON.parse(raw); }
  catch { 
    // Strip markdown fences if present
    const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    try { return JSON.parse(stripped); }
    catch { return { raw }; }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
  const geminiKey = Deno.env.get("GOOGLE_API_KEY") ?? "";
  const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY") ?? "";
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") ?? "";

  try {
    if (!lovableKey && !geminiKey) throw new Error("No AI key configured. Set GOOGLE_API_KEY or LOVABLE_API_KEY.");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { text, org_id, watch_id, analysis: existingAnalysis } = body;
    if (!text) throw new Error("text is required");

    console.log("[research] starting for org:", org_id, "watch:", watch_id);

    // ── STEP 1: Entity extraction + search query generation ──────────────────
    console.log("[research] step 1: extract entities + queries");

    const orgRes = await supabase.from("organizations").select("name").eq("id", org_id).maybeSingle();
    const brandName = orgRes.data?.name ?? "Binance";

    const step1 = await aiCall(lovableKey,
      `You are a crypto threat intelligence analyst for ${brandName}. Extract structured intelligence from a piece of text and generate targeted search queries to research it further.

Return JSON with this exact schema:
{
  "event_summary": "1-sentence description of what happened",
  "event_date": "ISO date if mentioned, or null",
  "entities": [
    { "name": "entity name", "type": "person|token|exchange|regulator|media|other", "role": "their role in this event" }
  ],
  "key_claims": [
    { "claim": "specific claim being made", "source": "who made it", "verifiable": true|false }
  ],
  "search_queries": [
    {
      "query": "exact search string",
      "angle": "what this query investigates",
      "priority": "high|medium|low"
    }
  ],
  "binance_exposure": "direct|indirect|potential|none",
  "threat_type": "regulatory|market_manipulation|insider_trading|reputation|competitor|scam|unknown"
}

Generate 6-8 diverse search queries covering: (1) the original event, (2) entity backgrounds, (3) similar past incidents, (4) how ${brandName} is being discussed in the same context, (5) regulatory or legal angle, (6) counter-narratives or rebuttals. Use specific entity names, tickers, dates.`,
      `Intelligence text to analyse:\n\n${text}`
    );

    const entities: any[] = step1.entities ?? [];
    const keyClaims: any[] = step1.key_claims ?? [];
    const searchQueries: any[] = step1.search_queries ?? [];
    const eventSummary: string = step1.event_summary ?? "";

    console.log("[research] extracted", entities.length, "entities,", searchQueries.length, "queries");

    // ── STEP 2: Parallel web searches ────────────────────────────────────────
    console.log("[research] step 2: parallel searches");

    const highPriorityQueries = searchQueries.filter((q: any) => q.priority === "high").slice(0, 4);
    const medPriorityQueries = searchQueries.filter((q: any) => q.priority !== "high").slice(0, 4);
    const allQueries = [...highPriorityQueries, ...medPriorityQueries].slice(0, 6);

    const searchResults = await Promise.all(
      allQueries.map(async (q: any) => {
        const results = await withRetry(() => braveSearch(q.query, braveKey, 8, "pm"));
        return { query: q.query, angle: q.angle, results };
      })
    );

    // Deduplicate URLs across all searches
    const seenUrls = new Set<string>();
    const allLinks: any[] = [];
    for (const sr of searchResults) {
      for (const r of sr.results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allLinks.push({ ...r, query_angle: sr.angle });
        }
      }
    }

    console.log("[research] found", allLinks.length, "unique links across", searchResults.length, "queries");

    // ── STEP 3: AI triage — pick the most valuable sources to scrape ─────────
    console.log("[research] step 3: AI source triage");

    const topSources = allLinks.length > 0
      ? await aiCall(lovableKey,
          `You are a research analyst. Given a list of search results about a specific event, select the 8-10 most valuable sources to deep-read. Prioritise: (1) primary sources with direct evidence, (2) investigative journalists, (3) regulatory bodies, (4) on-chain analysts (ZachXBT, etc.), (5) major crypto media. Deprioritise: generic aggregators, duplicate coverage, social media with no original information.

Return JSON: { "selected_indices": [0, 2, 5, ...], "rationale": "brief explanation" }`,
          `Event: ${eventSummary}

Sources to evaluate:\n${allLinks.map((l, i) => `[${i}] ${l.title} — ${l.snippet.slice(0, 150)} (${l.url})`).join("\n")}`
        )
      : { selected_indices: [] };

    const selectedIndices: number[] = (topSources.selected_indices ?? []).slice(0, 8);
    const sourcesToScrape = selectedIndices
      .filter(i => i >= 0 && i < allLinks.length)
      .map(i => allLinks[i]);

    // Also add high-priority search results that weren't selected but are from credible domains
    const credibleDomains = ["coindesk", "cointelegraph", "decrypt", "theblock", "bloomberg", "reuters", "wsj"];
    for (const link of allLinks) {
      if (sourcesToScrape.length >= 10) break;
      if (!selectedIndices.includes(allLinks.indexOf(link)) && credibleDomains.some(d => link.url.includes(d))) {
        sourcesToScrape.push(link);
      }
    }

    console.log("[research] scraping", sourcesToScrape.length, "sources");

    // ── STEP 4: Parallel scraping of top sources ──────────────────────────────
    console.log("[research] step 4: parallel scraping");

    const scraped = await Promise.all(
      sourcesToScrape.map(async (link: any) => {
        const content = await withRetry(() => scrapeUrl(link.url, firecrawlKey, 2500));
        return {
          ...link,
          full_content: content || link.snippet,
          scraped: content.length > 100,
        };
      })
    );

    console.log("[research] scraped", scraped.filter(s => s.scraped).length, "sources successfully");

    // ── STEP 5: Per-source AI extraction ─────────────────────────────────────
    console.log("[research] step 5: extract intelligence from each source");

    const sourceIntelligence = await Promise.all(
      scraped.map(async (source: any) => {
        try {
          const intel = await aiCall(lovableKey,
            `You are a crypto threat intelligence analyst extracting structured information from an article/source. Extract only what is explicitly stated. Do not infer or fabricate.

Return JSON:
{
  "relevant": true|false,
  "headline": "article headline or main claim",
  "publication_date": "ISO date or null",
  "author": "author name or null",
  "key_facts": ["specific verifiable fact 1", "fact 2"],
  "claims_about_entities": [
    { "entity": "name", "claim": "what is said about them", "sentiment": "positive|negative|neutral" }
  ],
  "corroborates": ["which original claims this confirms"],
  "contradicts": ["which original claims this disputes"],
  "adds": ["new information not in original"],
  "binance_mentions": ["direct quotes or paraphrases mentioning Binance"],
  "credibility_note": "1 sentence on source credibility/limitations"
}`,
            `Original event: ${eventSummary}

Source URL: ${source.url}
Source title: ${source.title}
Source content:\n${source.full_content}`
          );
          return { ...source, intelligence: intel };
        } catch (e: any) {
          return { ...source, intelligence: null, error: e.message };
        }
      })
    );

    // ── STEP 6: Claim verification matrix ────────────────────────────────────
    console.log("[research] step 6: fact-check matrix");

    const relevantSources = sourceIntelligence.filter(s => s.intelligence?.relevant !== false);
    const allFacts = relevantSources.flatMap(s => (s.intelligence?.key_facts ?? []).map((f: string) => ({ fact: f, source: s.url, title: s.title })));

    const factCheckMatrix = keyClaims.length > 0
      ? await aiCall(lovableKey,
          `You are a fact-checker. Given original claims from intelligence text and a body of corroborating/contradicting evidence, assess each claim.

Return JSON:
{
  "fact_checks": [
    {
      "claim": "the original claim",
      "verdict": "confirmed|likely_true|unverified|disputed|false",
      "confidence": 0-100,
      "evidence_for": ["source snippet confirming"],
      "evidence_against": ["source snippet disputing"],
      "supporting_sources": ["url1"],
      "assessment": "1-2 sentence assessment"
    }
  ]
}`,
          `Original claims to fact-check:\n${keyClaims.map((c: any, i: number) => `${i + 1}. "${c.claim}" (said by: ${c.source})`).join("\n")}

Evidence gathered from ${relevantSources.length} sources:\n${allFacts.slice(0, 30).map(f => `- ${f.fact} (from: ${f.title})`).join("\n")}

Entity mentions:\n${relevantSources.flatMap(s => s.intelligence?.claims_about_entities ?? []).slice(0, 20).map((c: any) => `- ${c.entity}: ${c.claim}`).join("\n")}`
        )
      : { fact_checks: [] };

    // ── STEP 7: Spread map — how the narrative is moving ─────────────────────
    console.log("[research] step 7: build spread map");

    const spreadMap = await aiCall(lovableKey,
      `You are a narrative analyst. Given a set of sources that picked up a story, map how the narrative is spreading.

Return JSON:
{
  "origin": { "source": "where it first appeared", "date": "ISO date or null", "author": "who started it" },
  "spread_timeline": [
    { "date": "ISO date", "source": "platform/outlet", "url": "url", "amplification": "what they added or changed" }
  ],
  "reach_estimate": "estimated total reach / impressions",
  "dominant_framing": "how the story is being told (1-2 sentences)",
  "counter_narratives": ["any pushback or alternative framings"],
  "amplifier_types": ["types of accounts amplifying: crypto media|influencer|regulator|general press|etc"],
  "trajectory": "accelerating|stable|fading",
  "binance_narrative_exposure": "1-2 sentences on how ${brandName} is being framed across all sources"
}`,
      `Event: ${eventSummary}
Brand: ${brandName}

Sources that covered this story:\n${relevantSources.map(s => `- ${s.title} (${s.source}, ${s.intelligence?.publication_date ?? "date unknown"}) — ${s.url}\n  Added: ${(s.intelligence?.adds ?? []).join("; ") || "standard coverage"}`).join("\n")}`
    );

    // ── STEP 8: Entity profile enrichment ────────────────────────────────────
    console.log("[research] step 8: entity profiles");

    const entityProfiles = entities.slice(0, 6).map((e: any) => {
      const mentions = relevantSources.flatMap(s =>
        (s.intelligence?.claims_about_entities ?? [])
          .filter((c: any) => c.entity?.toLowerCase().includes(e.name?.toLowerCase()))
      );
      return {
        ...e,
        mention_count: mentions.length,
        sentiment_breakdown: {
          negative: mentions.filter((m: any) => m.sentiment === "negative").length,
          positive: mentions.filter((m: any) => m.sentiment === "positive").length,
          neutral: mentions.filter((m: any) => m.sentiment === "neutral").length,
        },
        key_claims_about: mentions.slice(0, 3).map((m: any) => m.claim),
      };
    });

    // ── STEP 9: Final synthesis ───────────────────────────────────────────────
    console.log("[research] step 9: final synthesis");

    const synthesis = await aiCall(lovableKey,
      `You are the head of intelligence for ${brandName}'s communications team. Synthesise a threat research report.

Return JSON:
{
  "executive_summary": "3-4 sentence summary of the threat, its current status, and ${brandName}'s exposure",
  "threat_level": "critical|high|medium|low",
  "threat_level_reasoning": "why this threat level",
  "binance_exposure_detail": "specific ways ${brandName} is implicated or at risk",
  "verified_facts": ["bullet point fact that has been confirmed"],
  "unverified_allegations": ["claim that is unconfirmed or disputed"],
  "key_unknowns": ["important questions that couldn't be answered from available sources"],
  "recommended_actions": [
    { "action": "specific action", "urgency": "immediate|24h|72h|monitor", "owner": "comms|legal|product|exec" }
  ],
  "monitoring_keywords": ["additional terms to monitor based on this research"],
  "similar_precedents": ["similar past incidents that might indicate likely trajectory"]
}`,
      `Brand: ${brandName}
Original intel: ${text}

Fact-check results: ${JSON.stringify(factCheckMatrix.fact_checks ?? [])}
Spread analysis: ${JSON.stringify(spreadMap)}
Entity profiles: ${JSON.stringify(entityProfiles)}
Source count: ${relevantSources.length} relevant sources from ${allLinks.length} found
Confirmed corroborations: ${relevantSources.filter(s => (s.intelligence?.corroborates ?? []).length > 0).length} sources`
    );

    // ── STEP 10: Persist to topic_watches if watch_id given ──────────────────
    if (watch_id) {
      try {
        const tableCheck = await supabase.from("topic_watches" as any).select("id").eq("id", watch_id).maybeSingle();
        if (!tableCheck.error) {
          await supabase.from("topic_watches" as any).update({
            research_data: {
              generated_at: new Date().toISOString(),
              event_summary: eventSummary,
              sources_found: allLinks.length,
              sources_scraped: scraped.filter(s => s.scraped).length,
              sources_relevant: relevantSources.length,
              entities: entityProfiles,
              fact_checks: factCheckMatrix.fact_checks ?? [],
              spread_map: spreadMap,
              synthesis,
              source_list: relevantSources.map(s => ({
                url: s.url,
                title: s.title,
                source: s.source,
                headline: s.intelligence?.headline,
                publication_date: s.intelligence?.publication_date,
                credibility_note: s.intelligence?.credibility_note,
                key_facts: s.intelligence?.key_facts ?? [],
                corroborates: s.intelligence?.corroborates ?? [],
                contradicts: s.intelligence?.contradicts ?? [],
                adds: s.intelligence?.adds ?? [],
                binance_mentions: s.intelligence?.binance_mentions ?? [],
              })),
            },
          }).eq("id", watch_id);
          console.log("[research] saved to topic_watch", watch_id);
        }
      } catch (e: any) {
        console.log("[research] failed to save:", e.message);
      }
    }

    console.log("[research] complete:", synthesis.threat_level, "— sources:", allLinks.length, "scraped:", scraped.filter(s => s.scraped).length);

    return new Response(JSON.stringify({
      event_summary: eventSummary,
      entities: entityProfiles,
      search_queries: allQueries,
      sources_found: allLinks.length,
      sources_scraped: scraped.filter(s => s.scraped).length,
      sources_relevant: relevantSources.length,
      source_list: relevantSources.map(s => ({
        url: s.url,
        title: s.title,
        source: s.source,
        snippet: s.snippet,
        headline: s.intelligence?.headline,
        publication_date: s.intelligence?.publication_date,
        author: s.intelligence?.author,
        credibility_note: s.intelligence?.credibility_note,
        key_facts: s.intelligence?.key_facts ?? [],
        corroborates: s.intelligence?.corroborates ?? [],
        contradicts: s.intelligence?.contradicts ?? [],
        adds: s.intelligence?.adds ?? [],
        binance_mentions: s.intelligence?.binance_mentions ?? [],
      })),
      fact_checks: factCheckMatrix.fact_checks ?? [],
      spread_map: spreadMap,
      entity_profiles: entityProfiles,
      synthesis,
      generated_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("[research-topic-watch]", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
