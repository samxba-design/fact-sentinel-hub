import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Scan, Plus, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const mockRuns = [
  { id: "1", date: "2026-02-16 09:00", range: "Feb 9–16", sources: "News, Reddit, X", mentions: 342, negativePct: 12.3, emergencies: 1, status: "completed" },
  { id: "2", date: "2026-02-15 09:00", range: "Feb 8–15", sources: "News, Reddit", mentions: 298, negativePct: 8.7, emergencies: 0, status: "completed" },
  { id: "3", date: "2026-02-14 09:00", range: "Feb 7–14", sources: "News, Reddit, X, App Stores", mentions: 415, negativePct: 15.1, emergencies: 2, status: "completed" },
  { id: "4", date: "2026-02-16 14:30", range: "Feb 10–16", sources: "All", mentions: 0, negativePct: 0, emergencies: 0, status: "running" },
];

const statusConfig: Record<string, { icon: any; className: string }> = {
  completed: { icon: CheckCircle2, className: "text-sentinel-emerald" },
  running: { icon: Loader2, className: "text-sentinel-cyan animate-spin" },
  failed: { icon: XCircle, className: "text-sentinel-red" },
  pending: { icon: Clock, className: "text-muted-foreground" },
};

export default function ScansPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scans</h1>
          <p className="text-sm text-muted-foreground mt-1">Run and manage source scans</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Scan
        </Button>
      </div>

      <div className="space-y-3">
        {mockRuns.map(run => {
          const sc = statusConfig[run.status];
          return (
            <Card key={run.id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Scan className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium text-card-foreground">{run.range}</div>
                    <div className="text-xs text-muted-foreground">{run.date} · {run.sources}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-sm font-mono text-card-foreground">{run.mentions}</div>
                    <div className="text-[10px] text-muted-foreground">mentions</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-mono ${run.negativePct > 10 ? "text-sentinel-amber" : "text-card-foreground"}`}>
                      {run.negativePct}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">negative</div>
                  </div>
                  {run.emergencies > 0 && (
                    <Badge variant="outline" className="border-sentinel-red/30 text-sentinel-red text-[10px]">
                      {run.emergencies} emergency
                    </Badge>
                  )}
                  <div className="flex items-center gap-1.5">
                    <sc.icon className={`h-4 w-4 ${sc.className}`} />
                    <span className="text-xs capitalize text-muted-foreground">{run.status}</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
