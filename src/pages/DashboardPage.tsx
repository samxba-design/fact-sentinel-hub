import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquareWarning, AlertTriangle, Siren, TrendingUp,
  TrendingDown, Activity, Shield, BarChart3, Flame
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

// Mock data for the dashboard
const sentimentData = [
  { date: "Mon", positive: 42, negative: 12, neutral: 28 },
  { date: "Tue", positive: 38, negative: 18, neutral: 32 },
  { date: "Wed", positive: 45, negative: 8, neutral: 25 },
  { date: "Thu", positive: 35, negative: 22, neutral: 30 },
  { date: "Fri", positive: 50, negative: 15, neutral: 28 },
  { date: "Sat", positive: 40, negative: 10, neutral: 20 },
  { date: "Sun", positive: 44, negative: 14, neutral: 26 },
];

const volumeData = [
  { date: "Mon", mentions: 82 },
  { date: "Tue", mentions: 88 },
  { date: "Wed", mentions: 78 },
  { date: "Thu", mentions: 87 },
  { date: "Fri", mentions: 93 },
  { date: "Sat", mentions: 70 },
  { date: "Sun", mentions: 84 },
];

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
            <div
              className="h-full rounded-full sentinel-gradient-risk transition-all duration-500"
              style={{ width: `${score}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>Low</span>
            <span>Critical</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { currentOrg } = useOrg();

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoring overview — Last 7 days
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5">
            <Flame className="h-3 w-3 mr-1" />
            Incident Mode: Off
          </Badge>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={MessageSquareWarning}
          label="Total Mentions"
          value="1,284"
          change="+12.3%"
          changeType="up"
        />
        <MetricCard
          icon={TrendingDown}
          label="Negative Mentions"
          value="156"
          change="-4.2%"
          changeType="up"
          accentClass="bg-sentinel-amber/10"
        />
        <MetricCard
          icon={Siren}
          label="Emergencies"
          value="3"
          change="+1"
          changeType="down"
          accentClass="bg-sentinel-red/10"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Spike Alerts"
          value="7"
          change="2 active"
          changeType="neutral"
          accentClass="bg-sentinel-amber/10"
        />
      </div>

      {/* Risk Index + Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RiskIndex score={42} />

        <Card className="bg-card border-border p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-card-foreground">Sentiment Trend</span>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sentinel-emerald" /> Positive
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sentinel-red" /> Negative
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Neutral
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={sentimentData}>
              <defs>
                <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(152, 60%, 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(152, 60%, 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 18%)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(220, 10%, 55%)" }} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "hsl(220, 10%, 55%)" }} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(222, 30%, 10%)",
                  border: "1px solid hsl(222, 20%, 18%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Area type="monotone" dataKey="positive" stroke="hsl(152, 60%, 45%)" fill="url(#colorPositive)" strokeWidth={2} />
              <Area type="monotone" dataKey="negative" stroke="hsl(0, 72%, 51%)" fill="url(#colorNegative)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Volume + Top Narratives */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border p-5">
          <span className="text-sm font-medium text-card-foreground">Mention Volume</span>
          <ResponsiveContainer width="100%" height={180} className="mt-4">
            <BarChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 18%)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(220, 10%, 55%)" }} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "hsl(220, 10%, 55%)" }} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(222, 30%, 10%)",
                  border: "1px solid hsl(222, 20%, 18%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="mentions" fill="hsl(220, 70%, 55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="bg-card border-border p-5">
          <span className="text-sm font-medium text-card-foreground">Top Narratives</span>
          <div className="mt-4 space-y-3">
            {[
              { name: "Security breach claims", volume: 48, sentiment: "negative" },
              { name: "New product launch reactions", volume: 35, sentiment: "mixed" },
              { name: "CEO leadership concerns", volume: 28, sentiment: "negative" },
              { name: "Partnership announcements", volume: 22, sentiment: "positive" },
              { name: "Pricing complaints", volume: 18, sentiment: "negative" },
            ].map((n, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
                  <span className="text-sm text-card-foreground">{n.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${
                    n.sentiment === "negative" ? "border-sentinel-red/30 text-sentinel-red" :
                    n.sentiment === "positive" ? "border-sentinel-emerald/30 text-sentinel-emerald" :
                    "border-sentinel-amber/30 text-sentinel-amber"
                  }`}>
                    {n.sentiment}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">{n.volume}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
