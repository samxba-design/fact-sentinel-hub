// Edge function: scan-regulatory
// Crawls financial regulator websites for brand/competitor mentions.
// Sources: SEC EDGAR, CFTC, FCA, MAS, FinCEN, ESMA
//
// Input: { org_id, keywords: string[], date_from?: string, date_to?: string }
// Output: { results: ScanResult[], source: "regulatory" }

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
  regulator: string;
  relevance: string;
}

// Regulatory sources with their RSS/API endpoints
const REGULATORS = [
  {
    name: "SEC",
    rss: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=&company=&dateb=&owner=include&start=0&count=40&output=atom",
    baseUrl: "https://www.sec.gov",
  },
  {
    name: "CFTC",
    rss: "https://www.cftc.gov/PressRoom/PressReleases/rss",
    baseUrl: "https://www.cftc.gov",
  },
  {
    name: "FCA",
    rss: "https://www.fca.org.uk/news/rss.xml",
    baseUrl: "https://www.fca.org.uk",
  },
  {
    name: "MAS",
    rss: "https://www.mas.gov.sg/news/media-releases/rss.xml",
    baseUrl: "https://www.mas.gov.sg",
  },
  {
    name: "FinCEN",
    rss: "https://www.fincen.gov/news/news-releases/rss.xml",
    baseUrl: "https://www.fincen.gov",
  },
  {
    name: "ESMA",
    rss: "https://www.esma.europa.eu/press-news/esma-news/rss.xml",
    baseUrl: "https://www.esma.europa.eu",
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const { org_id, keywords, date_from, date_to } = await req.json();

    if (!org_id || !keywords?.length) {
      return new Response(JSON.stringify({ error: "org_id and keywords required" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const results: ScanResult[] = [];
    const fromDate = date_from ? new Date(date_from) : new Date(Date.now() - 7 * 86400000);

    // Fetch RSS feeds in parallel
    const feedPromises = REGULATORS.map(async (reg) => {
      try {
        const res = await fetch(reg.rss, {
          headers: { "User-Agent": "SentiWatch/1.0 (monitoring bot; contact@sentinel.ai)" },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          console.log(`[regulatory] ${reg.name} feed returned ${res.status}`);
          return [];
        }

        const xml = await res.text();
        return parseAtomRSS(xml, reg.name, reg.baseUrl, keywords, fromDate);
      } catch (e) {
        console.log(`[regulatory] ${reg.name} fetch error:`, e);
        return [];
      }
    });

    const allFeeds = await Promise.allSettled(feedPromises);
    for (const feed of allFeeds) {
      if (feed.status === "fulfilled") results.push(...feed.value);
    }

    // Classify relevance with Gemini for matched items
    if (results.length > 0 && Deno.env.get("GOOGLE_API_KEY")) {
      await classifyRelevance(results, keywords);
    }

    return new Response(JSON.stringify({
      source: "regulatory",
      results,
      count: results.length,
      regulators_scanned: REGULATORS.length,
    }), { headers: corsHeaders });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders,
    });
  }
});

function parseAtomRSS(
  xml: string, regulator: string, baseUrl: string,
  keywords: string[], fromDate: Date
): ScanResult[] {
  const results: ScanResult[] = [];

  // Match <entry> elements (Atom) or <item> elements (RSS 2.0)
  const entryRegex = /<(?:entry|item)>([\s\S]*?)<\/(?:entry|item)>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = entry.match(/<link[^>]*href="([^"]*)"[^>]*>/i)
      || entry.match(/<link[^>]*>([^<]*)<\/link>/i);
    const dateMatch = entry.match(/<(?:published|updated|pubDate|dc:date)>([\s\S]*?)<\/(?:published|updated|pubDate|dc:date)>/i);
    const summaryMatch = entry.match(/<(?:summary|description|content)[^>]*>([\s\S]*?)<\/(?:summary|description|content)>/i);

    const title = cleanHtml(titleMatch?.[1] || "");
    const content = cleanHtml(summaryMatch?.[1] || title);
    let url = linkMatch?.[1] || linkMatch?.[2] || "";

    // Make relative URLs absolute
    if (url && !url.startsWith("http")) {
      url = baseUrl + (url.startsWith("/") ? "" : "/") + url;
    }

    const postedAt = dateMatch?.[1] ? new Date(dateMatch[1]).toISOString() : null;

    // Date filter
    if (postedAt && new Date(postedAt) < fromDate) continue;

    // Keyword match
    const searchText = (title + " " + content).toLowerCase();
    if (!keywords.some(k => searchText.includes(k.toLowerCase()))) continue;

    // Content cleanup
    const cleanedContent = content.replace(/\s+/g, " ").trim().slice(0, 2000);

    results.push({
      url,
      title: title.slice(0, 300),
      content: cleanedContent,
      source: `${regulator.toLowerCase()}-regulatory`,
      posted_at: postedAt,
      regulator,
      relevance: "pending", // classified below
    });
  }

  return results;
}

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function classifyRelevance(results: ScanResult[], keywords: string[]) {
  // Batch classify in groups of 5
  for (let i = 0; i < results.length; i += 5) {
    const batch = results.slice(i, i + 5);
    const items = batch.map((r, idx) =>
      `[${idx + i}] Title: ${r.title}\nRegulator: ${r.regulator}\nSnippet: ${r.content.slice(0, 500)}`
    ).join("\n\n");

    const prompt = `Analyze these regulatory filings/announcements. For each, classify:

- "directly_mentions": specifically names one of these keywords: ${keywords.join(", ")}
- "mentions_competitor": mentions a competing crypto/fintech company
- "industry_wide": affects the crypto/fintech industry broadly
- "irrelevant": not related to crypto/finance

Return ONLY valid JSON array: [{"id":"N","classification":"...","explanation":"one sentence"},...]

Items:
${items}`;

    try {
      const response = await geminiPrompt(prompt, { jsonMode: true, temperature: 0.1, timeoutMs: 20000 });
      const classifications = JSON.parse(response);

      if (Array.isArray(classifications)) {
        for (const c of classifications) {
          const idx = parseInt(c.id) - i;
          if (idx >= 0 && idx < batch.length) {
            batch[idx].relevance = c.classification || "unclassified";
          }
        }
      }
    } catch (e) {
      console.log("[regulatory] Classification batch failed:", e);
      // Leave as "pending"
    }
  }
}