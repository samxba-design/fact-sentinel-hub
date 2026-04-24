import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [escalationCount, setEscalationCount] = useState(0);
  const [markingRead, setMarkingRead] = useState(false);

  const fetchAlerts = async () => {
    if (!currentOrg) return;
    const orgId = currentOrg.id;
    const [alertsRes, escRes] = await Promise.all([
      supabase.from("alerts").select("*").eq("org_id", orgId).order("triggered_at", { ascending: false }).limit(10),
      supabase.from("escalations").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", ["open", "in_progress"]),
    ]);
    setAlerts(alertsRes.data || []);
    setEscalationCount(escRes.count || 0);
  };

  useEffect(() => {
    if (!currentOrg) return;
    fetchAlerts();
  }, [currentOrg]);

  const markAllRead = async () => {
    if (!currentOrg) return;
    setMarkingRead(true);
    const { error } = await supabase
      .from("alerts")
      .update({ status: "read" })
      .eq("org_id", currentOrg.id)
      .eq("status", "new");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setAlerts(prev => prev.map(a => a.status === "new" ? { ...a, status: "read" } : a));
      toast({ title: "All notifications marked as read" });
    }
    setMarkingRead(false);
  };

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
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={markAllRead}
              disabled={markingRead}
            >
              {markingRead ? "Marking…" : "Mark all read"}
            </Button>
          )}
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
