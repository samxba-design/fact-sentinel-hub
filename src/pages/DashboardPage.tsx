import { useEffect, useState, useRef } from "react";
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
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
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
import NarrativeHealthWidget from "@/components/dashboard/NarrativeHealthWidget";
import LiveThreatFeed from "@/components/dashboard/LiveThreatFeed";

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

function MetricCard({ icon: Icon, label, value, change, changeType, accentClass, onClick, tooltip }: {
  icon: any; label: string; value: number; change?: string; changeType?: "up" | "down" | "neutral";
  accentClass?: string; onClick?: () => void; tooltip?: string;
}) {
  const animatedValue = useCountUp(value);
  return (
    <Card
      className={`bg-card border-border p-5 space-y-3 transition-all duration-200 hover:shadow-md ${onClick ? "cursor-pointer hover:border-primary/30 hover:-translate-y-0.5" : ""}`}
      onClick={onClick}
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
}

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

export default function DashboardPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [totalMentions, setTotalMentions] = useState(0);
  const [negativeMentions, setNegativeMentions] = useState(0);
  const [emergencies, setEmergencies] = useState(0);
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [incidentMode, setIncidentMode] = useState(false);
  const [volumeData, setVolumeData] = useState<{ date: string; mentions: number }[]>([]);
  const [sentimentData, setSentimentData] = useState<{ name: string; value: number }[]>([]);
  const [prevTotal, setPrevTotal] = useState(0);
  const [rangeDays, setRangeDays] = useState(7);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    setIncidentMode(currentOrg.incident_mode);

    const now = new Date();
    const rangeAgo = subDays(now, rangeDays).toISOString();
    const prevRangeAgo = subDays(now, rangeDays * 2).toISOString();

    Promise.all([
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).gte("posted_at", rangeAgo),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("sentiment_label", "negative").gte("posted_at", rangeAgo),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("severity", "critical").gte("posted_at", rangeAgo),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).gte("posted_at", prevRangeAgo).lt("posted_at", rangeAgo),
      supabase.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("status", "active"),
      supabase.from("mentions").select("posted_at, sentiment_label").eq("org_id", currentOrg.id).gte("posted_at", rangeAgo).order("posted_at"),
    ]).then(async ([total, neg, emg, prev, incidents, mentionsRaw]) => {
      setTotalMentions(total.count ?? 0);
      setNegativeMentions(neg.count ?? 0);
      setEmergencies(emg.count ?? 0);
      setPrevTotal(prev.count ?? 0);
      setActiveIncidents(incidents.count ?? 0);

      const mentions = mentionsRaw.data || [];
      const dayMap: Record<string, number> = {};
      const sentMap: Record<string, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };

      for (let i = rangeDays - 1; i >= 0; i--) {
        const d = format(subDays(now, i), "MMM dd");
        dayMap[d] = 0;
      }

      mentions.forEach((m: any) => {
        if (m.posted_at) {
          const d = format(new Date(m.posted_at), "MMM dd");
          if (d in dayMap) dayMap[d]++;
        }
        const label = m.sentiment_label || "neutral";
        if (label in sentMap) sentMap[label]++;
      });

      setVolumeData(Object.entries(dayMap).map(([date, mentions]) => ({ date, mentions })));
      setSentimentData(Object.entries(sentMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })));
      setLoading(false);
    });
  }, [currentOrg, rangeDays]);

  const riskScore = Math.min(100, Math.round((negativeMentions / Math.max(totalMentions, 1)) * 100 + emergencies * 10));
  const totalChange = prevTotal > 0 ? `${Math.round(((totalMentions - prevTotal) / prevTotal) * 100)}%` : undefined;
  const totalChangeType = totalMentions > prevTotal ? "up" as const : totalMentions < prevTotal ? "down" as const : "neutral" as const;

  return (
    <div className="space-y-6 animate-fade-up">
      <OnboardingTour />
      <GettingStartedChecklist />
      <UpgradeBanner feature="Advanced analytics & unlimited scans" />
      <div className="flex items-center justify-between">
        <div>
         <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitoring overview — Last {rangeDays} days</p>
        </div>
        <div className="flex items-center gap-2">
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
          <Badge variant="outline" className={`${incidentMode ? "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5" : "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5"}`}>
            <Flame className="h-3 w-3 mr-1" />
            Incident Mode: {incidentMode ? "On" : "Off"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <MetricCard icon={MessageSquareWarning} label="Total Mentions" value={totalMentions} change={totalChange} changeType={totalChangeType} onClick={() => navigate(`/mentions?days=${rangeDays}`)} tooltip="Total mentions detected across all sources in the selected time period." />
            <MetricCard icon={TrendingDown} label="Negative Mentions" value={negativeMentions} accentClass="bg-sentinel-amber/10" onClick={() => navigate(`/mentions?sentiment=negative&days=${rangeDays}`)} tooltip="Mentions classified as having negative sentiment by AI analysis." />
            <MetricCard icon={Siren} label="Emergencies" value={emergencies} accentClass="bg-sentinel-red/10" onClick={() => navigate(`/mentions?severity=critical&days=${rangeDays}`)} tooltip="Critical-severity mentions requiring immediate attention — potential crises." />
            <MetricCard icon={AlertTriangle} label="Active Incidents" value={activeIncidents} accentClass="bg-sentinel-amber/10" onClick={() => navigate("/incidents?status=active")} tooltip="Open incident war-rooms currently being tracked." />
          </>
        )}
      </div>

      {/* Sentiment Sparklines */}
      <SentimentSparklines />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity Timeline */}
        <ActivityTimeline />

        {/* Mention Volume + Top Narratives */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NarrativeHealthWidget />
        <LiveThreatFeed />
      </div>
    </div>
  );
}
