import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import UpgradeBanner from "@/components/UpgradeBanner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InfoTooltip from "@/components/InfoTooltip";
import {
  MessageSquareWarning, AlertTriangle, Siren, TrendingUp,
  TrendingDown, Shield, Flame, ChevronDown, ChevronUp, ExternalLink,
  Clock, FileWarning, Plus, Zap, CheckCircle2, AlertOctagon, Sparkles, Loader2,
} from "lucide-react";
import AddMentionDialog from "@/components/mentions/AddMentionDialog";
import { Switch } from "@/components/ui/switch";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subDays, formatDistanceToNow } from "date-fns";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ActivityTimeline from "@/components/dashboard/ActivityTimeline";
import SentimentSparklines from "@/components/dashboard/SentimentSparklines";
import GettingStartedChecklist from "@/components/dashboard/GettingStartedChecklist";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import NarrativeNow from "@/components/dashboard/NarrativeNow";
import CompetitorFeedWidget from "@/components/dashboard/CompetitorFeedWidget";
import LiveThreatFeed from "@/components/dashboard/LiveThreatFeed";
import MonitoringWidget from "@/components/dashboard/MonitoringWidget";
import ReportGeneratorDialog from "@/components/reports/ReportGeneratorDialog";
import DashboardCustomizer from "@/components/dashboard/DashboardCustomizer";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import SentimentForecastWidget from "@/components/dashboard/SentimentForecastWidget";
import WatchlistThreatsWidget from "@/components/dashboard/WatchlistThreatsWidget";
import ActiveThreatsWidget from "@/components/dashboard/ActiveThreatsWidget";
import NarrativeHealthWidget from "@/components/dashboard/NarrativeHealthWidget";
// Animated counter hook
function useCountUp(target: number, duration = 800) {
  const [current, setCurrent] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === 0) { setCurrent(0); return; }
    const start = current;
    startRef.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - (startRef.current || now);
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCurrent(Math.round(start + (target - start) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return current;
}

const MetricCard = React.forwardRef<HTMLDivElement, {
  icon: any; label: string; value: number; change?: string; changeType?: "up" | "down" | "neutral";
  accentClass?: string; onClick?: () => void; tooltip?: string;
}>(function MetricCard({ icon: Icon, label, value, change, changeType, accentClass, onClick, tooltip }, ref) {
  const animatedValue = useCountUp(value);
  return (
    <Card
      className={`bg-card border-border p-5 space-y-3 transition-all duration-200 hover:shadow-md ${onClick ? "cursor-pointer hover:border-primary/30 hover:-translate-y-0.5" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      aria-label={onClick ? `View ${label}` : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </span>
        <div className={`p-2 rounded-lg ${accentClass || "bg-primary/10"}`}>
          <Icon className={`h-4 w-4 ${accentClass?.includes("amber") ? "text-sentinel-amber" : accentClass?.includes("red") ? "text-sentinel-red" : accentClass?.includes("emerald") ? "text-sentinel-emerald" : "text-primary"}`} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-card-foreground">{animatedValue.toLocaleString()}</span>
        {change && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${
            changeType === "up" ? "text-sentinel-emerald" : changeType === "down" ? "text-sentinel-red" : "text-muted-foreground"
          }`}>
            {changeType === "up" ? <TrendingUp className="h-3 w-3" /> : changeType === "down" ? <TrendingDown className="h-3 w-3" /> : null}
            {change}
          </span>
        )}
      </div>
      {onClick && <span className="text-[10px] text-primary">Click to view →</span>}
    </Card>
  );
});

function RiskIndex({ score }: { score: number }) {
  const animatedScore = useCountUp(score);
  const getColor = (s: number) => {
    if (s < 30) return "text-sentinel-emerald";
    if (s < 60) return "text-sentinel-amber";
    return "text-sentinel-red";
  };

  return (
    <Card className={`bg-card border-border p-5 space-y-3 ${score >= 60 ? "sentinel-pulse-red border-sentinel-red/30" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          Risk Index
          <InfoTooltip text="Composite score based on negative mention ratio and emergency count. Below 30 = low risk, 30-60 = moderate, above 60 = critical." />
        </span>
        <div className="p-2 rounded-lg bg-sentinel-red/10">
          <Shield className="h-4 w-4 text-sentinel-red" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className={`text-4xl font-bold font-mono ${getColor(score)}`}>{animatedScore}</span>
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

const SENTIMENT_COLORS: Record<string, string> = {
  negative: "hsl(0, 84%, 60%)",
  neutral: "hsl(220, 9%, 46%)",
  positive: "hsl(142, 71%, 45%)",
  mixed: "hsl(38, 92%, 50%)",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

const DATE_RANGES = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
];

// Extract chart-building logic to avoid duplication
function buildChartData(mentions: any[], rangeDays: number) {
  const now = new Date();
  const dayMap: Record<string, number> = {};
  const sentMap: Record<string, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
  const srcMap: Record<string, number> = {};

  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = format(subDays(now, i), "MMM dd");
    dayMap[d] = 0;
  }

  mentions.forEach((m: any) => {
    const dateStr = m.posted_at || m.created_at;
    if (dateStr) {
      const d = format(new Date(dateStr), "MMM dd");
      if (d in dayMap) dayMap[d]++;
    }
    const label = m.sentiment_label || "neutral";
    if (label in sentMap) sentMap[label]++;
    const src = m.source || "unknown";
    srcMap[src] = (srcMap[src] || 0) + 1;
  });

  return {
    volumeData: Object.entries(dayMap).map(([date, mentions]) => ({ date, mentions })),
    sentimentData: Object.entries(sentMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })),
    sourceData: Object.entries(srcMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value })),
  };
}

// ── Threat Status Banner ─────────────────────────────────────────────────────
interface ThreatStatusBannerProps {
  emergencies: number;
  negativeMentions: number;
  totalMentions: number;
  positiveMentions: number;
  rangeDays: number;
  loading: boolean;
}

function ThreatStatusBanner({ emergencies, negativeMentions, totalMentions, positiveMentions, rangeDays, loading }: ThreatStatusBannerProps) {
  const navigate = useNavigate();

  if (loading) return null;

  const negativePct = totalMentions > 0 ? Math.round((negativeMentions / totalMentions) * 100) : 0;
  const positivePct = totalMentions > 0 ? Math.round((positiveMentions / totalMentions) * 100) : 0;
  const isHighNegative = totalMentions > 0 && (negativeMentions / totalMentions) > 0.3 && negativeMentions >= 5;

  if (emergencies > 0) {
    const label = `🚨 ${emergencies} critical threat${emergencies !== 1 ? "s" : ""} detected in the last ${rangeDays} days`;
    return (
      <Card className="border-l-4 border-l-red-500 bg-red-500/5 border-red-500/20 py-3 px-5 flex items-center gap-4">
        <AlertOctagon className="h-5 w-5 text-red-500 shrink-0" />
        <p className="flex-1 text-sm font-medium text-foreground">{label}</p>
        <Button size="sm" variant="destructive" onClick={() => navigate(`/mentions?severity=critical&days=${rangeDays}`)}>
          Review Now →
        </Button>
      </Card>
    );
  }

  if (isHighNegative) {
    const label = `⚠ Negative sentiment elevated — ${negativeMentions} negative mentions (${negativePct}% of total)`;
    return (
      <Card className="border-l-4 border-l-amber-500 bg-amber-500/5 border-amber-500/20 py-3 px-5 flex items-center gap-4">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
        <p className="flex-1 text-sm font-medium text-foreground">{label}</p>
        <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => navigate(`/mentions?sentiment=negative&days=${rangeDays}`)}>
          View Threats →
        </Button>
      </Card>
    );
  }

  if (totalMentions === 0) {
    return (
      <Card className="border-l-4 border-l-muted-foreground/30 bg-muted/30 border-muted/50 py-3 px-5 flex items-center gap-4">
        <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
        <p className="flex-1 text-sm text-muted-foreground">No data yet. Run your first scan to start monitoring.</p>
        <Button size="sm" variant="outline" onClick={() => navigate("/scans")}>
          Run Scan →
        </Button>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-emerald-500 bg-emerald-500/5 border-emerald-500/20 py-3 px-5 flex items-center gap-4">
      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
      <p className="flex-1 text-sm font-medium text-foreground">✓ All clear — {totalMentions} mentions tracked, {positivePct}% positive</p>
      <Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10" onClick={() => navigate(`/mentions?days=${rangeDays}`)}>
        View All →
      </Button>
    </Card>
  );
}

export default function DashboardPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { widgets, toggleWidget, reorderWidgets, resetLayout } = useDashboardLayout();
  const [loading, setLoading] = useState(true);
  const [totalMentions, setTotalMentions] = useState(0);
  const [negativeMentions, setNegativeMentions] = useState(0);
  const [positiveMentions, setPositiveMentions] = useState(0);
  const [emergencies, setEmergencies] = useState(0);
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [pendingEscalations, setPendingEscalations] = useState(0);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [incidentMode, setIncidentMode] = useState(false);
  const [volumeData, setVolumeData] = useState<{ date: string; mentions: number }[]>([]);
  const [sentimentData, setSentimentData] = useState<{ name: string; value: number }[]>([]);
  const [sourceData, setSourceData] = useState<{ name: string; value: number }[]>([]);
  const [prevTotal, setPrevTotal] = useState(0);
  const [rangeDays, setRangeDays] = useState(7);
  const [addMentionOpen, setAddMentionOpen] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);

  const handleSeedDemo = async () => {
    if (!currentOrg) return;
    setSeedingDemo(true);
    try {
      const { error } = await supabase.functions.invoke("seed-demo", {
        body: { org_id: currentOrg.id },
      });
      if (error) throw error;
      // Reload the page data after seeding
      window.location.reload();
    } catch (err: any) {
      console.error("Seed demo error:", err);
    } finally {
      setSeedingDemo(false);
    }
  };

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    setIncidentMode(currentOrg.incident_mode);

    const now = new Date();
    const rangeAgo = subDays(now, rangeDays).toISOString();
    const prevRangeAgo = subDays(now, rangeDays * 2).toISOString();

    Promise.all([
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand").eq("sentiment_label", "negative").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand").eq("severity", "critical").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand").or(`and(posted_at.gte.${prevRangeAgo},posted_at.lt.${rangeAgo}),and(posted_at.is.null,created_at.gte.${prevRangeAgo},created_at.lt.${rangeAgo})`),
      supabase.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("status", "active"),
      supabase.from("mentions").select("posted_at, created_at, sentiment_label, source").eq("org_id", currentOrg.id).eq("mention_type", "brand").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`).order("created_at"),
      supabase.from("escalations").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).in("status", ["open", "in_progress"]),
      supabase.from("scan_runs").select("finished_at").eq("org_id", currentOrg.id).eq("status", "completed").order("finished_at", { ascending: false }).limit(1),
    ]).then(async ([total, neg, emg, prev, incidents, mentionsRaw, escalations, lastScan]) => {
      setTotalMentions(total.count ?? 0);
      setNegativeMentions(neg.count ?? 0);
      setEmergencies(emg.count ?? 0);
      setPrevTotal(prev.count ?? 0);
      setActiveIncidents(incidents.count ?? 0);
      setPendingEscalations(escalations.count ?? 0);
      setLastScanAt(lastScan.data?.[0]?.finished_at || null);

      const { volumeData: vd, sentimentData: sd, sourceData: srd } = buildChartData(mentionsRaw.data || [], rangeDays);
      setVolumeData(vd);
      setSentimentData(sd);
      setSourceData(srd);
      
      // Extract positive mentions count from sentiment data
      const positiveCount = sd.find(s => s.name === "positive")?.value ?? 0;
      setPositiveMentions(positiveCount);
      
      setLoading(false);
    });
  }, [currentOrg, rangeDays]);

  // Debounced full refresh for realtime — updates counts AND charts
  const realtimeRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshRef.current) clearTimeout(realtimeRefreshRef.current);
    realtimeRefreshRef.current = setTimeout(() => {
      if (!currentOrg) return;
      const now = new Date();
      const rangeAgo = subDays(now, rangeDays).toISOString();
      Promise.all([
        supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`),
        supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand").eq("sentiment_label", "negative").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`),
        supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand").eq("severity", "critical").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`),
        supabase.from("mentions").select("posted_at, created_at, sentiment_label, source").eq("org_id", currentOrg.id).eq("mention_type", "brand").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`).order("created_at"),
      ]).then(([total, neg, emg, mentionsRaw]) => {
        setTotalMentions(total.count ?? 0);
        setNegativeMentions(neg.count ?? 0);
        setEmergencies(emg.count ?? 0);
        const { volumeData: vd, sentimentData: sd, sourceData: srd } = buildChartData(mentionsRaw.data || [], rangeDays);
        setVolumeData(vd);
        setSentimentData(sd);
        setSourceData(srd);
        const positiveCount = sd.find(s => s.name === "positive")?.value ?? 0;
        setPositiveMentions(positiveCount);
      });
    }, 2000);
  }, [currentOrg, rangeDays]);

  // Supabase Realtime subscription for scan_runs + 30s safety interval
  useEffect(() => {
    if (!currentOrg) return;

    const loadDashboardData = () => {
      const now = new Date();
      const rangeAgo = subDays(now, rangeDays).toISOString();
      Promise.all([
        supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`),
        supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand").eq("sentiment_label", "negative").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`),
        supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand").eq("severity", "critical").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`),
        supabase.from("mentions").select("posted_at, created_at, sentiment_label, source").eq("org_id", currentOrg.id).eq("mention_type", "brand").or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`).order("created_at"),
      ]).then(([total, neg, emg, mentionsRaw]) => {
        setTotalMentions(total.count ?? 0);
        setNegativeMentions(neg.count ?? 0);
        setEmergencies(emg.count ?? 0);
        const { volumeData: vd, sentimentData: sd, sourceData: srd } = buildChartData(mentionsRaw.data || [], rangeDays);
        setVolumeData(vd);
        setSentimentData(sd);
        setSourceData(srd);
        const positiveCount = sd.find(s => s.name === "positive")?.value ?? 0;
        setPositiveMentions(positiveCount);
      });
    };

    // Realtime subscription on scan_runs
    const channel = supabase
      .channel(`scan-runs:${currentOrg.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scan_runs', filter: `org_id=eq.${currentOrg.id}` }, () => {
        loadDashboardData();
      })
      .subscribe();

    // 30s safety interval fallback
    const safetyInterval = setInterval(loadDashboardData, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(safetyInterval);
    };
  }, [currentOrg, rangeDays]);

  const riskScore = Math.min(100, Math.round((negativeMentions / Math.max(totalMentions, 1)) * 100 + emergencies * 10));
  const totalChange = prevTotal > 0 ? `${Math.round(((totalMentions - prevTotal) / prevTotal) * 100)}%` : undefined;
  const totalChangeType = totalMentions > prevTotal ? "up" as const : totalMentions < prevTotal ? "down" as const : "neutral" as const;

  // Sort widgets by saved order; only render visible ones
  const orderedWidgets = [...widgets].sort((a, b) => a.order - b.order).filter(w => w.visible);

  const renderWidget = (id: string) => {
    switch (id) {
      case "narrative-now":
        return <NarrativeNow key="narrative-now" />;

      case "metrics":
        return (
          <div key="metrics" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
            ) : (
              <>
                <MetricCard icon={MessageSquareWarning} label="Total Mentions" value={totalMentions} change={totalChange} changeType={totalChangeType} onClick={() => navigate(`/mentions?days=${rangeDays}`)} tooltip="Total mentions detected across all sources in the selected time period." />
                <MetricCard icon={TrendingDown} label="Negative Mentions" value={negativeMentions} accentClass="bg-sentinel-amber/10" onClick={() => navigate(`/mentions?sentiment=negative&days=${rangeDays}`)} tooltip="Mentions classified as having negative sentiment by AI analysis." />
                <MetricCard icon={Siren} label="Emergencies" value={emergencies} accentClass="bg-sentinel-red/10" onClick={() => navigate(`/mentions?severity=critical&days=${rangeDays}`)} tooltip="Critical-severity mentions requiring immediate attention — potential crises." />
                <MetricCard icon={AlertTriangle} label="Active Incidents" value={activeIncidents} accentClass="bg-sentinel-amber/10" onClick={() => navigate("/incidents?status=active")} tooltip="Open incident war-rooms currently being tracked." />
                <MetricCard icon={FileWarning} label="Open Escalations" value={pendingEscalations} accentClass="bg-primary/10" onClick={() => navigate("/escalations")} tooltip="Escalations currently open or in progress requiring attention." />
              </>
            )}
          </div>
        );

      case "sparklines":
        return <SentimentSparklines key="sparklines" />;

      case "forecast":
        return <SentimentForecastWidget key="forecast" />;

      case "risk-sentiment":
        return (
          <div key="risk-sentiment" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="cursor-pointer" onClick={() => navigate("/risk-console")}>
              <RiskIndex score={loading ? 0 : riskScore} />
            </div>
            <Card className="bg-card border-border p-5 lg:col-span-2">
              <span className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
                Sentiment Breakdown
                <InfoTooltip text="Distribution of AI-classified sentiment across all mentions in the selected period." />
              </span>
              {loading ? (
                <Skeleton className="h-40 w-full mt-4" />
              ) : sentimentData.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-4">No sentiment data yet. Run a scan to populate.</p>
              ) : (
                <div className="flex items-center gap-6 mt-4">
                  <ResponsiveContainer width="50%" height={160}>
                    <PieChart>
                      <Pie data={sentimentData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} strokeWidth={0}>
                        {sentimentData.map((entry) => (
                          <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name] || "hsl(220, 9%, 46%)"} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-3 flex-1">
                    {sentimentData.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-center justify-between cursor-pointer hover:bg-muted/30 rounded-md px-2 py-1 -mx-2 transition-colors"
                        onClick={() => navigate(`/mentions?sentiment=${s.name}&days=${rangeDays}`)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SENTIMENT_COLORS[s.name] }} />
                          <span className="text-sm text-card-foreground capitalize">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-mono text-muted-foreground">{s.value}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground/50" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        );

      case "timeline-volume":
        return (
          <div key="timeline-volume" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ActivityTimeline />
            <Card className="bg-card border-border p-5">
              <span className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
                Mention Volume ({rangeDays} days)
                <InfoTooltip text="Daily mention count across all sources, showing volume trends over the selected period." />
              </span>
              {loading ? (
                <Skeleton className="h-48 w-full mt-4" />
              ) : volumeData.every(d => d.mentions === 0) ? (
                <p className="text-xs text-muted-foreground mt-4">No mentions yet. Run a scan to populate.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200} className="mt-4">
                  <AreaChart data={volumeData}>
                    <defs>
                      <linearGradient id="mentionGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="mentions" stroke="hsl(var(--primary))" fill="url(#mentionGrad)" strokeWidth={2} name="Mentions" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        );

      case "narrative-monitoring-feed":
        return (
          <div key="narrative-monitoring-feed" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <NarrativeHealthWidget />
            <MonitoringWidget />
            <LiveThreatFeed />
          </div>
        );

      case "active-threats":
        return <ActiveThreatsWidget key="active-threats" />;

      case "watchlist-threats":
        return <WatchlistThreatsWidget key="watchlist-threats" />;

      case "sources":
        return (
          <Card key="sources" className="bg-card border-border p-5 space-y-3">
            <span className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
              Source Breakdown
              <InfoTooltip text="Distribution of mentions by source platform in the selected period." />
            </span>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : sourceData.length === 0 ? (
              <p className="text-xs text-muted-foreground">No source data yet. Run a scan to populate.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sourceData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Mentions" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        );

      case "competitor-feed":
        return <CompetitorFeedWidget key="competitor-feed" />;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <OnboardingTour />
      <GettingStartedChecklist />
      <UpgradeBanner feature="Advanced analytics & unlimited scans" />

      {/* ── New-user zero state ── */}
      {!loading && totalMentions === 0 && !lastScanAt && (
        <Card className="bg-gradient-to-br from-primary/5 via-card to-card border-primary/20 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground">Welcome to SentiWatch — run your first scan</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your dashboard is empty because no scans have run yet. A scan pulls in brand mentions from news, social, Reddit, and more, then analyses sentiment and detects narrative themes automatically.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" onClick={() => navigate("/scans")} className="gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> Run First Scan
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/settings")} className="gap-1.5">
                  Configure Keywords
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleSeedDemo}
                  disabled={seedingDemo}
                  className="gap-1.5"
                >
                  {seedingDemo
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Sparkles className="h-3.5 w-3.5" />
                  }
                  {seedingDemo ? "Loading…" : "Load Demo Data"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigate("/guide")} className="gap-1.5 text-muted-foreground">
                  View Getting Started Guide
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">Monitoring overview — Last {rangeDays} days</p>
            {lastScanAt && (
              <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last scan: {formatDistanceToNow(new Date(lastScanAt), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddMentionOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Mention
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/triage")} className="gap-1.5">
            <Zap className="h-3.5 w-3.5 text-primary" /> Quick Triage
          </Button>
          <ReportGeneratorDialog />
          <DashboardCustomizer widgets={widgets} onToggle={toggleWidget} onReorder={reorderWidgets} onReset={resetLayout} />
          {/* Date range selector */}
          <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
            {DATE_RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setRangeDays(r.days)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  rangeDays === r.days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-card-foreground hover:bg-muted/50"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <TooltipProvider>
            <UiTooltip>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all cursor-default ${
                  incidentMode 
                    ? "border-sentinel-red/40 bg-sentinel-red/10" 
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}>
                  <Flame className={`h-4 w-4 ${incidentMode ? "text-sentinel-red" : "text-muted-foreground"}`} />
                  <div className="flex flex-col">
                    <span className={`text-xs font-medium leading-none ${incidentMode ? "text-sentinel-red" : "text-card-foreground"}`}>
                      Incident Mode
                    </span>
                  </div>
                  <Switch
                    checked={incidentMode}
                    onCheckedChange={async (checked) => {
                      if (!currentOrg) return;
                      setIncidentMode(checked);
                      await supabase.from("organizations").update({ incident_mode: checked }).eq("id", currentOrg.id);
                    }}
                    className="ml-1"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] bg-popover border-border text-popover-foreground z-50">
                <p className="text-xs font-medium mb-1">
                  {incidentMode ? "🔴 Incident Mode Active" : "Incident Mode Off"}
                </p>
                <p className="text-xs text-muted-foreground">
                  When enabled, scan frequency increases, alerts escalate faster, and the dashboard prioritizes critical threats. Toggle on during active crises.
                </p>
              </TooltipContent>
            </UiTooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* ── Threat Status Banner ── */}
      <ThreatStatusBanner 
        emergencies={emergencies}
        negativeMentions={negativeMentions}
        totalMentions={totalMentions}
        positiveMentions={positiveMentions}
        rangeDays={rangeDays}
        loading={loading}
      />

      {/* ── Widgets — rendered in user-defined order ── */}
      {orderedWidgets.map(w => renderWidget(w.id))}

      <AddMentionDialog open={addMentionOpen} onOpenChange={setAddMentionOpen} />
    </div>
  );
}
