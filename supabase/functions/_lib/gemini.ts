// Shared Gemini AI helper for Supabase Edge Functions.
// Import in edge functions: import { geminiChat } from "../_lib/gemini.ts";

const GEMINI_KEY = Deno.env.get("GOOGLE_API_KEY") ?? "";
const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_TIMEOUT = 30000;

export interface ChatMessage {
  role: string;
  content: string;
}

export interface GeminiOptions {
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

/**
 * Call Gemini API with chat messages. Returns the response text.
 * Throws if GOOGLE_API_KEY is missing or the API call fails.
 */
export async function geminiChat(
  messages: ChatMessage[],
  options: GeminiOptions = {}
): Promise<string> {
  if (!GEMINI_KEY) {
    throw new Error(
      "GOOGLE_API_KEY not configured. Add it in Supabase Edge Function secrets."
    );
  }

  const {
    model = DEFAULT_MODEL,
    temperature = 0.1,
    jsonMode = false,
    timeoutMs = DEFAULT_TIMEOUT,
  } = options;

  const prompt = messages
    .map((m) => `${m.role === "system" ? "Instructions" : "User"}: ${m.content}`)
    .join("\n\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Gemini API error ${res.status}: ${errText.slice(0, 200)}`
    );
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) {
    throw new Error("Gemini returned empty response. Check GOOGLE_API_KEY and model availability.");
  }

  return text;
}

/**
 * Shortcut: single-prompt call (no chat history). Returns parsed JSON if jsonMode is true.
 */
export async function geminiPrompt(
  prompt: string,
  options: GeminiOptions = {}
): Promise<string> {
  return geminiChat([{ role: "user", content: prompt }], options);
}