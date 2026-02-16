import { useEffect, useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquareWarning, AlertTriangle, Siren, TrendingUp,
  TrendingDown, Activity, Shield, BarChart3, Flame
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

function MetricCard({ icon: Icon, label, value, change, changeType, accentClass }: {
  icon: any; label: string; value: string | number; change?: string; changeType?: "up" | "down" | "neutral";
  accentClass?: string;
}) {
  return (
    <Card className="bg-card border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={`p-2 rounded-lg ${accentClass || "bg-primary/10"}`}>
          <Icon className={`h-4 w-4 ${accentClass?.includes("amber") ? "text-sentinel-amber" : accentClass?.includes("red") ? "text-sentinel-red" : accentClass?.includes("emerald") ? "text-sentinel-emerald" : "text-primary"}`} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-card-foreground">{value}</span>
        {change && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${
            changeType === "up" ? "text-sentinel-emerald" : changeType === "down" ? "text-sentinel-red" : "text-muted-foreground"
          }`}>
            {changeType === "up" ? <TrendingUp className="h-3 w-3" /> : changeType === "down" ? <TrendingDown className="h-3 w-3" /> : null}
            {change}
          </span>
        )}
      </div>
    </Card>
  );
}

function RiskIndex({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s < 30) return "text-sentinel-emerald";
    if (s < 60) return "text-sentinel-amber";
    return "text-sentinel-red";
  };

  return (
    <Card className="bg-card border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Risk Index</span>
        <div className="p-2 rounded-lg bg-sentinel-red/10">
          <Shield className="h-4 w-4 text-sentinel-red" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className={`text-4xl font-bold font-mono ${getColor(score)}`}>{score}</span>
        <div className="flex-1">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full sentinel-gradient-risk transition-all duration-500" style={{ width: `${score}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>Low</span><span>Critical</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { currentOrg } = useOrg();
  const [loading, setLoading] = useState(true);
  const [totalMentions, setTotalMentions] = useState(0);
  const [negativeMentions, setNegativeMentions] = useState(0);
  const [emergencies, setEmergencies] = useState(0);
  const [narratives, setNarratives] = useState<{ name: string; status: string | null }[]>([]);
  const [incidentMode, setIncidentMode] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    setIncidentMode(currentOrg.incident_mode);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString();

    Promise.all([
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).gte("posted_at", sevenDaysAgo),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("sentiment_label", "negative").gte("posted_at", sevenDaysAgo),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("severity", "critical").gte("posted_at", sevenDaysAgo),
      supabase.from("narratives").select("name, status").eq("org_id", currentOrg.id).eq("status", "active").order("created_at", { ascending: false }).limit(5),
    ]).then(([total, neg, emg, narr]) => {
      setTotalMentions(total.count ?? 0);
      setNegativeMentions(neg.count ?? 0);
      setEmergencies(emg.count ?? 0);
      setNarratives(narr.data || []);
      setLoading(false);
    });
  }, [currentOrg]);

  const riskScore = Math.min(100, Math.round((negativeMentions / Math.max(totalMentions, 1)) * 100 + emergencies * 10));

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitoring overview — Last 7 days</p>
        </div>
        <Badge variant="outline" className={`${incidentMode ? "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5" : "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5"}`}>
          <Flame className="h-3 w-3 mr-1" />
          Incident Mode: {incidentMode ? "On" : "Off"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <MetricCard icon={MessageSquareWarning} label="Total Mentions" value={totalMentions.toLocaleString()} />
            <MetricCard icon={TrendingDown} label="Negative Mentions" value={negativeMentions.toLocaleString()} accentClass="bg-sentinel-amber/10" />
            <MetricCard icon={Siren} label="Emergencies" value={emergencies} accentClass="bg-sentinel-red/10" />
            <MetricCard icon={AlertTriangle} label="Spike Alerts" value="—" accentClass="bg-sentinel-amber/10" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RiskIndex score={loading ? 0 : riskScore} />
        <Card className="bg-card border-border p-5 lg:col-span-2">
          <span className="text-sm font-medium text-card-foreground">Sentiment data will populate after scans run.</span>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border p-5">
          <span className="text-sm font-medium text-card-foreground">Mention volume will populate after scans run.</span>
        </Card>
        <Card className="bg-card border-border p-5">
          <span className="text-sm font-medium text-card-foreground">Top Narratives</span>
          <div className="mt-4 space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
            ) : narratives.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active narratives yet.</p>
            ) : (
              narratives.map((n, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
                    <span className="text-sm text-card-foreground">{n.name}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-sentinel-emerald/30 text-sentinel-emerald capitalize">{n.status}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
