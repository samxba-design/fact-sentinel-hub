import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import InfoTooltip from "@/components/InfoTooltip";
import { TrendingUp, TrendingDown, Minus, Brain, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { subDays, format, addDays } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface DayPoint {
  date: string;
  negative: number;
  positive: number;
  total: number;
  predicted?: boolean;
}

function linearRegression(points: number[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0] || 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += points[i]; sumXY += i * points[i]; sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function exponentialSmoothing(data: number[], alpha = 0.3): number[] {
  if (data.length === 0) return [];
  const result = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

export default function SentimentForecastWidget() {
  const { currentOrg } = useOrg();
  const [loading, setLoading] = useState(true);
  const [historical, setHistorical] = useState<DayPoint[]>([]);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    const now = new Date();
    const ago = subDays(now, 14).toISOString();

    supabase
      .from("mentions")
      .select("posted_at, created_at, sentiment_label")
      .eq("org_id", currentOrg.id)
      .eq("mention_type", "brand")
      .or(`posted_at.gte.${ago},and(posted_at.is.null,created_at.gte.${ago})`)
      .order("created_at")
      .then(({ data }) => {
        const dayMap: Record<string, { negative: number; positive: number; total: number }> = {};
        for (let i = 13; i >= 0; i--) {
          const d = format(subDays(now, i), "MMM dd");
          dayMap[d] = { negative: 0, positive: 0, total: 0 };
        }
        (data || []).forEach((m: any) => {
          const dateStr = m.posted_at || m.created_at;
          if (!dateStr) return;
          const d = format(new Date(dateStr), "MMM dd");
          if (d in dayMap) {
            dayMap[d].total++;
            if (m.sentiment_label === "negative") dayMap[d].negative++;
            if (m.sentiment_label === "positive") dayMap[d].positive++;
          }
        });
        setHistorical(Object.entries(dayMap).map(([date, v]) => ({ date, ...v })));
        setLoading(false);
      });
  }, [currentOrg]);

  const { chartData, forecast, alert } = useMemo(() => {
    // Need at least 7 data points for meaningful predictions
    if (historical.length < 7) return { chartData: historical, forecast: null, alert: null };

    const negValues = historical.map(h => h.negative);
    const totalValues = historical.map(h => h.total);
    const smoothedNeg = exponentialSmoothing(negValues);
    const smoothedTotal = exponentialSmoothing(totalValues);

    const regNeg = linearRegression(smoothedNeg.slice(-7));
    const regTotal = linearRegression(smoothedTotal.slice(-7));
    const n = smoothedNeg.length;

    const predictions: DayPoint[] = [];
    const now = new Date();
    for (let i = 1; i <= 3; i++) {
      const predNeg = Math.max(0, Math.round(regNeg.slope * (6 + i) + regNeg.intercept));
      const predTotal = Math.max(0, Math.round(regTotal.slope * (6 + i) + regTotal.intercept));
      predictions.push({
        date: format(addDays(now, i), "MMM dd"),
        negative: predNeg,
        positive: Math.max(0, predTotal - predNeg),
        total: predTotal,
        predicted: true,
      });
    }

    const avgNeg7 = negValues.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const predAvgNeg = predictions.reduce((a, b) => a + b.negative, 0) / 3;
    const spikeAlert = predAvgNeg > avgNeg7 * 1.5 && predAvgNeg > 2
      ? { type: "spike" as const, message: `Negative mentions predicted to rise ${Math.round((predAvgNeg / Math.max(avgNeg7, 1) - 1) * 100)}% in the next 72h` }
      : regNeg.slope < -0.5
      ? { type: "improving" as const, message: "Negative sentiment trending downward over the next 72h" }
      : null;

    return {
      chartData: [...historical, ...predictions],
      forecast: {
        direction: regNeg.slope > 0.3 ? "up" : regNeg.slope < -0.3 ? "down" : "flat",
        confidence: Math.min(95, Math.max(40, Math.round(60 + (n - 7) * 3))),
        predictions,
      },
      alert: spikeAlert,
    };
  }, [historical]);

  if (loading) return <Skeleton className="h-64 rounded-lg" />;

  // Show insufficient data message when not enough history
  const hasInsufficientData = !forecast && historical.length > 0 && historical.length < 7;


  const ForecastIcon = forecast?.direction === "up" ? TrendingUp : forecast?.direction === "down" ? TrendingDown : Minus;
  const dirColor = forecast?.direction === "up" ? "text-sentinel-red" : forecast?.direction === "down" ? "text-sentinel-emerald" : "text-muted-foreground";

  return (
    <Card className="bg-card border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Sentiment Trend Extrapolation
          <InfoTooltip text="Projected values are estimated using linear regression on your recent mention data. Actual sentiment may vary." />
        </h3>
        <div className="flex items-center gap-2">
          {forecast && (
            <Badge variant="outline" className={`text-[10px] gap-1 ${dirColor}`}>
              <ForecastIcon className="h-3 w-3" />
              {forecast.direction === "up" ? "Rising" : forecast.direction === "down" ? "Declining" : "Stable"}
              <span className="text-muted-foreground ml-1">{forecast.confidence}% conf.</span>
            </Badge>
          )}
        </div>
      </div>

      {hasInsufficientData && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-muted/50 text-muted-foreground border border-border">
          <Brain className="h-3.5 w-3.5 shrink-0" />
          Insufficient data for predictions. Need at least 7 days of mention history.
        </div>
      )}

      {alert && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
          alert.type === "spike" ? "bg-sentinel-red/10 text-sentinel-red border border-sentinel-red/20" : "bg-sentinel-emerald/10 text-sentinel-emerald border border-sentinel-emerald/20"
        }`}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {alert.message}
        </div>
      )}

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null;
              const isPred = payload[0]?.payload?.predicted;
              return (
                <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs">
                  <p className="text-muted-foreground mb-1">{label} {isPred ? "(projected est.)" : ""}</p>
                  {payload.map((p: any) => (
                    <p key={p.dataKey} style={{ color: p.color }} className="font-medium">{p.name}: {p.value}</p>
                  ))}
                </div>
              );
            }}
          />
          {historical.length > 0 && (
            <ReferenceLine x={historical[historical.length - 1]?.date} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.5} />
          )}
          <Area type="monotone" dataKey="negative" stroke="hsl(0, 84%, 60%)" fill="url(#negGrad)" strokeWidth={2} name="Negative" />
          <Area type="monotone" dataKey="positive" stroke="hsl(142, 71%, 45%)" fill="url(#posGrad)" strokeWidth={1.5} name="Positive" />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>← 14 day history</span>
        <span className="flex items-center gap-1">
          <span className="w-4 border-t border-dashed border-muted-foreground" /> Projected (est.) →
        </span>
      </div>
    </Card>
  );
}
