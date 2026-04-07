/**
 * NarrativeNow — brand narrative overview widget.
 *
 * Includes a visible toggle to enable/disable live monitoring.
 * When disabled (default): queries run once on load, no realtime subscription.
 * When enabled: subscribes to mention inserts for live updates.
 *
 * The toggle is prominently visible because live monitoring uses Supabase Realtime
 * (persistent WebSocket) and increases bandwidth/connection usage.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Brain,
  ArrowRight, Scan, RefreshCw, CheckCircle2, Zap, Settings2,
  Radio, WifiOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLiveNarratives, buildLiveFilter, LiveNarrativeConfig } from "@/hooks/useLiveNarratives";
import InfoTooltip from "@/components/InfoTooltip";

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
  if (label === "positive") return <TrendingUp className="h-3.5 w-3.5 text-sentinel-emerald" />;
  if (label === "negative") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function RiskPill({ negPct, critCount }: { negPct: number; critCount: number }) {
  if (critCount > 0 || negPct >= 50)
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1.5"><AlertTriangle className="h-3 w-3" />Critical</Badge>;
  if (negPct >= 30)
    return <Badge className="bg-sentinel-amber/15 text-sentinel-amber border-sentinel-amber/30 gap-1.5"><AlertTriangle className="h-3 w-3" />Watch</Badge>;
  if (negPct <= 15)
    return <Badge className="bg-sentinel-emerald/15 text-sentinel-emerald border-sentinel-emerald/30 gap-1.5"><CheckCircle2 className="h-3 w-3" />Healthy</Badge>;
  return <Badge variant="outline" className="gap-1.5"><Minus className="h-3 w-3" />Moderate</Badge>;
}

// ── Config panel ────────────────────────────────────────────────────────────
function LiveConfigPanel({ config, update }: { config: LiveNarrativeConfig; update: (p: Partial<LiveNarrativeConfig>) => void }) {
  return (
    <div className="border border-primary/20 rounded-xl bg-primary/3 p-4 space-y-4 text-sm">
      <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Live Monitoring Options</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Sentiment filter */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Show sentiment</Label>
          <Select value={config.sentiment} onValueChange={v => update({ sentiment: v as LiveNarrativeConfig["sentiment"] })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All mentions</SelectItem>
              <SelectItem value="negative">Negative only</SelectItem>
              <SelectItem value="negative-mixed">Negative + Mixed</SelectItem>
              <SelectItem value="critical-only">Critical threats only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Severity filter */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Min severity</Label>
          <Select value={config.minSeverity} onValueChange={v => update({ minSeverity: v as LiveNarrativeConfig["minSeverity"] })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="medium">Medium and above</SelectItem>
              <SelectItem value="high">High and above</SelectItem>
              <SelectItem value="critical">Critical only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Show narratives */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-foreground">Show narrative clusters</p>
            <p className="text-[10px] text-muted-foreground">AI-grouped themes from your mentions</p>
          </div>
          <Switch
            checked={config.showNarratives}
            onCheckedChange={v => update({ showNarratives: v })}
          />
        </div>
        {/* Show live feed */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-foreground">Live mention ticker</p>
            <p className="text-[10px] text-muted-foreground">Realtime stream as new mentions arrive</p>
          </div>
          <Switch
            checked={config.showLiveFeed}
            onCheckedChange={v => update({ showLiveFeed: v })}
          />
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground bg-muted/40 rounded-lg p-2.5 leading-relaxed">
        <strong className="text-foreground">Bandwidth note:</strong> Live monitoring keeps a WebSocket open per browser tab.
        Disable when not actively monitoring to reduce Supabase Realtime usage.
        Data is still correct when disabled — just refreshed manually or after each scan.
      </div>
    </div>
  );
}

export default function NarrativeNow() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { config, update, toggle, saving } = useLiveNarratives();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { sentimentFilter, severityFilter } = buildLiveFilter(config);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    // Build mention query with active filters
    let mentionQuery = supabase
      .from("mentions")
      .select("id,content,source,sentiment_label,severity,posted_at,url")
      .eq("org_id", currentOrg.id)
      .eq("mention_type", "brand")
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(100);

    if (config.enabled) {
      if (sentimentFilter && sentimentFilter.length > 0) {
        mentionQuery = mentionQuery.in("sentiment_label", sentimentFilter);
      }
      if (severityFilter && severityFilter.length > 0) {
        mentionQuery = mentionQuery.in("severity", severityFilter);
      }
      if (config.sources.length > 0) {
        mentionQuery = mentionQuery.in("source", config.sources);
      }
    }

    const [mentionsRes, narrativesRes, scanRes] = await Promise.all([
      mentionQuery,
      config.enabled && config.showNarratives
        ? supabase.from("narratives").select("id,name,description,status,confidence,last_seen").eq("org_id", currentOrg.id).order("last_seen", { ascending: false, nullsFirst: false }).limit(10)
        : Promise.resolve({ data: [] }),
      supabase.from("scan_runs").select("finished_at").eq("org_id", currentOrg.id).eq("status", "completed").order("finished_at", { ascending: false }).limit(1),
    ]);

    const mentions = mentionsRes.data || [];
    const narratives = (narrativesRes as any).data || [];
    const lastScan = scanRes.data?.[0]?.finished_at || null;

    const negCount = mentions.filter(m => m.sentiment_label === "negative" || m.sentiment_label === "mixed").length;
    const posCount = mentions.filter(m => m.sentiment_label === "positive").length;
    const critCount = mentions.filter(m => m.severity === "critical" || m.severity === "high").length;
    const negPct = mentions.length > 0 ? Math.round((negCount / mentions.length) * 100) : 0;
    const posPct = mentions.length > 0 ? Math.round((posCount / mentions.length) * 100) : 0;
    const topThreat = mentions.find(m => m.severity === "critical") || mentions.find(m => m.severity === "high") || null;

    setData({ totalMentions: mentions.length, negPct, posPct, critCount, narratives, topThreat, lastScan });
    setLoading(false);
  }, [currentOrg, config.enabled, config.sources, config.showNarratives, JSON.stringify(sentimentFilter), JSON.stringify(severityFilter)]);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Realtime subscription — only when enabled
  useEffect(() => {
    if (!currentOrg || !config.enabled) {
      // Clean up any existing subscription
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    // Build filter for realtime — Supabase realtime only supports simple eq filters
    const channel = supabase
      .channel(`narrative-now-${currentOrg.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "mentions",
        filter: `org_id=eq.${currentOrg.id}`,
      }, (payload) => {
        const m = payload.new as any;
        // Apply client-side filters (realtime can't do multi-value IN filters)
        if (sentimentFilter && !sentimentFilter.includes(m.sentiment_label)) return;
        if (severityFilter && !severityFilter.includes(m.severity)) return;
        if (config.sources.length > 0 && !config.sources.includes(m.source)) return;
        // Refresh data on new mention
        load();
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [currentOrg?.id, config.enabled, load]);

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
      <div className="px-5 pt-4 pb-4 flex items-start justify-between gap-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              Narrative Now
              {config.enabled && (
                <span className="flex items-center gap-1 text-[10px] font-normal text-emerald-500 bg-emerald-500/10 rounded-full px-2 py-0.5">
                  <Radio className="h-2.5 w-2.5 animate-pulse" /> Live
                </span>
              )}
              {!config.enabled && (
                <span className="flex items-center gap-1 text-[10px] font-normal text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                  <WifiOff className="h-2.5 w-2.5" /> Static
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground">
              {data?.lastScan
                ? `Data updated ${formatDistanceToNow(new Date(data.lastScan), { addSuffix: true })}`
                : "No scans yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasData && <RiskPill negPct={data!.negPct} critCount={data!.critCount} />}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setConfigOpen(o => !o)} title="Live monitoring settings">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={runQuickScan} disabled={scanning} className="h-8 text-xs gap-1.5">
            {scanning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Scan className="h-3.5 w-3.5" />}
            {scanning ? "Scanning…" : "Quick Scan"}
          </Button>
        </div>
      </div>

      {/* Live monitoring toggle bar — always visible */}
      <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Switch
            id="live-narratives-toggle"
            checked={config.enabled}
            onCheckedChange={() => toggle()}
            className="scale-90"
          />
          <Label htmlFor="live-narratives-toggle" className="text-xs font-medium text-foreground cursor-pointer select-none">
            Live monitoring
          </Label>
          <InfoTooltip text="When enabled, this widget subscribes to real-time mention updates via Supabase WebSocket. Disable to save bandwidth — data still updates after each scan." />
          {saving && <span className="text-[10px] text-muted-foreground">Saving…</span>}
        </div>
        <button
          onClick={() => setConfigOpen(o => !o)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          {configOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Options
        </button>
      </div>

      {/* Config panel (collapsible) */}
      {configOpen && (
        <div className="px-5 py-4 border-b border-border">
          <LiveConfigPanel config={config} update={update} />
        </div>
      )}

      <CardContent className="p-5">
        {!hasData ? (
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
            {/* Sentiment pulse — 3 stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{data!.totalMentions}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {config.enabled && (sentimentFilter || severityFilter) ? "filtered mentions" : "mentions tracked"}
                </p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${data!.negPct >= 30 ? "border-destructive/20 bg-destructive/5" : "border-border bg-card"}`}>
                <p className={`text-2xl font-bold ${data!.negPct >= 30 ? "text-destructive" : "text-foreground"}`}>{data!.negPct}%</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">negative</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${data!.critCount > 0 ? "border-sentinel-amber/20 bg-sentinel-amber/5" : "border-border bg-card"}`}>
                <p className={`text-2xl font-bold ${data!.critCount > 0 ? "text-sentinel-amber" : "text-foreground"}`}>{data!.critCount}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">high threats</p>
              </div>
            </div>

            {/* Active filter indicators */}
            {config.enabled && (sentimentFilter || severityFilter || config.sources.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-muted-foreground">Filtered:</span>
                {sentimentFilter && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                    {config.sentiment.replace(/-/g, " ")}
                  </Badge>
                )}
                {severityFilter && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                    {config.minSeverity === "all" ? "all severity" : `≥ ${config.minSeverity}`}
                  </Badge>
                )}
                {config.sources.length > 0 && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                    {config.sources.join(", ")}
                  </Badge>
                )}
                <button onClick={() => update({ sentiment: "all", minSeverity: "all", sources: [] })} className="text-[10px] text-primary hover:underline ml-1">
                  Clear filters
                </button>
              </div>
            )}

            {/* Active narratives */}
            {config.enabled && config.showNarratives && data!.narratives.length > 0 && (
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
                      <div className={`h-2 w-2 rounded-full shrink-0 ${n.status === "watch" ? "bg-sentinel-amber" : "bg-sentinel-emerald"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate group-hover:text-primary transition-colors">{n.name}</p>
                        {n.last_seen && (
                          <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(n.last_seen), { addSuffix: true })}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {n.confidence != null && (
                          <span className="text-[10px] text-muted-foreground">{Math.round(n.confidence * 100)}%</span>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${n.status === "watch" ? "border-sentinel-amber/30 text-sentinel-amber" : "border-sentinel-emerald/30 text-sentinel-emerald"}`}>
                          {n.status || "active"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* When live is disabled, show note that narratives are hidden */}
            {!config.enabled && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground flex items-center gap-2">
                <WifiOff className="h-3.5 w-3.5 shrink-0" />
                <span>Narrative clusters and live feed are shown only when live monitoring is enabled. Toggle above to activate.</span>
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
                    <Badge className="bg-destructive/15 text-destructive text-[10px]">{data!.topThreat.severity}</Badge>
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
