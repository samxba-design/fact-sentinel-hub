import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Detect if content is blocked/error junk
function isJunkContent(text: string): boolean {
  const blockers = [
    "blocked by an extension", "enable javascript", "access denied",
    "403 forbidden", "captcha", "please verify you are a human",
    "cloudflare", "just a moment", "checking your browser", "ray id",
    "please turn javascript on", "ERR_BLOCKED", "not available in your region",
    "cookie policy", "we use cookies", "accept cookies",
  ];
  const lower = text.toLowerCase();
  const matchCount = blockers.filter(b => lower.includes(b)).length;
  // If multiple blockers match, or content is very short, it's junk
  if (matchCount >= 2) return true;
  if (text.length < 50 && matchCount >= 1) return true;
  return false;
}

// Clean content before sending to AI
function cleanForAI(raw: string): string {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

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

      const extractRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0.2,
          tools: [{
            type: "function",
            function: {
              name: "extract_mention_data",
              description: "Extract structured mention data from article/post content",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "2-3 sentence summary of the article/post focusing on the key claims and events" },
                  sentiment: { type: "string", enum: ["positive", "negative", "neutral", "mixed"], description: "Overall sentiment" },
                  severity: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Reputational risk severity" },
                  author: { type: "string", description: "Author name if identifiable" },
                  published_date: { type: "string", description: "Published date in ISO format if identifiable, otherwise null" },
                },
                required: ["summary", "sentiment", "severity"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "extract_mention_data" } },
          messages: [
            { role: "system", content: "Extract structured data from this article/post. Focus on the actual content, not navigation or boilerplate. Be accurate with sentiment and severity assessment." },
            { role: "user", content: `URL: ${url || "unknown"}\nTitle: ${title || "unknown"}\n\nContent:\n${cleaned.slice(0, 3000)}` },
          ],
        }),
      });

      if (extractRes.ok) {
        const extractData = await extractRes.json();
        const toolCall = extractData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          const parsed = JSON.parse(toolCall.function.arguments);
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Fallback
      return new Response(JSON.stringify({
        summary: cleaned.slice(0, 500),
        sentiment: "neutral",
        severity: "low",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      const ytRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0.2,
          tools: [{
            type: "function",
            function: {
              name: "mention_summary",
              description: "Return a structured analysis of the mention",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  impact: { type: "string" },
                  action: { type: "string" },
                },
                required: ["summary", "impact", "action"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "mention_summary" } },
          messages: [
            {
              role: "system",
              content: `You are a reputation intelligence analyst. You are analysing a YouTube ${isComment ? "comment" : "video"} based on its title and description ONLY — full transcript is not available.

RULES:
- You are analysing METADATA (title + description), not the full video content
- Begin your summary with "Based on the video title and description: …" to be transparent
- Only describe what is explicitly stated in the title/description — do not guess or infer what the video says
- Do NOT mention access errors, 403 errors, or technical scraping issues — this is expected YouTube behaviour
- If the title/description is short or vague, say so and recommend watching the video for full context
- Source: YouTube, Severity: ${severity || "unknown"}, Sentiment: ${sentiment || "unknown"}, Author: ${author || "unknown"}`,
            },
            {
              role: "user",
              content: isComment
                ? `YouTube comment:\n${cleaned.slice(0, 1000)}`
                : `YouTube video title and description:\n${cleaned.slice(0, 1500)}`,
            },
          ],
        }),
      });

      if (ytRes.ok) {
        const ytData = await ytRes.json();
        const toolCall = ytData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          const parsed = JSON.parse(toolCall.function.arguments);
          return new Response(JSON.stringify({ ...parsed, content_note: "youtube_metadata_only" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Fallback if AI call fails — honest response
      return new Response(JSON.stringify({
        summary: `Based on the video title and description: ${cleaned.slice(0, 200)}`,
        impact: "Transcript not available. Impact assessment requires watching the video directly.",
        action: "Watch the video to assess the full content and determine whether a response is needed.",
        content_note: "youtube_metadata_only",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.3,
        tools: [
          {
            type: "function",
            function: {
              name: "mention_summary",
              description: "Return a structured analysis of the mention",
              parameters: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                    description: "2-3 sentence plain-language summary of what is being said. Focus on the actual claims, opinions, or news being reported. Do NOT describe the webpage structure or navigation elements.",
                  },
                  impact: {
                    type: "string",
                    description: "1-2 sentences on how this could impact the brand's reputation, specifically and concretely",
                  },
                  action: {
                    type: "string",
                    description: "1-2 sentences recommending what the team should do, be specific and actionable",
                  },
                },
                required: ["summary", "impact", "action"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "mention_summary" } },
        messages: [
          {
            role: "system",
            content: `You are a reputation intelligence analyst. Analyze the mention and provide a clear summary for a communications team. Be direct and actionable.

IMPORTANT RULES:
- Focus ONLY on the substantive content — what claims are being made, what opinions are expressed, what news is being reported
- NEVER mention website navigation, cookies, HTML structure, or page layout in your analysis
- If the content seems to be website boilerplate rather than actual article content, say so clearly
- Source: ${source || "unknown"}, Severity: ${severity || "unknown"}, Sentiment: ${sentiment || "unknown"}, Author: ${author || "unknown"}.`,
          },
          {
            role: "user",
            content: cleaned.slice(0, 2000),
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("AI gateway error:", res.status, errText);
      
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI analysis failed");
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try parsing content directly
    const rawContent = data.choices?.[0]?.message?.content || "";
    try {
      const contentCleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(contentCleaned);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({
        summary: rawContent || "Unable to generate summary.",
        impact: "Review the original source for more context.",
        action: "Click 'View Source' to assess manually.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    console.error("generate-ai-summary error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
