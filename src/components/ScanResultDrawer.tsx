import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Info, Clock, ExternalLink, Search, Brain, Filter, Copy } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface ScanRun {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  status: string | null;
  total_mentions: number | null;
  negative_pct: number | null;
  emergencies_count: number | null;
  config_snapshot: any;
  result_snapshot: any;
}

interface Props {
  run: ScanRun | null;
  onClose: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  "web-brand": "Web (brand keywords)",
  "web-risk": "Web (risk keywords)",
  "google-news": "Google News",
  "reddit-api": "Reddit API",
  "reddit-web": "Reddit (web fallback)",
  "social-web": "Social (web)",
  "twitter": "X (Twitter)",
  "youtube-api": "YouTube API",
  "youtube-web": "YouTube (web fallback)",
  "reviews": "Review Sites",
  "app-store": "App Store",
  "podcasts": "Podcasts",
};

function StatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "completed": return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Completed</Badge>;
    case "running": return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse">Running</Badge>;
    case "failed": return <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Failed</Badge>;
    default: return <Badge variant="outline">Pending</Badge>;
  }
}

function StatBlock({ label, value, highlight }: { label: string; value: number | string; highlight?: "red" | "amber" | "green" | "none" }) {
  const colors = {
    red: "text-red-400",
    amber: "text-amber-400",
    green: "text-emerald-400",
    none: "text-foreground",
  };
  return (
    <div className="text-center p-3 rounded-lg border border-border bg-muted/20">
      <div className={`text-2xl font-bold font-mono ${colors[highlight || "none"]}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default function ScanResultDrawer({ run, onClose }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();

  if (!run) return null;

  const snap = run.result_snapshot as any;
  const config = run.config_snapshot as any;
  const hasSnap = !!snap;

  const scanLog: { source: string; query: string; found: number }[] = snap?.scan_log || [];
  const kwGroups = snap?.keyword_groups || config?.keyword_groups || {};
  const errors: string[] = snap?.errors || [];
  const zeroReason: string = snap?.zero_reason || "";
  const totalFound = snap?.total_found ?? 0;
  const qualityFiltered = snap?.quality_filtered ?? 0;
  const aiRejected = snap?.ai_rejected ?? 0;
  const dupeSkipped = snap?.duplicates_skipped ?? 0;
  const mentionsSaved = snap?.mentions_saved ?? run.total_mentions ?? 0;
  const rejReasons: string[] = snap?.relevance_rejections || [];

  const duration = run.started_at && run.finished_at
    ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null;

  const copyId = () => {
    navigator.clipboard.writeText(run.id);
    toast({ title: "Scan ID copied" });
  };

  return (
    <Sheet open={!!run} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-base font-semibold">Scan Details</SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {run.started_at ? format(new Date(run.started_at), "MMM d, yyyy h:mm a") : "—"}
                {duration !== null && ` · ${duration}s`}
              </p>
            </div>
            <StatusBadge status={run.status} />
          </div>
        </SheetHeader>

        <div className="py-5 space-y-6">

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            <StatBlock label="Found" value={totalFound} />
            <StatBlock label="Filtered" value={qualityFiltered} highlight={qualityFiltered > totalFound * 0.5 ? "amber" : "none"} />
            <StatBlock label="Saved" value={mentionsSaved} highlight={mentionsSaved > 0 ? "green" : "none"} />
            <StatBlock label="Emergencies" value={run.emergencies_count ?? 0} highlight={(run.emergencies_count ?? 0) > 0 ? "red" : "none"} />
          </div>

          {/* View Mentions button */}
          {mentionsSaved > 0 && (
            <Button variant="outline" className="w-full" onClick={() => { onClose(); navigate(`/mentions?scan=${run.id}`); }}>
              <ExternalLink className="h-4 w-4 mr-2" /> View {mentionsSaved} Mention{mentionsSaved !== 1 ? "s" : ""}
            </Button>
          )}

          {/* Zero results explanation */}
          {mentionsSaved === 0 && zeroReason && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-400">No mentions saved</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{zeroReason}</p>
              </div>
            </div>
          )}

          {/* Filter funnel */}
          {hasSnap && totalFound > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" /> Filter Funnel
              </h3>
              <div className="space-y-2">
                {[
                  { label: "Raw results from sources", value: totalFound, icon: Search },
                  { label: "After quality filter (junk/short/blocked)", value: totalFound - qualityFiltered, icon: Filter },
                  { label: "After AI relevance filter", value: Math.max(0, totalFound - qualityFiltered - aiRejected), icon: Brain },
                  { label: "After duplicate check", value: Math.max(0, totalFound - qualityFiltered - aiRejected - dupeSkipped), icon: CheckCircle2 },
                  { label: "Saved to mentions", value: mentionsSaved, icon: CheckCircle2 },
                ].map((step, i, arr) => {
                  const pct = totalFound > 0 ? Math.round((step.value / totalFound) * 100) : 0;
                  const isLast = i === arr.length - 1;
                  return (
                    <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg ${isLast && mentionsSaved > 0 ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-muted/20 border border-border/50"}`}>
                      <step.icon className={`h-3.5 w-3.5 shrink-0 ${isLast && mentionsSaved > 0 ? "text-emerald-400" : "text-muted-foreground"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{step.label}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${isLast && mentionsSaved > 0 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-mono text-foreground w-8 text-right">{step.value}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Source breakdown */}
          {scanLog.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source Breakdown</h3>
              <div className="space-y-1.5">
                {scanLog.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 border border-border/50">
                    <span className="text-xs text-foreground">{SOURCE_LABEL[entry.source] || entry.source}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono ${entry.found === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                        {entry.found} raw
                      </span>
                      {entry.found === 0 && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">no results</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Keywords used */}
          {(kwGroups.brand?.length > 0 || kwGroups.risk?.length > 0) && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Keywords Used</h3>
              <div className="space-y-2">
                {kwGroups.brand?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5 uppercase">Brand</p>
                    <div className="flex flex-wrap gap-1">
                      {kwGroups.brand.map((kw: string) => (
                        <Badge key={kw} variant="secondary" className="text-xs font-normal">{kw}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {kwGroups.risk?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5 uppercase">Risk</p>
                    <div className="flex flex-wrap gap-1">
                      {kwGroups.risk.map((kw: string) => (
                        <Badge key={kw} variant="outline" className="text-xs font-normal border-amber-500/30 text-amber-400">{kw}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI rejection reasons */}
          {rejReasons.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" /> AI Rejection Reasons (top {Math.min(rejReasons.length, 5)})
              </h3>
              <div className="space-y-1">
                {rejReasons.slice(0, 5).map((reason, i) => (
                  <div key={i} className="text-xs text-muted-foreground px-3 py-2 rounded-md bg-muted/20 border border-border/50">
                    {reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-red-400" /> Source Errors
              </h3>
              <div className="space-y-1">
                {errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-400 px-3 py-2 rounded-md bg-red-500/5 border border-red-500/20">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {err}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Config */}
          {config?.sources && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scan Config</h3>
              <div className="text-xs text-muted-foreground space-y-1.5 p-3 rounded-lg bg-muted/20 border border-border/50">
                <p><span className="text-foreground font-medium">Sources:</span> {(config.sources as string[]).join(", ")}</p>
                {config.date_from && <p><span className="text-foreground font-medium">From:</span> {format(new Date(config.date_from), "MMM d, yyyy")}</p>}
                {config.date_to && <p><span className="text-foreground font-medium">To:</span> {format(new Date(config.date_to), "MMM d, yyyy")}</p>}
                {config.sentiment_filter && config.sentiment_filter !== "all" && <p><span className="text-foreground font-medium">Sentiment filter:</span> {config.sentiment_filter}</p>}
              </div>
            </div>
          )}

          {/* Scan ID */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border">
            <span className="font-mono">{run.id}</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={copyId}>
              <Copy className="h-3 w-3 mr-1" /> Copy ID
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
