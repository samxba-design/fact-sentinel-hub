import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface CompetitorScore {
  name: string;
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
  total_mentions: number;
  sentiment_score: number;
  trend: "up" | "down" | "steady";
  trend_delta: number;
}

const COLORS = ["#22c55e", "#ef4444", "#6b7280"]; // green, red, gray

export default function CompetitorBenchmarkWidget() {
  const { currentOrg } = useOrg();
  const [loading, setLoading] = useState(true);
  const [competitors, setCompetitors] = useState<CompetitorScore[]>([]);
  const [brandScore, setBrandScore] = useState<CompetitorScore | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    loadData();
  }, [currentOrg?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

      // Get competitor keywords
      const { data: compKeywords } = await supabase
        .from("keywords")
        .select("value, type")
        .eq("org_id", currentOrg!.id)
        .eq("type", "competitor")
        .limit(10);

      // Get brand mentions
      const { data: brandMentions } = await supabase
        .from("mentions")
        .select("sentiment_label, sentiment_score, created_at")
        .eq("org_id", currentOrg!.id)
        .eq("mention_type", "brand")
        .gte("created_at", sevenDaysAgo);

      // Get previous period brand mentions for trend
      const { data: prevBrand } = await supabase
        .from("mentions")
        .select("sentiment_label, sentiment_score, created_at")
        .eq("org_id", currentOrg!.id)
        .eq("mention_type", "brand")
        .gte("created_at", fourteenDaysAgo)
        .lt("created_at", sevenDaysAgo);

      if (brandMentions?.length) {
        const currentScore = computeSentimentScore(brandMentions);
        const prevScore = computeSentimentScore(prevBrand || []);
        setBrandScore({
          name: "Your Brand",
          ...currentScore,
          trend: currentScore.sentiment_score > prevScore.sentiment_score ? "up" : currentScore.sentiment_score < prevScore.sentiment_score ? "down" : "steady",
          trend_delta: Math.round((currentScore.sentiment_score - prevScore.sentiment_score) * 100) / 100,
        });
      }

      // Compute competitor scores
      if (compKeywords?.length) {
        const compScores: CompetitorScore[] = [];
        for (const kw of compKeywords) {
          const { data: compMentions } = await supabase
            .from("mentions")
            .select("sentiment_label, sentiment_score, created_at")
            .eq("org_id", currentOrg!.id)
            .eq("mention_type", "competitor")
            .eq("competitor_name", kw.value)
            .gte("created_at", sevenDaysAgo);

          if (compMentions?.length) {
            const { data: prevComp } = await supabase
              .from("mentions")
              .select("sentiment_score")
              .eq("org_id", currentOrg!.id)
              .eq("mention_type", "competitor")
              .eq("competitor_name", kw.value)
              .gte("created_at", fourteenDaysAgo)
              .lt("created_at", sevenDaysAgo);

            const current = computeSentimentScore(compMentions);
            const prev = computeSentimentScore(prevComp || []);
            compScores.push({
              name: kw.value,
              ...current,
              trend: current.sentiment_score > prev.sentiment_score ? "up" : current.sentiment_score < prev.sentiment_score ? "down" : "steady",
              trend_delta: Math.round((current.sentiment_score - prev.sentiment_score) * 100) / 100,
            });
          }
        }
        setCompetitors(compScores.sort((a, b) => b.sentiment_score - a.sentiment_score));
      }
    } catch (e) {
      console.error("Competitor benchmark error:", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Skeleton className="h-64 rounded-lg" />;

  const allScores = brandScore ? [brandScore, ...competitors] : competitors;

  if (allScores.length === 0) {
    return (
      <Card className="bg-card border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Competitor Sentiment Benchmark</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Add competitor keywords in Settings to see how your sentiment compares.
        </p>
      </Card>
    );
  }

  // Bar chart data: sentiment_score per competitor
  const barData = allScores.map(s => ({
    name: s.name.length > 15 ? s.name.slice(0, 14) + "…" : s.name,
    score: Math.round(s.sentiment_score * 100),
    fullName: s.name,
  }));

  return (
    <Card className="bg-card border-border p-5">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Competitor Sentiment Benchmark</span>
      </div>

      {/* Bar chart */}
      <div className="h-48 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={80} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
              formatter={(value: number) => [`${value}% sentiment`, ""]}
              labelFormatter={(label: string, payload: unknown) => payload?.[0]?.payload?.fullName || label}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]}>
              {barData.map((entry, idx) => (
                <Cell key={idx} fill={entry.score >= 60 ? COLORS[0] : entry.score >= 40 ? "#f59e0b" : COLORS[1]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail list */}
      <div className="space-y-2">
        {allScores.map((s, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${s.name === "Your Brand" ? "text-primary" : ""}`}>
                {s.name}
              </span>
              {s.name === "Your Brand" && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">you</Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">
                {s.positive_pct}% pos · {s.negative_pct}% neg · {s.total_mentions} mentions
              </span>
              <span className={`flex items-center gap-0.5 font-medium ${
                s.trend === "up" ? "text-green-500" : s.trend === "down" ? "text-red-500" : "text-muted-foreground"
              }`}>
                {s.trend === "up" ? <TrendingUp className="h-3 w-3" /> : s.trend === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {s.trend_delta > 0 ? "+" : ""}{s.trend_delta}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function computeSentimentScore(mentions: unknown[]): { positive_pct: number; negative_pct: number; neutral_pct: number; total_mentions: number; sentiment_score: number } {
  const total = mentions.length;
  if (total === 0) return { positive_pct: 0, negative_pct: 0, neutral_pct: 0, total_mentions: 0, sentiment_score: 0 };

  let pos = 0, neg = 0;
  for (const m of mentions) {
    if (m.sentiment_label === "positive") pos++;
    else if (m.sentiment_label === "negative") neg++;
  }
  const neu = total - pos - neg;
  const score = (pos / total) - (neg / total);

  return {
    positive_pct: Math.round((pos / total) * 100),
    negative_pct: Math.round((neg / total) * 100),
    neutral_pct: Math.round((neu / total) * 100),
    total_mentions: total,
    sentiment_score: Math.round(score * 100) / 100,
  };
}