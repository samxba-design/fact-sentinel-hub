import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Siren, Flag, ShieldAlert, TrendingUp, Zap } from "lucide-react";

const queues = [
  { key: "emergencies", label: "Emergencies", icon: Siren, count: 3, color: "text-sentinel-red" },
  { key: "high", label: "High Severity", icon: AlertTriangle, count: 12, color: "text-sentinel-amber" },
  { key: "false-claims", label: "False Claims", icon: Flag, count: 5, color: "text-sentinel-amber" },
  { key: "regulatory", label: "Regulatory", icon: ShieldAlert, count: 2, color: "text-sentinel-purple" },
  { key: "scams", label: "Scams", icon: Zap, count: 4, color: "text-sentinel-red" },
  { key: "spikes", label: "Spikes", icon: TrendingUp, count: 7, color: "text-sentinel-cyan" },
];

const mockItems = [
  { title: "BREAKING: Regulatory scrutiny over withdrawal delays", source: "TechCrunch", severity: "critical", time: "1h ago" },
  { title: "Security breach claims spreading on Reddit", source: "Reddit", severity: "high", time: "2h ago" },
  { title: "False claim about CEO resignation", source: "X", severity: "high", time: "3h ago" },
];

export default function RiskConsolePage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Risk Console</h1>
        <p className="text-sm text-muted-foreground mt-1">Triage and manage operational risks</p>
      </div>

      {/* Queue overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {queues.map(q => (
          <Card key={q.key} className="bg-card border-border p-4 text-center hover:border-primary/30 transition-colors cursor-pointer">
            <q.icon className={`h-5 w-5 mx-auto ${q.color}`} />
            <div className="text-xl font-bold font-mono text-card-foreground mt-2">{q.count}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{q.label}</div>
          </Card>
        ))}
      </div>

      {/* Items */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4">Latest Risk Items</h3>
        <div className="space-y-3">
          {mockItems.map((item, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-4 w-4 ${item.severity === "critical" ? "text-sentinel-red" : "text-sentinel-amber"}`} />
                <div>
                  <div className="text-sm text-card-foreground">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.source} · {item.time}</div>
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] ${
                item.severity === "critical" ? "border-sentinel-red/30 text-sentinel-red" : "border-sentinel-amber/30 text-sentinel-amber"
              }`}>
                {item.severity}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
