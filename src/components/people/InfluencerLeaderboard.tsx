import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, TrendingDown, Minus, User2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import InfoTooltip from "@/components/InfoTooltip";

interface LeaderboardPerson {
  person_id: string;
  name: string;
  tier: string | null;
  follower_count: number | null;
  impact_score: number | null;
  reach_multiplier: number | null;
  sentiment_impact: number | null;
  mention_count: number | null;
  negative_ratio: number | null;
}

interface Props {
  people: LeaderboardPerson[];
}

const tierColors: Record<string, string> = {
  executive: "border-primary/30 text-primary bg-primary/5",
  influencer: "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5",
  journalist: "border-chart-3/30 text-chart-3 bg-chart-3/5",
  critic: "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5",
  other: "border-muted-foreground/30 text-muted-foreground bg-muted/5",
};

export default function InfluencerLeaderboard({ people }: Props) {
  const navigate = useNavigate();
  const sorted = [...people].sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0));

  if (sorted.length === 0) return null;

  return (
    <Card className="bg-card border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          Influencer Impact Leaderboard
          <InfoTooltip text="People ranked by their overall impact score — a composite of follower reach, mention volume, and sentiment influence on your brand." />
        </h3>
      </div>
      <div className="space-y-2">
        {sorted.slice(0, 10).map((p, i) => {
          const sentimentImpact = p.sentiment_impact || 0;
          const SentIcon = sentimentImpact > 0 ? TrendingUp : sentimentImpact < 0 ? TrendingDown : Minus;
          const sentColor = sentimentImpact > 0 ? "text-sentinel-emerald" : sentimentImpact < 0 ? "text-sentinel-red" : "text-muted-foreground";

          return (
            <div
              key={p.person_id}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border hover:border-primary/30 cursor-pointer transition-colors"
              onClick={() => navigate(`/people/${p.person_id}`)}
            >
              <span className={`text-sm font-bold font-mono w-6 text-center ${
                i === 0 ? "text-sentinel-amber" : i === 1 ? "text-muted-foreground" : i === 2 ? "text-chart-3" : "text-muted-foreground/60"
              }`}>
                {i + 1}
              </span>
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User2 className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-card-foreground truncate">{p.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className={`text-[9px] capitalize ${tierColors[p.tier || "other"]}`}>
                    {p.tier || "other"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {(p.follower_count || 0).toLocaleString()} followers
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <div className="text-lg font-bold font-mono text-primary">{Math.round(p.impact_score || 0)}</div>
                <div className={`flex items-center gap-0.5 text-[10px] ${sentColor} justify-end`}>
                  <SentIcon className="h-3 w-3" />
                  <span>{p.reach_multiplier?.toFixed(1) || "1.0"}x reach</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
