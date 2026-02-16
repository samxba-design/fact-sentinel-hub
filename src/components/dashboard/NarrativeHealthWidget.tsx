import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InfoTooltip from "@/components/InfoTooltip";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { TrendingUp, TrendingDown, Minus, GitBranch } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { subDays } from "date-fns";

interface NarrativeHealth {
  id: string;
  name: string;
  status: string | null;
  confidence: number | null;
  mention_count: number;
  recent_count: number;
  trend: "rising" | "declining" | "stable";
}

export default function NarrativeHealthWidget() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [narratives, setNarratives] = useState<NarrativeHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    const now = new Date();
    const threeDaysAgo = subDays(now, 3).toISOString();
    const sevenDaysAgo = subDays(now, 7).toISOString();

    supabase
      .from("narratives")
      .select("id, name, status, confidence")
      .eq("org_id", currentOrg.id)
      .in("status", ["active", "watch"])
      .order("last_seen", { ascending: false })
      .limit(5)
      .then(async ({ data }) => {
        if (!data || data.length === 0) {
          setNarratives([]);
          setLoading(false);
          return;
        }

        const enriched = await Promise.all(
          data.map(async (n) => {
            const [totalRes, recentRes] = await Promise.all([
              supabase.from("mention_narratives").select("mention_id", { count: "exact", head: true }).eq("narrative_id", n.id),
              supabase
                .from("mention_narratives")
                .select("mention_id, mentions!inner(posted_at)")
                .eq("narrative_id", n.id)
                .gte("mentions.posted_at", threeDaysAgo),
            ]);

            const totalCount = totalRes.count ?? 0;
            const recentCount = recentRes.data?.length ?? 0;
            const olderCount = totalCount - recentCount;
            
            // Determine trend: if recent 3 days have more than older proportional share, rising
            const dailyRecent = recentCount / 3;
            const dailyOlder = olderCount / Math.max(4, 1); // rest of the 7 days
            let trend: "rising" | "declining" | "stable" = "stable";
            if (dailyRecent > dailyOlder * 1.3) trend = "rising";
            else if (dailyRecent < dailyOlder * 0.7 && totalCount > 0) trend = "declining";

            return {
              id: n.id,
              name: n.name,
              status: n.status,
              confidence: n.confidence,
              mention_count: totalCount,
              recent_count: recentCount,
              trend,
            };
          })
        );

        setNarratives(enriched);
        setLoading(false);
      });
  }, [currentOrg]);

  const trendConfig = {
    rising: { icon: TrendingUp, class: "text-sentinel-red", label: "Rising" },
    declining: { icon: TrendingDown, class: "text-sentinel-emerald", label: "Declining" },
    stable: { icon: Minus, class: "text-muted-foreground", label: "Stable" },
  };

  return (
    <Card className="bg-card border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
          <GitBranch className="h-4 w-4 text-primary" />
          Narrative Health
          <InfoTooltip text="Active narrative threads with trend direction. Rising narratives need attention — they indicate growing conversation volume." />
        </span>
        <Button size="sm" variant="ghost" onClick={() => navigate("/narratives")} className="text-xs text-primary h-6 px-2">
          View all
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : narratives.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No active narratives. Run a scan to detect narrative threads.</p>
      ) : (
        <div className="space-y-2">
          {narratives.map((n) => {
            const trend = trendConfig[n.trend];
            const TrendIcon = trend.icon;
            return (
              <div
                key={n.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors border border-transparent hover:border-primary/20"
                onClick={() => navigate(`/narratives/${n.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-card-foreground font-medium leading-snug">{n.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground font-mono">{n.mention_count} mentions</span>
                    {n.confidence != null && (
                      <span className="text-[10px] text-muted-foreground">· {Number(n.confidence) > 1 ? Math.round(Number(n.confidence)) : Math.round(Number(n.confidence) * 100)}% confidence</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className={`flex items-center gap-1 text-[10px] font-medium ${trend.class}`}>
                    <TrendIcon className="h-3 w-3" />
                    {trend.label}
                  </div>
                  <Badge variant="outline" className={`text-[9px] capitalize ${
                    n.status === "active" ? "border-sentinel-emerald/30 text-sentinel-emerald" : "border-sentinel-amber/30 text-sentinel-amber"
                  }`}>
                    {n.status}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
