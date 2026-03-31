import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { AlertTriangle, TrendingUp, Siren, ExternalLink, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";

interface Threat {
  id: string;
  content: string | null;
  source: string;
  severity: string | null;
  sentiment_label: string | null;
  posted_at: string | null;
  author_name: string | null;
  author_follower_count: number | null;
  url: string | null;
}

export default function ActiveThreatsWidget() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [threats, setThreats] = useState<Threat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    supabase
      .from("mentions")
      .select("id, content, source, severity, sentiment_label, posted_at, author_name, author_follower_count, url")
      .eq("org_id", currentOrg.id)
      
      .in("severity", ["critical", "high"])
      .eq("sentiment_label", "negative")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setThreats(data || []);
        setLoading(false);
      });
  }, [currentOrg]);

  if (loading) return <div className="h-48 bg-muted/30 rounded-lg animate-pulse" />;
  if (threats.length === 0) {
    return (
      <Card className="bg-card border-border p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Siren className="h-4 w-4 text-sentinel-emerald" />
          <h3 className="text-sm font-medium text-card-foreground">Active Threats</h3>
        </div>
        <p className="text-xs text-muted-foreground">No critical or high-severity negative mentions in the last 7 days. Great work! 🎉</p>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-b from-sentinel-red/5 to-card border-sentinel-red/20 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Siren className="h-4 w-4 text-sentinel-red animate-pulse" />
          <h3 className="text-sm font-medium text-sentinel-red">🚨 Active Threats ({threats.length})</h3>
        </div>
        <Button 
          size="sm" 
          variant="ghost" 
          className="text-xs h-6 px-2 text-sentinel-red hover:bg-sentinel-red/10"
          onClick={() => navigate("/risk-console")}
        >
          View All <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      </div>

      <div className="space-y-2">
        {threats.map((threat) => (
          <div 
            key={threat.id} 
            className="p-2.5 rounded-lg border border-sentinel-red/20 bg-sentinel-red/5 hover:bg-sentinel-red/10 cursor-pointer transition-colors"
            onClick={() => navigate(`/mentions?threat=${threat.id}`)}
          >
            <div className="flex items-start gap-2 mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-sentinel-red mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-card-foreground font-medium line-clamp-2">
                  {threat.content?.slice(0, 80)}...
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] py-0 px-1 border-sentinel-red/30 text-sentinel-red shrink-0">
                {threat.severity}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="capitalize">{threat.source}</span>
              {threat.posted_at && <span>·</span>}
              {threat.posted_at && <span>{formatDistanceToNow(new Date(threat.posted_at), { addSuffix: true })}</span>}
              {threat.author_follower_count && threat.author_follower_count > 10000 && (
                <>
                  <span>·</span>
                  <TrendingUp className="h-2.5 w-2.5" />
                  <span>{(threat.author_follower_count / 1000).toFixed(0)}K followers</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button 
        variant="outline" 
        size="sm" 
        className="w-full h-8 text-xs"
        onClick={() => navigate("/risk-console")}
      >
        <Sparkles className="h-3 w-3 mr-1.5" /> Generate Response
      </Button>
    </Card>
  );
}
