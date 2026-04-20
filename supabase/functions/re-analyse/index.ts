import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── YouTube video ID extraction ──────────────────────────────────────────────
function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    return null;
  } catch { return null; }
}

// ── Gemini native YouTube video analysis ─────────────────────────────────────
// Uses Gemini's native video understanding — it watches/reads the actual video,
// captions, speech, and visual content. No transcript scraping needed.
async function analyseYouTubeWithGemini(
  videoUrl: string,
  videoId: string,
  title: string,
  brandName: string,
  geminiKey: string
): Promise<{
  transcript_excerpt: string;
  summary: string;
  sentiment_label: string;
  sentiment_score: number;
  severity: string;
  relevant: boolean;
  flags: Record<string, unknown>;
  gemini_analysis: Record<string, unknown>;
} | null> {
  try {
    console.log(`[gemini-video] analysing ${videoId}`);

    // Gemini 2.0 Flash natively understands YouTube URLs as video input
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(90000), // video analysis can take up to 90s
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              {
                // Native Gemini video part — it fetches and fully processes the video
                fileData: {
                  mimeType: "video/mp4",
                  fileUri: videoUrl,
                },
              },
              {
                text: `You are a brand reputation analyst for "${brandName}". Thoroughly analyse this YouTube video.

Return ONLY valid JSON with this exact structure:
{
  "relevant": true or false,
  "title_as_spoken": "the actual video title if stated, else from thumbnail/metadata",
  "transcript_excerpt": "150-200 word excerpt of the most relevant spoken content about ${brandName}",
  "full_topic": "what this video is actually about in 2-3 sentences",
  "brand_mentions": ["exact quotes or paraphrases mentioning ${brandName}"],
  "sentiment_label": "positive|negative|neutral|mixed",
  "sentiment_score": number from -1.0 to 1.0,
  "severity": "low|medium|high|critical",
  "summary": "2-3 sentence reputation intelligence summary — what is specifically said about ${brandName}, how it's framed, and what the audience takeaway is",
  "key_claims": ["specific claims made about ${brandName}"],
  "flags": {
    "misinformation": boolean,
    "viral_potential": boolean,
    "contains_allegations": boolean,
    "price_discussion": boolean,
    "regulatory_mention": boolean
  },
  "content_type": "tutorial|review|news|opinion|scam_warning|promotional|other",
  "creator_stance": "critical|supportive|neutral|mixed"
}

If the video is not relevant to ${brandName}, set relevant=false and keep other fields minimal.
CRITICAL: Base your analysis on the ACTUAL video content — what is spoken, shown, and demonstrated. Do not guess.`,
              },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error(`[gemini-video] API error ${geminiRes.status}:`, errText.slice(0, 300));
      return null;
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    if (!rawText) {
      console.error("[gemini-video] empty response");
      return null;
    }

    // Parse the JSON response
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const stripped = rawText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      try { parsed = JSON.parse(stripped); }
      catch { 
        console.error("[gemini-video] parse failed:", rawText.slice(0, 200));
        return null;
      }
    }

    console.log(`[gemini-video] success: ${parsed.sentiment_label} / ${parsed.severity} / relevant=${parsed.relevant}`);

    return {
      transcript_excerpt: parsed.transcript_excerpt || "",
      summary: parsed.summary || "",
      sentiment_label: parsed.sentiment_label || "neutral",
      sentiment_score: parsed.sentiment_score ?? 0,
      severity: parsed.severity || "low",
      relevant: parsed.relevant !== false,
      flags: parsed.flags || {},
      gemini_analysis: {
        title_as_spoken: parsed.title_as_spoken,
        full_topic: parsed.full_topic,
        brand_mentions: parsed.brand_mentions || [],
        key_claims: parsed.key_claims || [],
        content_type: parsed.content_type,
        creator_stance: parsed.creator_stance,
        analysed_at: new Date().toISOString(),
      },
    };
  } catch (e: any) {
    console.error(`[gemini-video] failed for ${videoId}:`, e.message);
    return null;
  }
}

// ── Standard text/web mention analysis ──────────────────────────────────────
async function analyseTextWithAI(
  content: string,
  title: string,
  source: string,
  url: string,
  brandName: string,
  lovableKey: string,
  firecrawlKey?: string
): Promise<{
  summary: string;
  sentiment_label: string;
  sentiment_score: number;
  severity: string;
  relevant: boolean;
  flags: Record<string, unknown>;
  scraped_fresh: boolean;
} | null> {
  let analysisContent = content;
  let scraped_fresh = false;

  // For web mentions, attempt a fresh scrape to get latest content
  if (firecrawlKey && url && !["twitter", "reddit"].includes(source)) {
    try {
      const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 2000 }),
        signal: AbortSignal.timeout(20000),
      });
      if (scrapeRes.ok) {
        const scrapeData = await scrapeRes.json();
        const fresh = scrapeData.data?.markdown || scrapeData.markdown || "";
        if (fresh.length > 200) {
          analysisContent = fresh.slice(0, 4000);
          scraped_fresh = true;
          console.log(`[re-analyse] fresh scrape: ${analysisContent.length} chars`);
        }
      }
    } catch (e: any) {
      console.log("[re-analyse] fresh scrape failed:", e.message);
    }
  }

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: `You analyze a brand mention for "${brandName}". Return ONLY valid JSON (no markdown):
{
  "relevant": boolean,
  "sentiment_label": "positive"|"negative"|"neutral"|"mixed",
  "sentiment_score": number -1.0 to 1.0,
  "severity": "low"|"medium"|"high"|"critical",
  "summary": "2-3 sentences on what is specifically said about ${brandName}, concrete and factual",
  "flags": {"misinformation": bool, "viral_potential": bool, "contains_allegations": bool}
}
severity guide: tutorial/neutral = low; complaints/criticism = medium; fraud/hack allegations = high; coordinated attack/regulatory action = critical.`,
          },
          {
            role: "user",
            content: `Source: ${source}\nURL: ${url}\nTitle: ${title}\n\nContent:\n${analysisContent.slice(0, 3000)}`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    let raw = data.choices?.[0]?.message?.content || "{}";
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(raw);
    return {
      summary: parsed.summary || "",
      sentiment_label: parsed.sentiment_label || "neutral",
      sentiment_score: parsed.sentiment_score ?? 0,
      severity: parsed.severity || "low",
      relevant: parsed.relevant !== false,
      flags: parsed.flags || {},
      scraped_fresh,
    };
  } catch (e: any) {
    console.warn(`[re-analyse] text AI failed: ${e.message}`);
    return null;
  }
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
    const geminiKey = Deno.env.get("GOOGLE_API_KEY") || "";
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { mention_id, force_gemini_video = false } = body;

    if (!mention_id) return json({ error: "mention_id required" }, 400);

    // Fetch the mention
    const { data: mention, error: fetchErr } = await sb
      .from("mentions")
      .select("id, source, content, url, title, flags, org_id")
      .eq("id", mention_id)
      .single();

    if (fetchErr || !mention) {
      return json({ error: `Mention not found: ${fetchErr?.message}` }, 404);
    }

    const { data: org } = await sb
      .from("organizations")
      .select("name")
      .eq("id", mention.org_id)
      .single();
    const brandName = org?.name || "the brand";

    const isYouTube = mention.source === "youtube";
    const videoId = isYouTube ? extractVideoId(mention.url || "") : null;

    let updatePayload: Record<string, any> = {
      last_rescanned_at: new Date().toISOString(),
      rescan_count: (mention.flags?.rescan_count ?? 0) + 1,
    };

    // ── Path A: YouTube — use Gemini native video understanding ───────────────
    if (isYouTube && videoId) {
      if (!geminiKey) {
        // Fallback to text analysis if no Gemini key
        console.log("[re-analyse] no GOOGLE_API_KEY — falling back to text analysis for YouTube");
      } else {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const analysis = await analyseYouTubeWithGemini(
          videoUrl, videoId, mention.title || "", brandName, geminiKey
        );

        if (analysis) {
          // Build enriched content: keep original metadata + add Gemini transcript excerpt
          const originalTitle = mention.title || "";
          const originalDesc = (mention.content || "").split("\n\n")[0];
          const enrichedContent = [
            originalTitle ? `TITLE: ${originalTitle}` : "",
            originalDesc && !originalDesc.startsWith("TITLE:") ? `\nDESCRIPTION: ${originalDesc.slice(0, 400)}` : "",
            analysis.transcript_excerpt ? `\n\nGEMINI TRANSCRIPT EXCERPT:\n${analysis.transcript_excerpt}` : "",
            analysis.gemini_analysis.brand_mentions?.length
              ? `\n\nBRAND MENTIONS:\n${(analysis.gemini_analysis.brand_mentions as string[]).slice(0, 5).join("\n")}`
              : "",
          ].filter(Boolean).join("").trim();

          updatePayload = {
            ...updatePayload,
            content: enrichedContent,
            title: originalTitle || (analysis.gemini_analysis.title_as_spoken as string) || mention.title,
            clean_summary: analysis.summary,
            sentiment_label: analysis.sentiment_label,
            sentiment_score: analysis.sentiment_score,
            severity: analysis.severity,
            gemini_video_analysis: analysis.gemini_analysis,
            flags: {
              ...(mention.flags || {}),
              has_transcript: true,
              transcript_source: "gemini_native_video",
              ...analysis.flags,
              reanalysed_at: new Date().toISOString(),
              rescan_count: (mention.flags?.rescan_count ?? 0) + 1,
            },
          };

          const { error: updateErr } = await sb.from("mentions").update(updatePayload).eq("id", mention_id);
          if (updateErr) return json({ error: `DB update failed: ${updateErr.message}` }, 500);

          console.log(`[re-analyse] YouTube ${mention_id}: ${analysis.sentiment_label}/${analysis.severity} via Gemini native`);
          return json({
            success: true,
            mention_id,
            method: "gemini_native_video",
            updated: {
              summary: analysis.summary,
              sentiment_label: analysis.sentiment_label,
              sentiment_score: analysis.sentiment_score,
              severity: analysis.severity,
              has_transcript: true,
              transcript_source: "gemini_native_video",
              brand_mentions_found: (analysis.gemini_analysis.brand_mentions as any[]).length,
              key_claims: analysis.gemini_analysis.key_claims,
              content_type: analysis.gemini_analysis.content_type,
            },
          });
        }
        // Fall through to text analysis if Gemini video failed
        console.log("[re-analyse] Gemini video analysis failed, falling back to text");
      }
    }

    // ── Path B: Text/web/social — fresh scrape + AI analysis ─────────────────
    if (!lovableKey) {
      return json({ error: "LOVABLE_API_KEY not configured" }, 400);
    }

    const title = mention.title || (mention.content || "").match(/TITLE:\s*(.*?)(?:\n|$)/i)?.[1] || "";
    const analysis = await analyseTextWithAI(
      mention.content || "",
      title,
      mention.source,
      mention.url || "",
      brandName,
      lovableKey,
      firecrawlKey || undefined
    );

    if (!analysis) {
      return json({ error: "AI analysis failed" }, 502);
    }

    updatePayload = {
      ...updatePayload,
      clean_summary: analysis.summary,
      sentiment_label: analysis.sentiment_label,
      sentiment_score: analysis.sentiment_score,
      severity: analysis.severity,
      flags: {
        ...(mention.flags || {}),
        ...analysis.flags,
        scraped_fresh: analysis.scraped_fresh,
        reanalysed_at: new Date().toISOString(),
        rescan_count: (mention.flags?.rescan_count ?? 0) + 1,
      },
    };

    const { error: updateErr } = await sb.from("mentions").update(updatePayload).eq("id", mention_id);
    if (updateErr) return json({ error: `DB update failed: ${updateErr.message}` }, 500);

    console.log(`[re-analyse] ${mention_id}: ${analysis.sentiment_label}/${analysis.severity} / fresh=${analysis.scraped_fresh}`);
    return json({
      success: true,
      mention_id,
      method: isYouTube ? "text_fallback" : analysis.scraped_fresh ? "fresh_scrape" : "cached_content",
      updated: {
        summary: analysis.summary,
        sentiment_label: analysis.sentiment_label,
        sentiment_score: analysis.sentiment_score,
        severity: analysis.severity,
        scraped_fresh: analysis.scraped_fresh,
      },
    });

  } catch (err: any) {
    console.error("[re-analyse] error:", err);
    return json({ error: err.message }, 500);
  }
});
