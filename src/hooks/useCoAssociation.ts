import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CoAssociationEntity {
  entity: string;
  category: "competitor" | "coin" | "person" | "regulator" | "event" | "unknown";
  coOccurrences: number;
  positivePct: number;
  neutralPct: number;
  negativePct: number;
  trend: "rising" | "stable" | "falling";
  riskLevel: "low" | "elevated" | "high" | "critical";
  firstSeen: string;
  sampleExcerpts: string[];
}

const REGULATOR_TERMS = new Set(["sec", "cftc", "doj", "fca", "cbi", "finra", "lawsuit", "fraud", "ponzi", "rug", "scam", "investigation", "subpoena", "fine", "penalty"]);
const COMPETITOR_TERMS = new Set(["coinbase", "okx", "bybit", "kraken", "crypto.com", "kucoin", "bitfinex", "huobi", "gate.io", "mexc"]);
const COIN_PATTERN = /\b[A-Z]{2,6}\b/g;
const STOP_WORDS = new Set(["the","and","for","are","was","not","but","its","it","in","on","at","to","of","a","an","is","that","this","with","by","from","be","has","had","have","will","can","do","did","if","or","as","so","we","you","your","our","their","they","he","she","his","her","who","what","when","how","all","been","get","got","just","new","now","out","up","via","per","into","than","more","also","about","after","before","over","under","between","through","against"]);

function classify(token: string): CoAssociationEntity["category"] {
  if (REGULATOR_TERMS.has(token)) return "regulator";
  if (COMPETITOR_TERMS.has(token)) return "competitor";
  if (/^[A-Z]{2,6}$/.test(token)) return "coin";
  return "unknown";
}

function riskScore(entity: CoAssociationEntity["category"], negativePct: number, trending: boolean): CoAssociationEntity["riskLevel"] {
  if (entity === "regulator" || (entity === "regulator" && negativePct > 40)) return "critical";
  if (negativePct > 60 || (trending && negativePct > 40)) return "high";
  if (negativePct > 30 || trending) return "elevated";
  return "low";
}

export function useCoAssociation(orgId: string | undefined, days = 30, minCoOccurrences = 3) {
  const [entities, setEntities] = useState<CoAssociationEntity[]>([]);
  const [risingRisks, setRisingRisks] = useState<CoAssociationEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
        const prior = new Date(Date.now() - days * 2 * 24 * 3600 * 1000).toISOString();

        const { data: mentions } = await supabase
          .from("mentions")
          .select("id, content, sentiment_label, posted_at")
          .eq("org_id", orgId)
          .gte("posted_at", since);

        if (!mentions?.length) { setLoading(false); return; }

        // Build co-occurrence map
        type Entry = { count: number; neg: number; pos: number; neu: number; firstSeen: string; excerpts: string[] };
        const map: Record<string, Entry> = {};

        for (const m of mentions) {
          const text = m.content ?? "";
          const lower = text.toLowerCase();
          // Tokenise: split on whitespace + punctuation, deduplicate per mention
          const rawTokens = lower.split(/[\s\.,!?;:()\[\]"'\/\\]+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));
          // Also capture uppercase symbols (coins)
          const upperTokens = (text.match(COIN_PATTERN) ?? []).filter(t => t.length >= 3 && t.length <= 6 && !["THE","AND","FOR","ARE","HAS","NOT","BUT","ITS","WILL","CAN","DID","GET","GOT","NEW","NOW","OUT","VIA","PER"].includes(t));
          const tokens = [...new Set([...rawTokens, ...upperTokens.map(t => t)])];

          const isoDate = m.posted_at ?? new Date().toISOString();
          for (const token of tokens) {
            if (!map[token]) map[token] = { count: 0, neg: 0, pos: 0, neu: 0, firstSeen: isoDate, excerpts: [] };
            map[token].count++;
            if (m.sentiment_label === "negative") map[token].neg++;
            else if (m.sentiment_label === "positive") map[token].pos++;
            else map[token].neu++;
            if (map[token].excerpts.length < 3) map[token].excerpts.push(text.slice(0, 180));
            if (isoDate < map[token].firstSeen) map[token].firstSeen = isoDate;
          }
        }

        // Also compute prior period counts for trend
        const { data: priorMentions } = await supabase
          .from("mentions").select("id, content")
          .eq("org_id", orgId).gte("posted_at", prior).lt("posted_at", since);
        const priorMap: Record<string, number> = {};
        for (const m of priorMentions ?? []) {
          const tokens = (m.content ?? "").toLowerCase().split(/[\s\.,!?;:()\[\]"'\/\\]+/).filter((t: string) => t.length > 2 && !STOP_WORDS.has(t));
          for (const t of tokens) { priorMap[t] = (priorMap[t] ?? 0) + 1; }
        }

        const result: CoAssociationEntity[] = Object.entries(map)
          .filter(([, v]) => v.count >= minCoOccurrences)
          .map(([entity, v]) => {
            const total = v.count || 1;
            const negPct = Math.round((v.neg / total) * 100);
            const posPct = Math.round((v.pos / total) * 100);
            const neuPct = 100 - negPct - posPct;
            const priorCount = priorMap[entity] ?? 0;
            const trendRatio = priorCount > 0 ? v.count / priorCount : (v.count > 5 ? 2 : 1);
            const trending = trendRatio > 1.5;
            const trend: CoAssociationEntity["trend"] = trendRatio > 1.5 ? "rising" : trendRatio < 0.7 ? "falling" : "stable";
            const category = classify(entity);
            return {
              entity,
              category,
              coOccurrences: v.count,
              positivePct: posPct,
              neutralPct: Math.max(0, neuPct),
              negativePct: negPct,
              trend,
              riskLevel: riskScore(category, negPct, trending),
              firstSeen: v.firstSeen,
              sampleExcerpts: v.excerpts,
            };
          })
          .sort((a, b) => b.coOccurrences - a.coOccurrences)
          .slice(0, 60);

        const rising = result
          .filter(e => e.trend === "rising" && e.riskLevel !== "low")
          .sort((a, b) => b.coOccurrences - a.coOccurrences)
          .slice(0, 10);

        setEntities(result);
        setRisingRisks(rising);
      } catch { setEntities([]); setRisingRisks([]); }
      finally { setLoading(false); }
    })();
  }, [orgId, days, minCoOccurrences]);

  return { entities, risingRisks, loading };
}
