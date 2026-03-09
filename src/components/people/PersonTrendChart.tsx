import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import { format, subDays, differenceInDays } from "date-fns";

interface Mention {
  id: string;
  sentiment_label: string | null;
  posted_at: string | null;
  created_at?: string | null;
}

interface PersonTrendChartProps {
  mentions: Mention[];
}

const SENTIMENT_COLORS: Record<string, string> = {
  negative: "hsl(0, 84%, 60%)",
  neutral: "hsl(220, 9%, 46%)",
  positive: "hsl(142, 71%, 45%)",
  mixed: "hsl(35, 92%, 50%)",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color || p.fill }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function PersonTrendChart({ mentions }: PersonTrendChartProps) {
  const { volumeData, sentimentOverTime } = useMemo(() => {
    if (mentions.length === 0) return { volumeData: [], sentimentOverTime: [] };

    // Determine date range from actual data
    const dates = mentions
      .map(m => new Date(m.posted_at || m.created_at || ""))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (dates.length === 0) return { volumeData: [], sentimentOverTime: [] };

    const earliest = dates[0];
    const latest = dates[dates.length - 1];
    const daySpan = Math.max(differenceInDays(latest, earliest), 7);
    const rangeDays = Math.min(daySpan + 1, 90);

    const now = new Date();
    const dayMap: Record<string, { total: number; negative: number; positive: number; neutral: number }> = {};

    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = format(subDays(now, i), "MMM dd");
      dayMap[d] = { total: 0, negative: 0, positive: 0, neutral: 0 };
    }

    mentions.forEach(m => {
      const dateStr = m.posted_at || m.created_at;
      if (!dateStr) return;
      const d = format(new Date(dateStr), "MMM dd");
      if (d in dayMap) {
        dayMap[d].total++;
        const label = m.sentiment_label || "neutral";
        if (label === "negative") dayMap[d].negative++;
        else if (label === "positive") dayMap[d].positive++;
        else dayMap[d].neutral++;
      }
    });

    const entries = Object.entries(dayMap);
    return {
      volumeData: entries.map(([date, counts]) => ({ date, mentions: counts.total })),
      sentimentOverTime: entries.map(([date, counts]) => ({
        date,
        positive: counts.positive,
        neutral: counts.neutral,
        negative: counts.negative,
      })),
    };
  }, [mentions]);

  if (mentions.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Volume over time */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> Mention Volume Over Time
        </h3>
        {volumeData.every(d => d.mentions === 0) ? (
          <p className="text-xs text-muted-foreground">No timeline data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={volumeData}>
              <defs>
                <linearGradient id="personVolGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="mentions" stroke="hsl(var(--primary))" fill="url(#personVolGrad)" strokeWidth={2} name="Mentions" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Sentiment stacked over time */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-sentinel-amber" /> Sentiment Over Time
        </h3>
        {sentimentOverTime.every(d => d.positive === 0 && d.neutral === 0 && d.negative === 0) ? (
          <p className="text-xs text-muted-foreground">No sentiment timeline data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sentimentOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="positive" stackId="s" fill={SENTIMENT_COLORS.positive} name="Positive" radius={[0, 0, 0, 0]} />
              <Bar dataKey="neutral" stackId="s" fill={SENTIMENT_COLORS.neutral} name="Neutral" />
              <Bar dataKey="negative" stackId="s" fill={SENTIMENT_COLORS.negative} name="Negative" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
