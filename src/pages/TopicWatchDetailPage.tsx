import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTopicWatchDetail, getBinanceImpactLabel, updateTopicWatch } from "@/hooks/useTopicWatches";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Crosshair, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import StoryArcTimeline from "@/components/StoryArcTimeline";
import ThreatResearchPanel from "@/components/ThreatResearchPanel";

type Range = "24h" | "48h" | "7d";

const RANGE_HOURS: Record<Range, number> = { "24h": 24, "48h": 48, "7d": 168 };

export default function TopicWatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { watch, snapshots, loading } = useTopicWatchDetail(id);
  const [range, setRange] = useState<Range>("48h");

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!watch) return (
    <div className="p-6 text-center text-muted-foreground">
      Watch not found. <button className="text-primary hover:underline" onClick={() => navigate("/topic-watch")}>Back to watches</button>
    </div>
  );

  const now = Date.now();
  const cutoff = new Date(now - RANGE_HOURS[range] * 3600 * 1000).toISOString();
  const filtered = snapshots.filter(s => s.bucket_hour >= cutoff);
  const latest = snapshots[snapshots.length - 1];
  const impact = getBinanceImpactLabel(latest?.binance_overlap_pct ?? 0);

  const totalMentions = filtered.reduce((a, s) => a + s.total_mentions, 0);
  const totalNeg = filtered.reduce((a, s) => a + s.negative_mentions, 0);
  const negPct = totalMentions ? Math.round((totalNeg / totalMentions) * 100) : 0;
  const avgOverlap = filtered.length
    ? filtered.reduce((a, s) => a + s.binance_overlap_pct, 0) / filtered.length
    : 0;
  const velocity = latest?.velocity ?? 0;

  const chartData = filtered.map(s => ({
    hour: format(new Date(s.bucket_hour), "MM/dd HH:mm"),
    mentions: s.total_mentions,
    overlap: s.binance_overlap_pct,
  }));

  // Binance impact gauge score (0–100)
  const gaugeScore = Math.min(100, Math.round(
    (avgOverlap * 0.5) + (negPct * 0.3) + (Math.abs(velocity) * 10 * 0.2)
  ));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/topic-watch")} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="p-2 rounded-lg bg-primary/10">
          <Crosshair className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{watch.name}</h1>
            <Badge variant="outline" className={`${impact.color} border-current text-xs`}>{impact.label} impact</Badge>
            <Badge variant="outline" className="text-xs capitalize">{watch.status}</Badge>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {watch.query.split(",").map(t => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 bg-muted/40 text-muted-foreground rounded-full">{t.trim()}</span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {(["24h", "48h", "7d"] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${range === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Mentions", value: totalMentions.toLocaleString(), sub: "in period" },
          { label: "Negative %", value: `${negPct}%`, sub: "of total" },
          { label: "Binance Overlap", value: `${avgOverlap.toFixed(1)}%`, sub: "avg crossover" },
          { label: "Velocity", value: `${Math.abs(velocity).toFixed(1)}/hr`, sub: velocity >= 0 ? "↑ rising" : "↓ declining" },
        ].map(s => (
          <Card key={s.label} className="bg-card border-border p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </Card>
        ))}
      </div>

      {/* Main chart */}
      <Card className="bg-card border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-foreground">Mention Volume + Binance Overlap</span>
          {avgOverlap >= watch.alert_threshold && (
            <div className="flex items-center gap-1.5 text-xs text-sentinel-red">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Overlap exceeds {watch.alert_threshold}% threshold</span>
            </div>
          )}
        </div>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No snapshot data yet. Data populates as scans run.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine yAxisId="right" y={watch.alert_threshold} stroke="hsl(var(--sentinel-red))" strokeDasharray="4 4" label={{ value: `Threshold ${watch.alert_threshold}%`, position: "right", fontSize: 10 }} />
              <Bar yAxisId="left" dataKey="mentions" fill="hsl(var(--muted-foreground)/0.3)" name="Mentions" radius={[2, 2, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="overlap" stroke="#f97316" strokeWidth={2} dot={false} name="Binance Overlap %" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Story Arc */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Story Arc</h2>
        <StoryArcTimeline sourceType="topic_watch" sourceId={id!} days={7} />
      </div>

      {/* Threat Research */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Threat Intelligence Research</h2>
        <ThreatResearchPanel
          text={watch.description ?? watch.query}
          watchId={watch.id}
          initialData={(watch as any).research_data ?? undefined}
        />
      </div>
    </div>
  );
}
