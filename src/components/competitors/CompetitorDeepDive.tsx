import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";

interface MentionRow {
  id: string;
  content: string | null;
  source: string;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
  created_at: string | null;
}

interface NarrativeRow {
  id: string;
  name: string;
  description: string | null;
  confidence: number | null;
  status: string | null;
}

interface Props {
  competitorName: string;
  mentions: MentionRow[];
  narratives: NarrativeRow[];
  orgMentionCount: number;
  orgNarratives: NarrativeRow[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(142, 71%, 45%)",
  "hsl(0, 84%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(220, 9%, 46%)",
  "hsl(280, 67%, 55%)",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.fill || p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function CompetitorDeepDive({ competitorName, mentions, narratives, orgMentionCount, orgNarratives }: Props) {
  const shareOfVoice = useMemo(() => {
    const compMentions = mentions.length;
    const total = orgMentionCount + compMentions;
    if (total === 0) return [];
    return [
      { name: "Your Brand", value: orgMentionCount },
      { name: competitorName, value: compMentions },
    ];
  }, [mentions, orgMentionCount, competitorName]);

  const narrativeOverlap = useMemo(() => {
    const compNarrativeNames = new Set(narratives.map(n => n.name.toLowerCase()));
    const orgNarrativeNames = new Set(orgNarratives.map(n => n.name.toLowerCase()));
    const shared = [...compNarrativeNames].filter(n => orgNarrativeNames.has(n));
    const compOnly = [...compNarrativeNames].filter(n => !orgNarrativeNames.has(n));
    const orgOnly = [...orgNarrativeNames].filter(n => !compNarrativeNames.has(n));
    return { shared, compOnly, orgOnly };
  }, [narratives, orgNarratives]);

  const radarData = useMemo(() => {
    const compNeg = mentions.filter(m => m.sentiment_label === "negative").length;
    const compPos = mentions.filter(m => m.sentiment_label === "positive").length;
    const compHigh = mentions.filter(m => m.severity === "high" || m.severity === "critical").length;
    const compSources = new Set(mentions.map(m => m.source)).size;
    const total = mentions.length || 1;

    return [
      { axis: "Volume", value: Math.min(100, (mentions.length / Math.max(orgMentionCount, 1)) * 100) },
      { axis: "Negativity", value: Math.round((compNeg / total) * 100) },
      { axis: "Positivity", value: Math.round((compPos / total) * 100) },
      { axis: "Severity", value: Math.min(100, Math.round((compHigh / total) * 100)) },
      { axis: "Source Spread", value: Math.min(100, compSources * 15) },
      { axis: "Narratives", value: Math.min(100, narratives.length * 10) },
    ];
  }, [mentions, narratives, orgMentionCount]);

  const sourceBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    mentions.forEach(m => { map[m.source] = (map[m.source] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
  }, [mentions]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Deep Dive Intelligence</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Share of Voice */}
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Share of Voice</h3>
            {shareOfVoice.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data available</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie data={shareOfVoice} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} strokeWidth={0}>
                      {shareOfVoice.map((_, i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {shareOfVoice.map((s, i) => {
                    const total = shareOfVoice.reduce((a, b) => a + b.value, 0);
                    const pct = total ? Math.round((s.value / total) * 100) : 0;
                    return (
                      <div key={s.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                          <span className="text-sm text-foreground">{s.name}</span>
                        </div>
                        <span className="text-sm font-mono text-muted-foreground">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Radar Chart */}
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Competitive Profile Radar</h3>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                <Radar name={competitorName} dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Narrative Overlap */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Narrative Overlap Analysis</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Shared Narratives</p>
              {narrativeOverlap.shared.length === 0 ? (
                <p className="text-xs text-muted-foreground">No overlap detected</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {narrativeOverlap.shared.map(n => (
                    <Badge key={n} variant="secondary" className="text-[10px] capitalize">{n}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{competitorName} Only</p>
              {narrativeOverlap.compOnly.length === 0 ? (
                <p className="text-xs text-muted-foreground">None unique</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {narrativeOverlap.compOnly.map(n => (
                    <Badge key={n} variant="outline" className="text-[10px] capitalize border-destructive/30 text-destructive">{n}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Your Brand Only</p>
              {narrativeOverlap.orgOnly.length === 0 ? (
                <p className="text-xs text-muted-foreground">None unique</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {narrativeOverlap.orgOnly.map(n => (
                    <Badge key={n} variant="outline" className="text-[10px] capitalize border-primary/30 text-primary">{n}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Source comparison */}
      {sourceBreakdown.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Competitor Source Distribution</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={sourceBreakdown} layout="vertical" margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Mentions" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
