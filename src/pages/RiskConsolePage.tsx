import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Siren, Flag, ShieldAlert, TrendingUp, Zap, Bell, Check, X, Scan, Settings2, Eye, MessageSquare, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import UpgradeBanner from "@/components/UpgradeBanner";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import PageGuide from "@/components/PageGuide";
import PredictiveRiskWidget from "@/components/dashboard/PredictiveRiskWidget";
import SourceCredibilityWidget from "@/components/mentions/SourceCredibilityWidget";

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

type QueueFilter = string | null;

const QUEUE_DESCRIPTIONS: Record<string, string> = {
  emergencies: "Critical-severity mentions requiring immediate action",
  high: "High-severity mentions that need attention soon",
  "false-claims": "Mentions flagged as containing misinformation",
  regulatory: "Mentions with potential regulatory compliance risks",
  scams: "Mentions flagged for scam or impersonation activity",
  spikes: "Active alerts for unusual mention volume spikes",
};

export default function RiskConsolePage() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [mentions, setMentions] = useState<RiskMention[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState({ emergencies: 0, high: 0, falseClaims: 0, regulatory: 0, scams: 0, spikes: 0 });
  const [loading, setLoading] = useState(true);
  const [activeQueue, setActiveQueue] = useState<QueueFilter>(null);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    Promise.all([
      supabase
        .from("mentions")
        .select("id, content, source, severity, posted_at, flags")
        .eq("org_id", currentOrg.id)
        .eq("mention_type", "brand")
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

  const filteredMentions = mentions.filter(m => {
    if (!activeQueue) return true;
    const f = m.flags as any || {};
    switch (activeQueue) {
      case "emergencies": return m.severity === "critical";
      case "high": return m.severity === "high";
      case "false-claims": return f.misinformation;
      case "regulatory": return f.regulatory_risk;
      case "scams": return f.scam || f.impersonation;
      default: return true;
    }
  });

  const activeAlerts = alerts.filter(a => a.status === "active");

  return (
    <div className="space-y-6 animate-fade-up">
      <UpgradeBanner feature="Risk Console" className="mb-2" />
      <div className="flex items-center justify-between">
        <div>
         <h1 className="text-2xl font-bold text-foreground">Risk Console</h1>
          <p className="text-sm text-muted-foreground mt-1">Triage and manage operational risks, spikes, and alerts</p>
        </div>
        <Button variant="outline" className="text-foreground" onClick={() => navigate("/scans")}>
          <Scan className="h-4 w-4 mr-2" /> Run New Scan
        </Button>
      </div>

      <PageGuide
        title="How the Risk Console Works"
        subtitle="Real-time triage center for threats, spikes, and alerts"
        steps={[
          {
            icon: <Scan className="h-4 w-4 text-primary" />,
            title: "1. Automated Detection",
            description: "After each scan, the system flags high/critical severity mentions, misinformation, regulatory risks, scams, and volume spikes automatically.",
          },
          {
            icon: <Eye className="h-4 w-4 text-primary" />,
            title: "2. Triage by Queue",
            description: "Click queue cards to filter — Emergencies, High Severity, False Claims, Regulatory, Scams, or Spikes. Each queue surfaces different risk types.",
          },
          {
            icon: <Settings2 className="h-4 w-4 text-primary" />,
            title: "3. Act on Alerts",
            description: "Acknowledge or dismiss alerts. Click any mention to view details, draft a response, or escalate to your team.",
          },
        ]}
        integrations={[
          { label: "Scans", to: "/scans", description: "Run new scans" },
          { label: "Mentions", to: "/mentions", description: "View full mention list" },
          { label: "Escalations", to: "/escalations", description: "Auto-escalated tickets" },
          { label: "Settings → Alerts", to: "/settings?tab=alerts", description: "Configure alert emails" },
        ]}
        tip="Anomaly detection runs automatically after each scan, checking for volume increases >3x baseline, negative sentiment surges, and viral content. Configure alert emails in Settings to get notified instantly."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {queues.map(q => (
          <Tooltip key={q.key}>
            <TooltipTrigger asChild>
              <Card
                className={`bg-card border-border p-4 text-center hover:border-primary/30 transition-colors cursor-pointer ${
                  activeQueue === q.key ? "ring-1 ring-primary border-primary/40" : ""
                } ${q.key === "emergencies" && q.count > 0 ? "border-sentinel-red/40 sentinel-pulse-red" : ""} ${
                  q.key === "high" && q.count > 0 ? "border-sentinel-amber/30 sentinel-pulse-amber" : ""
                }`}
                onClick={() => setActiveQueue(activeQueue === q.key ? null : q.key)}
              >
                <q.icon className={`h-5 w-5 mx-auto ${q.color}`} />
                <div className="text-xl font-bold font-mono text-card-foreground mt-2">{loading ? "—" : q.count}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{q.label}</div>
                {activeQueue === q.key && <div className="text-[9px] text-primary mt-1">Filtering ↓</div>}
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-48">
              {QUEUE_DESCRIPTIONS[q.key]}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {activeQueue && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs border-primary/30 text-primary">
            Filtered: {queues.find(q => q.key === activeQueue)?.label}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => setActiveQueue(null)} className="text-xs h-6 px-2">
            Clear filter ×
          </Button>
        </div>
      )}

      {/* Active Alerts */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" /> Active Alerts ({activeAlerts.length})
        </h3>
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg mb-2" />)
        ) : activeAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No active alerts. Anomaly detection runs automatically after each scan.</p>
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-card-foreground">
            {activeQueue ? `${queues.find(q => q.key === activeQueue)?.label} Items` : "Latest Risk Items"}
            {" "}({filteredMentions.length})
          </h3>
          {filteredMentions.length === 0 && !loading && (
            <Button size="sm" variant="outline" onClick={() => navigate("/scans")}>
              <Scan className="h-3.5 w-3.5 mr-1.5" /> Scan Now
            </Button>
          )}
        </div>
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
          ) : filteredMentions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {activeQueue ? "No items match this filter." : "No high-severity mentions detected. Run a scan to check."}
            </p>
          ) : (
            filteredMentions.slice(0, 15).map(item => (
              <div
                key={item.id}
                className={`group p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors ${
                  item.severity === "critical" ? "border border-sentinel-red/30 sentinel-pulse-red" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${item.severity === "critical" ? "text-sentinel-red" : "text-sentinel-amber"}`} />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm text-card-foreground line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => navigate(`/mentions/${item.id}`)}
                    >
                      {item.content || "No content"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.source} · {timeAgo(item.posted_at)}</div>
                    {/* Inline actions */}
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => navigate(`/respond?mention=${item.id}`)}
                      >
                        <MessageSquare className="h-2.5 w-2.5" /> Respond
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={async () => {
                          await supabase.from("escalations").insert({ org_id: currentOrg?.id, mention_id: item.id, status: "open", reason: "Flagged from Risk Console" });
                          toast({ title: "Escalated", description: "Added to escalations queue" });
                        }}
                      >
                        <Flag className="h-2.5 w-2.5" /> Escalate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
                        onClick={() => navigate(`/mentions/${item.id}`)}
                      >
                        <ChevronRight className="h-2.5 w-2.5" /> Details
                      </Button>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${
                    item.severity === "critical" ? "border-sentinel-red/30 text-sentinel-red" : "border-sentinel-amber/30 text-sentinel-amber"
                  }`}>
                    {item.severity}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
      {/* Predictive Risk */}
      <PredictiveRiskWidget />
      {/* Source Credibility */}
      <SourceCredibilityWidget />
    </div>
  );
}
