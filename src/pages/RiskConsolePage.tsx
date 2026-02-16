import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Siren, Flag, ShieldAlert, TrendingUp, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";

interface RiskMention {
  id: string;
  content: string | null;
  source: string;
  severity: string | null;
  posted_at: string | null;
  flags: any;
}

export default function RiskConsolePage() {
  const { currentOrg } = useOrg();
  const [mentions, setMentions] = useState<RiskMention[]>([]);
  const [counts, setCounts] = useState({ emergencies: 0, high: 0, falseClaims: 0, regulatory: 0, scams: 0, spikes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    // Fetch high+ severity mentions
    supabase
      .from("mentions")
      .select("id, content, source, severity, posted_at, flags")
      .eq("org_id", currentOrg.id)
      .in("severity", ["high", "critical"])
      .order("posted_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const items = data || [];
        setMentions(items);

        let emergencies = 0, high = 0, falseClaims = 0, regulatory = 0, scams = 0;
        items.forEach(m => {
          const f = m.flags as any || {};
          if (f.emergency) emergencies++;
          if (m.severity === "high") high++;
          if (m.severity === "critical") emergencies++;
          if (f.false_claim) falseClaims++;
          if (f.regulatory_risk) regulatory++;
          if (f.scam || f.impersonation) scams++;
        });
        setCounts({ emergencies, high, falseClaims, regulatory, scams, spikes: 0 });
        setLoading(false);
      });
  }, [currentOrg]);

  const queues = [
    { key: "emergencies", label: "Emergencies", icon: Siren, count: counts.emergencies, color: "text-sentinel-red" },
    { key: "high", label: "High Severity", icon: AlertTriangle, count: counts.high, color: "text-sentinel-amber" },
    { key: "false-claims", label: "False Claims", icon: Flag, count: counts.falseClaims, color: "text-sentinel-amber" },
    { key: "regulatory", label: "Regulatory", icon: ShieldAlert, count: counts.regulatory, color: "text-sentinel-purple" },
    { key: "scams", label: "Scams", icon: Zap, count: counts.scams, color: "text-sentinel-red" },
    { key: "spikes", label: "Spikes", icon: TrendingUp, count: counts.spikes, color: "text-sentinel-cyan" },
  ];

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
        <h1 className="text-2xl font-bold text-foreground">Risk Console</h1>
        <p className="text-sm text-muted-foreground mt-1">Triage and manage operational risks</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {queues.map(q => (
          <Card key={q.key} className="bg-card border-border p-4 text-center hover:border-primary/30 transition-colors cursor-pointer">
            <q.icon className={`h-5 w-5 mx-auto ${q.color}`} />
            <div className="text-xl font-bold font-mono text-card-foreground mt-2">{loading ? "—" : q.count}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{q.label}</div>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4">Latest Risk Items</h3>
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
          ) : mentions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No high-severity mentions detected.</p>
          ) : (
            mentions.slice(0, 10).map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`h-4 w-4 ${item.severity === "critical" ? "text-sentinel-red" : "text-sentinel-amber"}`} />
                  <div>
                    <div className="text-sm text-card-foreground line-clamp-1">{item.content || "No content"}</div>
                    <div className="text-xs text-muted-foreground">{item.source} · {timeAgo(item.posted_at)}</div>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] ${
                  item.severity === "critical" ? "border-sentinel-red/30 text-sentinel-red" : "border-sentinel-amber/30 text-sentinel-amber"
                }`}>
                  {item.severity}
                </Badge>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
