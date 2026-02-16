import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Bell, BellRing, Check, X, AlertTriangle, TrendingUp, Siren, Zap,
  Settings2, Activity, Clock, Shield, Save, Loader2, ExternalLink,
  Eye, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import InfoTooltip from "@/components/InfoTooltip";
import PageGuide from "@/components/PageGuide";
import UpgradeBanner from "@/components/UpgradeBanner";

interface Alert {
  id: string;
  type: string;
  status: string | null;
  payload: any;
  triggered_at: string | null;
  created_at: string | null;
}

const ALERT_ICONS: Record<string, any> = {
  mention_spike: TrendingUp,
  negative_spike: AlertTriangle,
  critical_mention: Siren,
  viral_risk: Zap,
};

const ALERT_COLORS: Record<string, string> = {
  mention_spike: "text-primary",
  negative_spike: "text-sentinel-amber",
  critical_mention: "text-sentinel-red",
  viral_risk: "text-sentinel-red",
};

const ALERT_DESCRIPTIONS: Record<string, string> = {
  mention_spike: "Unusual increase in mention volume detected",
  negative_spike: "Surge in negative sentiment mentions",
  critical_mention: "Critical-severity mentions requiring immediate attention",
  viral_risk: "Content flagged with potential to go viral",
};

const STATUS_COLORS: Record<string, string> = {
  active: "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5",
  new: "border-primary/30 text-primary bg-primary/5",
  acknowledged: "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5",
  dismissed: "border-muted-foreground/30 text-muted-foreground",
};

const SCHEDULE_LABELS: Record<string, string> = {
  manual: "Manual only",
  "6h": "Every 6 hours",
  "12h": "Every 12 hours",
  daily: "Daily",
  weekly: "Weekly",
};

type FilterStatus = "all" | "active" | "acknowledged" | "dismissed";

export default function AlertsPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  // Config state
  const [scanSchedule, setScanSchedule] = useState("daily");
  const [alertEmails, setAlertEmails] = useState("");
  const [quietStart, setQuietStart] = useState<number | null>(null);
  const [quietEnd, setQuietEnd] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    Promise.all([
      supabase
        .from("alerts")
        .select("*")
        .eq("org_id", currentOrg.id)
        .order("triggered_at", { ascending: false })
        .limit(100),
      supabase
        .from("tracking_profiles")
        .select("scan_schedule, alert_emails, quiet_hours_start, quiet_hours_end")
        .eq("org_id", currentOrg.id)
        .maybeSingle(),
    ]).then(([alertsRes, configRes]) => {
      setAlerts(alertsRes.data || []);
      if (configRes.data) {
        setScanSchedule(configRes.data.scan_schedule || "daily");
        setAlertEmails((configRes.data.alert_emails || []).join(", "));
        setQuietStart(configRes.data.quiet_hours_start);
        setQuietEnd(configRes.data.quiet_hours_end);
      }
      setConfigLoaded(true);
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

  const saveConfig = async () => {
    if (!currentOrg) return;
    setSaving(true);
    const payload = {
      scan_schedule: scanSchedule,
      alert_emails: alertEmails.split(",").map(e => e.trim()).filter(Boolean),
      quiet_hours_start: quietStart,
      quiet_hours_end: quietEnd,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase.from("tracking_profiles").select("id").eq("org_id", currentOrg.id).maybeSingle();
    let error;
    if (existing) {
      ({ error } = await supabase.from("tracking_profiles").update(payload).eq("org_id", currentOrg.id));
    } else {
      ({ error } = await supabase.from("tracking_profiles").insert({ ...payload, org_id: currentOrg.id }));
    }
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Monitoring settings saved" });
    }
    setSaving(false);
  };

  const filteredAlerts = alerts.filter(a => {
    if (filterStatus === "all") return true;
    return a.status === filterStatus;
  });

  const activeCount = alerts.filter(a => a.status === "active" || a.status === "new").length;
  const isMonitoring = scanSchedule && scanSchedule !== "manual";

  const alertTypeCounts = alerts.reduce<Record<string, number>>((acc, a) => {
    if (a.status === "active" || a.status === "new") {
      acc[a.type] = (acc[a.type] || 0) + 1;
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-up">
      <UpgradeBanner feature="Advanced alert configuration" className="mb-2" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            {activeCount > 0 ? <BellRing className="h-6 w-6 text-sentinel-red" /> : <Bell className="h-6 w-6 text-primary" />}
            Alerts & Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeCount > 0 ? `${activeCount} active alert${activeCount !== 1 ? "s" : ""} requiring attention` : "All clear — no active alerts"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/risk-console")} className="gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Risk Console
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/scans")} className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Run Scan
          </Button>
        </div>
      </div>

      <PageGuide
        title="How Alerts & Monitoring Works"
        subtitle="Automated detection and notification system"
        steps={[
          {
            icon: <Activity className="h-4 w-4 text-primary" />,
            title: "1. Automated Detection",
            description: "Spike detection runs every 15 minutes, checking for mention volume spikes (>3x increase), negative sentiment surges, critical threats, and viral potential.",
          },
          {
            icon: <Bell className="h-4 w-4 text-primary" />,
            title: "2. Alert Triggers",
            description: "When thresholds are exceeded, alerts are created and email notifications are sent to configured recipients. Duplicate alerts are suppressed within 24 hours.",
          },
          {
            icon: <Settings2 className="h-4 w-4 text-primary" />,
            title: "3. Configure & Respond",
            description: "Set scan frequency, alert emails, and quiet hours below. Acknowledge or dismiss alerts as you triage them. Linked mentions can be viewed in the Risk Console.",
          },
        ]}
        integrations={[
          { label: "Risk Console", to: "/risk-console", description: "Triage risk items" },
          { label: "Scans", to: "/scans", description: "Run manual scans" },
          { label: "Escalations", to: "/escalations", description: "Escalated tickets" },
          { label: "Settings → Notifications", to: "/settings?tab=notifications", description: "Email preferences" },
        ]}
        tip="Alerts are automatically deduplicated — you won't receive duplicate alerts for the same spike within a 24-hour window."
      />

      {/* Monitoring Configuration */}
      <Card className="bg-card border-border p-5 space-y-4">
        <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" /> Monitoring Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              Auto-Scan Frequency
              <InfoTooltip text="How often the system automatically scans for new mentions across all your configured sources." />
            </Label>
            <Select value={scanSchedule} onValueChange={setScanSchedule}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual only</SelectItem>
                <SelectItem value="6h">Every 6 hours</SelectItem>
                <SelectItem value="12h">Every 12 hours</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              Alert Emails
              <InfoTooltip text="Comma-separated email addresses that receive alert notifications when spikes or critical mentions are detected." />
            </Label>
            <Input
              placeholder="team@example.com"
              value={alertEmails}
              onChange={e => setAlertEmails(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Quiet Hours (UTC)</Label>
            <div className="flex items-center gap-2">
              <Select value={quietStart != null ? String(quietStart) : "none"} onValueChange={v => setQuietStart(v === "none" ? null : Number(v))}>
                <SelectTrigger className="w-20"><SelectValue placeholder="Off" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Off</SelectItem>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>{String(i).padStart(2, "0")}:00</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">to</span>
              <Select value={quietEnd != null ? String(quietEnd) : "none"} onValueChange={v => setQuietEnd(v === "none" ? null : Number(v))}>
                <SelectTrigger className="w-20"><SelectValue placeholder="Off" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Off</SelectItem>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>{String(i).padStart(2, "0")}:00</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-end">
            <Button onClick={saveConfig} disabled={saving} className="w-full gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Settings
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${isMonitoring ? "bg-sentinel-emerald animate-pulse" : "bg-muted-foreground"}`} />
            Auto-scan: {isMonitoring ? SCHEDULE_LABELS[scanSchedule] || scanSchedule : "Disabled"}
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-sentinel-emerald animate-pulse" />
            Spike detection: Active (every 15 min)
          </span>
          {quietStart != null && quietEnd != null && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Quiet: {String(quietStart).padStart(2, "0")}:00–{String(quietEnd).padStart(2, "0")}:00 UTC
            </span>
          )}
        </div>
      </Card>

      {/* Alert Type Summary */}
      {activeCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { type: "mention_spike", label: "Volume Spikes", icon: TrendingUp, color: "text-primary" },
            { type: "negative_spike", label: "Sentiment Surges", icon: AlertTriangle, color: "text-sentinel-amber" },
            { type: "critical_mention", label: "Critical Threats", icon: Siren, color: "text-sentinel-red" },
            { type: "viral_risk", label: "Viral Risks", icon: Zap, color: "text-sentinel-red" },
          ].map(t => (
            <Card key={t.type} className="bg-card border-border p-4 text-center">
              <t.icon className={`h-5 w-5 mx-auto ${t.color}`} />
              <div className="text-xl font-bold font-mono text-card-foreground mt-2">{alertTypeCounts[t.type] || 0}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{t.label}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
          {(["all", "active", "acknowledged", "dismissed"] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                filterStatus === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-card-foreground hover:bg-muted/50"
              }`}
            >
              {s} {s === "active" && activeCount > 0 ? `(${activeCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Alert List */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4">
          {filterStatus === "all" ? "All Alerts" : `${filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)} Alerts`}
          {" "}({filteredAlerts.length})
        </h3>

        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg mb-2" />)
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {filterStatus === "all" ? "No alerts yet. The system checks for spikes every 15 minutes after scans run." : `No ${filterStatus} alerts.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAlerts.map(alert => {
              const Icon = ALERT_ICONS[alert.type] || Bell;
              const color = ALERT_COLORS[alert.type] || "text-primary";
              const payload = alert.payload as any || {};
              const isActive = alert.status === "active" || alert.status === "new";
              return (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    isActive ? "bg-muted/30 border-border" : "bg-muted/10 border-border/50 opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-card-foreground">{payload.message || ALERT_DESCRIPTIONS[alert.type] || alert.type}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {alert.triggered_at ? format(new Date(alert.triggered_at), "MMM d, h:mm a") : "—"}
                        </span>
                        {payload.multiplier && (
                          <Badge variant="outline" className="text-[9px] h-4">{payload.multiplier}x spike</Badge>
                        )}
                        {payload.negative_count && (
                          <Badge variant="outline" className="text-[9px] h-4">{payload.negative_count} negative</Badge>
                        )}
                        {payload.critical_count && (
                          <Badge variant="outline" className="text-[9px] h-4">{payload.critical_count} critical</Badge>
                        )}
                        {payload.viral_count && (
                          <Badge variant="outline" className="text-[9px] h-4">{payload.viral_count} viral</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_COLORS[alert.status || "active"]}`}>
                      {alert.status || "active"}
                    </Badge>
                    {isActive && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => acknowledgeAlert(alert.id)} title="Acknowledge">
                          <Check className="h-3.5 w-3.5 text-sentinel-emerald" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => dismissAlert(alert.id)} title="Dismiss">
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigate("/risk-console")} title="View in Risk Console">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
