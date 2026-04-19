import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ResponseEvent {
  id: string;
  org_id: string;
  incident_id?: string;
  topic_watch_id?: string;
  response_type: string;
  title: string;
  content_url?: string;
  content_preview?: string;
  published_at: string;
  sentiment_before?: number;
  volume_before?: number;
  sentiment_after?: number;
  volume_after?: number;
  sentiment_delta?: number;
  efficacy_score?: number;
  efficacy_label: string;
  created_at: string;
}

export interface LogResponseData {
  org_id: string;
  incident_id?: string;
  topic_watch_id?: string;
  response_type: string;
  title: string;
  content_url?: string;
  content_preview?: string;
  published_at: string;
}

export function efficacyColor(label: string) {
  if (label === "effective")  return "text-emerald-500";
  if (label === "backfired")  return "text-sentinel-red";
  if (label === "pending")    return "text-muted-foreground";
  return "text-sentinel-amber"; // neutral
}

export function efficacyBg(label: string) {
  if (label === "effective")  return "bg-emerald-500/10 border-emerald-500/30";
  if (label === "backfired")  return "bg-sentinel-red/10 border-sentinel-red/30";
  if (label === "pending")    return "bg-muted/20 border-border";
  return "bg-sentinel-amber/10 border-sentinel-amber/30";
}

export function useResponseEfficacy(orgId: string | undefined, incidentId?: string) {
  const [events, setEvents] = useState<ResponseEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      let q = supabase.from("response_events" as any).select("*").eq("org_id", orgId).order("published_at", { ascending: false });
      if (incidentId) q = q.eq("incident_id", incidentId);
      const { data } = await q;
      setEvents((data as ResponseEvent[]) ?? []);
    } catch { setEvents([]); }
    finally { setLoading(false); }
  }, [orgId, incidentId]);

  useEffect(() => { load(); }, [load]);

  return { events, loading, refetch: load };
}

export async function logResponseEvent(data: LogResponseData): Promise<ResponseEvent> {
  // Snapshot sentiment_before from last 2h of mentions
  const before = new Date(new Date(data.published_at).getTime() - 2 * 3600 * 1000).toISOString();
  const { data: preMentions } = await supabase
    .from("mentions").select("sentiment_score, id")
    .eq("org_id", data.org_id)
    .gte("posted_at", before).lt("posted_at", data.published_at);

  const sentBefore = preMentions?.length
    ? preMentions.reduce((a: number, m: any) => a + (m.sentiment_score ?? 0), 0) / preMentions.length
    : null;

  const { data: result, error } = await supabase
    .from("response_events" as any)
    .insert({
      ...data,
      sentiment_before: sentBefore,
      volume_before: preMentions?.length ?? 0,
      efficacy_label: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return result as ResponseEvent;
}

export async function computeEfficacy(event: ResponseEvent, orgId: string): Promise<Partial<ResponseEvent>> {
  const after = new Date(new Date(event.published_at).getTime() + 24 * 3600 * 1000).toISOString();
  const { data: postMentions } = await supabase
    .from("mentions").select("sentiment_score, id")
    .eq("org_id", orgId)
    .gte("posted_at", event.published_at).lt("posted_at", after);

  if (!postMentions?.length) return { efficacy_label: "pending" };

  const sentAfter = postMentions.reduce((a: number, m: any) => a + (m.sentiment_score ?? 0), 0) / postMentions.length;
  const sentBefore = event.sentiment_before ?? 0;
  const volBefore = event.volume_before ?? 0;
  const volAfter = postMentions.length;
  const delta = sentAfter - sentBefore;

  let score = 50;
  if (delta > 0.1)  score += 25;
  if (delta < -0.1) score -= 25;
  if (volAfter < volBefore) score += 15;
  if (volAfter > volBefore * 1.5) score -= 15;
  score = Math.max(0, Math.min(100, score));

  const label = score >= 65 ? "effective" : score < 40 ? "backfired" : "neutral";

  const patch = {
    sentiment_after: sentAfter,
    volume_after: volAfter,
    sentiment_delta: delta,
    efficacy_score: score,
    efficacy_label: label,
  };
  await supabase.from("response_events" as any).update(patch).eq("id", event.id);
  return patch;
}

export function useEfficacySummary(orgId: string | undefined) {
  const [stats, setStats] = useState({ avgScore: 0, effective: 0, total: 0, bestTitle: "" });
  const { events } = useResponseEfficacy(orgId);

  useEffect(() => {
    const scored = events.filter(e => e.efficacy_score != null);
    if (!scored.length) return;
    const avg = scored.reduce((a, e) => a + (e.efficacy_score ?? 0), 0) / scored.length;
    const effective = scored.filter(e => e.efficacy_label === "effective").length;
    const best = scored.sort((a, b) => (b.efficacy_score ?? 0) - (a.efficacy_score ?? 0))[0];
    setStats({ avgScore: Math.round(avg), effective, total: scored.length, bestTitle: best?.title ?? "" });
  }, [events]);

  return stats;
}
