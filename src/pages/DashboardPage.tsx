import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import UpgradeBanner from "@/components/UpgradeBanner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquareWarning, AlertTriangle, Siren, TrendingUp,
  TrendingDown, Shield, Flame, ChevronDown, ChevronUp, ExternalLink, Quote,
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
import LiveThreatFeed from "@/components/dashboard/LiveThreatFeed";
import ActivityTimeline from "@/components/dashboard/ActivityTimeline";
import SentimentSparklines from "@/components/dashboard/SentimentSparklines";
import OnboardingTour from "@/components/onboarding/OnboardingTour";

interface RecentMention {
  id: string;
  content: string | null;
  source: string;
  severity: string | null;
  sentiment_label: string | null;
  posted_at: string | null;
  author_name: string | null;
  flags: any;
}

function MetricCard({ icon: Icon, label, value, change, changeType, accentClass, onClick }: {
  icon: any; label: string; value: string | number; change?: string; changeType?: "up" | "down" | "neutral";
  accentClass?: string; onClick?: () => void;
}) {
  return (
    <Card
      className={`bg-card border-border p-5 space-y-3 transition-colors ${onClick ? "cursor-pointer hover:border-primary/30" : ""}`}
      onClick={onClick}
    >
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
      {onClick && <span className="text-[10px] text-primary">Click to view →</span>}
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

const SENTIMENT_COLORS: Record<string, string> = {
  negative: "hsl(0, 84%, 60%)",
  neutral: "hsl(220, 9%, 46%)",
  positive: "hsl(142, 71%, 45%)",
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

export default function DashboardPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [totalMentions, setTotalMentions] = useState(0);
  const [negativeMentions, setNegativeMentions] = useState(0);
  const [emergencies, setEmergencies] = useState(0);
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [narratives, setNarratives] = useState<{ id: string; name: string; status: string | null; mention_count: number }[]>([]);
  const [incidentMode, setIncidentMode] = useState(false);
  const [volumeData, setVolumeData] = useState<{ date: string; mentions: number }[]>([]);
  const [sentimentData, setSentimentData] = useState<{ name: string; value: number }[]>([]);
  const [prevTotal, setPrevTotal] = useState(0);
  const [recentMentions, setRecentMentions] = useState<RecentMention[]>([]);
  const [emergencyMentions, setEmergencyMentions] = useState<RecentMention[]>([]);
  const [emergenciesOpen, setEmergenciesOpen] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    setIncidentMode(currentOrg.incident_mode);

    const now = new Date();
    const sevenDaysAgo = subDays(now, 7).toISOString();
    const fourteenDaysAgo = subDays(now, 14).toISOString();

    Promise.all([
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).gte("posted_at", sevenDaysAgo),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("sentiment_label", "negative").gte("posted_at", sevenDaysAgo),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("severity", "critical").gte("posted_at", sevenDaysAgo),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).gte("posted_at", fourteenDaysAgo).lt("posted_at", sevenDaysAgo),
      supabase.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("status", "active"),
      supabase.from("narratives").select("id, name, status").eq("org_id", currentOrg.id).eq("status", "active").order("created_at", { ascending: false }).limit(5),
      supabase.from("mentions").select("posted_at, sentiment_label").eq("org_id", currentOrg.id).gte("posted_at", sevenDaysAgo).order("posted_at"),
      supabase.from("mentions").select("id, content, source, severity, sentiment_label, posted_at, author_name, flags")
        .eq("org_id", currentOrg.id).in("severity", ["high", "critical"]).not("content", "is", null)
        .order("posted_at", { ascending: false }).limit(5),
      supabase.from("mentions").select("id, content, source, severity, sentiment_label, posted_at, author_name, flags")
        .eq("org_id", currentOrg.id).eq("severity", "critical").not("content", "is", null)
        .order("posted_at", { ascending: false }).limit(10),
    ]).then(async ([total, neg, emg, prev, incidents, narr, mentionsRaw, recentRes, emergencyRes]) => {
      setTotalMentions(total.count ?? 0);
      setNegativeMentions(neg.count ?? 0);
      setEmergencies(emg.count ?? 0);
      setPrevTotal(prev.count ?? 0);
      setActiveIncidents(incidents.count ?? 0);
      setRecentMentions(recentRes.data || []);
      setEmergencyMentions(emergencyRes.data || []);

      const narrData = narr.data || [];
      if (narrData.length > 0) {
        const countResults = await Promise.all(
          narrData.map(n =>
            supabase.from("mention_narratives").select("mention_id", { count: "exact", head: true }).eq("narrative_id", n.id)
          )
        );
        setNarratives(narrData.map((n, i) => ({
          id: n.id, name: n.name, status: n.status,
          mention_count: countResults[i].count ?? 0,
        })));
      } else {
        setNarratives([]);
      }

      const mentions = mentionsRaw.data || [];
      const dayMap: Record<string, number> = {};
      const sentMap: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };

      for (let i = 6; i >= 0; i--) {
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
  }, [currentOrg]);

  const riskScore = Math.min(100, Math.round((negativeMentions / Math.max(totalMentions, 1)) * 100 + emergencies * 10));
  const totalChange = prevTotal > 0 ? `${Math.round(((totalMentions - prevTotal) / prevTotal) * 100)}%` : undefined;
  const totalChangeType = totalMentions > prevTotal ? "up" as const : totalMentions < prevTotal ? "down" as const : "neutral" as const;

  return (
    <div className="space-y-6 animate-fade-up">
      <OnboardingTour />
      <UpgradeBanner feature="Advanced analytics & unlimited scans" />
      <div className="flex items-center justify-between">
        <div>
         <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitoring overview — Last 7 days</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 italic">Data shown is AI-simulated from scans — not sourced from real platforms</p>
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
            <MetricCard icon={MessageSquareWarning} label="Total Mentions" value={totalMentions.toLocaleString()} change={totalChange} changeType={totalChangeType} onClick={() => navigate("/mentions")} />
            <MetricCard icon={TrendingDown} label="Negative Mentions" value={negativeMentions.toLocaleString()} accentClass="bg-sentinel-amber/10" onClick={() => navigate("/mentions")} />
            <MetricCard icon={Siren} label="Emergencies" value={emergencies} accentClass="bg-sentinel-red/10" onClick={() => navigate("/risk-console")} />
            <MetricCard icon={AlertTriangle} label="Active Incidents" value={activeIncidents} accentClass="bg-sentinel-amber/10" onClick={() => navigate("/incidents")} />
          </>
        )}
      </div>

      {/* Emergencies expandable */}
      {!loading && emergencies > 0 && (
        <Collapsible open={emergenciesOpen} onOpenChange={setEmergenciesOpen}>
          <Card className="bg-card border-sentinel-red/20 p-4">
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full text-left">
                <div className="flex items-center gap-2">
                  <Siren className="h-4 w-4 text-sentinel-red" />
                  <span className="text-sm font-medium text-card-foreground">{emergencies} Critical {emergencies === 1 ? "Detection" : "Detections"} (AI-Simulated)</span>
                </div>
                {emergenciesOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              {emergencyMentions.map(m => (
                <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg bg-sentinel-red/5 border border-sentinel-red/10 cursor-pointer hover:bg-sentinel-red/10 transition-colors" onClick={() => navigate(`/mentions/${m.id}`)}>
                  <AlertTriangle className="h-4 w-4 text-sentinel-red shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-card-foreground line-clamp-2">{m.content}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span>{m.source}</span><span>·</span><span>{m.author_name || "Unknown"}</span><span>·</span>
                      <span>{m.posted_at ? formatDistanceToNow(new Date(m.posted_at), { addSuffix: true }) : "—"}</span>
                    </div>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                </div>
              ))}
              <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => navigate("/risk-console")}>
                View all in Risk Console
              </Button>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Live Threat Feed + Sentiment Sparklines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LiveThreatFeed />
        <SentimentSparklines />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RiskIndex score={loading ? 0 : riskScore} />
        <Card className="bg-card border-border p-5 lg:col-span-2">
          <span className="text-sm font-medium text-card-foreground">Sentiment Breakdown</span>
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
                  <div key={s.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SENTIMENT_COLORS[s.name] }} />
                      <span className="text-sm text-card-foreground capitalize">{s.name}</span>
                    </div>
                    <span className="text-sm font-mono text-muted-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Recent Notable Mentions with Quotes */}
      {!loading && recentMentions.length > 0 && (
        <Card className="bg-card border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-card-foreground flex items-center gap-2">
              <Quote className="h-4 w-4 text-primary" /> Recent Notable Detections
              <Badge variant="outline" className="text-[9px] text-muted-foreground border-border ml-1">AI-Simulated</Badge>
            </span>
            <Button size="sm" variant="ghost" onClick={() => navigate("/mentions")} className="text-xs text-primary">
              View all <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <div className="space-y-3">
            {recentMentions.map(m => (
              <div key={m.id} className="p-4 rounded-lg bg-muted/30 border border-border hover:border-primary/20 cursor-pointer transition-colors" onClick={() => navigate(`/mentions/${m.id}`)}>
                <div className="flex items-start gap-3">
                  <Quote className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-card-foreground line-clamp-3 italic">"{m.content}"</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{m.source}</Badge>
                      <span className="text-[10px] text-muted-foreground">{m.author_name || "Unknown"}</span>
                      <span className="text-[10px] text-muted-foreground">{m.posted_at ? format(new Date(m.posted_at), "MMM d, yyyy") : "—"}</span>
                      <Badge variant="outline" className={`text-[10px] ${m.severity === "critical" ? "border-sentinel-red/30 text-sentinel-red" : "border-sentinel-amber/30 text-sentinel-amber"}`}>{m.severity}</Badge>
                      <span className={`text-[10px] font-medium ${m.sentiment_label === "negative" ? "text-sentinel-red" : m.sentiment_label === "positive" ? "text-sentinel-emerald" : "text-muted-foreground"}`}>{m.sentiment_label}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity Timeline */}
        <ActivityTimeline />

        {/* Mention Volume + Top Narratives */}
        <Card className="bg-card border-border p-5">
          <span className="text-sm font-medium text-card-foreground">Mention Volume (7 days)</span>
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

      <Card className="bg-card border-border p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-card-foreground">Top Narratives</span>
          <Button size="sm" variant="ghost" onClick={() => navigate("/narratives")} className="text-xs text-primary h-6 px-2">View all</Button>
        </div>
        <div className="mt-4 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
          ) : narratives.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active narratives yet.</p>
          ) : (
            narratives.map((n, i) => (
              <div key={i} className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded-lg p-2 -mx-2 transition-colors" onClick={() => navigate(`/narratives/${n.id}`)}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
                  <span className="text-sm text-card-foreground">{n.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{n.mention_count} mentions</span>
                  <Badge variant="outline" className="text-[10px] border-sentinel-emerald/30 text-sentinel-emerald capitalize">{n.status}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
