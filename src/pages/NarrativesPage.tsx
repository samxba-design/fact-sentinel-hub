import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network, ArrowUpRight, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";

interface Narrative {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  confidence: number | null;
  first_seen: string | null;
  last_seen: string | null;
}

export default function NarrativesPage() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const [narratives, setNarratives] = useState<Narrative[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    supabase
      .from("narratives")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setNarratives(data || []);
        setLoading(false);
      });
  }, [currentOrg]);

  const timeAgo = (d: string | null) => {
    if (!d) return "—";
    const diff = Date.now() - new Date(d).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Narratives</h1>
        <p className="text-sm text-muted-foreground mt-1">Narrative intelligence and propagation tracking</p>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : narratives.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Network className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No narratives detected yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Narratives are automatically created when scans detect clusters of related mentions. Run a scan to start detecting patterns.
            </p>
            <Button onClick={() => navigate("/scans")}>
              <Scan className="h-4 w-4 mr-2" /> Run a Scan
            </Button>
          </div>
        ) : (
          narratives.map(n => (
            <Card key={n.id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate(`/narratives/${n.id}`)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Network className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium text-card-foreground">{n.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <span>First seen {timeAgo(n.first_seen)}</span>
                      <span>·</span>
                      <span>Last active {timeAgo(n.last_seen)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  {n.confidence != null && (
                    <div className="text-right">
                      <div className="text-sm font-mono text-card-foreground">{(Number(n.confidence) * 100).toFixed(0)}%</div>
                      <div className="text-[10px] text-muted-foreground">confidence</div>
                    </div>
                  )}
                  <Badge variant="outline" className={`text-[10px] capitalize ${
                    n.status === "active" ? "border-sentinel-emerald/30 text-sentinel-emerald" :
                    n.status === "watch" ? "border-sentinel-amber/30 text-sentinel-amber" :
                    "border-muted-foreground/30 text-muted-foreground"
                  }`}>
                    {n.status || "active"}
                  </Badge>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
