import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Users, TrendingUp, ChevronRight } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";

interface WatchlistThreat {
  person_id: string;
  name: string;
  tier: string | null;
  impact_score: number;
  mention_count: number;
  negative_ratio: number;
  group_name: string | null;
  group_color: string | null;
}

const tierColors: Record<string, string> = {
  threat_actor: "border-sentinel-red/40 text-sentinel-red",
  impersonator: "border-sentinel-red/30 text-sentinel-red",
  hostile_outlet: "border-sentinel-amber/40 text-sentinel-amber",
  bot_network: "border-sentinel-red/30 text-sentinel-red",
  critic: "border-sentinel-amber/30 text-sentinel-amber",
  competitor: "border-primary/30 text-primary",
  executive: "border-primary/30 text-primary",
  influencer: "border-primary/30 text-primary",
};

export default function WatchlistThreatsWidget() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [threats, setThreats] = useState<WatchlistThreat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    supabase
      .from("org_people")
      .select("person_id, tier, impact_score, mention_count, negative_ratio, watchlist_group_id, people(name), watchlist_groups(name, color)")
      .eq("org_id", currentOrg.id)
      .order("impact_score", { ascending: false })
      .limit(6)
      .then(({ data }) => {
        const items = (data || [])
          .filter((d: any) => d.people)
          .map((d: any) => ({
            person_id: d.person_id,
            name: d.people.name,
            tier: d.tier,
            impact_score: d.impact_score || 0,
            mention_count: d.mention_count || 0,
            negative_ratio: d.negative_ratio || 0,
            group_name: d.watchlist_groups?.name || null,
            group_color: d.watchlist_groups?.color || null,
          }));
        setThreats(items);
        setLoading(false);
      });
  }, [currentOrg]);

  if (loading) return <Skeleton className="h-64 rounded-lg" />;
  if (threats.length === 0) return null;

  return (
    <Card className="bg-card border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-sentinel-red" />
          Top Tracked Threats
          <InfoTooltip text="Highest-impact tracked people across your watchlist groups, ranked by impact score." />
        </span>
        <button
          onClick={() => navigate("/people")}
          className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
        >
          View all <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-2">
        {threats.map((t) => (
          <div
            key={t.person_id}
            className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 border border-border hover:border-primary/30 cursor-pointer transition-colors"
            onClick={() => navigate(`/people/${t.person_id}`)}
          >
            <div className="h-8 w-8 rounded-full bg-sentinel-red/10 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 text-sentinel-red" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-card-foreground truncate">{t.name}</span>
                {t.group_name && (
                  <Badge variant="outline" className="text-[8px] py-0 px-1.5 border-muted-foreground/30">
                    {t.group_name}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                <span>{t.mention_count} mentions</span>
                {t.negative_ratio > 0 && (
                  <span className="text-sentinel-red">{Math.round(t.negative_ratio * 100)}% negative</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className={`text-[9px] capitalize ${tierColors[t.tier || ""] || "border-muted-foreground/30 text-muted-foreground"}`}>
                {(t.tier || "other").replace("_", " ")}
              </Badge>
              <div className="flex items-center gap-1 text-xs font-mono">
                <TrendingUp className="h-3 w-3 text-sentinel-amber" />
                <span className="text-card-foreground">{Math.round(t.impact_score)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
