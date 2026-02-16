import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Siren, Flag, ShieldAlert, TrendingUp, Zap, Bell, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface RiskMention {
  id: string;
  content: string | null;
  source: string;
  severity: string | null;
  posted_at: string | null;
  flags: any;
}

interface Alert {
  id: string;
  type: string;
  status: string | null;
  payload: any;
  triggered_at: string | null;
}

const ALERT_ICONS: Record<string, any> = {
  mention_spike: TrendingUp,
  negative_spike: AlertTriangle,
  critical_mention: Siren,
  viral_risk: Zap,
};

const ALERT_COLORS: Record<string, string> = {
  mention_spike: "text-sentinel-cyan",
  negative_spike: "text-sentinel-amber",
  critical_mention: "text-sentinel-red",
  viral_risk: "text-sentinel-red",
};

export default function RiskConsolePage() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [mentions, setMentions] = useState<RiskMention[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState({ emergencies: 0, high: 0, falseClaims: 0, regulatory: 0, scams: 0, spikes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    Promise.all([
      supabase
        .from("mentions")
        .select("id, content, source, severity, posted_at, flags")
        .eq("org_id", currentOrg.id)
        .in("severity", ["high", "critical"])
        .order("posted_at", { ascending: false })
        .limit(50),
      supabase
        .from("alerts")
        .select("id, type, status, payload, triggered_at")
        .eq("org_id", currentOrg.id)
        .order("triggered_at", { ascending: false })
        .limit(20),
    ]).then(([mentionsRes, alertsRes]) => {
      const items = mentionsRes.data || [];
      setMentions(items);
      setAlerts(alertsRes.data || []);

      let emergencies = 0, high = 0, falseClaims = 0, regulatory = 0, scams = 0;
      items.forEach(m => {
        const f = m.flags as any || {};
        if (m.severity === "critical") emergencies++;
        if (m.severity === "high") high++;
        if (f.misinformation) falseClaims++;
        if (f.regulatory_risk) regulatory++;
        if (f.scam || f.impersonation) scams++;
      });

      const spikeAlerts = (alertsRes.data || []).filter((a: Alert) => a.type === "mention_spike" && a.status === "active").length;
      setCounts({ emergencies, high, falseClaims, regulatory, scams, spikes: spikeAlerts });
      setLoading(false);
    });
  }, [currentOrg]);

  const dismissAlert = async (alertId: string) => {
    const { error } = await supabase.from("alerts").update({ status: "dismissed" }).eq("id", alertId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "dismissed" } : a));
      toast({ title: "Alert dismissed" });
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    const { error } = await supabase.from("alerts").update({ status: "acknowledged" }).eq("id", alertId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "acknowledged" } : a));
      toast({ title: "Alert acknowledged" });
    }
  };

  const timeAgo = (d: string | null) => d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "—";

  const queues = [
    { key: "emergencies", label: "Emergencies", icon: Siren, count: counts.emergencies, color: "text-sentinel-red" },
    { key: "high", label: "High Severity", icon: AlertTriangle, count: counts.high, color: "text-sentinel-amber" },
    { key: "false-claims", label: "False Claims", icon: Flag, count: counts.falseClaims, color: "text-sentinel-amber" },
    { key: "regulatory", label: "Regulatory", icon: ShieldAlert, count: counts.regulatory, color: "text-sentinel-purple" },
    { key: "scams", label: "Scams", icon: Zap, count: counts.scams, color: "text-sentinel-red" },
    { key: "spikes", label: "Spikes", icon: TrendingUp, count: counts.spikes, color: "text-sentinel-cyan" },
  ];

  const activeAlerts = alerts.filter(a => a.status === "active");

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Risk Console</h1>
        <p className="text-sm text-muted-foreground mt-1">Triage and manage operational risks, spikes, and alerts</p>
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

      {/* Active Alerts */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" /> Active Alerts ({activeAlerts.length})
        </h3>
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg mb-2" />)
        ) : activeAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No active alerts. The system checks for spikes every 15 minutes.</p>
        ) : (
          <div className="space-y-2">
            {activeAlerts.map(alert => {
              const AlertIcon = ALERT_ICONS[alert.type] || Bell;
              const alertColor = ALERT_COLORS[alert.type] || "text-primary";
              const payload = alert.payload as any || {};

              return (
                <div key={alert.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <AlertIcon className={`h-5 w-5 shrink-0 ${alertColor}`} />
                    <div className="min-w-0">
                      <div className="text-sm text-card-foreground">{payload.message || alert.type}</div>
                      <div className="text-[10px] text-muted-foreground">{timeAgo(alert.triggered_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-[10px] capitalize border-sentinel-red/30 text-sentinel-red">
                      {alert.type.replace(/_/g, " ")}
                    </Badge>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => acknowledgeAlert(alert.id)} title="Acknowledge">
                      <Check className="h-3.5 w-3.5 text-sentinel-emerald" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => dismissAlert(alert.id)} title="Dismiss">
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Alert History */}
      {alerts.filter(a => a.status !== "active").length > 0 && (
        <Card className="bg-card border-border p-5">
          <h3 className="text-sm font-medium text-card-foreground mb-4">Alert History</h3>
          <div className="space-y-2">
            {alerts.filter(a => a.status !== "active").slice(0, 10).map(alert => {
              const payload = alert.payload as any || {};
              return (
                <div key={alert.id} className="flex items-center justify-between p-2 rounded-lg opacity-60">
                  <div className="flex items-center gap-3 min-w-0">
                    <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{payload.message || alert.type}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[9px] capitalize">{alert.status}</Badge>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(alert.triggered_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Risk Mentions */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4">Latest Risk Items</h3>
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
          ) : mentions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No high-severity mentions detected.</p>
          ) : (
            mentions.slice(0, 10).map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                onClick={() => navigate(`/mentions/${item.id}`)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${item.severity === "critical" ? "text-sentinel-red" : "text-sentinel-amber"}`} />
                  <div className="min-w-0">
                    <div className="text-sm text-card-foreground line-clamp-1">{item.content || "No content"}</div>
                    <div className="text-xs text-muted-foreground">{item.source} · {timeAgo(item.posted_at)}</div>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${
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
