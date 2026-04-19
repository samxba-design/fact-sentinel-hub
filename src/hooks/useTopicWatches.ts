import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TopicWatch {
  id: string;
  org_id: string;
  name: string;
  query: string;
  description?: string;
  status: "active" | "paused" | "archived";
  alert_threshold: number;
  color: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  // Computed from latest snapshot
  latestSnapshot?: TopicSnapshot;
}

export interface TopicSnapshot {
  id: string;
  topic_watch_id: string;
  bucket_hour: string;
  total_mentions: number;
  negative_mentions: number;
  positive_mentions: number;
  neutral_mentions: number;
  binance_overlap: number;
  binance_overlap_pct: number;
  velocity: number;
  top_sources: string[];
}

export interface CreateTopicWatchData {
  name: string;
  query: string;
  description?: string;
  alert_threshold?: number;
  color?: string;
  tags?: string[];
}

const BINANCE_TERMS = ["binance", "bnb", "cz ", "changpeng", "binance.com"];

function overlapPct(total: number, overlap: number) {
  if (total === 0) return 0;
  return Math.round((overlap / total) * 100 * 100) / 100;
}

export function getBinanceImpactLabel(pct: number): { label: string; color: string } {
  if (pct >= 50) return { label: "Critical", color: "text-sentinel-red" };
  if (pct >= 20) return { label: "High", color: "text-orange-500" };
  if (pct >= 5)  return { label: "Medium", color: "text-sentinel-amber" };
  return { label: "Low", color: "text-muted-foreground" };
}

export function useTopicWatches(orgId: string | undefined) {
  const [watches, setWatches] = useState<TopicWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("topic_watches" as any)
        .select("*")
        .eq("org_id", orgId)
        .neq("status", "archived")
        .order("created_at", { ascending: false });
      if (err) throw err;

      // For each watch, grab latest snapshot
      const withSnapshots = await Promise.all((data || []).map(async (w: any) => {
        const { data: snaps } = await supabase
          .from("topic_watch_snapshots" as any)
          .select("*")
          .eq("topic_watch_id", w.id)
          .order("bucket_hour", { ascending: false })
          .limit(1);
        return { ...w, latestSnapshot: snaps?.[0] ?? undefined };
      }));
      setWatches(withSnapshots as TopicWatch[]);
    } catch (e: any) {
      // Table may not exist in demo — return empty gracefully
      setWatches([]);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  return { watches, loading, error, refetch: load };
}

export function useTopicWatchDetail(id: string | undefined) {
  const [watch, setWatch] = useState<TopicWatch | null>(null);
  const [snapshots, setSnapshots] = useState<TopicSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [{ data: w }, { data: snaps }] = await Promise.all([
          supabase.from("topic_watches" as any).select("*").eq("id", id).single(),
          supabase.from("topic_watch_snapshots" as any).select("*")
            .eq("topic_watch_id", id)
            .order("bucket_hour", { ascending: true })
            .gte("bucket_hour", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
        ]);
        setWatch((w as TopicWatch) ?? null);
        setSnapshots((snaps as TopicSnapshot[]) ?? []);
      } catch {
        setWatch(null); setSnapshots([]);
      } finally { setLoading(false); }
    })();
  }, [id]);

  return { watch, snapshots, loading };
}

export async function createTopicWatch(orgId: string, data: CreateTopicWatchData) {
  // First try via edge function (handles table-not-exists gracefully)
  try {
    const { data: result, error } = await supabase.functions.invoke("analyze-topic-watch", {
      body: { action: "create", org_id: orgId, watch_data: data },
    });
    if (error) throw new Error(error.message);
    if (result?.error) throw new Error(result.error);
    return result.watch;
  } catch (fnErr: any) {
    // Fallback: direct insert (may fail if table doesn't exist)
    const { data: result, error } = await supabase
      .from("topic_watches" as any)
      .insert({ org_id: orgId, ...data })
      .select()
      .single();
    if (error) throw error;
    return result;
  }
}

export async function updateTopicWatch(id: string, patch: Partial<TopicWatch>) {
  const { error } = await supabase
    .from("topic_watches" as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTopicWatch(id: string) {
  await supabase.from("topic_watches" as any).update({ status: "archived" }).eq("id", id);
}

/** Compute what % of mentions matching a query also mention Binance (last N hours). */
export async function computeBinanceOverlap(orgId: string, query: string, hours = 48) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const terms = query.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  try {
    const { data } = await supabase
      .from("mentions")
      .select("id, content")
      .eq("org_id", orgId)
      .gte("posted_at", since);
    if (!data?.length) return { total: 0, overlap: 0, pct: 0 };

    const matching = data.filter(m =>
      terms.some(t => m.content?.toLowerCase().includes(t))
    );
    const withBinance = matching.filter(m =>
      BINANCE_TERMS.some(b => m.content?.toLowerCase().includes(b))
    );
    return {
      total: matching.length,
      overlap: withBinance.length,
      pct: overlapPct(matching.length, withBinance.length),
    };
  } catch { return { total: 0, overlap: 0, pct: 0 }; }
}
