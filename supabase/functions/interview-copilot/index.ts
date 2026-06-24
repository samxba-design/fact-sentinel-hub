import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GEMINI_API_KEY");

interface InterviewRequest {
  action: "generate_response" | "analyze_question" | "generate_talking_points" | "coach";
  stream?: boolean;
  transcript: string;
  last_question?: string;
  context: {
    job_title?: string;
    company_name?: string;
    job_description?: string;
    company_info?: string;
    role_context?: string;
    candidate_resume?: string;
    candidate_cover_letter?: string;
    candidate_facts?: string;
    interview_style?: string;
    response_length?: string;
  };
  conversation_history?: Array<{ speaker: string; text: string }>;
  previous_responses?: string[];
}

function buildSystemPrompt(context: InterviewRequest["context"]) {
  const style = context.interview_style || "professional";
  const length = context.response_length || "balanced";

  const styleGuides: Record<string, string> = {
    casual: "Use a conversational, relaxed tone. Short sentences. Occasional filler words like 'well' and 'you know' are OK. Sound like you're chatting with a colleague.",
    formal: "Use polished, professional language. Structured responses with clear logic. No slang. Sound like an experienced executive.",
    technical: "Use precise terminology. Include relevant technical details and frameworks. Demonstrate deep domain knowledge without being pedantic.",
    startup: "Be energetic, direct, and scrappy. Show passion. Use 'we' and 'us' thinking. Reference rapid iteration and impact.",
    professional: "Balanced professional tone. Clear, confident, warm but authoritative. Use the STAR method implicitly (Situation, Task, Action, Result) for experience questions.",
  };

  return `You are an expert interview coach AI that generates natural-sounding spoken responses for job candidates to read aloud during live interviews.

CRITICAL RULES:
1. Generate responses that sound SPOKEN, not written. Use natural speech patterns, contractions, and conversational flow.
2. NEVER sound like AI. Use "I" and "my" naturally. Include occasional natural pauses (marked with "...") and thinking phrases like "That's a great question" or "Let me think about that."
3. Match the response to ${context.candidate_resume ? "the candidate's actual experience in their resume" : "a strong candidate profile"}.
4. Use specific examples and details when context provides them. Generic answers are obvious.
5. Keep responses ${length === "concise" ? "under 45 seconds when read aloud (about 100 words)" : length === "detailed" ? "around 90-120 seconds (200-300 words)" : "around 60 seconds (about 150 words)"}.
6. Structure longer responses with clear points the candidate can follow naturally.
7. Include natural transitions: "First...", "Also...", "What I'd add is...", "The key thing is..."
8. When using STAR format, weave it naturally: "So there was this situation where... what I did was... and the result ended up being..."
9. If the question is about weakness/failure, be honest but show growth. Frame it as a learning experience.
10. End responses with a natural conclusion, not an abrupt stop. Sometimes end by offering to elaborate: "Happy to go deeper on any part of that."

RESPONSE STYLE: ${styleGuides[style] || styleGuides.professional}

JOB CONTEXT:
- Role: ${context.job_title || "Not specified"}
- Company: ${context.company_name || "Not specified"}
${context.job_description ? `\nJOB DESCRIPTION:\n${context.job_description}` : ""}
${context.company_info ? `\nCOMPANY INFO:\n${context.company_info}` : ""}
${context.role_context ? `\nROLE CONTEXT:\n${context.role_context}` : ""}

CANDIDATE PROFILE:
${context.candidate_resume ? `RESUME:\n${context.candidate_resume}` : ""}
${context.candidate_cover_letter ? `COVER LETTER:\n${context.candidate_cover_letter}` : ""}
${context.candidate_facts ? `ADDITIONAL FACTS:\n${context.candidate_facts}` : ""}

Remember: The candidate will READ YOUR RESPONSE ALOUD. It must flow naturally when spoken. Test-read it in your head — if it sounds stiff, fix it.`;
}

function buildGeneratePrompt(req: InterviewRequest): string {
  const historyLines = (req.conversation_history || [])
    .map((m) => `${m.speaker === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${m.text}`)
    .join("\n");

  const prevResponses = (req.previous_responses || [])
    .slice(-3)
    .map((r, i) => `Previous Response ${i + 1}: ${r}`)
    .join("\n");

  return `INTERVIEW TRANSCRIPT:
${historyLines || "(No history yet)"}

LATEST QUESTION FROM INTERVIEWER:
"${req.last_question || req.transcript || "Tell me about yourself."}"

${prevResponses ? `\nYOUR PREVIOUS RESPONSES (avoid repeating):\n${prevResponses}` : ""}

Generate the candidate's spoken response now. Make it natural, impressive, and authentic to the candidate's background. Remember — they will READ THIS ALOUD.`;
}

async function callGeminiNonStreaming(prompt: string, systemInstruction: string) {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key not configured.");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 2048, topP: 0.95 },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function* streamGemini(prompt: string, systemInstruction: string) {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key not configured.");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 2048, topP: 0.95 },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini streaming error: ${response.status} ${err}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim() || !line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") return;

      try {
        const parsed = JSON.parse(json);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {
        // skip unparseable chunks
      }
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: InterviewRequest = await req.json();
    const { action, stream = false, context = { /* noop */ } } = body;

    // --- STREAMING PATH for generate_response ---
    if (action === "generate_response" && stream) {
      const prompt = buildGeneratePrompt(body);
      const systemPrompt = buildSystemPrompt(context);

      const encoder = new TextEncoder();
      let isFirst = true;

      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamGemini(prompt, systemPrompt)) {
              const event = JSON.stringify({ type: "chunk", text: chunk });
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));
              isFirst = false;
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
            controller.close();
          } catch (err: unknown) {
            const errorEvent = JSON.stringify({ type: "error", error: err.message });
            controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // --- NON-STREAMING PATH ---
    let result: string;
    let prompt: string;
    const systemPrompt = buildSystemPrompt(context);

    switch (action) {
      case "generate_response": {
        prompt = buildGeneratePrompt(body);
        result = await callGeminiNonStreaming(prompt, systemPrompt);
        break;
      }

      case "analyze_question": {
        prompt = `Analyze this interview transcript segment and extract:
1. The specific question(s) being asked
2. The subtext — what the interviewer is really looking for
3. Any traps or tricky aspects
4. Key points that should be in the answer

TRANSCRIPT:
${body.transcript}

Return as JSON:
{
  "questions": ["identified question"],
  "subtext": "what they really want to know",
  "traps": ["any trap or tricky aspect"],
  "key_points": ["must-address point"]
}`;
        result = await callGeminiNonStreaming(prompt, systemPrompt);
        break;
      }

      case "generate_talking_points": {
        prompt = `Generate 3-5 quick bullet points the candidate should hit when answering this question. 
These should be memory-joggers, not sentences.

Question: "${body.last_question || body.transcript}"

Return as a simple numbered list.`;
        result = await callGeminiNonStreaming(prompt, systemPrompt);
        break;
      }

      case "coach": {
        prompt = `The candidate just gave this response: "${body.transcript}"

Question was: "${body.last_question}"

Give a quick coaching tip (1-2 sentences) — what could they improve for next time? Be specific and constructive.`;
        result = await callGeminiNonStreaming(prompt, systemPrompt);
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ result, action }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("Interview copilot error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});