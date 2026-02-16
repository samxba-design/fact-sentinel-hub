import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { subDays, format } from "date-fns";

interface SparkData {
  label: string;
  data: { day: string; count: number }[];
  total: number;
  trend: "up" | "down" | "flat";
  color: string;
}

export default function SentimentSparklines() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [sparks, setSparks] = useState<SparkData[]>([]);

  useEffect(() => {
    if (!currentOrg) return;

    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30).toISOString();

    supabase
      .from("mentions")
      .select("sentiment_label, posted_at")
      .eq("org_id", currentOrg.id)
      .gte("posted_at", thirtyDaysAgo)
      .order("posted_at")
      .then(({ data }) => {
        if (!data || data.length === 0) return;

        const buckets: Record<string, Record<string, number>> = {
          negative: {},
          neutral: {},
          positive: {},
        };

        // Init 30 days
        for (let i = 29; i >= 0; i--) {
          const day = format(subDays(now, i), "MM-dd");
          buckets.negative[day] = 0;
          buckets.neutral[day] = 0;
          buckets.positive[day] = 0;
        }

        data.forEach((m: any) => {
          if (!m.posted_at) return;
          const day = format(new Date(m.posted_at), "MM-dd");
          const label = m.sentiment_label || "neutral";
          if (buckets[label] && day in buckets[label]) {
            buckets[label][day]++;
          }
        });

        const toSparkData = (label: string, color: string): SparkData => {
          const entries = Object.entries(buckets[label]).map(([day, count]) => ({ day, count }));
          const total = entries.reduce((s, e) => s + e.count, 0);
          const firstHalf = entries.slice(0, 15).reduce((s, e) => s + e.count, 0);
          const secondHalf = entries.slice(15).reduce((s, e) => s + e.count, 0);
          const trend = secondHalf > firstHalf * 1.1 ? "up" : secondHalf < firstHalf * 0.9 ? "down" : "flat";
          return { label, data: entries, total, trend, color };
        };

        setSparks([
          toSparkData("negative", "hsl(0, 84%, 60%)"),
          toSparkData("neutral", "hsl(220, 9%, 46%)"),
          toSparkData("positive", "hsl(142, 71%, 45%)"),
        ]);
      });
  }, [currentOrg]);

  if (sparks.length === 0) return null;

  const TrendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus };

  return (
    <Card className="bg-card border-border p-5 space-y-4">
      <span className="text-sm font-medium text-card-foreground">Sentiment Trends (30 days)</span>
      <div className="grid grid-cols-3 gap-4">
        {sparks.map((s) => {
          const Icon = TrendIcon[s.trend];
          return (
            <div
              key={s.label}
              className="space-y-2 cursor-pointer hover:bg-muted/30 rounded-lg p-2 -m-2 transition-colors"
              onClick={() => navigate(`/mentions?sentiment=${s.label}&days=30`)}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs capitalize text-muted-foreground">{s.label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-mono text-card-foreground">{s.total}</span>
                  <Icon className={`h-3 w-3 ${
                    s.trend === "up" && s.label === "negative" ? "text-sentinel-red" :
                    s.trend === "up" && s.label === "positive" ? "text-sentinel-emerald" :
                    s.trend === "down" && s.label === "negative" ? "text-sentinel-emerald" :
                    s.trend === "down" && s.label === "positive" ? "text-sentinel-red" :
                    "text-muted-foreground"
                  }`} />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={40}>
                <LineChart data={s.data}>
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={s.color}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
