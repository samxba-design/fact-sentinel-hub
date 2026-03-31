/**
 * NarrativeNow — the single most important widget on the dashboard.
 * Answers: "What is happening to our brand's narrative right now?"
 * Shows: risk status, top active/watch narratives, dominant sentiment, top threat, quick actions.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Brain,
  ArrowRight, Scan, RefreshCw, CheckCircle2, Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Narrative {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  confidence: number | null;
  last_seen: string | null;
}

interface TopMention {
  id: string;
  content: string | null;
  source: string;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
  url: string | null;
}

interface SummaryData {
  totalMentions: number;
  negPct: number;
  posPct: number;
  critCount: number;
  narratives: Narrative[];
  topThreat: TopMention | null;
  lastScan: string | null;
}

function SentimentIcon({ label }: { label: string | null }) {
  if (label === "positive") return <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--sentinel-emerald))]" />;
  if (label === "negative") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function RiskPill({ negPct, critCount }: { negPct: number; critCount: number }) {
  if (critCount > 0 || negPct >= 50)
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1.5"><AlertTriangle className="h-3 w-3" />Critical</Badge>;
  if (negPct >= 30)
    return <Badge className="bg-[hsl(var(--sentinel-amber))]/15 text-[hsl(var(--sentinel-amber))] border-[hsl(var(--sentinel-amber))]/30 gap-1.5"><AlertTriangle className="h-3 w-3" />Watch</Badge>;
  if (negPct <= 15)
    return <Badge className="bg-[hsl(var(--sentinel-emerald))]/15 text-[hsl(var(--sentinel-emerald))] border-[hsl(var(--sentinel-emerald))]/30 gap-1.5"><CheckCircle2 className="h-3 w-3" />Healthy</Badge>;
  return <Badge variant="outline" className="gap-1.5"><Minus className="h-3 w-3" />Moderate</Badge>;
}

export default function NarrativeNow() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    if (!currentOrg) return;
    setLoading(true);

    const [mentionsRes, narrativesRes, scanRes] = await Promise.all([
      supabase
        .from("mentions")
        .select("id,content,source,sentiment_label,severity,posted_at,url")
        .eq("org_id", currentOrg.id)
        .eq("mention_type", "brand")   // ← brand only, never competitor
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("narratives")
        .select("id,name,description,status,confidence,last_seen")
        .eq("org_id", currentOrg.id)
        .order("last_seen", { ascending: false, nullsFirst: false })
        .limit(10),
      supabase
        .from("scan_runs")
        .select("finished_at")
        .eq("org_id", currentOrg.id)
        .eq("status", "completed")
        .order("finished_at", { ascending: false })
        .limit(1),
    ]);

    const mentions = mentionsRes.data || [];
    const narratives = narrativesRes.data || [];
    const lastScan = scanRes.data?.[0]?.finished_at || null;

    const negCount = mentions.filter(m => m.sentiment_label === "negative" || m.sentiment_label === "mixed").length;
    const posCount = mentions.filter(m => m.sentiment_label === "positive").length;
    const critCount = mentions.filter(m => m.severity === "critical" || m.severity === "high").length;
    const negPct = mentions.length > 0 ? Math.round((negCount / mentions.length) * 100) : 0;
    const posPct = mentions.length > 0 ? Math.round((posCount / mentions.length) * 100) : 0;

    const topThreat = mentions.find(m => m.severity === "critical") ||
                      mentions.find(m => m.severity === "high") || null;

    setData({ totalMentions: mentions.length, negPct, posPct, critCount, narratives, topThreat, lastScan });
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentOrg]);

  const runQuickScan = async () => {
    if (!currentOrg) return;
    setScanning(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("run-scan", {
        body: { org_id: currentOrg.id },
      });
      if (res?.error) throw new Error(res.error);
      if (error) throw error;
      toast({ title: "Scan complete", description: `${res?.mentions_created || 0} new mentions found` });
      load();
    } catch (e: any) {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-5 w-48" />
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-24 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const hasData = (data?.totalMentions || 0) > 0;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Narrative Now</h2>
            <p className="text-xs text-muted-foreground">
              {data?.lastScan
                ? `Updated ${formatDistanceToNow(new Date(data.lastScan), { addSuffix: true })}`
                : "No scans yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasData && <RiskPill negPct={data!.negPct} critCount={data!.critCount} />}
          <Button
            size="sm" variant="outline"
            onClick={runQuickScan} disabled={scanning}
            className="h-8 text-xs gap-1.5"
          >
            {scanning
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <Scan className="h-3.5 w-3.5" />
            }
            {scanning ? "Scanning…" : "Quick Scan"}
          </Button>
        </div>
      </div>

      <CardContent className="p-5">
        {!hasData ? (
          /* Empty state */
          <div className="text-center py-8 space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted mx-auto flex items-center justify-center">
              <Scan className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No data yet</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Run your first scan to see what's being said about your brand right now.
            </p>
            <Button onClick={runQuickScan} disabled={scanning} size="sm">
              {scanning ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
              Run First Scan
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Sentiment pulse — 3 numbers */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{data!.totalMentions}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">mentions tracked</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${data!.negPct >= 30 ? "border-destructive/20 bg-destructive/5" : "border-border bg-card"}`}>
                <p className={`text-2xl font-bold ${data!.negPct >= 30 ? "text-destructive" : "text-foreground"}`}>{data!.negPct}%</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">negative</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${data!.critCount > 0 ? "border-[hsl(var(--sentinel-amber))]/20 bg-[hsl(var(--sentinel-amber))]/5" : "border-border bg-card"}`}>
                <p className={`text-2xl font-bold ${data!.critCount > 0 ? "text-[hsl(var(--sentinel-amber))]" : "text-foreground"}`}>{data!.critCount}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">high threats</p>
              </div>
            </div>

            {/* Active narratives */}
            {data!.narratives.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Narratives</p>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2 gap-1" onClick={() => navigate("/narratives")}>
                    All <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {data!.narratives.slice(0, 4).map(n => (
                    <div
                      key={n.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:border-primary/20 cursor-pointer transition-colors group"
                      onClick={() => navigate(`/narratives/${n.id}`)}
                    >
                      <div className={`h-2 w-2 rounded-full shrink-0 ${
                        n.status === "watch" ? "bg-[hsl(var(--sentinel-amber))]" : "bg-[hsl(var(--sentinel-emerald))]"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate group-hover:text-primary transition-colors">{n.name}</p>
                        {n.last_seen && (
                          <p className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(n.last_seen), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {n.confidence != null && (
                          <span className="text-[10px] text-muted-foreground">{Math.round(n.confidence * 100)}%</span>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${
                          n.status === "watch"
                            ? "border-[hsl(var(--sentinel-amber))]/30 text-[hsl(var(--sentinel-amber))]"
                            : "border-[hsl(var(--sentinel-emerald))]/30 text-[hsl(var(--sentinel-emerald))]"
                        }`}>
                          {n.status || "active"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top threat */}
            {data!.topThreat && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Top Threat</p>
                <div
                  className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 cursor-pointer hover:border-destructive/40 transition-colors"
                  onClick={() => navigate(`/mentions/${data!.topThreat!.id}`)}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge className="bg-destructive/15 text-destructive text-[10px]">
                      {data!.topThreat.severity}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{data!.topThreat.source}</Badge>
                    {data!.topThreat.posted_at && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(data!.topThreat.posted_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
                    {data!.topThreat.content?.slice(0, 180) || "No content"}
                  </p>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => navigate("/briefing")}>
                <Brain className="h-3.5 w-3.5 mr-1.5" /> Full Briefing
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => navigate("/mentions")}>
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> All Mentions
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => navigate("/respond")}>
                <Zap className="h-3.5 w-3.5 mr-1.5" /> Respond
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
