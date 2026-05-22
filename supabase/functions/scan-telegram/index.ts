// Edge function: scan-telegram
// Monitors public Telegram channels for brand/competitor mentions.
//
// TWO MODES:
// 1. PUBLIC CHANNEL MODE (no API key needed):
//    Uses t.me/s/{channel} public preview pages — works for any public channel.
//    Channels configured via org_api_keys or sources table.
//
// 2. BOT MODE (requires bot token):
//    Uses Telegram Bot API to monitor channels where the bot is a member.
//    Supports keyword alerts and message history.
//
// Input: { org_id, keywords: string[], date_from?: string, channels?: string[], bot_token?: string }
// Output: { results: ScanResult[], source: "telegram" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiPrompt } from "../_lib/gemini.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const corsHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

interface ScanResult {
  url: string;
  title: string;
  content: string;
  source: string;
  posted_at: string | null;
  channel: string;
  author_name?: string;
}

// Default crypto channels worth monitoring (public)
const DEFAULT_CRYPTO_CHANNELS = [
  "coindesk", "cointelegraph", "TheBlockCrypto", "WuBlockchain",
  "crypto_news_aggregator", "defi_news", "binance_announcements",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const { org_id, keywords, date_from, channels: userChannels, bot_token } = await req.json();

    if (!org_id || !keywords?.length) {
      return new Response(JSON.stringify({ error: "org_id and keywords required" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Get configured Telegram channels from sources table
    const { data: sourceData } = await supabase
      .from("sources")
      .select("id, config")
      .eq("org_id", org_id)
      .eq("type", "telegram")
      .eq("enabled", true);

    const configuredChannels = userChannels ||
      sourceData?.flatMap((s: any) => s.config?.channels || []) ||
      DEFAULT_CRYPTO_CHANNELS;

    const fromDate = date_from ? new Date(date_from) : new Date(Date.now() - 7 * 86400000);
    const token = bot_token ||
      sourceData?.find((s: any) => s.config?.bot_token)?.[0]?.config?.bot_token ||
      Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

    const results: ScanResult[] = [];

    // Run both modes in parallel
    const [publicResults, botResults] = await Promise.allSettled([
      scanPublicChannels(configuredChannels, keywords, fromDate),
      token ? scanViaBot(token, configuredChannels, keywords, fromDate) : Promise.resolve([]),
    ]);

    if (publicResults.status === "fulfilled") results.push(...publicResults.value);
    if (botResults.status === "fulfilled") results.push(...botResults.value);

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped = results.filter(r => {
      const key = r.url || (r.channel + r.title + r.content.slice(0, 100));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return new Response(JSON.stringify({
      source: "telegram",
      results: deduped,
      count: deduped.length,
      channels_scanned: configuredChannels.length,
      modes_used: [true, !!token],
    }), { headers: corsHeaders });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders,
    });
  }
});

// ── Mode 1: Public channel preview ──────────────────────────────────────

async function scanPublicChannels(
  channels: string[], keywords: string[], fromDate: Date
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  const fetchOne = async (channel: string) => {
    const cleanChannel = channel.replace(/^@/, "").replace(/^https?:\/\/t\.me\/(s\/)?/, "");
    const urls = [
      `https://t.me/s/${cleanChannel}`,
      `https://nitter.poast.org/${cleanChannel}/rss`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SentiWatch/1.0)" },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) continue;

        const text = await res.text();

        // HTML mode: parse t.me/s page
        if (url.includes("t.me/s/")) {
          return parseTelegramHTML(text, channel, keywords, fromDate);
        }

        // RSS mode
        if (url.includes("/rss")) {
          return parseRSS(text, channel, keywords, fromDate);
        }
      } catch {
        continue;
      }
    }

    return [];
  };

  // Fetch 3 channels at a time to avoid rate limiting
  for (let i = 0; i < channels.length; i += 3) {
    const batch = channels.slice(i, i + 3);
    const batchResults = await Promise.allSettled(batch.map(fetchOne));
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(...r.value);
    }
  }

  return results;
}

function parseTelegramHTML(
  html: string, channel: string, keywords: string[], fromDate: Date
): ScanResult[] {
  const results: ScanResult[] = [];

  // Match message blocks from t.me/s page
  const msgRegex = /<div class="tgme_widget_message_wrap[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let match;

  while ((match = msgRegex.exec(html)) !== null) {
    const block = match[1];

    const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const dateMatch = block.match(/<time[^>]*datetime="([^"]*)"/i);
    const idMatch = block.match(/data-post="([^"]*)"/i);

    const text = cleanHtml(textMatch?.[1] || "");
    if (!text || text.length < 20) continue;

    const postedAt = dateMatch?.[1] || null;
    if (postedAt && new Date(postedAt) < fromDate) continue;

    // Keyword match
    const searchText = text.toLowerCase();
    if (!keywords.some(k => searchText.includes(k.toLowerCase()))) continue;

    const msgId = idMatch?.[1] || "";
    const url = msgId ? `https://t.me/${channel}/${msgId.split("/").pop()}` : "";

    results.push({
      url,
      title: text.split("\n")[0].slice(0, 200),
      content: text.slice(0, 2000),
      source: "telegram",
      posted_at: postedAt,
      channel: `@${channel}`,
    });
  }

  return results;
}

// ── Mode 2: Bot API ─────────────────────────────────────────────────────

async function scanViaBot(
  token: string, channels: string[], keywords: string[], fromDate: Date
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  for (const channel of channels) {
    try {
      const cleanChannel = channel.replace(/^@/, "");
      const chatId = `@${cleanChannel}`;

      // Get recent messages via bot
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?chat_id=${encodeURIComponent(chatId)}&limit=50`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!res.ok) continue;

      const data = await res.json();
      if (!data.ok || !data.result?.length) continue;

      for (const update of data.result) {
        const msg = update.message || update.channel_post;
        if (!msg?.text) continue;

        const msgDate = new Date(msg.date * 1000);
        if (msgDate < fromDate) continue;

        const text = msg.text.toLowerCase();
        if (!keywords.some(k => text.includes(k.toLowerCase()))) continue;

        const msgId = msg.message_id;
        results.push({
          url: `https://t.me/${cleanChannel}/${msgId}`,
          title: msg.text.split("\n")[0].slice(0, 200),
          content: msg.text.slice(0, 2000),
          source: "telegram",
          posted_at: msgDate.toISOString(),
          channel: `@${cleanChannel}`,
          author_name: msg.from?.username || msg.from?.first_name || undefined,
        });
      }
    } catch {
      continue;
    }
  }

  return results;
}

// ── RSS Parser for Nitter fallback ──────────────────────────────────────

function parseRSS(
  xml: string, channel: string, keywords: string[], fromDate: Date
): ScanResult[] {
  const results: ScanResult[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const entry = match[1];
    const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
    const link = entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "";
    const date = entry.match(/<(?:pubDate|dc:date)>([\s\S]*?)<\/(?:pubDate|dc:date)>/i)?.[1];
    const desc = entry.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || "";

    const content = cleanHtml(desc || title);
    const searchText = (title + " " + content).toLowerCase();
    if (!keywords.some(k => searchText.includes(k.toLowerCase()))) continue;

    const postedAt = date ? new Date(date).toISOString() : null;
    if (postedAt && new Date(postedAt) < fromDate) continue;

    results.push({
      url: link,
      title: cleanHtml(title).slice(0, 200),
      content: content.slice(0, 2000),
      source: "telegram",
      posted_at: postedAt,
      channel: `@${channel}`,
    });
  }

  return results;
}

function cleanHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}