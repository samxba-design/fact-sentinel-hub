import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, AlertTriangle, Flag, MoreVertical, EyeOff, Clock, CheckCircle2, ArrowLeft,
  MessageCircleReply, ExternalLink, Siren, Scan, MessageSquareWarning, Plus, Trash2,
  Network, ChevronDown, ChevronRight, CalendarClock, Eye, AlertCircle, Link2, User2,
  Ban, Globe, BarChart3, X, Sparkles, ArrowUpDown, Lock, Share2, Loader2
} from "lucide-react";
import SourceBadge, { formatReachDisplay } from "@/components/SourceBadge";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import BulkActionsBar from "@/components/mentions/BulkActionsBar";
import SavedFilters from "@/components/mentions/SavedFilters";
import AddMentionDialog from "@/components/mentions/AddMentionDialog";
import SourceIntelSheet from "@/components/mentions/SourceIntelSheet";
import { format } from "date-fns";
import { useMentionClusters } from "@/hooks/useMentionClusters";

interface Mention {
  id: string;
  source: string;
  author_name: string | null;
  author_handle: string | null;
  content: string | null;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
  created_at: string | null;
  author_follower_count: number | null;
  flags: any;
  status: string | null;
  scan_run_id: string | null;
  url: string | null;
}

interface NarrativeInfo {
  mention_id: string;
  narrative_id: string;
  narratives: { name: string } | null;
}

const severityColors: Record<string, string> = {
  low: "border-sentinel-emerald/30 text-sentinel-emerald bg-sentinel-emerald/5",
  medium: "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5",
  high: "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5",
  critical: "border-sentinel-red/50 text-sentinel-red bg-sentinel-red/10",
};

const sentimentColors: Record<string, string> = {
  positive: "text-sentinel-emerald",
  negative: "text-sentinel-red",
  neutral: "text-muted-foreground",
  mixed: "text-sentinel-amber",
};

const statusLabels: Record<string, { label: string; icon: any; class: string }> = {
  ignored: { label: "Ignored", icon: EyeOff, class: "text-muted-foreground" },
  snoozed: { label: "Snoozed", icon: Clock, class: "text-sentinel-amber" },
  resolved: { label: "Resolved", icon: CheckCircle2, class: "text-sentinel-emerald" },
};

// Clean junk content for preview
function cleanPreview(raw: string | null): string {
  if (!raw) return "No content";
  let text = raw;
  text = text.replace(/!\[.*?\]\(data:.*?\)/g, "");
  text = text.replace(/\[([^\]]*)\]\(https?:[^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/data:image\/[^,]+,[^\s)]+/g, "");
  text = text.replace(/[#*_~`>]/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length < 20) return "Content not extractable — click to view source";
  return text;
}

const PAGE_SIZE = 100;

export default function MentionsPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [narrativeLinks, setNarrativeLinks] = useState<NarrativeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addMentionOpen, setAddMentionOpen] = useState(false);
  const [groupByNarrative, setGroupByNarrative] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [ignoredSources, setIgnoredSources] = useState<{ id: string; domain: string; reason: string | null }[]>([]);
  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [sourceIntelDomain, setSourceIntelDomain] = useState<string | null>(null);
  const [sourceIntelOpen, setSourceIntelOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"detected" | "published">("detected");

  const scanFilter = searchParams.get("scan");
  const daysParam = searchParams.get("days");

  // Apply URL query params to filters on mount
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const sentiment = searchParams.get("sentiment");
    const severity = searchParams.get("severity");
    const status = searchParams.get("status");
    if (sentiment) setSentimentFilter(sentiment);
    if (severity) setSeverityFilter(severity);
    if (status) setStatusFilter(status);
  }, [searchParams]);

  // Debounce search for server-side text search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const buildQuery = useCallback((cursor?: string) => {
    if (!currentOrg) return null;
    let query = supabase
      .from("mentions")
      .select("id, source, author_name, author_handle, content, sentiment_label, severity, posted_at, created_at, author_follower_count, flags, status, scan_run_id, url")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (scanFilter) query = query.eq("scan_run_id", scanFilter);
    if (daysParam) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(daysParam, 10));
      query = query.gte("posted_at", daysAgo.toISOString());
    }
    // Server-side filters
    if (sentimentFilter !== "all") query = query.eq("sentiment_label", sentimentFilter);
    if (severityFilter !== "all") query = query.eq("severity", severityFilter);
    if (sourceFilter !== "all") query = query.eq("source", sourceFilter);
    if (statusFilter === "active") {
      query = query.not("status", "in", '("ignored","snoozed","resolved")');
    } else if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (debouncedSearch) query = query.ilike("content", `%${debouncedSearch}%`);
    if (cursor) query = query.lt("created_at", cursor);
    return query;
  }, [currentOrg, scanFilter, daysParam, sentimentFilter, severityFilter, sourceFilter, statusFilter, debouncedSearch]);

  useEffect(() => {
    const query = buildQuery();
    if (!query) return;
    setLoading(true);
    setHasMore(true);

    query.then(({ data }) => {
      const mentionData = data || [];
      setMentions(mentionData);
      setHasMore(mentionData.length === PAGE_SIZE);
      setLoading(false);

      // Load narrative links for grouping
      if (mentionData.length > 0) {
        const ids = mentionData.map(m => m.id);
        supabase
          .from("mention_narratives")
          .select("mention_id, narrative_id, narratives(name)")
          .in("mention_id", ids)
          .then(({ data: links }) => {
            setNarrativeLinks((links as any) || []);
          });
      }
    });
  }, [buildQuery]);

  // Load ignored sources
  useEffect(() => {
    if (!currentOrg) return;
    supabase
      .from("ignored_sources")
      .select("id, domain, reason")
      .eq("org_id", currentOrg.id)
      .then(({ data }) => setIgnoredSources(data || []));
  }, [currentOrg]);

  // Extract domain from URL
  const getDomain = (url: string | null): string => {
    if (!url) return "unknown";
    try { return new URL(url).hostname.replace("www.", ""); } catch { return "unknown"; }
  };

  const ignoreSource = async (domain: string, reason?: string) => {
    if (!currentOrg) return;
    const { error } = await supabase.from("ignored_sources").insert({
      org_id: currentOrg.id,
      domain,
      reason: reason || null,
      created_by: null,
    });
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Already ignored", description: `${domain} is already on your ignore list.` });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      return;
    }
    setIgnoredSources(prev => [...prev, { id: crypto.randomUUID(), domain, reason: reason || null }]);
    toast({ title: "Source ignored", description: `${domain} will be hidden from future results.` });
  };

  const unignoreSource = async (domain: string) => {
    if (!currentOrg) return;
    const { error } = await supabase.from("ignored_sources").delete()
      .eq("org_id", currentOrg.id).eq("domain", domain);
    if (!error) {
      setIgnoredSources(prev => prev.filter(s => s.domain !== domain));
      toast({ title: "Source restored", description: `${domain} will appear in results again.` });
    }
  };

  const ignoredDomains = new Set(ignoredSources.map(s => s.domain));

  const updateMentionStatus = async (mentionId: string, newStatus: string) => {
    const { error } = await supabase.from("mentions").update({ status: newStatus }).eq("id", mentionId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMentions(prev => prev.map(m => m.id === mentionId ? { ...m, status: newStatus } : m));
      toast({ title: `Mention ${newStatus}` });
    }
  };

  const deleteMention = async (mentionId: string) => {
    const { error } = await supabase.from("mentions").delete().eq("id", mentionId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMentions(prev => prev.filter(m => m.id !== mentionId));
      setSelected(prev => { const n = new Set(prev); n.delete(mentionId); return n; });
      toast({ title: "Mention deleted" });
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    if (action === "delete") {
      const { error } = await supabase.from("mentions").delete().in("id", ids);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setMentions(prev => prev.filter(m => !ids.includes(m.id)));
        toast({ title: `${ids.length} mentions deleted` });
      }
    } else if (action === "escalate") {
      if (!currentOrg) return;
      const { error } = await supabase.from("escalations").insert({
        org_id: currentOrg.id,
        title: `Bulk escalation: ${ids.length} mentions`,
        description: `Escalated ${ids.length} mentions in bulk`,
        related_mention_ids: ids,
        priority: "high",
        status: "open",
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `${ids.length} mentions escalated` });
      }
    } else {
      const { error } = await supabase.from("mentions").update({ status: action }).in("id", ids);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setMentions(prev => prev.map(m => ids.includes(m.id) ? { ...m, status: action } : m));
        toast({ title: `${ids.length} mentions ${action}` });
      }
    }
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = mentions.filter(m => {
    // Filter out ignored source domains (client-side only)
    const domain = getDomain(m.url);
    if (ignoredDomains.has(domain)) return false;
    // Domain-level filter from source panel
    if (domainFilter && domain !== domainFilter) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "published") {
      const aDate = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const bDate = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      if (aDate === 0 && bDate === 0) return 0;
      if (aDate === 0) return 1;
      if (bDate === 0) return -1;
      return bDate - aDate;
    }
    const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bDate - aDate;
  });

  // Source breakdown stats (from unfiltered, non-ignored mentions)
  const sourceBreakdown = useMemo(() => {
    const domainMap = new Map<string, { count: number; negCount: number; source: string; latestUrl: string | null }>();
    for (const m of mentions) {
      const domain = getDomain(m.url);
      if (ignoredDomains.has(domain)) continue;
      const mStatus = m.status || "new";
      if (mStatus === "ignored" || mStatus === "resolved") continue;
      const existing = domainMap.get(domain) || { count: 0, negCount: 0, source: m.source, latestUrl: m.url };
      existing.count++;
      if (m.sentiment_label === "negative" || m.sentiment_label === "mixed") existing.negCount++;
      domainMap.set(domain, existing);
    }
    return [...domainMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);
  }, [mentions, ignoredDomains]);

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(m => m.id)));
    }
  };

  // Build narrative groups
  const narrativeGroups = useMemo(() => {
    if (!groupByNarrative) return null;
    const groups: Record<string, { name: string; mentionIds: Set<string> }> = {};
    const ungrouped = new Set(filtered.map(m => m.id));

    for (const link of narrativeLinks) {
      if (!ungrouped.has(link.mention_id)) continue;
      const name = (link.narratives as any)?.name || "Unknown Narrative";
      if (!groups[link.narrative_id]) {
        groups[link.narrative_id] = { name, mentionIds: new Set() };
      }
      groups[link.narrative_id].mentionIds.add(link.mention_id);
      ungrouped.delete(link.mention_id);
    }

    return { groups, ungroupedIds: ungrouped };
  }, [groupByNarrative, filtered, narrativeLinks]);

  const toggleGroupCollapse = (id: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const uniqueSources = [...new Set(mentions.map(m => m.source))];

  const formatReach = (count: number | null) => {
    if (!count) return "0";
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return String(count);
  };

  const openSourceIntel = (domain: string) => {
    setSourceIntelDomain(domain);
    setSourceIntelOpen(true);
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return `${Math.max(1, Math.floor(diff / 60000))}m ago`;
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return format(new Date(dateStr), "MMM d, yyyy");
  };

  const clearScanFilter = () => {
    searchParams.delete("scan");
    searchParams.delete("days");
    searchParams.delete("sentiment");
    searchParams.delete("severity");
    searchParams.delete("status");
    setSearchParams(searchParams, { replace: true });
    setSentimentFilter("all");
    setSeverityFilter("all");
    setStatusFilter("active");
  };

  const hasUrlFilters = searchParams.has("sentiment") || searchParams.has("severity") || searchParams.has("days") || searchParams.has("status");

  const currentFilters = { statusFilter, severityFilter, sentimentFilter, sourceFilter, search };
  const applyFilters = (f: Record<string, any>) => {
    if (f.statusFilter) setStatusFilter(f.statusFilter);
    if (f.severityFilter) setSeverityFilter(f.severityFilter);
    if (f.sentimentFilter) setSentimentFilter(f.sentimentFilter);
    if (f.sourceFilter) setSourceFilter(f.sourceFilter);
    if (f.search !== undefined) setSearch(f.search);
  };

  const refetchMentions = () => {
    const query = buildQuery();
    if (!query) return;
    setLoading(true);
    query.then(({ data }) => {
      setMentions(data || []);
      setHasMore((data || []).length === PAGE_SIZE);
      setLoading(false);
    });
  };

  const loadMore = async () => {
    if (!currentOrg || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const lastMention = mentions[mentions.length - 1];
    if (!lastMention?.created_at) { setLoadingMore(false); return; }

    const query = buildQuery(lastMention.created_at);
    if (!query) { setLoadingMore(false); return; }

    const { data } = await query;
    const newMentions = data || [];
    setMentions(prev => [...prev, ...newMentions]);
    setHasMore(newMentions.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  // Detect coordinated patterns with linked mention details
  interface CoordWarning {
    type: "burst" | "duplicate" | "ai_flagged";
    message: string;
    mentionIds: string[];
    sources: string[];
    contentPreview?: string;
  }

  const coordWarnings = useMemo(() => {
    const warnings: CoordWarning[] = [];

    // Check for burst of same-sentiment mentions in short window across DIFFERENT sources
    const negMentions = filtered.filter(m => m.sentiment_label === "negative" && m.posted_at);
    if (negMentions.length >= 5) {
      const withTime = negMentions.map(m => ({
        id: m.id,
        time: new Date(m.posted_at!).getTime(),
        domain: getDomain(m.url),
      })).filter(t => t.time > 0).sort((a, b) => a.time - b.time);
      if (withTime.length >= 5) {
        const span = withTime[withTime.length - 1].time - withTime[0].time;
        const uniqueDomains = new Set(withTime.map(t => t.domain));
        if (span < 3600000 && uniqueDomains.size >= 3) {
          warnings.push({
            type: "burst",
            message: `${negMentions.length} negative mentions published within the same hour across ${uniqueDomains.size} different sources — possible coordinated FUD campaign`,
            mentionIds: withTime.map(t => t.id),
            sources: [...uniqueDomains],
          });
        }
      }
    }

    // Check for duplicate content across DIFFERENT domains only
    const contentMap = new Map<string, { count: number; domains: Set<string>; ids: string[]; preview: string }>();
    filtered.forEach(m => {
      const preview = cleanPreview(m.content);
      const key = preview.slice(0, 80).toLowerCase();
      const domain = getDomain(m.url);
      if (key.length > 30) {
        const entry = contentMap.get(key) || { count: 0, domains: new Set(), ids: [], preview };
        entry.count++;
        entry.domains.add(domain);
        entry.ids.push(m.id);
        contentMap.set(key, entry);
      }
    });
    const dupes = [...contentMap.entries()].filter(([, v]) => v.domains.size >= 3);
    if (dupes.length > 0) {
      const [, detail] = dupes[0];
      warnings.push({
        type: "duplicate",
        message: `Similar content detected across ${detail.domains.size} different sources — may indicate coordinated activity`,
        mentionIds: detail.ids,
        sources: [...detail.domains],
        contentPreview: detail.preview.slice(0, 120) + (detail.preview.length > 120 ? "…" : ""),
      });
    }

    // Check if many flagged as coordinated by AI
    const coordMentions = filtered.filter(m => (m.flags as any)?.coordinated);
    if (coordMentions.length >= 3) {
      warnings.push({
        type: "ai_flagged",
        message: `${coordMentions.length} mentions flagged as potentially coordinated activity by AI analysis`,
        mentionIds: coordMentions.map(m => m.id),
        sources: [...new Set(coordMentions.map(m => getDomain(m.url)))],
      });
    }
    return warnings;
  }, [filtered]);

  const [expandedWarning, setExpandedWarning] = useState<number | null>(null);

  // Render a single mention card
  const renderMention = (m: Mention) => {
    const flags = m.flags as any || {};
    const mStatus = m.status || "new";
    const statusInfo = statusLabels[mStatus];
    const isSelected = selected.has(m.id);

    return (
      <Card
        key={m.id}
        className={`bg-card border-border p-5 hover:border-primary/30 transition-colors ${
          mStatus === "ignored" ? "opacity-50" : mStatus === "snoozed" ? "opacity-70" : ""
        } ${isSelected ? "ring-1 ring-primary/40" : ""} ${
          flags.coordinated ? "border-l-2 border-l-sentinel-amber" : ""
        }`}
      >
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleSelect(m.id)}
            className="mt-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex-1 flex items-start justify-between gap-4 min-w-0">
            <div className="flex-1 space-y-2 min-w-0 cursor-pointer" onClick={() => navigate(`/mentions/${m.id}`)}>
              <div className="flex items-center gap-2 flex-wrap">
                <SourceBadge source={m.source} />
                {m.url && getDomain(m.url) !== "unknown" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <span
                        className="text-[10px] text-muted-foreground hover:text-primary cursor-pointer transition-colors inline-flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {getDomain(m.url)}
                        <ChevronDown className="h-2.5 w-2.5" />
                      </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => openSourceIntel(getDomain(m.url))}>
                        <Sparkles className="h-3.5 w-3.5 mr-2 text-primary" /> Source Intelligence
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDomainFilter(getDomain(m.url))}>
                        <Globe className="h-3.5 w-3.5 mr-2" /> Filter by this source
                      </DropdownMenuItem>
                      {m.url && (
                        <DropdownMenuItem onClick={() => window.open(m.url!, "_blank")}>
                          <ExternalLink className="h-3.5 w-3.5 mr-2" /> Visit {getDomain(m.url)}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => navigate(`/people?search=${encodeURIComponent(m.author_name || m.author_handle || "")}`)}
                      >
                        <User2 className="h-3.5 w-3.5 mr-2" /> Track author in People
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => ignoreSource(getDomain(m.url), `Blocked from mention card`)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Ban className="h-3.5 w-3.5 mr-2" /> Block this source
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {/* Only show author name separately if it differs from the domain */}
                {(() => {
                  const authorDisplay = m.author_name || m.author_handle || "Unknown";
                  const domain = getDomain(m.url);
                  if (authorDisplay.toLowerCase() === domain.toLowerCase()) return null;
                  return (
                    <span className="text-xs text-card-foreground font-medium">
                      {authorDisplay}
                    </span>
                  );
                })()}
                {/* Published date */}
                {m.posted_at ? (
                  <span className="text-xs text-foreground/80 font-medium flex items-center gap-1" title={`Published: ${format(new Date(m.posted_at), "PPp")}`}>
                    <CalendarClock className="h-3 w-3 text-primary" />
                    {format(new Date(m.posted_at), "MMM d, yyyy")}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/50 italic flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Date unknown
                  </span>
                )}
                {/* Detected date */}
                <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5" title={m.created_at ? `Detected: ${format(new Date(m.created_at), "PPp")}` : undefined}>
                  <Eye className="h-2.5 w-2.5" /> Detected {timeAgo(m.created_at)}
                </span>
                {flags.paywall && (
                  <Badge className="bg-sentinel-amber/10 text-sentinel-amber border-sentinel-amber/30 text-[10px]">
                    <Lock className="h-3 w-3 mr-1" />Paywalled
                  </Badge>
                )}
                {(flags.social_pickup_count > 0 || flags.media_pickup_count > 0) && (
                  <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                    <Share2 className="h-3 w-3 mr-1" />{flags.social_pickup_count || 0} social · {flags.media_pickup_count || 0} media
                  </Badge>
                )}
                {flags.emergency && (
                  <Badge className="bg-sentinel-red/10 text-sentinel-red border-sentinel-red/30 text-[10px]">
                    <AlertTriangle className="h-3 w-3 mr-1" />Emergency
                  </Badge>
                )}
                {flags.false_claim && (
                  <Badge className="bg-sentinel-amber/10 text-sentinel-amber border-sentinel-amber/30 text-[10px]">
                    <Flag className="h-3 w-3 mr-1" />False Claim
                  </Badge>
                )}
                {flags.coordinated && (
                  <Badge className="bg-sentinel-purple/10 text-sentinel-purple border-sentinel-purple/30 text-[10px]">
                    <Network className="h-3 w-3 mr-1" />Coordinated
                  </Badge>
                )}
                {flags.bot_likely && (
                  <Badge className="bg-muted text-muted-foreground border-border text-[10px]">Bot Likely</Badge>
                )}
                {statusInfo && (
                  <Badge variant="outline" className={`text-[10px] ${statusInfo.class}`}>
                    <statusInfo.icon className="h-3 w-3 mr-1" />{statusInfo.label}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-card-foreground line-clamp-2">{cleanPreview(m.content)}</p>
              {m.url && (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" /> View source
                </a>
              )}
            </div>
            <div className="flex items-start gap-3 shrink-0">
              <div className="text-right space-y-2">
                <Badge variant="outline" className={`text-[10px] ${severityColors[m.severity || "low"]}`}>{m.severity || "low"}</Badge>
                <div className={`text-xs font-medium ${sentimentColors[m.sentiment_label || "neutral"]}`}>{m.sentiment_label || "neutral"}</div>
                {(() => {
                  const reach = formatReachDisplay(m.author_follower_count, m.source);
                  if (!reach) return null;
                  return <div className="text-[10px] text-muted-foreground font-mono">{reach.value} {reach.label}</div>;
                })()}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] px-2 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={(e) => { e.stopPropagation(); navigate(`/respond?mention=${m.id}`); }}
                >
                  <MessageCircleReply className="h-3 w-3 mr-1" /> Draft Reply
                </Button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => e.stopPropagation()}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/mentions/${m.id}`)}>View Details</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/respond`)}>
                    <MessageCircleReply className="h-3.5 w-3.5 mr-2" /> Draft Response
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/people?search=${encodeURIComponent(m.author_name || m.author_handle || "")}`)}>
                    <User2 className="h-3.5 w-3.5 mr-2" /> View Author Profile
                  </DropdownMenuItem>
                  {mStatus !== "ignored" && <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "ignored")}><EyeOff className="h-3.5 w-3.5 mr-2" /> Ignore</DropdownMenuItem>}
                  {mStatus !== "snoozed" && <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "snoozed")}><Clock className="h-3.5 w-3.5 mr-2" /> Snooze</DropdownMenuItem>}
                  {mStatus !== "resolved" && <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "resolved")}><CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark Resolved</DropdownMenuItem>}
                  {mStatus !== "new" && <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "new")}>Reopen</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    const d = getDomain(m.url);
                    if (d !== "unknown") ignoreSource(d, `Ignored from mention by ${m.author_name || "unknown"}`);
                  }}>
                    <Ban className="h-3.5 w-3.5 mr-2" /> Ignore this source ({getDomain(m.url)})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => deleteMention(m.id)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mentions</h1>
          <p className="text-sm text-muted-foreground mt-1">All detected mentions across sources</p>
        </div>
        <Button onClick={() => setAddMentionOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Mention
        </Button>
      </div>

      <AddMentionDialog open={addMentionOpen} onOpenChange={setAddMentionOpen} onCreated={refetchMentions} />
      <SourceIntelSheet
        domain={sourceIntelDomain}
        open={sourceIntelOpen}
        onOpenChange={setSourceIntelOpen}
        onIgnore={(d) => ignoreSource(d, "Blocked from source intelligence panel")}
      />

      {/* Coordinated FUD / suspicious pattern warnings */}
      {coordWarnings.length > 0 && (
        <div className="space-y-2">
          {coordWarnings.map((w, i) => (
            <div key={i} className="rounded-lg bg-sentinel-amber/5 border border-sentinel-amber/20 overflow-hidden">
              <button
                className="w-full flex items-start gap-2 p-3 text-left hover:bg-sentinel-amber/10 transition-colors"
                onClick={() => setExpandedWarning(expandedWarning === i ? null : i)}
              >
                <AlertCircle className="h-4 w-4 text-sentinel-amber mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-sentinel-amber">Suspicious Pattern Detected</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{w.message}</p>
                </div>
                <ChevronRight className={`h-4 w-4 text-sentinel-amber shrink-0 mt-0.5 transition-transform ${expandedWarning === i ? "rotate-90" : ""}`} />
              </button>
              {expandedWarning === i && (
                <div className="px-3 pb-3 space-y-3 border-t border-sentinel-amber/10 pt-3">
                  {/* Content preview for duplicate warnings */}
                  {w.contentPreview && (
                    <div className="rounded-md bg-muted/40 p-2.5 border border-border">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Matching Content</p>
                      <p className="text-xs text-foreground italic">"{w.contentPreview}"</p>
                    </div>
                  )}
                  {/* Sources involved */}
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Sources Involved ({w.sources.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {w.sources.map(s => (
                        <Badge key={s} variant="outline" className="text-[10px] border-sentinel-amber/30 text-sentinel-amber cursor-pointer hover:bg-sentinel-amber/10" onClick={() => setDomainFilter(s)}>
                          <Globe className="h-2.5 w-2.5 mr-1" />{s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {/* Linked mentions */}
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Affected Mentions ({w.mentionIds.length})</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {w.mentionIds.slice(0, 10).map(mid => {
                        const m = filtered.find(x => x.id === mid);
                        if (!m) return null;
                        return (
                          <div
                            key={mid}
                            className="flex items-center gap-2 p-2 rounded-md bg-card border border-border hover:border-primary/30 cursor-pointer transition-colors"
                            onClick={() => navigate(`/mentions/${mid}`)}
                          >
                            <SourceBadge source={m.source} />
                            <span className="text-xs text-muted-foreground truncate">{getDomain(m.url)}</span>
                            <span className="text-xs text-foreground truncate flex-1">{cleanPreview(m.content).slice(0, 60)}</span>
                            <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                          </div>
                        );
                      })}
                      {w.mentionIds.length > 10 && (
                        <p className="text-[10px] text-muted-foreground pl-2">+ {w.mentionIds.length - 10} more</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(scanFilter || hasUrlFilters) && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm text-primary">
            {scanFilter ? "Filtered by scan run" : `Filtered: ${[
              sentimentFilter !== "all" ? sentimentFilter + " sentiment" : "",
              severityFilter !== "all" ? severityFilter + " severity" : "",
              daysParam ? `last ${daysParam} days` : "",
              statusFilter !== "active" ? statusFilter + " status" : "",
            ].filter(Boolean).join(", ")}`}
          </span>
          <Button size="sm" variant="ghost" onClick={clearScanFilter} className="h-6 px-2 text-xs">
            <ArrowLeft className="h-3 w-3 mr-1" /> Clear filters
          </Button>
        </div>
      )}

      <BulkActionsBar selectedCount={selected.size} onAction={handleBulkAction} onClear={() => setSelected(new Set())} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search mentions..." className="pl-9 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
            <SelectItem value="snoozed">Snoozed</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {uniqueSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as "detected" | "published")}>
          <SelectTrigger className="w-44">
            <ArrowUpDown className="h-3 w-3 mr-1 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="detected">Sort: Detected</SelectItem>
            <SelectItem value="published">Sort: Published</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sentiment</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
            <SelectItem value="mixed">Mixed</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={groupByNarrative ? "default" : "outline"}
          onClick={() => setGroupByNarrative(!groupByNarrative)}
          className="h-9 text-xs gap-1.5"
        >
          <Network className="h-3.5 w-3.5" /> Group by Theme
        </Button>
        <Button
          size="sm"
          variant={showSourcePanel ? "default" : "outline"}
          onClick={() => setShowSourcePanel(!showSourcePanel)}
          className="h-9 text-xs gap-1.5"
        >
          <BarChart3 className="h-3.5 w-3.5" /> Sources
          {ignoredSources.length > 0 && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1">{ignoredSources.length} blocked</Badge>
          )}
        </Button>
        <SavedFilters currentFilters={currentFilters} onApply={applyFilters} />
      </div>

      {/* Domain filter indicator */}
      {domainFilter && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
          <Globe className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-primary">Filtered to: <strong>{domainFilter}</strong></span>
          <Button size="sm" variant="ghost" onClick={() => setDomainFilter(null)} className="h-5 w-5 p-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Source Breakdown Panel */}
      {showSourcePanel && (
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" /> Source Breakdown
            </h3>
            <Button size="sm" variant="ghost" onClick={() => setShowSourcePanel(false)} className="h-6 w-6 p-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          
          {sourceBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground">No source data available.</p>
          ) : (
            <div className="space-y-1.5">
              {sourceBreakdown.map(([domain, stats]) => (
                <div key={domain} className="flex items-center gap-2 group">
                  <button
                    onClick={() => setDomainFilter(domainFilter === domain ? null : domain)}
                    className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                      domainFilter === domain ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
                    }`}
                  >
                    <SourceBadge source={stats.source} />
                    <span className="text-xs text-foreground truncate flex-1">{domain}</span>
                    <span className="text-xs font-mono text-muted-foreground">{stats.count}</span>
                    {stats.negCount > 0 && (
                      <span className="text-[10px] font-mono text-destructive">{stats.negCount} neg</span>
                    )}
                    {/* Bar */}
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(stats.count / (sourceBreakdown[0]?.[1]?.count || 1)) * 100}%` }}
                      />
                    </div>
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                        onClick={() => { setSourceIntelDomain(domain); setSourceIntelOpen(true); }}
                      >
                        <Sparkles className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>AI Source Intelligence</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={() => ignoreSource(domain)}
                      >
                        <Ban className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Block this source</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}

          {/* Ignored Sources */}
          {ignoredSources.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Ban className="h-3 w-3" /> Blocked Sources ({ignoredSources.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {ignoredSources.map(s => (
                  <Badge
                    key={s.domain}
                    variant="outline"
                    className="text-[10px] text-muted-foreground cursor-pointer hover:border-destructive/30 hover:text-foreground transition-colors"
                    onClick={() => unignoreSource(s.domain)}
                    title="Click to unblock"
                  >
                    <Ban className="h-2.5 w-2.5 mr-1" /> {s.domain} ×
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Select all */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selected.size === filtered.length && filtered.length > 0}
            onCheckedChange={selectAll}
            className="h-4 w-4"
          />
          <span className="text-xs text-muted-foreground">Select all ({filtered.length})</span>
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <MessageSquareWarning className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {statusFilter !== "active" ? "No matches" : "No mentions yet"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              {statusFilter !== "active"
                ? "No mentions match this filter. Try adjusting your criteria."
                : "Run your first scan to start detecting mentions across news, social media, and forums."}
            </p>
            {statusFilter === "active" && (
              <Button onClick={() => navigate("/scans")}>
                <Scan className="h-4 w-4 mr-2" /> Run First Scan
              </Button>
            )}
          </div>
        ) : groupByNarrative && narrativeGroups ? (
          <>
            {/* Grouped by narrative */}
            {Object.entries(narrativeGroups.groups).map(([narrativeId, group]) => {
              const groupMentions = filtered.filter(m => group.mentionIds.has(m.id));
              if (groupMentions.length === 0) return null;
              const isCollapsed = collapsedGroups.has(narrativeId);
              return (
                <div key={narrativeId} className="space-y-2">
                  <button
                    onClick={() => toggleGroupCollapse(narrativeId)}
                    className="flex items-center gap-2 w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <Network className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium text-foreground">{group.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{groupMentions.length}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-6 text-[10px] text-primary"
                      onClick={(e) => { e.stopPropagation(); navigate(`/narratives`); }}
                    >
                      View Narrative →
                    </Button>
                  </button>
                  {!isCollapsed && groupMentions.map(renderMention)}
                </div>
              );
            })}
            {/* Ungrouped mentions */}
            {narrativeGroups.ungroupedIds.size > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2">
                  <span className="text-sm font-medium text-muted-foreground">Unclustered</span>
                  <Badge variant="secondary" className="text-[10px]">{narrativeGroups.ungroupedIds.size}</Badge>
                </div>
                {filtered.filter(m => narrativeGroups.ungroupedIds.has(m.id)).map(renderMention)}
              </div>
            )}
          </>
        ) : (
          filtered.map(renderMention)
        )}
      </div>

      {/* Load More */}
      {hasMore && !loading && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="gap-2">
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loadingMore ? "Loading..." : `Load more mentions`}
          </Button>
        </div>
      )}
    </div>
  );
}
