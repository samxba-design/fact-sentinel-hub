/**
 * CompetitorFeedWidget — shows a live feed of competitor mentions on the dashboard.
 * Strictly separate from brand health metrics — competitor activity only.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingDown, TrendingUp, Minus, ExternalLink, ArrowRight, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CompetitorMention {
  id: string;
  competitor_name: string | null;
  content: string | null;
  source: string;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
  url: string | null;
}

const COMP_COLORS = [
  "hsl(var(--primary))", "hsl(0,84%,60%)", "hsl(142,71%,45%)",
  "hsl(38,92%,50%)", "hsl(262,83%,58%)", "hsl(190,90%,50%)",
];

function sentimentIcon(label: string | null) {
  if (label === "positive") return <TrendingUp className="h-3 w-3 text-[hsl(var(--sentinel-emerald))]" />;
  if (label === "negative") return <TrendingDown className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export default function CompetitorFeedWidget() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [mentions, setMentions] = useState<CompetitorMention[]>([]);
  const [competitorNames, setCompetitorNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    (async () => {
      setLoading(true);
      const [mentionsRes, compRes] = await Promise.all([
        supabase
          .from("mentions")
          .select("id,competitor_name,content,source,sentiment_label,severity,posted_at,url")
          .eq("org_id", currentOrg.id)
          .eq("mention_type", "competitor")
          .order("posted_at", { ascending: false, nullsFirst: false })
          .limit(15),
        supabase
          .from("keywords")
          .select("value")
          .eq("org_id", currentOrg.id)
          .eq("type", "competitor")
          .eq("status", "active"),
      ]);
      setMentions(mentionsRes.data || []);
      setCompetitorNames((compRes.data || []).map((k: any) => k.value));
      setLoading(false);
    })();
  }, [currentOrg]);

  const colorFor = (name: string | null) => {
    if (!name) return COMP_COLORS[0];
    const idx = competitorNames.indexOf(name);
    return COMP_COLORS[Math.max(0, idx) % COMP_COLORS.length];
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Competitor Activity
          <Badge variant="outline" className="text-[10px] px-1.5 ml-1">
            {competitorNames.length} tracked
          </Badge>
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/competitors/intel-feed")}>
          Full Feed <ArrowRight className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {loading ? (
          <div className="px-5 pb-4 space-y-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : competitorNames.length === 0 ? (
          <div className="px-5 pb-5 text-center space-y-2 py-4">
            <Target className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-xs text-muted-foreground">No competitors tracked yet</p>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate("/competitors")}>
              Add Competitors
            </Button>
          </div>
        ) : mentions.length === 0 ? (
          <div className="px-5 pb-5 text-center space-y-2 py-4">
            <p className="text-xs text-muted-foreground">No competitor mentions yet</p>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate("/competitors")}>
              <Zap className="h-3 w-3 mr-1" /> Run Competitor Scans
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {mentions.map(m => (
              <div key={m.id} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                <div className="shrink-0 mt-0.5">
                  <Badge
                    className="text-[9px] font-semibold px-1.5 py-0 h-4 whitespace-nowrap"
                    style={{
                      backgroundColor: colorFor(m.competitor_name) + "20",
                      color: colorFor(m.competitor_name),
                      border: `1px solid ${colorFor(m.competitor_name)}40`,
                    }}
                  >
                    {m.competitor_name || "Unknown"}
                  </Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
                    {m.content?.slice(0, 120) || "No content"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="outline" className="text-[9px] px-1">{m.source}</Badge>
                    {m.posted_at && (
                      <span className="text-[9px] text-muted-foreground">
                        {formatDistanceToNow(new Date(m.posted_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {sentimentIcon(m.sentiment_label)}
                  {m.url && (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            <div className="px-5 py-2.5">
              <Button variant="ghost" size="sm" className="w-full text-xs h-7 text-muted-foreground" onClick={() => navigate("/competitors/intel-feed")}>
                View all competitor mentions →
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
