import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import PageGuide from "@/components/PageGuide";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from "recharts";
import {
  Network, Search, ExternalLink, TrendingUp, TrendingDown,
  Minus, AlertTriangle, Users, Globe, RefreshCw, ChevronRight,
  Layers, MessageSquare, Shield, Download,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Narrative {
  id: string;
  name: string;
  description?: string;
  status: string;
  confidence?: number;
  first_seen?: string;
  last_seen?: string;
  example_phrases?: string[];
}

interface Mention {
  id: string;
  content: string;
  source?: string;
  sentiment_label?: string;
  sentiment_score?: number;
  severity?: string;
  posted_at?: string;
  url?: string;
  narrative_ids: string[];
}

interface Person {
  id: string;
  name: string;
  handle?: string;
  follower_count?: number;
  narrative_ids: string[];
}

interface NarrativeStats {
  id: string;
  mentionCount: number;
  positive: number;
  negative: number;
  neutral: number;
  critical: number;
  sources: string[];
  recentMentions: Mention[];
  people: Person[];
  dominantSentiment: "positive" | "negative" | "neutral" | "mixed";
  trend: "up" | "down" | "flat";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: "bg-red-500/20 text-red-400 border-red-500/30",
  watch: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  resolved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  monitoring: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const SENTIMENT_COLOR = (s: string) =>
  s === "positive" ? "#22c55e" : s === "negative" ? "#ef4444" : "#94a3b8";

function SentimentBar({ pos, neg, neu }: { pos: number; neg: number; neu: number }) {
  const total = pos + neg + neu || 1;
  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden gap-px">
      <div style={{ width: `${(pos / total) * 100}%`, background: "#22c55e" }} />
      <div style={{ width: `${(neg / total) * 100}%`, background: "#ef4444" }} />
      <div style={{ width: `${(neu / total) * 100}%`, background: "#475569" }} />
    </div>
  );
}

function SentimentIcon({ s }: { s: string }) {
  if (s === "positive") return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (s === "negative") return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NarrativeGraphPage() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { toast } = useToast();

  const [narratives, setNarratives] = useState<Narrative[]>([]);
  const [stats, setStats] = useState<Map<string, NarrativeStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"mentions" | "negative" | "recent">("mentions");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Debounce search input for graph computation
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = async (isRefresh = false) => {
    if (!currentOrg?.id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);

    try {
      // Load narratives
      const { data: narrativeRows } = await supabase
        .from("narratives")
        .select("id, name, description, status, confidence, first_seen, last_seen, example_phrases")
        .eq("org_id", currentOrg.id)
        .order("last_seen", { ascending: false })
        .limit(50);

      if (!narrativeRows?.length) {
        setNarratives([]);
        setStats(new Map());
        return;
      }

      setNarratives(narrativeRows as Narrative[]);
      const narrativeIds = narrativeRows.map((n) => n.id);

      // Load mention_narratives junction
      const { data: mnRows } = await supabase
        .from("mention_narratives")
        .select("mention_id, narrative_id")
        .in("narrative_id", narrativeIds);

      const mentionIds = [...new Set((mnRows || []).map((r: any) => r.mention_id))];

      if (!mentionIds.length) {
        // No mentions — set empty stats
        const emptyStats = new Map<string, NarrativeStats>();
        narrativeRows.forEach((n) =>
          emptyStats.set(n.id, {
            id: n.id, mentionCount: 0, positive: 0, negative: 0, neutral: 0,
            critical: 0, sources: [], recentMentions: [], people: [],
            dominantSentiment: "neutral", trend: "flat",
          })
        );
        setStats(emptyStats);
        return;
      }

      // Load mentions for those narratives
      const { data: mentionRows } = await supabase
        .from("mentions")
        .select("id, content, source, sentiment_label, sentiment_score, severity, posted_at, url")
        .eq("mention_type", "brand")
        .in("id", mentionIds.slice(0, 500))
        .order("posted_at", { ascending: false });

      // Load people linked to these mentions
      const { data: mpRows } = await supabase
        .from("mention_people")
        .select("mention_id, person_id")
        .in("mention_id", mentionIds.slice(0, 500));

      const personIds = [...new Set((mpRows || []).map((r: any) => r.person_id))];
      let peopleRows: any[] = [];
      if (personIds.length) {
        const { data: pr } = await supabase
          .from("people")
          .select("id, name, handles, follower_count")
          .in("id", personIds.slice(0, 50));
        peopleRows = pr || [];
      }

      // Build mention → narrative_ids map
      const mentionToNarratives = new Map<string, string[]>();
      (mnRows || []).forEach((r: any) => {
        if (!mentionToNarratives.has(r.mention_id)) mentionToNarratives.set(r.mention_id, []);
        mentionToNarratives.get(r.mention_id)!.push(r.narrative_id);
      });

      // Build mention → person_ids map
      const mentionToPeople = new Map<string, string[]>();
      (mpRows || []).forEach((r: any) => {
        if (!mentionToPeople.has(r.mention_id)) mentionToPeople.set(r.mention_id, []);
        mentionToPeople.get(r.mention_id)!.push(r.person_id);
      });

      // Compute stats per narrative
      const newStats = new Map<string, NarrativeStats>();

      narrativeRows.forEach((n) => {
        const nMentionIds = (mnRows || [])
          .filter((r: any) => r.narrative_id === n.id)
          .map((r: any) => r.mention_id);

        const nMentions = (mentionRows || []).filter((m: any) =>
          nMentionIds.includes(m.id)
        );

        let pos = 0, neg = 0, neu = 0, crit = 0;
        const sources = new Set<string>();

        nMentions.forEach((m: any) => {
          if (m.sentiment_label === "positive") pos++;
          else if (m.sentiment_label === "negative") neg++;
          else neu++;
          if (m.severity === "critical") crit++;
          if (m.source) sources.add(m.source);
        });

        const total = pos + neg + neu || 1;
        let dominantSentiment: NarrativeStats["dominantSentiment"] = "neutral";
        if (neg / total > 0.5) dominantSentiment = "negative";
        else if (pos / total > 0.5) dominantSentiment = "positive";
        else if (pos > 0 && neg > 0) dominantSentiment = "mixed";

        // Trend: compare last 7 days vs prior 7 days
        const now = Date.now();
        const recentCount = nMentions.filter(
          (m: any) => m.posted_at && now - new Date(m.posted_at).getTime() < 7 * 86400000
        ).length;
        const priorCount = nMentions.filter((m: any) => {
          if (!m.posted_at) return false;
          const age = now - new Date(m.posted_at).getTime();
          return age >= 7 * 86400000 && age < 14 * 86400000;
        }).length;
        const trend: NarrativeStats["trend"] =
          recentCount > priorCount + 2 ? "up" : recentCount < priorCount - 2 ? "down" : "flat";

        // People linked to this narrative's mentions
        const nPersonIds = new Set<string>();
        nMentionIds.forEach((mid: string) => {
          (mentionToPeople.get(mid) || []).forEach((pid: string) => nPersonIds.add(pid));
        });
        const nPeople: Person[] = peopleRows
          .filter((p: any) => nPersonIds.has(p.id))
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            handle: p.handles?.twitter || p.handles?.x,
            follower_count: p.follower_count,
            narrative_ids: [n.id],
          }));

        newStats.set(n.id, {
          id: n.id,
          mentionCount: nMentions.length,
          positive: pos,
          negative: neg,
          neutral: neu,
          critical: crit,
          sources: Array.from(sources).slice(0, 8),
          recentMentions: nMentions.slice(0, 5),
          people: nPeople.slice(0, 6),
          dominantSentiment,
          trend,
        });
      });

      setStats(newStats);
    } catch (err) {
      console.error("NarrativeGraphPage load error:", err);
      toast({ title: "Failed to load narrative data", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [currentOrg?.id]);

  // ─── Filtered / sorted narratives ───────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = narratives;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.description?.toLowerCase().includes(q) ||
          n.example_phrases?.some((p) => p.toLowerCase().includes(q))
      );
    }
    if (filterStatus !== "all") {
      list = list.filter((n) => n.status === filterStatus);
    }
    return [...list].sort((a, b) => {
      const sa = stats.get(a.id);
      const sb = stats.get(b.id);
      if (sortBy === "mentions") return (sb?.mentionCount || 0) - (sa?.mentionCount || 0);
      if (sortBy === "negative") return (sb?.negative || 0) - (sa?.negative || 0);
      if (sortBy === "recent") {
        return new Date(b.last_seen || 0).getTime() - new Date(a.last_seen || 0).getTime();
      }
      return 0;
    });
  }, [narratives, stats, search, filterStatus, sortBy]);

  // ─── Radar chart data (top 6 narratives by mentions) ────────────────────────

  const radarData = useMemo(() => {
    const top6 = [...narratives]
      .sort((a, b) => (stats.get(b.id)?.mentionCount || 0) - (stats.get(a.id)?.mentionCount || 0))
      .slice(0, 6);
    return top6.map((n) => {
      const s = stats.get(n.id);
      return {
        name: n.name.length > 20 ? n.name.slice(0, 20) + "…" : n.name,
        mentions: s?.mentionCount || 0,
        negative: s?.negative || 0,
        critical: s?.critical || 0,
      };
    });
  }, [narratives, stats]);

  // ─── Summary bar chart ───────────────────────────────────────────────────────

  const barData = useMemo(() => {
    return filtered.slice(0, 10).map((n) => {
      const s = stats.get(n.id);
      return {
        name: n.name.length > 16 ? n.name.slice(0, 16) + "…" : n.name,
        positive: s?.positive || 0,
        negative: s?.negative || 0,
        neutral: s?.neutral || 0,
      };
    });
  }, [filtered, stats]);

  // ─── Loading skeleton ────────────────────────────────────────────────────────

  const exportPng = () => {
    const container = document.getElementById("narrative-graph-svg");
    const svg = container?.querySelector("svg") as SVGSVGElement | null;
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0f1117";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "narrative-graph.png"; a.click();
        URL.revokeObjectURL(url);
      });
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgStr)));
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Empty state ─────────────────────────────────────────────────────────────

  if (!narratives.length) {
    return (
      <div className="space-y-4 p-4">
        <PageGuide
          title="Narrative Intelligence"
          description="Understand which story arcs are forming around your brand — before they become crises."
          steps={[
            "Run a scan from the Scans page to collect brand mentions.",
            "Click 'Detect Narratives' on the Narratives page to cluster mentions into themes.",
            "Return here to see the full intelligence view: sentiment, reach, people, sources.",
          ]}
        />
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <Network className="h-12 w-12 text-muted-foreground/40" />
          <h2 className="text-xl font-semibold text-foreground">No narratives detected yet</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Run a scan and then use "Detect Narratives" to automatically cluster your brand
            mentions into narrative themes.
          </p>
          <div className="flex gap-3 mt-2">
            <Button onClick={() => navigate("/scans")} variant="default">
              Go to Scans
            </Button>
            <Button onClick={() => navigate("/narratives")} variant="outline">
              Detect Narratives
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 pb-12">
      <PageGuide
        title="Narrative Intelligence"
        description="Deep-dive into every narrative forming around your brand. See who's amplifying it, which sources carry it, and how sentiment is trending."
        steps={[
          "Cards show each detected narrative with its mention volume and sentiment breakdown.",
          "Click a card to expand it and see recent mentions, people, and sources.",
          "Use the Radar chart to spot which narratives are dominating the conversation.",
          "Navigate directly to Narratives or Respond to take action.",
        ]}
      />

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            Narrative Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {narratives.length} narrative{narratives.length !== 1 ? "s" : ""} detected ·{" "}
            {Array.from(stats.values()).reduce((a, s) => a + s.mentionCount, 0)} total mentions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/narratives")}
            className="gap-1.5"
          >
            <Layers className="h-3.5 w-3.5" />
            Manage Narratives
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportPng}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />Export PNG
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary charts row ── */}
      {narratives.length >= 2 && (
        <div id="narrative-graph-svg" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sentiment volume bar chart */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mention Volume by Narrative
              </CardTitle>
            </CardHeader>
            <CardContent className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 4, left: -20, bottom: 30 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    angle={-35}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    labelStyle={{ color: "#f1f5f9", fontSize: 11 }}
                    itemStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="positive" stackId="a" fill="#22c55e" name="Positive" />
                  <Bar dataKey="neutral" stackId="a" fill="#475569" name="Neutral" />
                  <Bar dataKey="negative" stackId="a" fill="#ef4444" name="Negative" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Radar chart */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Top Narrative Radar (mentions / negative / critical)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar name="Mentions" dataKey="mentions" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                  <Radar name="Negative" dataKey="negative" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    itemStyle={{ fontSize: 11 }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search narratives…"
            className="pl-8 h-8 w-48 text-sm"
          />
        </div>
        {(["all", "active", "watch", "monitoring", "resolved"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
              filterStatus === s
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          Sort:
          {(["mentions", "negative", "recent"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2 py-1 rounded transition-colors ${
                sortBy === s ? "text-foreground font-medium" : "hover:text-foreground"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Narrative cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((n) => {
          const s = stats.get(n.id);
          const isExpanded = expanded === n.id;
          const total = (s?.positive || 0) + (s?.negative || 0) + (s?.neutral || 0) || 1;
          const negPct = Math.round(((s?.negative || 0) / total) * 100);

          return (
            <Card
              key={n.id}
              className={`bg-card border-border transition-shadow hover:shadow-md cursor-pointer ${
                isExpanded ? "md:col-span-2 xl:col-span-3" : ""
              }`}
              onClick={() => setExpanded(isExpanded ? null : n.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground truncate">{n.name}</span>
                      {n.status && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[n.status] || "bg-muted text-muted-foreground"}`}
                        >
                          {n.status}
                        </Badge>
                      )}
                      {s?.critical && s.critical > 0 ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-950/40 text-red-400 border-red-500/30">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{s.critical} critical
                        </Badge>
                      ) : null}
                    </div>
                    {n.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1">
                      {s?.trend === "up" ? (
                        <TrendingUp className="h-3.5 w-3.5 text-red-400" />
                      ) : s?.trend === "down" ? (
                        <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Minus className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      <span className="text-lg font-bold text-foreground tabular-nums">
                        {s?.mentionCount || 0}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">mentions</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0 space-y-3">
                {/* Sentiment bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-2.5">
                      <span className="text-emerald-400">{s?.positive || 0} pos</span>
                      <span className="text-red-400">{s?.negative || 0} neg</span>
                      <span className="text-slate-400">{s?.neutral || 0} neu</span>
                    </div>
                    <span className={negPct > 50 ? "text-red-400 font-medium" : ""}>{negPct}% negative</span>
                  </div>
                  <SentimentBar pos={s?.positive || 0} neg={s?.negative || 0} neu={s?.neutral || 0} />
                </div>

                {/* Sources pills */}
                {s?.sources && s.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.sources.slice(0, 5).map((src) => (
                      <span
                        key={src}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
                      >
                        <Globe className="h-2.5 w-2.5" />
                        {src.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                      </span>
                    ))}
                    {s.sources.length > 5 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                        +{s.sources.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {/* Confidence + last seen */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                  <span>
                    {n.confidence != null ? `${Math.round(n.confidence * 100)}% confidence` : ""}
                  </span>
                  <span>
                    {n.last_seen
                      ? `Updated ${formatDistanceToNow(new Date(n.last_seen), { addSuffix: true })}`
                      : ""}
                  </span>
                </div>

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div
                    className="border-t border-border pt-4 mt-2 grid grid-cols-1 md:grid-cols-3 gap-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Recent mentions */}
                    <div className="md:col-span-2 space-y-2">
                      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" /> Recent Mentions
                      </h3>
                      {s?.recentMentions.length ? (
                        <div className="space-y-2">
                          {s.recentMentions.map((m) => (
                            <div
                              key={m.id}
                              className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <SentimentIcon s={m.sentiment_label || "neutral"} />
                                  {m.severity === "critical" && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-red-950/40 text-red-400 border-red-500/30">
                                      critical
                                    </Badge>
                                  )}
                                  <span className="text-[10px] text-muted-foreground truncate">{m.source}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-muted-foreground">
                                    {m.posted_at
                                      ? formatDistanceToNow(new Date(m.posted_at), { addSuffix: true })
                                      : ""}
                                  </span>
                                  {m.url && (
                                    <a
                                      href={m.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-foreground/80 line-clamp-2">
                                {m.content?.slice(0, 200)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No mentions linked yet.</p>
                      )}
                    </div>

                    {/* People + actions */}
                    <div className="space-y-4">
                      {s?.people && s.people.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                            <Users className="h-3.5 w-3.5" /> Key People
                          </h3>
                          <div className="space-y-1.5">
                            {s.people.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => navigate(`/people/${p.id}`)}
                                className="w-full flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/50 text-left hover:bg-muted/60 transition-colors"
                              >
                                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                                  {p.name[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                                  {p.handle && (
                                    <p className="text-[10px] text-muted-foreground truncate">@{p.handle}</p>
                                  )}
                                </div>
                                <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Example phrases */}
                      {n.example_phrases && n.example_phrases.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
                            Example Phrases
                          </h3>
                          <div className="flex flex-wrap gap-1">
                            {n.example_phrases.slice(0, 5).map((ph, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary border border-primary/20"
                              >
                                "{ph}"
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="space-y-1.5 pt-1">
                        <Button
                          size="sm"
                          className="w-full gap-1.5 h-8 text-xs"
                          onClick={() => navigate(`/narratives/${n.id}`)}
                        >
                          <Layers className="h-3.5 w-3.5" />
                          View Full Narrative
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-1.5 h-8 text-xs"
                          onClick={() => navigate(`/respond?narrative=${n.id}`)}
                        >
                          <Shield className="h-3.5 w-3.5" />
                          Draft Response
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-1.5 h-8 text-xs"
                          onClick={() => navigate(`/mentions?narrative=${n.id}`)}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          View All Mentions
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Expand hint */}
                {!isExpanded && (
                  <div className="flex items-center justify-end pt-1">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      Click to expand <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && narratives.length > 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No narratives match your filters. <button onClick={() => { setSearch(""); setFilterStatus("all"); }} className="underline hover:text-foreground">Clear filters</button>
        </div>
      )}
    </div>
  );
}
