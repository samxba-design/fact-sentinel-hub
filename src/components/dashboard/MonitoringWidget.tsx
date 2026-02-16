import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, BellRing, Settings2, ChevronRight, AlertTriangle, TrendingUp, Siren, Zap, Clock, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import InfoTooltip from "@/components/InfoTooltip";

interface Alert {
  id: string;
  type: string;
  status: string | null;
  payload: any;
  triggered_at: string | null;
}

interface ScheduleInfo {
  scan_schedule: string | null;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
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

const SCHEDULE_LABELS: Record<string, string> = {
  manual: "Manual",
  "6h": "Every 6h",
  "12h": "Every 12h",
  daily: "Daily",
  weekly: "Weekly",
};

export default function MonitoringWidget() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [schedule, setSchedule] = useState<ScheduleInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    Promise.all([
      supabase
        .from("alerts")
        .select("id, type, status, payload, triggered_at")
        .eq("org_id", currentOrg.id)
        .eq("status", "active")
        .order("triggered_at", { ascending: false })
        .limit(5),
      supabase
        .from("tracking_profiles")
        .select("scan_schedule, quiet_hours_start, quiet_hours_end")
        .eq("org_id", currentOrg.id)
        .maybeSingle(),
    ]).then(([alertsRes, scheduleRes]) => {
      setAlerts(alertsRes.data || []);
      setSchedule(scheduleRes.data);
      setLoading(false);
    });
  }, [currentOrg]);

  const activeCount = alerts.length;
  const scheduleLabel = schedule?.scan_schedule ? SCHEDULE_LABELS[schedule.scan_schedule] || schedule.scan_schedule : "Not configured";
  const isMonitoring = schedule?.scan_schedule && schedule.scan_schedule !== "manual";

  return (
    <Card className="bg-card border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-card-foreground flex items-center gap-2">
          {activeCount > 0 ? (
            <BellRing className="h-4 w-4 text-sentinel-red animate-pulse" />
          ) : (
            <Bell className="h-4 w-4 text-primary" />
          )}
          Monitoring & Alerts
          <InfoTooltip text="Automated monitoring detects mention spikes, negative sentiment surges, critical threats, and viral risks. Configure schedules and alert preferences in Settings." />
        </span>
        <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={() => navigate("/alerts")}>
          View All <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      {/* Schedule Status */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
        <div className={`p-1.5 rounded-md ${isMonitoring ? "bg-sentinel-emerald/10" : "bg-muted"}`}>
          <Activity className={`h-4 w-4 ${isMonitoring ? "text-sentinel-emerald" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-card-foreground">Auto-scan:</span>
            <Badge variant={isMonitoring ? "default" : "outline"} className="text-[10px] h-5">
              {scheduleLabel}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Spike detection runs every 15 min
          </p>
        </div>
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1 shrink-0" onClick={() => navigate("/settings?tab=alerts")}>
          <Settings2 className="h-3 w-3" /> Configure
        </Button>
      </div>

      {/* Active Alerts */}
      {loading ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : activeCount === 0 ? (
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground">No active alerts — monitoring is clear</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, 3).map(alert => {
            const Icon = ALERT_ICONS[alert.type] || Bell;
            const color = ALERT_COLORS[alert.type] || "text-primary";
            const payload = alert.payload as any || {};
            return (
              <div
                key={alert.id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 border border-border hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => navigate("/alerts")}
              >
                <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-card-foreground line-clamp-1">{payload.message || alert.type.replace(/_/g, " ")}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {alert.triggered_at ? formatDistanceToNow(new Date(alert.triggered_at), { addSuffix: true }) : "—"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[9px] capitalize border-sentinel-red/30 text-sentinel-red shrink-0">
                  active
                </Badge>
              </div>
            );
          })}
          {activeCount > 3 && (
            <button
              onClick={() => navigate("/alerts")}
              className="w-full text-xs text-primary hover:underline text-center py-1"
            >
              +{activeCount - 3} more active alerts →
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
