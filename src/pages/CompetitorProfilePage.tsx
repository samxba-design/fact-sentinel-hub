import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageGuide from "@/components/PageGuide";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Target, ArrowLeft, TrendingUp, TrendingDown, Minus,
  MessageSquareWarning, Network, ExternalLink, Scan, Loader2,
  BarChart3, Calendar, Globe, Lightbulb, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import CompetitorDeepDive from "@/components/competitors/CompetitorDeepDive";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format, subWeeks, startOfWeek, endOfWeek, parseISO, isWithinInterval } from "date-fns";

interface MentionRow {
  id: string;
  content: string | null;
  source: string;
  url: string | null;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
  created_at: string | null;
  author_name: string | null;
}

export default function CompetitorProfilePage() {
  const { name } = useParams<{ name: string }>();
  const competitorName = decodeURIComponent(name || "");
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mentions, setMentions] = useState<MentionRow[]>([]);
  const [narratives, setNarratives] = useState<any[]>([]);
  const [orgMentionCount, setOrgMentionCount] = useState(0);
  const [orgNarratives, setOrgNarratives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!currentOrg || !competitorName) return;
    loadProfile();
  }, [currentOrg, competitorName]);

  const loadProfile = async () => {
    if (!currentOrg) return;
    setLoading(true);

    const [mentionRes, narrativeRes, orgMentionRes, orgNarrativeRes] = await Promise.all([
      supabase
        .from("mentions")
        .select("id, content, source, url, sentiment_label, severity, posted_at, created_at, author_name")
        .eq("org_id", currentOrg.id)
        .eq("mention_type", "competitor")
        .textSearch("content", competitorName, { type: "plain" })
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("narratives")
        .select("id, name, description, status, confidence, first_seen, last_seen")
        .eq("org_id", currentOrg.id)
        .or(`name.ilike.%${competitorName}%,description.ilike.%${competitorName}%`)
        .order("last_seen", { ascending: false, nullsFirst: false })
        .limit(20),
      supabase
        .from("mentions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", currentOrg.id),
      supabase
        .from("narratives")
        .select("id, name, description, confidence, status")
        .eq("org_id", currentOrg.id)
        .limit(200),
    ]);

    setMentions(mentionRes.data || []);
    setNarratives(narrativeRes.data || []);
    setOrgMentionCount(orgMentionRes.count ?? 0);
    setOrgNarratives(orgNarrativeRes.data || []);
    setLoading(false);
  };

  const runCompetitorScan = async () => {
    if (!currentOrg) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-scan", {
        body: {
          org_id: currentOrg.id,
          keywords: [competitorName],
          sources: ["news", "google-news", "reddit", "social"],
          scan_context: "competitor",
        },
      });
      if (error) throw error;
      toast({
        title: "Competitor scan complete",
        description: `Found ${data?.mentions_created || 0} new mentions for "${competitorName}"`,
      });
      loadProfile();
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const stats = useMemo(() => {
    const total = mentions.length;
    const neg = mentions.filter(m => m.sentiment_label === "negative").length;
    const pos = mentions.filter(m => m.sentiment_label === "positive").length;
    const neu = total - neg - pos;
    const high = mentions.filter(m => m.severity === "high" || m.severity === "critical").length;
    const sources = [...new Set(mentions.map(m => m.source))];
    return { total, neg, pos, neu, high, sources, negPct: total ? Math.round((neg / total) * 100) : 0, posPct: total ? Math.round((pos / total) * 100) : 0 };
  }, [mentions]);

  const recentMentions = mentions.slice(0, 10);

  const severityColor = (s: string | null) => {
    if (s === "critical") return "bg-destructive/10 text-destructive";
    if (s === "high") return "bg-destructive/10 text-destructive";
    if (s === "medium") return "bg-[hsl(var(--sentinel-amber))]/10 text-[hsl(var(--sentinel-amber))]";
    return "bg-muted/30 text-muted-foreground";
  };

  const sentimentColor = (s: string | null) => {
    if (s === "positive") return "text-[hsl(var(--sentinel-emerald))]";
    if (s === "negative") return "text-destructive";
    return "text-muted-foreground";
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground animate-pulse">Loading competitor profile...</div>;
  }

  return (
    <div className="space-y-6">
      <PageGuide
        title="Competitor Profile — Deep dive"
        subtitle="Detailed intelligence on this competitor: sentiment timeline, narrative gaps, and top threats."
        steps={[
          { icon: <Target className="h-4 w-4 text-primary" />, title: "Sentiment timeline", description: "Weekly average sentiment over 8 weeks — see if their reputation is improving or declining." },
          { icon: <Lightbulb className="h-4 w-4 text-primary" />, title: "Narrative gap analysis", description: "Topics this competitor owns that your brand doesn't — opportunities to claim first." },
          { icon: <AlertTriangle className="h-4 w-4 text-primary" />, title: "Top threats", description: "Their high/critical severity mentions — content you may need to respond to or monitor." },
        ]}
        tip="Competitor data never affects your brand risk score or narrative health metrics."
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/competitors")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{competitorName}</h1>
            <p className="text-sm text-muted-foreground">Competitor Intelligence Profile</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={runCompetitorScan} disabled={scanning}>
            {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scan className="h-4 w-4 mr-2" />}
            {scanning ? "Scanning..." : "Scan Now"}
          </Button>
          <Button variant="outline" onClick={() => navigate(`/mentions?search=${encodeURIComponent(competitorName)}`)}>
            <MessageSquareWarning className="h-4 w-4 mr-2" /> All Mentions
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Total Mentions</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Negative %</p>
            <p className="text-2xl font-bold text-destructive">{stats.negPct}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">High Severity</p>
            <p className="text-2xl font-bold text-foreground">{stats.high}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Sources</p>
            <p className="text-2xl font-bold text-foreground">{stats.sources.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sentiment Bar */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Sentiment Distribution</h3>
          <div className="flex h-4 rounded-full overflow-hidden bg-muted/30">
            {stats.posPct > 0 && <div className="bg-[hsl(var(--sentinel-emerald))]" style={{ width: `${stats.posPct}%` }} />}
            {(100 - stats.posPct - stats.negPct) > 0 && <div className="bg-muted-foreground/30" style={{ width: `${100 - stats.posPct - stats.negPct}%` }} />}
            {stats.negPct > 0 && <div className="bg-destructive" style={{ width: `${stats.negPct}%` }} />}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span className="text-[hsl(var(--sentinel-emerald))]">{stats.pos} positive</span>
            <span>{stats.neu} neutral</span>
            <span className="text-destructive">{stats.neg} negative</span>
          </div>
        </CardContent>
      </Card>

      {/* Deep Dive Intelligence */}
      <CompetitorDeepDive
        competitorName={competitorName}
        mentions={mentions}
        narratives={narratives}
        orgMentionCount={orgMentionCount}
        orgNarratives={orgNarratives}
      />

      {/* ── Sentiment Timeline ── */}
      {(() => {
        const weeks = Array.from({ length: 8 }, (_, i) => {
          const weekStart = startOfWeek(subWeeks(new Date(), 7 - i));
          const weekEnd = endOfWeek(weekStart);
          const compAvg = (() => {
            const m = mentions.filter(x => x.posted_at && isWithinInterval(parseISO(x.posted_at), { start: weekStart, end: weekEnd }) && (x as any).sentiment_score != null);
            return m.length ? m.reduce((s: number, x: any) => s + (x.sentiment_score || 0), 0) / m.length : null;
          })();
          return { label: format(weekStart, "MMM d"), comp: compAvg };
        });
        const hasData = weeks.filter(w => w.comp !== null).length >= 2;
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Sentiment Timeline
              </CardTitle>
              <p className="text-xs text-muted-foreground">Average weekly sentiment score (–1 negative → +1 positive)</p>
            </CardHeader>
            <CardContent>
              {!hasData ? (
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                  Run more scans to see sentiment trends over time
                </div>
              ) : (
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeks} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis domain={[-1, 1]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => [typeof v === "number" ? v.toFixed(2) : "N/A", "Sentiment"]} />
                      <Line type="monotone" dataKey="comp" name={competitorName} stroke="hsl(0,84%,60%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Narrative Gap Analysis ── */}
      {(() => {
        const orgNarrativeNames = new Set(orgNarratives.map(n => n.name.toLowerCase()));
        const gaps = narratives.filter(n => !orgNarrativeNames.has(n.name.toLowerCase())).slice(0, 6);
        if (gaps.length === 0) return null;
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-[hsl(var(--sentinel-amber))]" /> Narrative Gap Analysis
              </CardTitle>
              <p className="text-xs text-muted-foreground">Topics {competitorName} owns that your brand doesn't — opportunities to establish your position</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {gaps.map(n => (
                  <div key={n.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{n.name}</p>
                      {n.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{n.description}</p>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/respond?context=${encodeURIComponent(n.name)}`)}>
                      Claim this narrative
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Top Threats from Competitor ── */}
      {(() => {
        const threats = mentions.filter(m => m.severity === "high" || m.severity === "critical").slice(0, 8);
        if (threats.length === 0) return null;
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" /> Top Threats from {competitorName}
              </CardTitle>
              <p className="text-xs text-muted-foreground">High and critical severity mentions — monitor and respond</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {threats.map(m => (
                  <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-border/70 transition-colors">
                    <Badge className={`shrink-0 text-[10px] mt-0.5 ${m.severity === "critical" ? "bg-red-500/15 text-red-400" : "bg-orange-500/15 text-orange-400"}`}>
                      {m.severity}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground line-clamp-2">{m.content?.slice(0, 160)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">{m.source}</Badge>
                        {m.posted_at && <span className="text-[10px] text-muted-foreground">{format(parseISO(m.posted_at), "MMM d")}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-1">
                      {m.url && (
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => navigate(`/respond?context=${encodeURIComponent(m.content?.slice(0, 200) || "")}`)}>
                        Respond
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Mentions */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-primary" /> Recent Mentions
          </h3>
          {recentMentions.length === 0 ? (
            <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">No mentions found. Run a scan to discover content about this competitor.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {recentMentions.map(m => (
                <Card key={m.id} className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate(`/mentions/${m.id}`)}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground line-clamp-2">{m.content?.slice(0, 200)}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">{m.source}</Badge>
                          {m.author_name && <span>{m.author_name}</span>}
                          {m.posted_at && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(m.posted_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge className={severityColor(m.severity)}>{m.severity}</Badge>
                        <span className={`text-xs font-medium ${sentimentColor(m.sentiment_label)}`}>{m.sentiment_label}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {mentions.length > 10 && (
                <Button variant="outline" className="w-full" onClick={() => navigate(`/mentions?search=${encodeURIComponent(competitorName)}`)}>
                  View all {mentions.length} mentions
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar: Narratives */}
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
              <Network className="h-5 w-5 text-primary" /> Related Narratives
            </h3>
            {narratives.length === 0 ? (
              <Card><CardContent className="pt-5 text-center text-xs text-muted-foreground">No narratives detected yet</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {narratives.map(n => (
                  <Card key={n.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(`/narratives/${n.id}`)}>
                    <CardContent className="pt-3 pb-3">
                      <p className="text-sm font-medium text-foreground">{n.name}</p>
                      {n.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.description}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-[10px]">{n.status}</Badge>
                        {n.confidence && <span className="text-[10px] text-muted-foreground">{Math.round(n.confidence * 100)}% confidence</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
              <Globe className="h-5 w-5 text-primary" /> Source Breakdown
            </h3>
            <Card>
              <CardContent className="pt-4 space-y-2">
                {stats.sources.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center">No sources yet</p>
                ) : (
                  stats.sources.map(src => {
                    const count = mentions.filter(m => m.source === src).length;
                    return (
                      <div key={src} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground capitalize">{src}</span>
                          <span className="text-muted-foreground">{count}</span>
                        </div>
                        <Progress value={(count / stats.total) * 100} className="h-1.5" />
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}