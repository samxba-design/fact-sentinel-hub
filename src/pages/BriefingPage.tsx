import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, TrendingUp, TrendingDown, AlertTriangle, Siren, Network, ExternalLink, Copy, Check, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { format, subDays } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { useToast } from "@/hooks/use-toast";
import PageGuide from "@/components/PageGuide";

const SENTIMENT_COLORS: Record<string, string> = {
  negative: "hsl(0, 84%, 60%)",
  neutral: "hsl(220, 9%, 46%)",
  positive: "hsl(142, 71%, 45%)",
  mixed: "hsl(38, 92%, 50%)",
};

function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const from = display;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

function RiskGauge({ score }: { score: number }) {
  const angle = (score / 100) * 180 - 90;
  const getColor = (s: number) => s < 30 ? "hsl(var(--sentinel-emerald))" : s < 60 ? "hsl(var(--sentinel-amber))" : "hsl(var(--sentinel-red))";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-48">
        {/* Background arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
        {/* Value arc */}
        <motion.path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={getColor(score)}
          strokeWidth="12"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: score / 100 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
        {/* Needle */}
        <motion.line
          x1="100" y1="100" x2="100" y2="30"
          stroke={getColor(score)}
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ rotate: -90 }}
          animate={{ rotate: angle }}
          transition={{ duration: 1.5, ease: "easeOut", type: "spring" }}
          style={{ transformOrigin: "100px 100px" }}
        />
        <circle cx="100" cy="100" r="6" fill={getColor(score)} />
      </svg>
      <motion.div
        className="text-3xl font-bold font-mono mt-2"
        style={{ color: getColor(score) }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <AnimatedNumber value={score} />
        <span className="text-sm text-muted-foreground font-normal ml-1">/ 100</span>
      </motion.div>
      <span className="text-xs text-muted-foreground mt-1">
        {score < 30 ? "Low Risk" : score < 60 ? "Moderate Risk" : "Critical Risk"}
      </span>
    </div>
  );
}

export default function BriefingPage() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    const now = new Date();
    const rangeAgo = subDays(now, 7).toISOString();

    Promise.all([
      supabase.from("mentions").select("posted_at, created_at, sentiment_label, severity, source")
        .eq("org_id", currentOrg.id)
        .eq("mention_type", "brand")
        .or(`posted_at.gte.${rangeAgo},and(posted_at.is.null,created_at.gte.${rangeAgo})`),
      supabase.from("narratives").select("name, status, confidence").eq("org_id", currentOrg.id).order("last_seen", { ascending: false }).limit(5),
      supabase.from("incidents").select("name, status").eq("org_id", currentOrg.id).eq("status", "active"),
      supabase.from("escalations").select("title, status, priority").eq("org_id", currentOrg.id).in("status", ["open", "in_progress"]),
    ]).then(([mentionsRes, narrativesRes, incidentsRes, escalationsRes]) => {
      const mentions = mentionsRes.data || [];
      const sentCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
      const dayMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        dayMap[format(subDays(now, i), "MMM dd")] = 0;
      }

      let criticals = 0;
      let highs = 0;
      mentions.forEach(m => {
        const s = m.sentiment_label || "neutral";
        if (s in sentCounts) sentCounts[s]++;
        const d = format(new Date(m.posted_at || m.created_at), "MMM dd");
        if (d in dayMap) dayMap[d]++;
        if (m.severity === "critical") criticals++;
        if (m.severity === "high") highs++;
      });

      const total = mentions.length;
      const negPct = total > 0 ? Math.round((sentCounts.negative / total) * 100) : 0;
      // Weighted risk score: 60% negative sentiment, 30% critical severity, 10% volume spike indicator
      const normalizedNeg = Math.min(negPct, 100);
      const criticalWeight = Math.min(criticals * 5, 30);
      const highWeight = Math.min(highs * 2, 10);
      const riskScore = Math.min(100, Math.round((normalizedNeg * 0.6) + criticalWeight + highWeight));

      setData({
        total,
        sentCounts,
        negPct,
        riskScore,
        criticals,
        volumeData: Object.entries(dayMap).map(([date, count]) => ({ date, mentions: count })),
        sentimentData: Object.entries(sentCounts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })),
        narratives: narrativesRes.data || [],
        incidents: incidentsRes.data || [],
        escalations: escalationsRes.data || [],
        orgName: currentOrg.name,
        generatedAt: format(now, "MMMM d, yyyy 'at' h:mm a"),
      });
      setLoading(false);
    });
  }, [currentOrg]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast({ title: "Link copied" });
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-up">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) return (
    <div className="space-y-6 animate-fade-up max-w-5xl mx-auto">
      <PageGuide
        title="Briefing Mode — Executive summary"
        subtitle="Brand-only risk overview. Use this for daily standups and leadership updates."
        steps={[
          { icon: <Shield className="h-4 w-4 text-primary" />, title: "Risk gauge (0–100)", description: "Calculated from brand mention negative % and critical/high severity count." },
          { icon: <Network className="h-4 w-4 text-primary" />, title: "Active narratives", description: "AI-clustered stories forming around your brand." },
          { icon: <Copy className="h-4 w-4 text-primary" />, title: "Copy & share", description: "Paste the full briefing into Slack, email, or a PDF export." },
        ]}
        tip="Run your first scan to populate this page. The briefing updates automatically after each scan."
      />
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Brain className="h-12 w-12 text-muted-foreground/40" />
        <h3 className="text-lg font-semibold text-foreground">No briefing data yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Run your first scan to start detecting mentions and narratives. The briefing generates automatically.
        </p>
        <Button onClick={() => window.location.href = "/scans"} className="mt-2">
          Go to Scans
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-up max-w-5xl mx-auto">
      <PageGuide
        title="Briefing Mode — Executive summary"
        subtitle="Brand-only risk overview. Use this for daily standups and leadership updates."
        steps={[
          { icon: <Shield className="h-4 w-4 text-primary" />, title: "Risk gauge (0–100)", description: "Calculated from brand mention negative % and critical/high severity count. Never includes competitor data." },
          { icon: <Network className="h-4 w-4 text-primary" />, title: "Active narratives", description: "AI-clustered stories forming around your brand with confidence scores." },
          { icon: <Copy className="h-4 w-4 text-primary" />, title: "Copy & share", description: "Use the copy button to paste the full briefing into Slack, email, or a PDF export." },
        ]}
        tip="Run a scan first to populate with fresh data. The briefing updates automatically after each scan."
      />
      {/* Header */}
      <motion.div
        className="text-center py-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-center gap-3 mb-3">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground tracking-tight">{data.orgName}</h1>
        </div>
        <p className="text-lg text-muted-foreground">Executive Intelligence Briefing</p>
        <p className="text-sm text-muted-foreground mt-1">{data.generatedAt} · Last 7 days</p>
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={copyLink} className="gap-2">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Share Briefing Link"}
          </Button>
        </div>
      </motion.div>

      {/* Risk Gauge + Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
          <Card className="bg-card border-border p-6 flex flex-col items-center">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Overall Risk Score</h3>
            <RiskGauge score={data.riskScore} />
          </Card>
        </motion.div>

        <motion.div className="md:col-span-2 grid grid-cols-2 gap-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <Card className="bg-card border-border p-5">
            <div className="text-sm text-muted-foreground mb-1">Total Mentions</div>
            <div className="text-3xl font-bold text-card-foreground"><AnimatedNumber value={data.total} /></div>
          </Card>
          <Card className="bg-card border-border p-5">
            <div className="text-sm text-muted-foreground mb-1">Negative %</div>
            <div className="text-3xl font-bold text-sentinel-amber"><AnimatedNumber value={data.negPct} />%</div>
          </Card>
          <Card className="bg-card border-border p-5">
            <div className="text-sm text-muted-foreground mb-1">Critical Threats</div>
            <div className="text-3xl font-bold text-sentinel-red"><AnimatedNumber value={data.criticals} /></div>
          </Card>
          <Card className="bg-card border-border p-5">
            <div className="text-sm text-muted-foreground mb-1">Active Incidents</div>
            <div className="text-3xl font-bold text-card-foreground"><AnimatedNumber value={data.incidents.length} /></div>
          </Card>
        </motion.div>
      </div>

      {/* Charts */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card className="bg-card border-border p-5">
          <h3 className="text-sm font-medium text-card-foreground mb-4">Mention Volume (7 days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.volumeData}>
              <defs>
                <linearGradient id="briefGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="mentions" stroke="hsl(var(--primary))" fill="url(#briefGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="bg-card border-border p-5">
          <h3 className="text-sm font-medium text-card-foreground mb-4">Sentiment Breakdown</h3>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.sentimentData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {data.sentimentData.map((entry: any) => (
                    <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name] || "#888"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {data.sentimentData.map((s: any) => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ background: SENTIMENT_COLORS[s.name] }} />
                <span className="capitalize text-muted-foreground">{s.name}: {s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Narratives & Escalations */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card className="bg-card border-border p-5">
          <h3 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" /> Active Narratives
          </h3>
          {data.narratives.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No active narratives</p>
          ) : (
            <div className="space-y-3">
              {data.narratives.map((n: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <span className="text-sm text-card-foreground">{n.name}</span>
                  <div className="flex items-center gap-2">
                    {n.confidence && <span className="text-xs font-mono text-muted-foreground">{Math.round(Number(n.confidence))}%</span>}
                    <Badge variant="outline" className={`text-[9px] capitalize ${
                      n.status === "active" ? "border-sentinel-emerald/30 text-sentinel-emerald" : "border-muted-foreground/30"
                    }`}>{n.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="bg-card border-border p-5">
          <h3 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-sentinel-amber" /> Open Escalations ({data.escalations.length})
          </h3>
          {data.escalations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No open escalations</p>
          ) : (
            <div className="space-y-3">
              {data.escalations.slice(0, 5).map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <span className="text-sm text-card-foreground">{e.title}</span>
                  <Badge variant="outline" className={`text-[9px] capitalize ${
                    e.priority === "critical" ? "border-sentinel-red/30 text-sentinel-red" :
                    e.priority === "high" ? "border-sentinel-amber/30 text-sentinel-amber" : ""
                  }`}>{e.priority}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Footer */}
      <motion.div className="text-center py-6 border-t border-border" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
        <p className="text-xs text-muted-foreground">
          Generated by SentiWatch · Confidential Intelligence Briefing · {data.generatedAt}
        </p>
      </motion.div>
    </div>
  );
}
