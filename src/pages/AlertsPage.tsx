import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Bell, BellRing, Check, X, AlertTriangle, TrendingUp, Siren, Zap,
  Settings2, Activity, Clock, Shield, Save, Loader2, ExternalLink,
  Filter, ChevronRight, Eye, Info, Pause, Play,
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

const ALERT_META: Record<string, { icon: any; color: string; label: string; description: string; mentionsFilter: string }> = {
  mention_spike: {
    icon: TrendingUp,
    color: "text-primary",
    label: "Volume Spike",
    description: "Unusual increase in mention volume — indicates growing attention on your brand.",
    mentionsFilter: "",
  },
  negative_spike: {
    icon: AlertTriangle,
    color: "text-sentinel-amber",
    label: "Negative Sentiment Surge",
    description: "Sudden rise in negative mentions — may signal emerging criticism or a PR issue.",
    mentionsFilter: "sentiment=negative",
  },
  critical_mention: {
    icon: Siren,
    color: "text-sentinel-red",
    label: "Critical Threat",
    description: "High-severity mentions detected — potential crisis requiring immediate attention.",
    mentionsFilter: "severity=critical",
  },
  viral_risk: {
    icon: Zap,
    color: "text-sentinel-red",
    label: "Viral Risk",
    description: "Content with high engagement velocity — could spread rapidly across platforms.",
    mentionsFilter: "severity=critical",
  },
};

/** Build a mentions link with a time window around when the alert was triggered */
function buildAlertMentionsLink(alert: Alert, filter: string): string {
  // Use 7-day window around the alert trigger time so users always see relevant mentions
  const triggerDate = alert.triggered_at ? new Date(alert.triggered_at) : new Date();
  const daysSince = Math.max(1, Math.ceil((Date.now() - triggerDate.getTime()) / (1000 * 60 * 60 * 24)) + 2);
  const days = Math.min(daysSince, 30); // Cap at 30 days
  const params = filter ? `${filter}&days=${days}` : `days=${days}`;
  return `/mentions?${params}`;
}

const STATUS_STYLES: Record<string, string> = {
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

  const updateStatus = async (alertId: string, status: string) => {
    const { error } = await supabase.from("alerts").update({ status }).eq("id", alertId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status } : a));
      toast({ title: status === "dismissed" ? "Alert dismissed" : "Alert acknowledged" });
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
  const isPaused = scanSchedule === "paused";
  const isMonitoring = scanSchedule && scanSchedule !== "manual" && scanSchedule !== "paused";

  const [prevSchedule, setPrevSchedule] = useState<string | null>(null);

  const togglePause = async () => {
    if (!currentOrg) return;
    setSaving(true);
    let newSchedule: string;
    if (isPaused) {
      // Resume to previous schedule or default to daily
      newSchedule = prevSchedule && prevSchedule !== "paused" ? prevSchedule : "daily";
    } else {
      setPrevSchedule(scanSchedule);
      newSchedule = "paused";
    }
    setScanSchedule(newSchedule);
    const { data: existing } = await supabase.from("tracking_profiles").select("id").eq("org_id", currentOrg.id).maybeSingle();
    const payload = { scan_schedule: newSchedule, updated_at: new Date().toISOString() };
    if (existing) {
      await supabase.from("tracking_profiles").update(payload).eq("org_id", currentOrg.id);
    } else {
      await supabase.from("tracking_profiles").insert({ ...payload, org_id: currentOrg.id });
    }
    toast({ title: newSchedule === "paused" ? "All monitoring paused" : "Monitoring resumed" });
    setSaving(false);
  };

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
            title: "1. Scans Collect Mentions",
            description: "Auto-scans run on your chosen schedule (e.g. daily) to discover new mentions across all configured sources. This is what uses your scan quota.",
          },
          {
            icon: <Bell className="h-4 w-4 text-primary" />,
            title: "2. Anomaly Detection Analyzes Results",
            description: "After each scan, the system checks for unusual patterns — volume spikes (3x+ increase), negative sentiment surges, critical threats, and viral potential. This analysis is lightweight and doesn't consume extra quota.",
          },
          {
            icon: <Settings2 className="h-4 w-4 text-primary" />,
            title: "3. Alerts Notify You",
            description: "When thresholds are exceeded, alerts appear here and email notifications are sent. Click any alert to see the specific mentions that triggered it.",
          },
        ]}
        integrations={[
          { label: "Risk Console", to: "/risk-console", description: "Triage risk items" },
          { label: "Scans", to: "/scans", description: "Run manual scans" },
          { label: "Escalations", to: "/escalations", description: "Escalated tickets" },
          { label: "Settings → Notifications", to: "/settings?tab=notifications", description: "Email preferences" },
        ]}
        tip="Only auto-scans use your scan quota. Anomaly detection runs automatically on existing data at no extra cost."
      />

      {/* How It Works Banner */}
      <Card className="bg-primary/5 border-primary/20 p-4">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-card-foreground">What triggers alerts?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              After each scan, the system analyzes your mentions for anomalies. <strong>Volume spikes</strong> fire when new mentions exceed 3× your recent average. <strong>Negative surges</strong> detect sudden drops in sentiment. <strong>Critical threats</strong> flag severe mentions. <strong>Viral risks</strong> identify high-engagement content. Only scans use your quota — analysis is free.
            </p>
          </div>
        </div>
      </Card>

      {/* Pause / Resume Toggle */}
      <Card className={`border p-4 ${isPaused ? "bg-sentinel-amber/10 border-sentinel-amber/30" : "bg-sentinel-emerald/5 border-sentinel-emerald/20"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isPaused ? <Pause className="h-5 w-5 text-sentinel-amber" /> : <Play className="h-5 w-5 text-sentinel-emerald" />}
            <div>
              <p className="text-sm font-medium text-card-foreground">
                {isPaused ? "All Monitoring Paused" : "Monitoring Active"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isPaused
                  ? "Auto-scans and anomaly detection are stopped. You can still run manual scans from the Scans page."
                  : "Auto-scans run on schedule and anomaly detection analyzes results automatically."
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">{isPaused ? "Paused" : "Active"}</span>
            <Switch
              checked={!isPaused}
              onCheckedChange={() => togglePause()}
              disabled={saving}
            />
          </div>
        </div>
      </Card>

      {/* Monitoring Configuration */}
      <Card className={`bg-card border-border p-5 space-y-4 ${isPaused ? "opacity-60 pointer-events-none" : ""}`}>
        <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" /> Monitoring Configuration
          {isPaused && <Badge variant="outline" className="text-[10px] text-sentinel-amber border-sentinel-amber/30">Paused</Badge>}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              Auto-Scan Frequency
              <InfoTooltip text="How often the system scans for new mentions. Each scan uses 1 unit of your quota. Anomaly detection runs automatically after each scan at no extra cost." />
            </Label>
            <Select value={scanSchedule} onValueChange={setScanSchedule}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual only (no quota used)</SelectItem>
                <SelectItem value="6h">Every 6 hours (~4/day)</SelectItem>
                <SelectItem value="12h">Every 12 hours (~2/day)</SelectItem>
                <SelectItem value="daily">Daily (~1/day)</SelectItem>
                <SelectItem value="weekly">Weekly (~1/week)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              Alert Emails
              <InfoTooltip text="Comma-separated email addresses that receive alert notifications when anomalies are detected." />
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
            <div className={`w-2 h-2 rounded-full ${isPaused ? "bg-sentinel-amber" : isMonitoring ? "bg-sentinel-emerald animate-pulse" : "bg-muted-foreground"}`} />
            {isPaused ? "Paused" : `Auto-scan: ${isMonitoring ? SCHEDULE_LABELS[scanSchedule] || scanSchedule : "Disabled"}`}
          </span>
          {!isPaused && (
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-sentinel-emerald animate-pulse" />
              Anomaly detection: Active after each scan
            </span>
          )}
          {quietStart != null && quietEnd != null && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Quiet: {String(quietStart).padStart(2, "0")}:00–{String(quietEnd).padStart(2, "0")}:00 UTC
            </span>
          )}
        </div>
      </Card>

      {/* Alert Type Summary Cards */}
      {activeCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(ALERT_META).map(([type, meta]) => {
            const Icon = meta.icon;
            const count = alertTypeCounts[type] || 0;
            return (
              <Card
                key={type}
                className={`bg-card border-border p-4 text-center transition-all cursor-pointer hover:border-primary/30 hover:-translate-y-0.5 ${count > 0 ? "" : "opacity-50"}`}
                onClick={() => count > 0 ? navigate(`/mentions?${meta.mentionsFilter ? meta.mentionsFilter + "&" : ""}days=7`) : undefined}
              >
                <Icon className={`h-5 w-5 mx-auto ${meta.color}`} />
                <div className="text-xl font-bold font-mono text-card-foreground mt-2">{count}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{meta.label}</div>
              </Card>
            );
          })}
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
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg mb-2" />)
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {filterStatus === "all" ? "No alerts yet. Run a scan — anomaly detection will analyze the results automatically." : `No ${filterStatus} alerts.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAlerts.map(alert => {
              const meta = ALERT_META[alert.type] || { icon: Bell, color: "text-primary", label: alert.type, description: "", mentionsFilter: "" };
              const Icon = meta.icon;
              const payload = alert.payload as any || {};
              const isActive = alert.status === "active" || alert.status === "new";
              return (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                    isActive ? "bg-muted/30 border-border hover:bg-muted/50" : "bg-muted/10 border-border/50 opacity-70"
                  }`}
                >
                  <div className={`p-2 rounded-lg mt-0.5 ${
                    alert.type === "critical_mention" || alert.type === "viral_risk" ? "bg-sentinel-red/10" :
                    alert.type === "negative_spike" ? "bg-sentinel-amber/10" : "bg-primary/10"
                  }`}>
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-card-foreground">{meta.label}</span>
                      <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_STYLES[alert.status || "active"]}`}>
                        {alert.status || "active"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {payload.message || meta.description}
                    </p>
                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {alert.triggered_at ? format(new Date(alert.triggered_at), "MMM d, h:mm a") : "—"}
                      </span>
                      {payload.multiplier && (
                        <Badge variant="outline" className="text-[9px] h-4">{payload.multiplier}x volume increase</Badge>
                      )}
                      {payload.negative_count && (
                        <Badge variant="outline" className="text-[9px] h-4">{payload.negative_count} negative mentions</Badge>
                      )}
                      {payload.critical_count && (
                        <Badge variant="outline" className="text-[9px] h-4">{payload.critical_count} critical mentions</Badge>
                      )}
                      {payload.viral_count && (
                        <Badge variant="outline" className="text-[9px] h-4">{payload.viral_count} viral signals</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isActive && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updateStatus(alert.id, "acknowledged")} title="Acknowledge">
                          <Check className="h-3.5 w-3.5 text-sentinel-emerald" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updateStatus(alert.id, "dismissed")} title="Dismiss">
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs text-primary"
                      onClick={() => navigate(buildAlertMentionsLink(alert, meta.mentionsFilter))}
                      title="View the mentions that triggered this alert"
                    >
                      <Eye className="h-3.5 w-3.5" /> View Mentions
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
