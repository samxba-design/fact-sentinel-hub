import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { geminiChat } from "../_lib/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { content, source, severity, sentiment, author, type, url, title } = body;
    if (!content) throw new Error("content required");

    // Handle extract_mention type for manual add dialog
    if (type === "extract_mention") {
      const cleaned = cleanForAI(content);
      if (cleaned.length < 30) {
        return new Response(JSON.stringify({
          summary: "",
          sentiment: "neutral",
          severity: "low",
          author: "",
          published_date: null,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Use geminiChat for structured extraction in JSON mode
      let extractedResult: unknown = null;

      // Always use geminiChat with json mode
      {
        const systemPrompt = "Extract structured data from this article/post. Return JSON with fields: summary (2-3 sentences), sentiment (positive/negative/neutral/mixed), severity (low/medium/high/critical), author (string or null), published_date (ISO string or null).";
        const userPrompt = `URL: ${url || "unknown"}\nTitle: ${title || "unknown"}\n\nContent:\n${cleaned.slice(0, 3000)}`;
        try {
          const raw = await geminiChat([{role: "system", content: systemPrompt}, {role: "user", content: userPrompt}], { jsonMode: true });
          const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
          extractedResult = JSON.parse(stripped);
        } catch (_) {
          extractedResult = { summary: cleaned.slice(0, 500), sentiment: "neutral", severity: "low" };
        }
      }

      return new Response(JSON.stringify(extractedResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean content first
    const cleaned = cleanForAI(content);

    // ── YouTube special handling ──────────────────────────────────────
    // YouTube mentions only carry title + description metadata — we can never
    // scrape a transcript. Do NOT run junk detection on them and do NOT tell
    // the user there's a 403 error. Instead, analyse based on what we have
    // and be transparent that it's title/description-only.
    if (source === "youtube" || source === "youtube_comment") {
      const isComment = source === "youtube_comment";

      // If content is literally empty, say so
      if (!cleaned || cleaned.length < 5) {
        return new Response(JSON.stringify({
          summary: `${isComment ? "YouTube comment" : "YouTube video"} — no text content available to analyse.`,
          impact: "Unable to assess without content. View the video directly.",
          action: "Open the video to watch/read and assess manually.",
          content_note: "title_only",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Analyse from title/description — be explicit about the limitation
      const systemPrompt = `You are a reputation intelligence analyst. You are analysing a YouTube ${isComment ? "comment" : "video"} based on its title and description ONLY — full transcript is not available.

RULES:
- You are analysing METADATA (title + description), not the full video content
- Begin your summary with "Based on the video title and description: …" to be transparent
- Only describe what is explicitly stated in the title/description — do not guess or infer what the video says
- Do NOT mention access errors, 403 errors, or technical scraping issues — this is expected YouTube behaviour
- If the title/description is short or vague, say so and recommend watching the video for full context
- Source: YouTube, Severity: ${severity || "unknown"}, Sentiment: ${sentiment || "unknown"}, Author: ${author || "unknown"}
- Return JSON with fields: summary, impact, action`;

      const userPrompt = isComment
        ? `YouTube comment:\n${cleaned.slice(0, 1000)}`
        : `YouTube video title and description:\n${cleaned.slice(0, 1500)}`;

      try {
        const raw = await geminiChat([{role: "system", content: systemPrompt}, {role: "user", content: userPrompt}], { jsonMode: true });
        const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
        const parsed = JSON.parse(stripped);
        return new Response(JSON.stringify({ ...parsed, content_note: "youtube_metadata_only" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (_) {
        // Fallback if AI call fails — honest response
        return new Response(JSON.stringify({
          summary: `Based on the video title and description: ${cleaned.slice(0, 200)}`,
          impact: "Transcript not available. Impact assessment requires watching the video directly.",
          action: "Watch the video to assess the full content and determine whether a response is needed.",
          content_note: "youtube_metadata_only",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    // ── End YouTube handling ──────────────────────────────────────────

    // Detect junk/blocked content BEFORE sending to AI
    if (isJunkContent(cleaned) || cleaned.length < 30) {
      return new Response(JSON.stringify({
        summary: "The original content could not be properly extracted — the source page may have blocked automated access or requires JavaScript.",
        impact: "Unable to assess impact without readable content. Review the original source manually.",
        action: "Click 'View original source' to read the content directly and assess whether it requires a response.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a reputation intelligence analyst. Analyze the mention and provide a clear summary for a communications team. Be direct and actionable.

IMPORTANT RULES:
- Focus ONLY on the substantive content — what claims are being made, what opinions are expressed, what news is being reported
- NEVER mention website navigation, cookies, HTML structure, or page layout in your analysis
- If the content seems to be website boilerplate rather than actual article content, say so clearly
- Source: ${source || "unknown"}, Severity: ${severity || "unknown"}, Sentiment: ${sentiment || "unknown"}, Author: ${author || "unknown"}.
- Return JSON with fields: summary (2-3 sentences of what is being said), impact (1-2 sentences on brand reputation impact), action (1-2 sentences on what the team should do)`;

    const userPrompt = cleaned.slice(0, 2000);

    const raw = await geminiChat([{role: "system", content: systemPrompt}, {role: "user", content: userPrompt}], { jsonMode: true });

    // Parse response
    let parsed: unknown;
    try {
      const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      parsed = JSON.parse(stripped);
    } catch {
      parsed = {
        summary: raw || "Unable to generate summary.",
        impact: "Review the original source for more context.",
        action: "Click 'View Source' to assess manually.",
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("generate-ai-summary error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
