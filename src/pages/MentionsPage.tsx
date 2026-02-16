import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, AlertTriangle, Flag, MoreVertical, EyeOff, Clock, CheckCircle2, ArrowLeft, MessageCircleReply, ExternalLink, Siren, Scan, MessageSquareWarning, Plus, Trash2 } from "lucide-react";
import SourceBadge from "@/components/SourceBadge";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import BulkActionsBar from "@/components/mentions/BulkActionsBar";
import SavedFilters from "@/components/mentions/SavedFilters";
import AddMentionDialog from "@/components/mentions/AddMentionDialog";

interface Mention {
  id: string;
  source: string;
  author_name: string | null;
  author_handle: string | null;
  content: string | null;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
  author_follower_count: number | null;
  flags: any;
  status: string | null;
  scan_run_id: string | null;
  url: string | null;
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

export default function MentionsPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addMentionOpen, setAddMentionOpen] = useState(false);

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

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    let query = supabase
      .from("mentions")
      .select("id, source, author_name, author_handle, content, sentiment_label, severity, posted_at, author_follower_count, flags, status, scan_run_id, url")
      .eq("org_id", currentOrg.id)
      .order("posted_at", { ascending: false })
      .limit(200);

    if (scanFilter) query = query.eq("scan_run_id", scanFilter);

    // Apply days filter from URL param
    if (daysParam) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(daysParam, 10));
      query = query.gte("posted_at", daysAgo.toISOString());
    }

    query.then(({ data }) => {
      setMentions(data || []);
      setLoading(false);
    });
  }, [currentOrg, scanFilter, daysParam]);

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

  // Clean junk content for preview
  const cleanPreview = (raw: string | null): string => {
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

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(m => m.id)));
    }
  };

  const filtered = mentions.filter(m => {
    const mStatus = m.status || "new";
    if (statusFilter === "active" && (mStatus === "ignored" || mStatus === "snoozed" || mStatus === "resolved")) return false;
    if (statusFilter !== "active" && statusFilter !== "all" && mStatus !== statusFilter) return false;
    if (severityFilter !== "all" && m.severity !== severityFilter) return false;
    if (sentimentFilter !== "all" && m.sentiment_label !== sentimentFilter) return false;
    if (sourceFilter !== "all" && m.source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.content?.toLowerCase().includes(q) || m.author_name?.toLowerCase().includes(q);
    }
    return true;
  });

  const uniqueSources = [...new Set(mentions.map(m => m.source))];

  const formatReach = (count: number | null) => {
    if (!count) return "0";
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return String(count);
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
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
    if (!currentOrg) return;
    setLoading(true);
    let query = supabase
      .from("mentions")
      .select("id, source, author_name, author_handle, content, sentiment_label, severity, posted_at, author_follower_count, flags, status, scan_run_id, url")
      .eq("org_id", currentOrg.id)
      .order("posted_at", { ascending: false })
      .limit(200);
    if (scanFilter) query = query.eq("scan_run_id", scanFilter);
    if (daysParam) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(daysParam, 10));
      query = query.gte("posted_at", daysAgo.toISOString());
    }
    query.then(({ data }) => { setMentions(data || []); setLoading(false); });
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
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {uniqueSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
        <SavedFilters currentFilters={currentFilters} onApply={applyFilters} />
      </div>

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
        ) : (
          filtered.map(m => {
            const flags = m.flags as any || {};
            const mStatus = m.status || "new";
            const statusInfo = statusLabels[mStatus];
            const isSelected = selected.has(m.id);
            return (
              <Card
                key={m.id}
                className={`bg-card border-border p-5 hover:border-primary/30 transition-colors ${
                  mStatus === "ignored" ? "opacity-50" : mStatus === "snoozed" ? "opacity-70" : ""
                } ${isSelected ? "ring-1 ring-primary/40" : ""}`}
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
                        <span className="text-xs text-muted-foreground">by {m.author_name || m.author_handle || "Unknown"}</span>
                        <span className="text-xs text-muted-foreground">· {timeAgo(m.posted_at)}</span>
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
                        <div className="text-[10px] text-muted-foreground font-mono">{formatReach(m.author_follower_count)} reach</div>
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
                          {mStatus !== "ignored" && <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "ignored")}><EyeOff className="h-3.5 w-3.5 mr-2" /> Ignore</DropdownMenuItem>}
                          {mStatus !== "snoozed" && <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "snoozed")}><Clock className="h-3.5 w-3.5 mr-2" /> Snooze</DropdownMenuItem>}
                          {mStatus !== "resolved" && <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "resolved")}><CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark Resolved</DropdownMenuItem>}
                          {mStatus !== "new" && <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "new")}>Reopen</DropdownMenuItem>}
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
          })
        )}
      </div>
    </div>
  );
}
