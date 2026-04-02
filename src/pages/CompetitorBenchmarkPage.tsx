import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PageGuide from "@/components/PageGuide";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target, BarChart3, TrendingUp, TrendingDown, Minus,
  MessageSquareWarning, ArrowLeft,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Legend, LineChart, Line, AreaChart, Area,
} from "recharts";
import { format, subDays } from "date-fns";
import Breadcrumbs from "@/components/Breadcrumbs";

interface CompetitorData {
  name: string;
  mentionCount: number;
  negPct: number;
  posPct: number;
  neuPct: number;
  highSeverity: number;
  sourceCount: number;
  volumeByDay: Record<string, number>;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(0, 84%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(262, 83%, 58%)",
  "hsl(190, 90%, 50%)",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color || p.stroke }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function CompetitorBenchmarkPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [competitors, setCompetitors] = useState<CompetitorData[]>([]);
  const [orgData, setOrgData] = useState<CompetitorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    loadBenchmarkData();
  }, [currentOrg]);

  const loadBenchmarkData = async () => {
    if (!currentOrg) return;
    setLoading(true);

    const rangeDays = 30;
    const now = new Date();
    const rangeAgo = subDays(now, rangeDays).toISOString();

    // Get competitor keywords
    const { data: keywords } = await supabase
      .from("keywords")
      .select("value")
      .eq("org_id", currentOrg.id)
      .eq("type", "competitor")
      .eq("status", "active");

    // Get brand keywords
    const { data: brandKws } = await supabase
      .from("keywords")
      .select("value")
      .eq("org_id", currentOrg.id)
      .eq("type", "brand")
      .eq("status", "active");

    // Get all recent mentions
    const { data: mentions } = await supabase
      .from("mentions")
      .select("content, sentiment_label, severity, source, posted_at, created_at, competitor_name")
      .eq("org_id", currentOrg.id)
      .eq("mention_type", "competitor")
      .or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`)
      .limit(1000);

    const allMentions = mentions || [];
    const compNames = (keywords || []).map(k => k.value);
    const brandNames = (brandKws || []).map(k => k.value);

    // Build day map template
    const dayTemplate: Record<string, number> = {};
    for (let i = rangeDays - 1; i >= 0; i--) {
      dayTemplate[format(subDays(now, i), "MMM dd")] = 0;
    }

    const buildData = (name: string, matched: typeof allMentions): CompetitorData => {
      const total = matched.length || 1;
      const neg = matched.filter(m => m.sentiment_label === "negative").length;
      const pos = matched.filter(m => m.sentiment_label === "positive").length;
      const high = matched.filter(m => m.severity === "high" || m.severity === "critical").length;
      const sources = new Set(matched.map(m => m.source));
      const volByDay = { ...dayTemplate };
      matched.forEach(m => {
        const d = format(new Date(m.posted_at || m.created_at || ""), "MMM dd");
        if (d in volByDay) volByDay[d]++;
      });
      return {
        name,
        mentionCount: matched.length,
        negPct: Math.round((neg / total) * 100),
        posPct: Math.round((pos / total) * 100),
        neuPct: Math.round(((total - neg - pos) / total) * 100),
        highSeverity: high,
        sourceCount: sources.size,
        volumeByDay: volByDay,
      };
    };

    // Build org data (brand mentions = mentions not matching any competitor)
    const orgMentions = allMentions.filter(m => {
      const c = (m.content || "").toLowerCase();
      return brandNames.length === 0 || brandNames.some(b => c.includes(b.toLowerCase()));
    });
    setOrgData(buildData(currentOrg.name || "Your Brand", orgMentions));

    // Build competitor data
    const compData = compNames.map(name => {
      const matched = allMentions.filter(m => (m.content || "").toLowerCase().includes(name.toLowerCase()));
      return buildData(name, matched);
    });
    setCompetitors(compData);
    setLoading(false);
  };

  // Combined volume chart data
  const volumeChartData = useMemo(() => {
    if (!orgData) return [];
    const days = Object.keys(orgData.volumeByDay);
    return days.map(day => {
      const row: any = { date: day, [orgData.name]: orgData.volumeByDay[day] };
      competitors.forEach(c => {
        row[c.name] = c.volumeByDay[day] || 0;
      });
      return row;
    });
  }, [orgData, competitors]);

  // Radar chart data
  const radarData = useMemo(() => {
    if (!orgData) return [];
    const all = [orgData, ...competitors];
    const maxMentions = Math.max(...all.map(d => d.mentionCount), 1);
    const maxSources = Math.max(...all.map(d => d.sourceCount), 1);

    return [
      { metric: "Volume", ...Object.fromEntries(all.map(d => [d.name, Math.round((d.mentionCount / maxMentions) * 100)])) },
      { metric: "Positive %", ...Object.fromEntries(all.map(d => [d.name, d.posPct])) },
      { metric: "Negative %", ...Object.fromEntries(all.map(d => [d.name, d.negPct])) },
      { metric: "Source Reach", ...Object.fromEntries(all.map(d => [d.name, Math.round((d.sourceCount / maxSources) * 100)])) },
      { metric: "Severity", ...Object.fromEntries(all.map(d => [d.name, Math.min(100, d.highSeverity * 20)])) },
    ];
  }, [orgData, competitors]);

  const allNames = orgData ? [orgData.name, ...competitors.map(c => c.name)] : [];

  // Share of Voice — normalise each day's mention count to % of total conversation
  const sovChartData = useMemo(() => {
    if (!orgData || allNames.length === 0) return [];
    return Object.keys(orgData.volumeByDay).map(day => {
      const row: any = { date: day };
      const dayTotal = allNames.reduce((sum, name) => {
        const d = name === orgData.name ? orgData : competitors.find(c => c.name === name);
        return sum + (d?.volumeByDay[day] || 0);
      }, 0) || 1;
      allNames.forEach(name => {
        const d = name === orgData.name ? orgData : competitors.find(c => c.name === name);
        row[name] = dayTotal > 0 ? Math.round(((d?.volumeByDay[day] || 0) / dayTotal) * 100) : 0;
      });
      return row;
    });
  }, [orgData, competitors, allNames]);

  // Overall share of voice (pie-style summary)
  const sovSummary = useMemo(() => {
    if (!orgData) return [];
    const all = [orgData, ...competitors];
    const total = all.reduce((s, d) => s + d.mentionCount, 0) || 1;
    return all.map((d, i) => ({
      name: d.name,
      count: d.mentionCount,
      pct: Math.round((d.mentionCount / total) * 100),
      color: COLORS[i % COLORS.length],
      isOwn: i === 0,
    }));
  }, [orgData, competitors]);

  const allNames = orgData ? [orgData.name, ...competitors.map(c => c.name)] : [];

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-up">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <Breadcrumbs items={[
        { label: "Competitors", href: "/competitors" },
        { label: "Benchmark" },
      ]} />
      <PageGuide
        title="Competitor Benchmark — Side-by-side comparison"
        subtitle="Compare your brand against competitors by mention volume, sentiment, and narrative count."
        steps={[
          { icon: <BarChart3 className="h-4 w-4 text-primary" />, title: "Radar chart", description: "Normalised 0–100 across volume, negativity, source diversity, narrative count, and high-severity mentions." },
          { icon: <Target className="h-4 w-4 text-primary" />, title: "Share of voice", description: "Donut shows your brand vs each competitor by total mention count." },
          { icon: <TrendingUp className="h-4 w-4 text-primary" />, title: "Sortable table", description: "Sort by any metric. Trend arrows show week-on-week change." },
        ]}
        tip="Run competitor scans first — benchmark needs data for each tracked competitor."
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Competitor Benchmark</h1>
          <p className="text-sm text-muted-foreground mt-1">Side-by-side comparison — Last 30 days</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/competitors")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Competitors
        </Button>
      </div>

      {competitors.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-16">
            <Target className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No competitors to benchmark</h3>
            <p className="text-sm text-muted-foreground mb-4">Add competitors first to see how you compare.</p>
            <Button onClick={() => navigate("/competitors")}>Go to Competitors</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[orgData!, ...competitors].map((d, i) => (
              <Card key={d.name} className={i === 0 ? "border-primary/30" : ""}>
                <CardContent className="pt-4 pb-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs font-medium text-card-foreground truncate">{d.name}</span>
                    {i === 0 && <Badge className="text-[8px] py-0 px-1">You</Badge>}
                  </div>
                  <div className="text-xl font-bold font-mono text-card-foreground">{d.mentionCount}</div>
                  <div className="flex gap-2 text-[10px]">
                    <span className="text-sentinel-emerald">{d.posPct}%+</span>
                    <span className="text-sentinel-red">{d.negPct}%-</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Volume over time */}
          <Card className="p-5">
            <h3 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Mention Volume Comparison (30 days)
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={volumeChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {allNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={i === 0 ? 2.5 : 1.5}
                    dot={false}
                    name={name}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Share of Voice */}
          <Card className="p-5 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> Share of Voice (30 days)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Your % of total conversation vs competitors each day</p>
            </div>

            {/* Summary row */}
            <div className="flex flex-wrap gap-3">
              {sovSummary.map(s => (
                <div key={s.name} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${s.isOwn ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"}`}>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <div>
                    <p className="text-xs font-medium text-foreground">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground">{s.pct}% · {s.count} mentions</p>
                  </div>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={sovChartData} stackOffset="expand">
                <defs>
                  {allNames.map((name, i) => (
                    <linearGradient key={name} id={`sovGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.2} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-popover border border-border rounded-lg p-2.5 shadow-lg text-xs space-y-1">
                        <p className="text-muted-foreground font-medium">{label}</p>
                        {payload.map((p: any) => (
                          <p key={p.name} style={{ color: p.color }} className="font-medium">
                            {p.name}: {Math.round(p.value * 100)}%
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                {allNames.map((name, i) => (
                  <Area
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stackId="1"
                    stroke={COLORS[i % COLORS.length]}
                    fill={`url(#sovGrad${i})`}
                    strokeWidth={i === 0 ? 2 : 1}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Radar comparison */}
            <Card className="p-5">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Multi-Axis Comparison</h3>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                  {allNames.map((name, i) => (
                    <Radar
                      key={name}
                      name={name}
                      dataKey={name}
                      stroke={COLORS[i % COLORS.length]}
                      fill={COLORS[i % COLORS.length]}
                      fillOpacity={i === 0 ? 0.15 : 0.05}
                      strokeWidth={i === 0 ? 2 : 1}
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </Card>

            {/* Sentiment comparison bars */}
            <Card className="p-5">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Sentiment Breakdown</h3>
              <div className="space-y-4">
                {[orgData!, ...competitors].map((d, i) => (
                  <div key={d.name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-xs font-medium text-card-foreground truncate max-w-[160px]">{d.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{d.mentionCount} mentions</span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
                      {d.posPct > 0 && <div className="bg-sentinel-emerald" style={{ width: `${d.posPct}%` }} />}
                      {d.neuPct > 0 && <div className="bg-muted-foreground/30" style={{ width: `${d.neuPct}%` }} />}
                      {d.negPct > 0 && <div className="bg-sentinel-red" style={{ width: `${d.negPct}%` }} />}
                    </div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground">
                      <span className="text-sentinel-emerald">{d.posPct}% pos</span>
                      <span>{d.neuPct}% neu</span>
                      <span className="text-sentinel-red">{d.negPct}% neg</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
