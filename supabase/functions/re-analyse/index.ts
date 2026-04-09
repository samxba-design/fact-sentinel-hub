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

// ── YouTube transcript fetcher (same logic as run-scan) ─────────────────────
async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SentiWatch/1.0)" },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (r.ok) {
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("application/json") || ct.includes("text/javascript")) {
        const data = await r.json();
        const parts: string[] = [];
        for (const evt of data.events || []) {
          for (const seg of evt.segs || []) {
            if (seg.utf8 && seg.utf8 !== "\n") parts.push(seg.utf8.trim());
          }
        }
        const text = parts.join(" ").replace(/\s+/g, " ").trim();
        if (text.length > 100) return text;
      }
    }
    // XML fallback
    const r2 = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SentiWatch/1.0)" },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (r2.ok) {
      const xml = await r2.text();
      const text = xml
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s+/g, " ").trim();
      if (text.length > 100) return text;
    }
  } catch (e: any) {
    console.log(`[re-analyse] transcript fetch failed: ${e.message}`);
  }
  return null;
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

// ── AI analysis for a single mention ────────────────────────────────────────
async function analyseWithAI(
  content: string,
  title: string,
  source: string,
  brandName: string,
  lovableKey: string,
  hasTranscript: boolean
): Promise<{
  summary: string;
  sentiment_label: string;
  sentiment_score: number;
  severity: string;
  relevant: boolean;
  flags: Record<string, unknown>;
} | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: `You analyze a single brand mention for "${brandName}". Return JSON with:
- relevant: boolean — true if this genuinely discusses "${brandName}" as a brand/product/company
- sentiment_label: "positive"|"negative"|"neutral"|"mixed"
- sentiment_score: number -1.0 to 1.0
- severity: "low"|"medium"|"high"|"critical"
- summary: 2-3 sentences describing what is ACTUALLY said about "${brandName}". Be specific and concrete. If content includes a TRANSCRIPT: section, use it — do NOT say the content is an error page.
- flags: {misinformation: bool, viral_potential: bool}
For YouTube videos with transcripts: severity=low for tutorials, sentiment based on actual tone.
Return ONLY valid JSON (no markdown).`,
          },
          {
            role: "user",
            content: `Source: ${source}\nTitle: ${title}\n\nContent:\n${
              source === "youtube" && hasTranscript
                ? content.slice(0, 3000)
                : content.slice(0, 800)
            }`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`[re-analyse] AI HTTP ${res.status}`);
      return null;
    }
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
    };
  } catch (e: any) {
    console.warn(`[re-analyse] AI failed: ${e.message}`);
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
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { mention_id } = body;

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

    // Get org name for AI context
    const { data: org } = await sb
      .from("organizations")
      .select("name")
      .eq("id", mention.org_id)
      .single();
    const brandName = org?.name || "the brand";

    let content = mention.content || "";
    let hasTranscript = mention.flags?.has_transcript || false;

    // ── YouTube: re-fetch transcript ───────────────────────────────────────
    if (mention.source === "youtube" && mention.url) {
      const videoId = extractVideoId(mention.url);
      if (videoId) {
        console.log(`[re-analyse] fetching transcript for ${videoId}`);
        const transcript = await fetchYouTubeTranscript(videoId);

        if (transcript) {
          // Rebuild the structured content
          const title = mention.title || "";
          // Extract description from old content if it had the structured format
          const descMatch = content.match(/DESCRIPTION:\s*(.*?)(?:\n\nTRANSCRIPT:|$)/is);
          const desc = descMatch?.[1]?.trim() || "";

          const truncated = transcript.length > 3000
            ? `${transcript.slice(0, 2100)} [...] ${transcript.slice(-900)}`
            : transcript;

          content = [
            title ? `TITLE: ${title}` : "",
            desc ? `\n\nDESCRIPTION: ${desc}` : "",
            `\n\nTRANSCRIPT: ${truncated}`,
          ].filter(Boolean).join("").trim();

          hasTranscript = true;
          console.log(`[re-analyse] transcript fetched: ${transcript.length} chars`);
        } else {
          console.log(`[re-analyse] transcript unavailable for ${videoId}`);
        }
      }
    }

    // ── AI re-analysis ─────────────────────────────────────────────────────
    if (!lovableKey) {
      return json({ error: "LOVABLE_API_KEY not configured — AI analysis unavailable" }, 400);
    }

    const title = mention.title || (content.match(/TITLE:\s*(.*?)(?:\n|$)/i)?.[1]) || "";
    const analysis = await analyseWithAI(
      content,
      title,
      mention.source,
      brandName,
      lovableKey,
      hasTranscript
    );

    if (!analysis) {
      return json({ error: "AI analysis failed — check LOVABLE_API_KEY and try again" }, 502);
    }

    // ── Write updates back to the mention ─────────────────────────────────
    const updatedFlags = {
      ...(mention.flags || {}),
      has_transcript: hasTranscript,
      reanalysed_at: new Date().toISOString(),
    };

    const { error: updateErr } = await sb
      .from("mentions")
      .update({
        content: content,
        clean_summary: analysis.summary,
        sentiment_label: analysis.sentiment_label,
        sentiment_score: analysis.sentiment_score,
        severity: analysis.severity,
        flags: updatedFlags,
      })
      .eq("id", mention_id);

    if (updateErr) {
      return json({ error: `DB update failed: ${updateErr.message}` }, 500);
    }

    console.log(`[re-analyse] ${mention_id} updated: ${analysis.sentiment_label} / ${analysis.severity} / transcript=${hasTranscript}`);

    return json({
      success: true,
      mention_id,
      updated: {
        summary: analysis.summary,
        sentiment_label: analysis.sentiment_label,
        sentiment_score: analysis.sentiment_score,
        severity: analysis.severity,
        has_transcript: hasTranscript,
      },
    });
  } catch (err: any) {
    console.error("[re-analyse] error:", err);
    return json({ error: err.message }, 500);
  }
});
