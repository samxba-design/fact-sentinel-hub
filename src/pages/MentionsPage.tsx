import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, AlertTriangle, Flag, MoreVertical, EyeOff, Clock, CheckCircle2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

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
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const scanFilter = searchParams.get("scan");

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    let query = supabase
      .from("mentions")
      .select("id, source, author_name, author_handle, content, sentiment_label, severity, posted_at, author_follower_count, flags, status, scan_run_id")
      .eq("org_id", currentOrg.id)
      .order("posted_at", { ascending: false })
      .limit(200);

    if (scanFilter) {
      query = query.eq("scan_run_id", scanFilter);
    }

    query.then(({ data }) => {
      setMentions(data || []);
      setLoading(false);
    });
  }, [currentOrg, scanFilter]);

  const updateMentionStatus = async (mentionId: string, newStatus: string) => {
    const { error } = await supabase.from("mentions").update({ status: newStatus }).eq("id", mentionId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMentions(prev => prev.map(m => m.id === mentionId ? { ...m, status: newStatus } : m));
      toast({ title: `Mention ${newStatus}` });
    }
  };

  const filtered = mentions.filter(m => {
    // Status filter
    const mStatus = m.status || "new";
    if (statusFilter === "active" && (mStatus === "ignored" || mStatus === "snoozed" || mStatus === "resolved")) return false;
    if (statusFilter !== "active" && statusFilter !== "all" && mStatus !== statusFilter) return false;

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      return m.content?.toLowerCase().includes(q) || m.author_name?.toLowerCase().includes(q);
    }
    return true;
  });

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
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mentions</h1>
        <p className="text-sm text-muted-foreground mt-1">All detected mentions across sources</p>
      </div>

      {scanFilter && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm text-primary">Filtered by scan run</span>
          <Button size="sm" variant="ghost" onClick={clearScanFilter} className="h-6 px-2 text-xs">
            <ArrowLeft className="h-3 w-3 mr-1" /> Show all mentions
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search mentions..." className="pl-9 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
            <SelectItem value="snoozed">Snoozed</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
        ) : filtered.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {statusFilter !== "active" ? "No mentions match this filter." : "No mentions found. Run a scan to start collecting data."}
            </p>
          </Card>
        ) : (
          filtered.map(m => {
            const flags = m.flags as any || {};
            const mStatus = m.status || "new";
            const statusInfo = statusLabels[mStatus];
            return (
              <Card
                key={m.id}
                className={`bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer ${
                  mStatus === "ignored" ? "opacity-50" : mStatus === "snoozed" ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className="flex-1 space-y-2 min-w-0"
                    onClick={() => navigate(`/mentions/${m.id}`)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{m.source}</Badge>
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
                          <statusInfo.icon className="h-3 w-3 mr-1" />
                          {statusInfo.label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-card-foreground line-clamp-2">{m.content || "No content"}</p>
                  </div>
                  <div className="flex items-start gap-3 shrink-0">
                    <div className="text-right space-y-2">
                      <Badge variant="outline" className={`text-[10px] ${severityColors[m.severity || "low"]}`}>
                        {m.severity || "low"}
                      </Badge>
                      <div className={`text-xs font-medium ${sentimentColors[m.sentiment_label || "neutral"]}`}>{m.sentiment_label || "neutral"}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{formatReach(m.author_follower_count)} reach</div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/mentions/${m.id}`)}>
                          View Details
                        </DropdownMenuItem>
                        {mStatus !== "ignored" && (
                          <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "ignored")}>
                            <EyeOff className="h-3.5 w-3.5 mr-2" /> Ignore
                          </DropdownMenuItem>
                        )}
                        {mStatus !== "snoozed" && (
                          <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "snoozed")}>
                            <Clock className="h-3.5 w-3.5 mr-2" /> Snooze
                          </DropdownMenuItem>
                        )}
                        {mStatus !== "resolved" && (
                          <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "resolved")}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark Resolved
                          </DropdownMenuItem>
                        )}
                        {mStatus !== "new" && (
                          <DropdownMenuItem onClick={() => updateMentionStatus(m.id, "new")}>
                            Reopen
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
