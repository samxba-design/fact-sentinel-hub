// Edge function: scan-discord
// Monitors Discord servers for brand/competitor mentions via bot.
//
// REQUIREMENTS:
//   - Discord Bot Token (from Discord Developer Portal)
//   - Bot must be invited to target servers with "Read Messages" permission
//   - Bot must have "Message Content Intent" enabled in Developer Portal
//
// Input: { org_id, keywords: string[], date_from?: string, guild_ids?: string[], bot_token?: string }
// Output: { results: ScanResult[], source: "discord" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiPrompt } from "../_lib/gemini.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const corsHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

const DISCORD_API = "https://discord.com/api/v10";

interface ScanResult {
  url: string;
  title: string;
  content: string;
  source: string;
  posted_at: string | null;
  server_name?: string;
  channel_name?: string;
  author_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const { org_id, keywords, date_from, guild_ids: userGuilds, bot_token } = await req.json();

    if (!org_id || !keywords?.length) {
      return new Response(JSON.stringify({ error: "org_id and keywords required" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Get configured Discord token/guilds from sources table
    const { data: sourceData } = await supabase
      .from("sources")
      .select("id, config")
      .eq("org_id", org_id)
      .eq("type", "discord")
      .eq("enabled", true);

    const token = bot_token ||
      sourceData?.find((s: any) => s.config?.bot_token)?.[0]?.config?.bot_token ||
      Deno.env.get("DISCORD_BOT_TOKEN") || "";

    if (!token) {
      return new Response(JSON.stringify({
        source: "discord",
        results: [],
        count: 0,
        error: "DISCORD_BOT_TOKEN not configured. See setup guide.",
      }), { headers: corsHeaders });
    }

    const guildIds = userGuilds ||
      sourceData?.flatMap((s: any) => s.config?.guild_ids || []) || [];

    const fromDate = date_from ? new Date(date_from) : new Date(Date.now() - 7 * 86400000);
    const results: ScanResult[] = [];

    // If specific guilds configured, search them
    if (guildIds.length > 0) {
      for (const guildId of guildIds) {
        try {
          const guildResults = await scanGuild(token, guildId, keywords, fromDate);
          results.push(...guildResults);
        } catch (e) {
          console.log(`[discord] Guild ${guildId} scan error:`, e);
        }
      }
    } else {
      // No guilds configured — return available guilds for setup guidance
      const guilds = await listGuilds(token);
      return new Response(JSON.stringify({
        source: "discord",
        results: [],
        count: 0,
        available_guilds: guilds,
        guidance: "No guilds configured. Use these guild IDs in Sources → Discord to start monitoring.",
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({
      source: "discord",
      results,
      count: results.length,
      guilds_scanned: guildIds.length,
    }), { headers: corsHeaders });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders,
    });
  }
});

// ── List guilds the bot is in ───────────────────────────────────────────

async function listGuilds(token: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Discord API error ${res.status}`);

  const data = await res.json();
  return (data || []).map((g: any) => ({ id: g.id, name: g.name }));
}

// ── Scan a specific guild ───────────────────────────────────────────────

async function scanGuild(
  token: string, guildId: string, keywords: string[], fromDate: Date
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  // Get guild name
  const guildRes = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  let guildName = guildId;
  if (guildRes.ok) {
    const guildData = await guildRes.json();
    guildName = guildData.name || guildId;
  }

  // Get text channels
  const channelsRes = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!channelsRes.ok) {
    console.log(`[discord] Cannot fetch channels for guild ${guildId}: ${channelsRes.status}`);
    return [];
  }

  const channels = (await channelsRes.json()) || [];
  const textChannels = channels.filter((c: any) => c.type === 0); // type 0 = GUILD_TEXT

  // Scan each text channel (limit to first 20 to avoid rate limits)
  const channelsToScan = textChannels.slice(0, 20);

  for (const channel of channelsToScan) {
    try {
      const channelResults = await scanChannel(token, channel.id, channel.name, guildName, keywords, fromDate);
      results.push(...channelResults);
    } catch {
      continue;
    }
  }

  return results;
}

// ── Scan a single channel ───────────────────────────────────────────────

async function scanChannel(
  token: string, channelId: string, channelName: string,
  guildName: string, keywords: string[], fromDate: Date
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  // Fetch recent messages (max 100)
  const res = await fetch(
    `${DISCORD_API}/channels/${channelId}/messages?limit=100`,
    {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) return [];

  const messages = (await res.json()) || [];

  for (const msg of messages) {
    const content = msg.content || "";
    if (!content || content.length < 20) continue;

    // Date check
    const msgDate = new Date(msg.timestamp);
    if (msgDate < fromDate) continue;

    // Keyword match (case-insensitive)
    const searchText = content.toLowerCase();
    if (!keywords.some(k => searchText.includes(k.toLowerCase()))) continue;

    const authorName = msg.author?.username || msg.author?.global_name || "unknown";

    results.push({
      url: `https://discord.com/channels/${msg.guild_id}/${channelId}/${msg.id}`,
      title: content.split("\n")[0].slice(0, 200),
      content: content.slice(0, 2000),
      source: "discord",
      posted_at: msg.timestamp,
      server_name: guildName,
      channel_name: `#${channelName}`,
      author_name: authorName,
    });
  }

  return results;
}