import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ArcStage = "origin" | "amplification" | "peak" | "response" | "decay" | "tail" | "normal";

export interface ArcSegment {
  bucket: string;
  volume: number;
  negativePct: number;
  stage: ArcStage;
  label?: string;
}

export interface KeyMoment {
  timestamp: string;
  type: "first_mention" | "volume_spike" | "sentiment_shift" | "official_response" | "media_pickup" | "decay_start";
  description: string;
  mentionCount?: number;
}

export interface ArcSummary {
  totalMentions: number;
  peakHour: string;
  peakVolume: number;
  durationHours: number;
  netSentimentShift: number;
  narrativePhase: "emerging" | "escalating" | "peaked" | "declining" | "resolved";
  oneLineSummary: string;
}

function bucketDate(d: Date, bucketHours = 4) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(d.getHours() / bucketHours) * bucketHours).toISOString();
}

function narrativePhase(segments: ArcSegment[]): ArcSummary["narrativePhase"] {
  if (!segments.length) return "emerging";
  const last3 = segments.slice(-3);
  const first3 = segments.slice(0, 3);
  const avgLast = last3.reduce((a, s) => a + s.volume, 0) / last3.length;
  const avgFirst = first3.reduce((a, s) => a + s.volume, 0) / first3.length;
  const peak = Math.max(...segments.map(s => s.volume));
  const lastVol = segments[segments.length - 1]?.volume ?? 0;
  if (avgLast < 2) return "resolved";
  if (lastVol < peak * 0.3) return "declining";
  if (segments.at(-1)?.stage === "peak") return "peaked";
  if (avgLast > avgFirst * 1.5) return "escalating";
  return "emerging";
}

export function useStoryArc(
  sourceType: "incident" | "topic_watch",
  sourceId: string | undefined,
  days = 7
) {
  const [arc, setArc] = useState<ArcSegment[]>([]);
  const [keyMoments, setKeyMoments] = useState<KeyMoment[]>([]);
  const [summary, setSummary] = useState<ArcSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sourceId) return;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
        let query = supabase.from("mentions").select("id, content, source, sentiment_label, posted_at, severity");

        if (sourceType === "incident") {
          query = query.eq("incident_id", sourceId).gte("posted_at", since);
        } else {
          // For topic watch, first get the watch query terms
          const { data: watch } = await supabase
            .from("topic_watches" as any).select("query, org_id").eq("id", sourceId).single();
          const terms = ((watch as any)?.query ?? "").split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean);
          if (!terms.length) { setLoading(false); return; }
          query = query.eq("org_id", (watch as any)?.org_id).gte("posted_at", since);
          const { data: all } = await query;
          const filtered = (all ?? []).filter((m: any) => terms.some((t: string) => m.content?.toLowerCase().includes(t)));
          buildArc(filtered);
          setLoading(false);
          return;
        }

        const { data } = await query;
        buildArc(data ?? []);
      } catch { setArc([]); setKeyMoments([]); setSummary(null); }
      finally { setLoading(false); }
    })();
  }, [sourceType, sourceId, days]);

  function buildArc(mentions: any[]) {
    if (!mentions.length) { setLoading(false); return; }

    // Sort chronologically
    const sorted = [...mentions].sort((a, b) => (a.posted_at ?? "").localeCompare(b.posted_at ?? ""));

    // Bucket into 4h windows
    const buckets: Record<string, any[]> = {};
    for (const m of sorted) {
      const key = bucketDate(new Date(m.posted_at ?? ""), 4);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(m);
    }

    const bucketList = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
    const volumes = bucketList.map(([, ms]) => ms.length);
    const peakVol = Math.max(...volumes);
    const peakIdx = volumes.indexOf(peakVol);

    // Assign stages
    const segments: ArcSegment[] = bucketList.map(([hour, ms], i) => {
      const vol = ms.length;
      const neg = ms.filter(m => m.sentiment_label === "negative").length;
      const negPct = vol ? Math.round((neg / vol) * 100) : 0;
      let stage: ArcStage = "normal";
      const priorVol = i > 0 ? bucketList[i - 1][1].length : 0;

      if (i === 0 && vol > 0) stage = "origin";
      else if (i === peakIdx) stage = "peak";
      else if (priorVol > 0 && vol >= priorVol * 1.8) stage = "amplification";
      else if (i > peakIdx && vol < peakVol * 0.6) stage = "decay";
      else if (i > peakIdx + 3 && vol < peakVol * 0.2) stage = "tail";

      return { bucket: hour, volume: vol, negativePct: negPct, stage };
    });

    // Key moments
    const moments: KeyMoment[] = [];
    if (sorted[0]) {
      moments.push({ timestamp: sorted[0].posted_at, type: "first_mention", description: "First mention detected", mentionCount: 1 });
    }
    segments.forEach((s, i) => {
      if (s.stage === "amplification") {
        moments.push({ timestamp: s.bucket, type: "volume_spike", description: `Volume spike — ${s.volume} mentions in 4h`, mentionCount: s.volume });
      }
      if (s.stage === "peak") {
        moments.push({ timestamp: s.bucket, type: "volume_spike", description: `Peak activity — ${s.volume} mentions`, mentionCount: s.volume });
      }
      if (i > 1) {
        const prev = segments[i - 1];
        if (Math.abs(s.negativePct - prev.negativePct) > 20) {
          const dir = s.negativePct > prev.negativePct ? "Sentiment deteriorated" : "Sentiment improved";
          moments.push({ timestamp: s.bucket, type: "sentiment_shift", description: `${dir} (${prev.negativePct}% → ${s.negativePct}% negative)` });
        }
      }
      if (s.stage === "decay" && i > 0 && segments[i - 1].stage !== "decay") {
        moments.push({ timestamp: s.bucket, type: "decay_start", description: "Volume beginning to decline" });
      }
    });

    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];
    const durationHours = bucketList.length * 4;
    const phase = narrativePhase(segments);
    const total = volumes.reduce((a, b) => a + b, 0);
    const netShift = (lastSeg?.negativePct ?? 0) - (firstSeg?.negativePct ?? 0);
    const peakBucket = bucketList[peakIdx]?.[0] ?? "";

    const phaseLabel: Record<string, string> = {
      emerging: "just emerging", escalating: "actively escalating",
      peaked: "at its peak", declining: "declining", resolved: "largely resolved",
    };

    const peakHourLabel = peakBucket ? new Date(peakBucket).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" }) : "unknown";
    const oneLineSummary = `Story ${moments[0]?.description?.toLowerCase() ?? "started"}, peaked at ${peakHourLabel} with ${peakVol} mentions — now ${phaseLabel[phase] ?? phase}.`;

    setArc(segments);
    setKeyMoments(moments.slice(0, 8));
    setSummary({ totalMentions: total, peakHour: peakBucket, peakVolume: peakVol, durationHours, netSentimentShift: netShift, narrativePhase: phase, oneLineSummary });
  }

  return { arc, keyMoments, summary, loading };
}
