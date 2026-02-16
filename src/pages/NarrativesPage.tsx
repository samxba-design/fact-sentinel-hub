import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network, TrendingUp, ArrowUpRight } from "lucide-react";

const mockNarratives = [
  { name: "Security breach claims", volume: 148, negativePct: 78, acceleration: "+32%", topSources: ["Reddit", "X", "News"], status: "active", firstSeen: "3 days ago", lastSeen: "1h ago" },
  { name: "CEO leadership controversy", volume: 92, negativePct: 65, acceleration: "+18%", topSources: ["X", "News"], status: "active", firstSeen: "5 days ago", lastSeen: "3h ago" },
  { name: "Product reliability issues", volume: 76, negativePct: 82, acceleration: "-5%", topSources: ["App Store", "Reddit"], status: "watch", firstSeen: "2 weeks ago", lastSeen: "6h ago" },
  { name: "Partnership expansion", volume: 54, negativePct: 12, acceleration: "+8%", topSources: ["News", "X"], status: "active", firstSeen: "1 week ago", lastSeen: "2h ago" },
  { name: "Pricing unfair comparisons", volume: 38, negativePct: 71, acceleration: "+45%", topSources: ["Reddit", "Forums"], status: "active", firstSeen: "2 days ago", lastSeen: "30m ago" },
];

export default function NarrativesPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Narratives</h1>
        <p className="text-sm text-muted-foreground mt-1">Narrative intelligence and propagation tracking</p>
      </div>

      <div className="space-y-3">
        {mockNarratives.map((n, i) => (
          <Card key={i} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Network className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-sm font-medium text-card-foreground">{n.name}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <span>First seen {n.firstSeen}</span>
                    <span>·</span>
                    <span>Last active {n.lastSeen}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex gap-1">
                  {n.topSources.map(s => (
                    <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono text-card-foreground">{n.volume}</div>
                  <div className="text-[10px] text-muted-foreground">mentions</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-mono ${n.negativePct > 50 ? "text-sentinel-red" : "text-sentinel-emerald"}`}>
                    {n.negativePct}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">negative</div>
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium ${n.acceleration.startsWith("+") ? "text-sentinel-amber" : "text-sentinel-emerald"}`}>
                  <ArrowUpRight className="h-3 w-3" />
                  {n.acceleration}
                </div>
                <Badge variant="outline" className={`text-[10px] capitalize ${
                  n.status === "active" ? "border-sentinel-emerald/30 text-sentinel-emerald" : "border-sentinel-amber/30 text-sentinel-amber"
                }`}>
                  {n.status}
                </Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
