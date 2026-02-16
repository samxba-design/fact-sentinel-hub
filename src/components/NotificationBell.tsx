import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

interface AlertItem {
  id: string;
  type: string;
  status: string | null;
  triggered_at: string | null;
  payload: any;
}

export default function NotificationBell() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [escalationCount, setEscalationCount] = useState(0);

  useEffect(() => {
    if (!currentOrg) return;
    const orgId = currentOrg.id;

    const fetchAlerts = async () => {
      const [alertsRes, escRes] = await Promise.all([
        supabase.from("alerts").select("*").eq("org_id", orgId).order("triggered_at", { ascending: false }).limit(10),
        supabase.from("escalations").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", ["open", "in_progress"]),
      ]);
      setAlerts(alertsRes.data || []);
      setEscalationCount(escRes.count || 0);
    };

    fetchAlerts();
  }, [currentOrg]);

  const unreadCount = alerts.filter(a => a.status === "new").length + escalationCount;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-accent/50 transition-colors">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b border-border">
          <h4 className="text-sm font-semibold">Notifications</h4>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {escalationCount > 0 && (
            <button
              onClick={() => navigate("/escalations")}
              className="w-full text-left px-3 py-2.5 hover:bg-accent/30 border-b border-border transition-colors"
            >
              <p className="text-sm font-medium">{escalationCount} open escalation{escalationCount !== 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground">Require attention</p>
            </button>
          )}
          {alerts.length === 0 && escalationCount === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          )}
          {alerts.map(alert => (
            <div key={alert.id} className="px-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{alert.type.replace(/_/g, " ")}</span>
                {alert.status === "new" && (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
              {alert.triggered_at && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(alert.triggered_at), "MMM d, h:mm a")}
                </p>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
