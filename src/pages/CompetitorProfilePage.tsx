import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Target, ArrowLeft, TrendingUp, TrendingDown, Minus,
  MessageSquareWarning, Network, ExternalLink, Scan, Loader2,
  BarChart3, Calendar, Globe
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import CompetitorDeepDive from "@/components/competitors/CompetitorDeepDive";

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