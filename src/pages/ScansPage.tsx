import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Scan, Plus, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";

interface ScanRun {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  status: string | null;
  total_mentions: number | null;
  negative_pct: number | null;
  emergencies_count: number | null;
  config_snapshot: any;
}

const statusConfig: Record<string, { icon: any; className: string }> = {
  completed: { icon: CheckCircle2, className: "text-sentinel-emerald" },
  running: { icon: Loader2, className: "text-sentinel-cyan animate-spin" },
  failed: { icon: XCircle, className: "text-sentinel-red" },
  pending: { icon: Clock, className: "text-muted-foreground" },
};

export default function ScansPage() {
  const { currentOrg } = useOrg();
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    supabase
      .from("scan_runs")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setRuns(data || []);
        setLoading(false);
      });
  }, [currentOrg]);

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString() : "—";

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scans</h1>
          <p className="text-sm text-muted-foreground mt-1">Run and manage source scans</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />New Scan</Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : runs.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No scans yet. Create your first scan to start monitoring.</p>
          </Card>
        ) : (
          runs.map(run => {
            const sc = statusConfig[run.status || "pending"];
            const StatusIcon = sc.icon;
            return (
              <Card key={run.id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Scan className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-card-foreground">{formatDate(run.started_at)}</div>
                      <div className="text-xs text-muted-foreground">{run.status}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm font-mono text-card-foreground">{run.total_mentions ?? 0}</div>
                      <div className="text-[10px] text-muted-foreground">mentions</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-mono ${(run.negative_pct ?? 0) > 10 ? "text-sentinel-amber" : "text-card-foreground"}`}>
                        {Number(run.negative_pct ?? 0).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">negative</div>
                    </div>
                    {(run.emergencies_count ?? 0) > 0 && (
                      <Badge variant="outline" className="border-sentinel-red/30 text-sentinel-red text-[10px]">
                        {run.emergencies_count} emergency
                      </Badge>
                    )}
                    <div className="flex items-center gap-1.5">
                      <StatusIcon className={`h-4 w-4 ${sc.className}`} />
                      <span className="text-xs capitalize text-muted-foreground">{run.status}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
