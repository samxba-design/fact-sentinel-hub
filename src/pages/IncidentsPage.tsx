import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Siren, Plus, Clock, User2 } from "lucide-react";

const mockIncidents = [
  { name: "Security Breach Response", status: "active", started: "Feb 14, 2026 08:30", owner: "Elena Volkov", mentions: 48, alerts: 12 },
  { name: "Withdrawal Delay Crisis", status: "active", started: "Feb 15, 2026 14:00", owner: "Sarah Chen", mentions: 23, alerts: 5 },
  { name: "Q4 Pricing Backlash", status: "resolved", started: "Jan 28, 2026", owner: "James Okonkwo", mentions: 156, alerts: 28 },
];

export default function IncidentsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-1">War room for active incidents</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Incident
        </Button>
      </div>

      <div className="space-y-3">
        {mockIncidents.map((inc, i) => (
          <Card key={i} className={`bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer ${
            inc.status === "active" ? "sentinel-glow-red" : ""
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Siren className={`h-5 w-5 ${inc.status === "active" ? "text-sentinel-red animate-pulse-glow" : "text-muted-foreground"}`} />
                <div>
                  <div className="text-sm font-medium text-card-foreground">{inc.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                    <Clock className="h-3 w-3" /> Started {inc.started}
                    <span>·</span>
                    <User2 className="h-3 w-3" /> {inc.owner}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-mono text-card-foreground">{inc.mentions}</div>
                  <div className="text-[10px] text-muted-foreground">mentions</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono text-sentinel-amber">{inc.alerts}</div>
                  <div className="text-[10px] text-muted-foreground">alerts</div>
                </div>
                <Badge variant="outline" className={`text-[10px] capitalize ${
                  inc.status === "active" ? "border-sentinel-red/30 text-sentinel-red" : "border-sentinel-emerald/30 text-sentinel-emerald"
                }`}>
                  {inc.status}
                </Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
