import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ContagionPoint {
  hour: string;
  topicTotal: number;
  binanceTotal: number;
  overlap: number;
  overlapPct: number;
  acceleration: number; // change vs 24h prior
}

export interface BridgePost {
  id: string;
  content: string;
  source: string;
  sentiment_label: string | null;
  posted_at: string | null;
  url?: string;
}

const BINANCE_TERMS = ["binance", "bnb", "cz ", "changpeng"];

export function useContagionData(topicWatchId: string | undefined, orgId: string | undefined, days = 7) {
  const [series, setSeries] = useState<ContagionPoint[]>([]);
  const [bridgePosts, setBridgePosts] = useState<BridgePost[]>([]);
  const [watchQuery, setWatchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!topicWatchId || !orgId) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch watch to get query terms
        const { data: watch } = await supabase
          .from("topic_watches" as any)
          .select("query")
          .eq("id", topicWatchId)
          .single();

        const query: string = (watch as any)?.query ?? "";
        setWatchQuery(query);
        const terms = query.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean);

        const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
        const { data: mentions } = await supabase
          .from("mentions")
          .select("id, content, source, sentiment_label, posted_at, url")
          .eq("org_id", orgId)
          .gte("posted_at", since)
          .order("posted_at", { ascending: true });

        if (!mentions) { setLoading(false); return; }

        const matchesTopic = (m: any) => terms.some(t => m.content?.toLowerCase().includes(t));
        const matchesBinance = (m: any) => BINANCE_TERMS.some(b => m.content?.toLowerCase().includes(b));

        // Build bridge posts (both topic AND binance)
        const bridges = mentions.filter(m => matchesTopic(m) && matchesBinance(m)).slice(0, 20);
        setBridgePosts(bridges as BridgePost[]);

        // Build hourly buckets (group by 4h for readability)
        const buckets: Record<string, { topicTotal: number; binanceTotal: number; overlap: number }> = {};
        for (const m of mentions) {
          const d = new Date(m.posted_at ?? "");
          const h = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(d.getHours() / 4) * 4).toISOString();
          if (!buckets[h]) buckets[h] = { topicTotal: 0, binanceTotal: 0, overlap: 0 };
          const inTopic = matchesTopic(m);
          const inBinance = matchesBinance(m);
          if (inTopic) buckets[h].topicTotal++;
          if (inBinance) buckets[h].binanceTotal++;
          if (inTopic && inBinance) buckets[h].overlap++;
        }

        const sorted = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
        const pts: ContagionPoint[] = sorted.map(([hour, v], i) => {
          const pct = v.topicTotal ? (v.overlap / v.topicTotal) * 100 : 0;
          // acceleration = pct vs 24h (6 buckets) prior
          const priorPct = i >= 6 ? (sorted[i - 6][1].topicTotal ? (sorted[i - 6][1].overlap / sorted[i - 6][1].topicTotal) * 100 : 0) : 0;
          return {
            hour,
            topicTotal: v.topicTotal,
            binanceTotal: v.binanceTotal,
            overlap: v.overlap,
            overlapPct: Math.round(pct * 10) / 10,
            acceleration: Math.round((pct - priorPct) * 10) / 10,
          };
        });

        setSeries(pts);
      } catch (e) {
        setSeries([]); setBridgePosts([]);
      } finally { setLoading(false); }
    })();
  }, [topicWatchId, orgId, days]);

  return { series, bridgePosts, watchQuery, loading };
}

export function useAllTopicWatches(orgId: string | undefined) {
  const [watches, setWatches] = useState<{ id: string; name: string; query: string; alert_threshold: number }[]>([]);
  useEffect(() => {
    if (!orgId) return;
    supabase.from("topic_watches" as any).select("id,name,query,alert_threshold")
      .eq("org_id", orgId).eq("status", "active")
      .then(({ data }) => setWatches((data as any) ?? []));
  }, [orgId]);
  return watches;
}
