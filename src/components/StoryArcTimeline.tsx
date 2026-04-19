import { useStoryArc, type ArcStage, type KeyMoment } from "@/hooks/useStoryArc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, TrendingUp, TrendingDown, MessageCircle, Shield, Newspaper, AlertCircle } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { format } from "date-fns";

const STAGE_COLORS: Record<ArcStage, string> = {
  origin:        "#3b82f6",
  amplification: "#f59e0b",
  peak:          "#ef4444",
  response:      "#22c55e",
  decay:         "#f97316",
  tail:          "hsl(var(--muted-foreground)/0.4)",
  normal:        "hsl(var(--muted-foreground)/0.25)",
};

const MOMENT_ICONS: Record<KeyMoment["type"], any> = {
  first_mention:     Search,
  volume_spike:      TrendingUp,
  sentiment_shift:   MessageCircle,
  official_response: Shield,
  media_pickup:      Newspaper,
  decay_start:       TrendingDown,
};

const MOMENT_COLORS: Record<KeyMoment["type"], string> = {
  first_mention:     "text-blue-400",
  volume_spike:      "text-sentinel-amber",
  sentiment_shift:   "text-purple-400",
  official_response: "text-emerald-400",
  media_pickup:      "text-sky-400",
  decay_start:       "text-sentinel-red",
};

const PHASE_STYLES: Record<string, string> = {
  emerging:   "text-blue-400 border-blue-400/40 bg-blue-400/10",
  escalating: "text-sentinel-red border-sentinel-red/40 bg-sentinel-red/10",
  peaked:     "text-orange-400 border-orange-400/40 bg-orange-400/10",
  declining:  "text-sentinel-amber border-sentinel-amber/40 bg-sentinel-amber/10",
  resolved:   "text-emerald-500 border-emerald-500/40 bg-emerald-500/10",
};

const PHASE_EMOJI: Record<string, string> = {
  emerging: "🔍", escalating: "⚡", peaked: "🔥", declining: "📉", resolved: "✅",
};

interface Props {
  sourceType: "incident" | "topic_watch";
  sourceId: string;
  days?: number;
  compact?: boolean;
}

export default function StoryArcTimeline({ sourceType, sourceId, days = 7, compact = false }: Props) {
  const { arc, keyMoments, summary, loading } = useStoryArc(sourceType, sourceId, days);

  if (loading) return <Skeleton className="h-48 w-full rounded-xl" />;

  if (!arc.length || !summary) {
    return (
      <Card className="bg-card border-border p-6 text-center text-muted-foreground">
        <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No arc data yet — story will build as mentions are collected.</p>
      </Card>
    );
  }

  const chartData = arc.map(s => ({
    time: format(new Date(s.bucket), "MM/dd HH:mm"),
    volume: s.volume,
    negPct: s.negativePct,
    stage: s.stage,
  }));

  const phaseStyle = PHASE_STYLES[summary.narrativePhase] ?? PHASE_STYLES.emerging;
  const phaseEmoji = PHASE_EMOJI[summary.narrativePhase] ?? "📊";

  return (
    <Card className="bg-card border-border p-5 space-y-4">
      {/* Summary header */}
      {!compact && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs ${phaseStyle}`}>
                {phaseEmoji} {summary.narrativePhase.charAt(0).toUpperCase() + summary.narrativePhase.slice(1)}
              </Badge>
              <span className="text-xs text-muted-foreground">{summary.durationHours}h tracked · {summary.totalMentions} total mentions</span>
            </div>
            <p className="text-sm text-foreground">{summary.oneLineSummary}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Peak</p>
            <p className="text-lg font-bold text-foreground">{summary.peakVolume}</p>
            <p className="text-xs text-muted-foreground">mentions/4h</p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STAGE_COLORS).filter(([s]) => arc.some(a => a.stage === s)).map(([stage, color]) => (
          <div key={stage} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="capitalize">{stage}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
            formatter={(val: any, name: string) => [name === "negPct" ? `${val}%` : val, name === "negPct" ? "Negative %" : "Volume"]}
          />
          {/* Key moment reference lines */}
          {keyMoments.slice(0, 4).map((m, i) => (
            <ReferenceLine
              key={i}
              yAxisId="left"
              x={format(new Date(m.timestamp), "MM/dd HH:mm")}
              stroke={m.type === "official_response" ? "#22c55e" : m.type === "volume_spike" ? "#f59e0b" : "hsl(var(--muted-foreground)/0.4)"}
              strokeDasharray="3 3"
            />
          ))}
          <Bar yAxisId="left" dataKey="volume" name="volume" radius={[2, 2, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={STAGE_COLORS[d.stage as ArcStage] ?? STAGE_COLORS.normal} />
            ))}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="negPct" stroke="#ef4444" strokeWidth={1.5} dot={false} name="negPct" />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Key moment pins */}
      {keyMoments.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Key Moments</p>
          <div className="space-y-1">
            {keyMoments.map((m, i) => {
              const Icon = MOMENT_ICONS[m.type] ?? AlertCircle;
              const color = MOMENT_COLORS[m.type] ?? "text-muted-foreground";
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${color}`} />
                  <div className="flex-1">
                    <span className="text-foreground">{m.description}</span>
                    {m.mentionCount && <span className="text-muted-foreground ml-1">({m.mentionCount} mentions)</span>}
                  </div>
                  <span className="text-muted-foreground text-[10px] flex-shrink-0">
                    {m.timestamp ? format(new Date(m.timestamp), "MM/dd HH:mm") : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
