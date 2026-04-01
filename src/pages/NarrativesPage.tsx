import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Network, Scan, Brain, Loader2, Sparkles, TrendingUp, TrendingDown,
  Search, MessageSquare, ChevronRight, BarChart3, AlertTriangle, Shield,
  CheckCircle, Eye, RefreshCw, Filter,
} from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import PageGuide from "@/components/PageGuide";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface NarrativeWithCounts {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  confidence: number | null;
  first_seen: string | null;
  last_seen: string | null;
  created_at: string;
  // enriched client-side
  mention_count: number;
  negative_pct: number;
  critical_count: number;
  sources: string[];
  sentiment_breakdown: { positive: number; negative: number; neutral: number };
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  active:   { label: "Active",   className: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10", icon: CheckCircle },
  watch:    { label: "Watch",    className: "border-amber-500/40 text-amber-400 bg-amber-500/10",   icon: Eye },
  emerging: { label: "Emerging", className: "border-blue-500/40 text-blue-400 bg-blue-500/10",     icon: TrendingUp },
  resolved: { label: "Resolved", className: "border-muted-foreground/30 text-muted-foreground",    icon: Shield },
};

export default function NarrativesPage() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { toast } = useToast();

  const [narratives, setNarratives] = useState<NarrativeWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"last_seen" | "confidence" | "mentions" | "negative">("last_seen");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadNarratives = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    const { data: rawNarratives } = await supabase
      .from("narratives")
      .select("id, name, description, status, confidence, first_seen, last_seen, created_at")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!rawNarratives || rawNarratives.length === 0) {
      setNarratives([]);
      setLoading(false);
      return;
    }

    // Batch-load mention counts + sentiment breakdowns for all narratives
    const narrativeIds = rawNarratives.map(n => n.id);

    const { data: mentionLinks } = await supabase
      .from("mention_narratives")
      .select("narrative_id, mentions(id, sentiment_label, severity, source)")
      .in("narrative_id", narrativeIds);

    // Build enrichment map
    const enrichMap: Record<string, {
      count: number; negative: number; positive: number; neutral: number; critical: number; sources: Set<string>;
    }> = {};

    narrativeIds.forEach(id => {
      enrichMap[id] = { count: 0, negative: 0, positive: 0, neutral: 0, critical: 0, sources: new Set() };
    });

    (mentionLinks || []).forEach((link: any) => {
      const m = link.mentions;
      if (!m) return;
      const e = enrichMap[link.narrative_id];
      if (!e) return;
      e.count++;
      if (m.sentiment_label === "negative") e.negative++;
      else if (m.sentiment_label === "positive") e.positive++;
      else e.neutral++;
      if (m.severity === "critical") e.critical++;
      if (m.source) e.sources.add(m.source);
    });

    const enriched: NarrativeWithCounts[] = rawNarratives.map(n => {
      const e = enrichMap[n.id];
      const total = e.count || 1;
      return {
        ...n,
        mention_count: e.count,
        negative_pct: Math.round((e.negative / total) * 100),
        critical_count: e.critical,
        sources: [...e.sources].slice(0, 4),
        sentiment_breakdown: { positive: e.positive, negative: e.negative, neutral: e.neutral },
      };
    });

    setNarratives(enriched);
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => { loadNarratives(); }, [loadNarratives]);

  const detectNarratives = async () => {
    if (!currentOrg) return;
    setDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("detect-narratives", {
        body: { org_id: currentOrg.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Narrative detection complete",
        description: `${data?.narratives_created || 0} new narratives, ${data?.mentions_linked || 0} mentions linked`,
      });
      loadNarratives();
    } catch (err: any) {
      toast({ title: "Detection failed", description: err.message, variant: "destructive" });
    } finally {
      setDetecting(false);
    }
  };

  const updateStatus = async (id: string, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setUpdatingId(id);
    const { error } = await supabase.from("narratives").update({ status: newStatus }).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setNarratives(prev => prev.map(n => n.id === id ? { ...n, status: newStatus } : n));
      toast({ title: `Narrative marked ${newStatus}` });
    }
    setUpdatingId(null);
  };

  const filtered = narratives
    .filter(n => {
      if (statusFilter !== "all" && n.status !== statusFilter) return false;
      if (search && !n.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "confidence") return (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
      if (sortBy === "mentions") return b.mention_count - a.mention_count;
      if (sortBy === "negative") return b.negative_pct - a.negative_pct;
      // last_seen
      return new Date(b.last_seen || b.created_at).getTime() - new Date(a.last_seen || a.created_at).getTime();
    });

  const totalMentions = narratives.reduce((s, n) => s + n.mention_count, 0);
  const activeCount = narratives.filter(n => n.status === "active" || n.status === "emerging").length;
  const criticalCount = narratives.filter(n => n.critical_count > 0).length;
  const highNegCount = narratives.filter(n => n.negative_pct > 60).length;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Narratives</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-clustered storylines forming around your brand</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadNarratives} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button onClick={detectNarratives} disabled={detecting} className="gap-2">
            {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {detecting ? "Detecting..." : "Run AI Detection"}
          </Button>
        </div>
      </div>

      <PageGuide
        title="How Narratives Work"
        subtitle="AI clusters related mentions into coherent storylines with sentiment tracking"
        steps={[
          { icon: <Scan className="h-4 w-4 text-primary" />, title: "1. Run a Scan", description: "Scans pull mentions from news, social, reviews, forums." },
          { icon: <Brain className="h-4 w-4 text-primary" />, title: "2. Run AI Detection", description: "AI groups mentions into distinct narrative themes. Run after each scan." },
          { icon: <BarChart3 className="h-4 w-4 text-primary" />, title: "3. Track & Respond", description: "Monitor how narratives grow, change status, and link to response drafts." },
        ]}
        integrations={[
          { label: "Scans", to: "/scans", description: "Build your mention data" },
          { label: "Mentions", to: "/mentions", description: "View linked mentions" },
          { label: "Respond", to: "/respond", description: "Draft responses" },
          { label: "Network Graph", to: "/narrative-graph", description: "Visual connections" },
        ]}
        tip="Click 'Run AI Detection' after each scan to get fresh narrative clusters. Change status to Watch or Resolved to track narrative lifecycle."
      />

      {/* Summary stats */}
      {!loading && narratives.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card border-border p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Narratives</div>
            <div className="text-2xl font-bold text-foreground">{narratives.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{activeCount} active</div>
          </Card>
          <Card className="bg-card border-border p-4">
            <div className="text-xs text-muted-foreground mb-1">Mentions Linked</div>
            <div className="text-2xl font-bold text-foreground">{totalMentions}</div>
          </Card>
          <Card className="bg-card border-border p-4">
            <div className="text-xs text-muted-foreground mb-1">High Negativity</div>
            <div className={`text-2xl font-bold ${highNegCount > 0 ? "text-amber-500" : "text-foreground"}`}>{highNegCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">&gt;60% negative</div>
          </Card>
          <Card className="bg-card border-border p-4">
            <div className="text-xs text-muted-foreground mb-1">With Critical</div>
            <div className={`text-2xl font-bold ${criticalCount > 0 ? "text-red-500" : "text-foreground"}`}>{criticalCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">critical mentions</div>
          </Card>
        </div>
      )}

      {/* Filter bar */}
      {narratives.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search narratives..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-muted border-border"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 bg-muted border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="emerging">Emerging</SelectItem>
              <SelectItem value="watch">Watch</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-40 bg-muted border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="last_seen">Latest activity</SelectItem>
              <SelectItem value="confidence">Confidence</SelectItem>
              <SelectItem value="mentions">Most mentions</SelectItem>
              <SelectItem value="negative">Most negative</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Narrative list */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Network className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {narratives.length === 0 ? "No narratives detected yet" : "No matches"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              {narratives.length === 0
                ? "Run a scan first, then click 'Run AI Detection' to cluster mentions into narratives."
                : "Try adjusting your search or filters."}
            </p>
            {narratives.length === 0 && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate("/scans")}>
                  <Scan className="h-4 w-4 mr-2" /> Run a Scan
                </Button>
                <Button onClick={detectNarratives} disabled={detecting}>
                  <Sparkles className="h-4 w-4 mr-2" /> AI Detection
                </Button>
              </div>
            )}
          </div>
        ) : (
          filtered.map(n => {
            const statusCfg = STATUS_CONFIG[n.status || "active"] || STATUS_CONFIG.active;
            const StatusIcon = statusCfg.icon;
            const negRisk = n.negative_pct > 60 ? "high" : n.negative_pct > 30 ? "medium" : "low";
            const confidenceNum = Math.round(Number(n.confidence) || 0);
            const totalSentiment = n.sentiment_breakdown.positive + n.sentiment_breakdown.negative + n.sentiment_breakdown.neutral || 1;

            return (
              <Card
                key={n.id}
                className={`bg-card border-border hover:border-primary/30 transition-all duration-200 cursor-pointer group ${n.critical_count > 0 ? "border-l-2 border-l-red-500" : n.negative_pct > 60 ? "border-l-2 border-l-amber-500" : ""}`}
                onClick={() => navigate(`/narratives/${n.id}`)}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Left: icon + confidence ring */}
                    <div className="flex-shrink-0 relative">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
                        confidenceNum >= 70 ? "bg-primary/20 text-primary" : confidenceNum >= 40 ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground"
                      }`}>
                        {confidenceNum}%
                      </div>
                    </div>

                    {/* Center: name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-card-foreground group-hover:text-primary transition-colors leading-snug">
                          {n.name}
                        </h3>
                        {n.critical_count > 0 && (
                          <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400 bg-red-500/5 flex-shrink-0">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> {n.critical_count} critical
                          </Badge>
                        )}
                      </div>
                      {n.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{n.description}</p>
                      )}

                      {/* Sentiment bar */}
                      {n.mention_count > 0 && (
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden flex">
                            <div
                              className="h-full bg-emerald-500 rounded-l-full"
                              style={{ width: `${(n.sentiment_breakdown.positive / totalSentiment) * 100}%` }}
                            />
                            <div
                              className="h-full bg-amber-500/60"
                              style={{ width: `${(n.sentiment_breakdown.neutral / totalSentiment) * 100}%` }}
                            />
                            <div
                              className="h-full bg-red-500 rounded-r-full"
                              style={{ width: `${(n.sentiment_breakdown.negative / totalSentiment) * 100}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-mono ${negRisk === "high" ? "text-red-400" : negRisk === "medium" ? "text-amber-400" : "text-muted-foreground"}`}>
                            {n.negative_pct}% neg
                          </span>
                        </div>
                      )}

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {n.mention_count} mention{n.mention_count !== 1 ? "s" : ""}
                        </span>
                        {n.last_seen && (
                          <span>Last seen {formatDistanceToNow(new Date(n.last_seen), { addSuffix: true })}</span>
                        )}
                        {n.first_seen && (
                          <span>Since {formatDistanceToNow(new Date(n.first_seen), { addSuffix: true })}</span>
                        )}
                        {n.sources.length > 0 && (
                          <span className="flex items-center gap-1">
                            {n.sources.slice(0, 3).map(s => (
                              <span key={s} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{s}</span>
                            ))}
                            {n.sources.length > 3 && <span>+{n.sources.length - 3}</span>}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: status + actions */}
                    <div className="flex-shrink-0 flex flex-col items-end gap-2">
                      <Badge variant="outline" className={`text-[10px] ${statusCfg.className}`}>
                        <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                        {statusCfg.label}
                      </Badge>
                      {/* Inline status change */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        {Object.entries(STATUS_CONFIG)
                          .filter(([k]) => k !== n.status)
                          .map(([k, v]) => (
                            <button
                              key={k}
                              onClick={(e) => updateStatus(n.id, k, e)}
                              disabled={updatingId === n.id}
                              className={`text-[9px] px-1.5 py-0.5 rounded border ${v.className} hover:opacity-80 transition-opacity`}
                              title={`Mark as ${v.label}`}
                            >
                              {v.label}
                            </button>
                          ))}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                        View details <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} of {narratives.length} narratives · Hover a card to change status inline
        </p>
      )}
    </div>
  );
}
