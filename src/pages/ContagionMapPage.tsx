import { useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useContagionData, useAllTopicWatches } from "@/hooks/useContagionData";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GitBranch, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { format } from "date-fns";

type Days = 7 | 14 | 30;

function AccelerationBadge({ a }: { a: number }) {
  if (a > 2) return <span className="flex items-center gap-1 text-sentinel-red text-xs"><TrendingUp className="h-3 w-3" /> Accelerating +{a.toFixed(1)}%</span>;
  if (a < -2) return <span className="flex items-center gap-1 text-emerald-500 text-xs"><TrendingDown className="h-3 w-3" /> Stabilising {a.toFixed(1)}%</span>;
  return <span className="flex items-center gap-1 text-muted-foreground text-xs"><Minus className="h-3 w-3" /> Stable</span>;
}

function sentimentBadge(s: string | null) {
  if (s === "negative") return <Badge variant="outline" className="text-[10px] text-sentinel-red border-sentinel-red/40">Negative</Badge>;
  if (s === "positive") return <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/40">Positive</Badge>;
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">Neutral</Badge>;
}

export default function ContagionMapPage() {
  const { currentOrg } = useOrg();
  const watches = useAllTopicWatches(currentOrg?.id);
  const [selectedId, setSelectedId] = useState<string>("");
  const [days, setDays] = useState<Days>(7);

  const activeId = selectedId || watches[0]?.id;
  const { series, bridgePosts, watchQuery, loading } = useContagionData(activeId, currentOrg?.id, days);

  const activeWatch = watches.find(w => w.id === activeId);
  const latestPt = series[series.length - 1];
  const latestAcc = latestPt?.acceleration ?? 0;
  const latestOverlap = latestPt?.overlapPct ?? 0;

  // Auto interpretation
  function interpretation() {
    if (!series.length || !activeWatch) return "";
    const firstPct = series[0]?.overlapPct ?? 0;
    const dir = latestAcc > 2 ? "at an accelerating rate" : latestAcc < -2 ? "and appears to be stabilising" : "steadily";
    if (latestOverlap < 5) return `Minimal crossover between "${activeWatch.name}" and Binance. Low contagion risk.`;
    return `Over the last ${days}d, ${latestOverlap}% of posts mentioning "${activeWatch.query.split(",")[0]?.trim()}" also mention Binance — ${firstPct > 0 ? `up from ${firstPct}% at start` : "with growing frequency"}. This narrative is drifting toward Binance ${dir}.`;
  }

  const chartData = series.map(p => ({
    time: format(new Date(p.hour), "MM/dd HH:mm"),
    topic: p.topicTotal,
    binance: p.binanceTotal,
    overlap: p.overlapPct,
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <GitBranch className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Narrative Contagion Map</h1>
          <p className="text-sm text-muted-foreground">Track how third-party crises drift toward Binance.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Watch selector */}
        <div className="flex-1 min-w-48">
          {watches.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active topic watches. <a href="/topic-watch" className="text-primary hover:underline">Create one first →</a></p>
          ) : (
            <select
              value={activeId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {watches.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex gap-1">
          {([7, 14, 30] as Days[]).map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${days === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <>
          {/* Interpretation + acceleration */}
          {interpretation() && (
            <Card className={`p-4 border ${latestOverlap >= (activeWatch?.alert_threshold ?? 20) ? "border-sentinel-red/40 bg-sentinel-red/5" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-2">
                  {latestOverlap >= (activeWatch?.alert_threshold ?? 20) && <AlertTriangle className="h-4 w-4 text-sentinel-red mt-0.5 flex-shrink-0" />}
                  <p className="text-sm text-foreground">{interpretation()}</p>
                </div>
                <AccelerationBadge a={latestAcc} />
              </div>
            </Card>
          )}

          {/* Main chart */}
          <Card className="bg-card border-border p-5">
            <p className="text-sm font-medium text-foreground mb-4">Mention Volume + Binance Crossover %</p>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">No data. Select a topic watch with recent mentions.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="right" y={activeWatch?.alert_threshold ?? 20} stroke="hsl(var(--sentinel-red))" strokeDasharray="4 4" />
                  <Bar yAxisId="left" dataKey="topic" fill="hsl(var(--muted-foreground)/0.25)" name="Topic mentions" radius={[2, 2, 0, 0]} stackId="a" />
                  <Bar yAxisId="left" dataKey="binance" fill="#f97316" name="Binance mentions" radius={[2, 2, 0, 0]} fillOpacity={0.6} stackId="b" />
                  <Line yAxisId="right" type="monotone" dataKey="overlap" stroke="#ef4444" strokeWidth={2.5} dot={false} name="Crossover %" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Bridge posts */}
          {bridgePosts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Bridge Posts — mentions linking this topic to Binance</h2>
              <div className="space-y-2">
                {bridgePosts.map(p => (
                  <Card key={p.id} className="bg-card border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{p.source}</Badge>
                        {sentimentBadge(p.sentiment_label)}
                      </div>
                      <span className="text-xs text-muted-foreground">{p.posted_at ? format(new Date(p.posted_at), "MMM d, HH:mm") : "—"}</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{(p.content ?? "").slice(0, 220)}{(p.content?.length ?? 0) > 220 ? "…" : ""}</p>
                    <p className="text-[10px] text-muted-foreground">High-reach post linking this topic to Binance</p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
