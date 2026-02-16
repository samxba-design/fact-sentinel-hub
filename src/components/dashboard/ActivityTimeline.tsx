import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Scan, Siren, AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface TimelineEvent {
  id: string;
  type: "scan" | "emergency" | "incident" | "escalation";
  message: string;
  timestamp: string;
  link?: string;
}

export default function ActivityTimeline() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    if (!currentOrg) return;

    Promise.all([
      supabase
        .from("scan_runs")
        .select("id, started_at, status, total_mentions, emergencies_count")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("escalations")
        .select("id, title, created_at")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("incidents")
        .select("id, name, created_at, status")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .limit(3),
    ]).then(([scans, escalations, incidents]) => {
      const all: TimelineEvent[] = [];

      (scans.data || []).forEach((s: any) => {
        all.push({
          id: `scan-${s.id}`,
          type: "scan",
          message: `Scan ${s.status}: ${s.total_mentions ?? 0} mentions found${s.emergencies_count ? `, ${s.emergencies_count} emergencies` : ""}`,
          timestamp: s.started_at || new Date().toISOString(),
          link: `/mentions?scan=${s.id}`,
        });
      });

      (escalations.data || []).forEach((e: any) => {
        all.push({
          id: `esc-${e.id}`,
          type: "escalation",
          message: `Escalation: ${e.title}`,
          timestamp: e.created_at,
          link: `/escalations`,
        });
      });

      (incidents.data || []).forEach((i: any) => {
        all.push({
          id: `inc-${i.id}`,
          type: "incident",
          message: `Incident ${i.status}: ${i.name}`,
          timestamp: i.created_at,
          link: `/incidents/${i.id}`,
        });
      });

      all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(all.slice(0, 10));
    });
  }, [currentOrg]);

  const iconMap = {
    scan: Scan,
    emergency: Siren,
    incident: AlertTriangle,
    escalation: CheckCircle2,
  };

  const colorMap = {
    scan: "text-primary",
    emergency: "text-sentinel-red",
    incident: "text-sentinel-amber",
    escalation: "text-sentinel-purple",
  };

  if (events.length === 0) return null;

  return (
    <Card className="bg-card border-border p-5 space-y-3">
      <span className="text-sm font-medium text-card-foreground flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" /> Recent Activity
      </span>
      <div className="space-y-1">
        {events.map((e) => {
          const Icon = iconMap[e.type];
          return (
            <div
              key={e.id}
              className={`flex items-start gap-3 py-2 px-2 rounded-lg text-xs ${
                e.link ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""
              }`}
              onClick={() => e.link && navigate(e.link)}
            >
              <div className="relative mt-0.5">
                <Icon className={`h-3.5 w-3.5 ${colorMap[e.type]}`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-card-foreground">{e.message}</span>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
