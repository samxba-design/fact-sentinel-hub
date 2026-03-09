import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Sparkles, Loader2, AlertTriangle, TrendingDown, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import InfoTooltip from "@/components/InfoTooltip";

interface SourceScore {
  domain: string;
  credibility_score: number;
  credibility_label: string;
  bias_direction: string;
  accuracy_rating: string;
  category: string;
  risk_level: string;
  reasoning: string;
  total_mentions: number;
  negative_pct: number;
  high_severity_pct: number;
}

export default function SourceCredibilityWidget() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [scores, setScores] = useState<SourceScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadScores = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("score-source-credibility", {
        body: { org_id: currentOrg.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setScores(data?.scores || []);
      setLoaded(true);
    } catch (err: any) {
      toast({ title: "Scoring failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const credColors: Record<string, string> = {
    high: "text-sentinel-emerald",
    medium: "text-sentinel-amber",
    low: "text-sentinel-red",
    unknown: "text-muted-foreground",
  };

  const riskBadgeColors: Record<string, string> = {
    low: "border-sentinel-emerald/30 text-sentinel-emerald bg-sentinel-emerald/5",
    medium: "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5",
    high: "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5",
  };

  if (!loaded) {
    return (
      <Card className="bg-card border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Source Credibility Scores
            <InfoTooltip text="AI-powered scoring of each source's reliability, bias, and historical accuracy based on your monitoring data." />
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">Score your monitored sources for credibility, bias, and accuracy using AI.</p>
        <Button onClick={loadScores} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Scoring sources..." : "Score Sources"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Source Credibility ({scores.length})
        </h3>
        <Button size="sm" variant="ghost" onClick={loadScores} disabled={loading} className="gap-1.5 text-xs">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Refresh
        </Button>
      </div>

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)
      ) : scores.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No sources to score. Run scans first to collect mention data.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {scores.map(s => (
            <div key={s.domain} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/20 transition-colors">
              <div className="shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <span className={`text-sm font-bold font-mono ${credColors[s.credibility_label] || credColors.unknown}`}>
                  {s.credibility_score}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{s.domain}</span>
                  <Badge variant="outline" className={`text-[9px] ${riskBadgeColors[s.risk_level] || ""}`}>
                    {s.risk_level} risk
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-muted-foreground">{s.category}</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">{s.bias_direction}</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">{s.total_mentions} mentions</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{s.reasoning}</p>
              </div>
              <div className="shrink-0 w-16">
                <Progress value={s.credibility_score} className="h-1.5" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
