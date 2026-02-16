import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Scan, Plus, Clock, CheckCircle2, XCircle, Loader2, Zap, Calendar, ExternalLink, Trash2, AlertTriangle, Info, Sparkles, Brain, Network, Settings2, Filter } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import UpgradeBanner from "@/components/UpgradeBanner";

interface ScanRun {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  status: string | null;
  total_mentions: number | null;
  negative_pct: number | null;
  emergencies_count: number | null;
  config_snapshot: any;
}

const statusConfig: Record<string, { icon: any; className: string }> = {
  completed: { icon: CheckCircle2, className: "text-sentinel-emerald" },
  running: { icon: Loader2, className: "text-sentinel-cyan animate-spin" },
  failed: { icon: XCircle, className: "text-sentinel-red" },
  pending: { icon: Clock, className: "text-muted-foreground" },
};

const ALL_SOURCES = ["twitter", "reddit", "youtube", "news", "blogs", "forums", "reviews", "google-news"];

// Sources that need API keys from the user
const SOURCES_NEEDING_KEYS: Record<string, string> = {
  twitter: "X (Twitter)",
  reddit: "Reddit",
  youtube: "YouTube",
};

const SOURCE_LABELS: Record<string, string> = {
  twitter: "X (Twitter)",
  reddit: "Reddit",
  youtube: "YouTube",
  news: "News",
  blogs: "Blogs",
  forums: "Forums",
  reviews: "Review Sites",
  "google-news": "Google News",
};

export default function ScansPage() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>("");
  const [scanResult, setScanResult] = useState<{ mentions: number; emergencies: number; narratives: number; scan_run_id: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [autoScanning, setAutoScanning] = useState(false);
  const [scanDatePickerOpen, setScanDatePickerOpen] = useState(false);
  const [scanDateRange, setScanDateRange] = useState<string>("7days");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [customSentimentFilter, setCustomSentimentFilter] = useState<string>("all");
  // Builder state
  const [selectedSources, setSelectedSources] = useState<string[]>(["news"]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState("daily");

  const fetchRuns = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase
      .from("scan_runs")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setRuns(data || []);
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Auto scan with date range
  const runAutoScan = async (dateRange?: string) => {
    if (!currentOrg) return;
    setAutoScanning(true);
    setScanProgress("Preparing intelligent auto-scan...");
    try {
      const [kwRes, provRes, customSourcesRes] = await Promise.all([
        supabase.from("keywords").select("value").eq("org_id", currentOrg.id).limit(50),
        supabase.from("org_api_keys").select("provider").eq("org_id", currentOrg.id),
        supabase.from("sources").select("type").eq("org_id", currentOrg.id).eq("enabled", true),
      ]);

      const autoKeywords = (kwRes.data || []).map(k => k.value);
      if (autoKeywords.length === 0) {
        toast({ title: "No keywords configured", description: "Add keywords in Settings first so the scan knows what to look for.", variant: "destructive" });
        setAutoScanning(false);
        setScanProgress("");
        return;
      }

      const connectedProviders = [...new Set((provRes.data || []).map(k => k.provider))];
      const customTypes = (customSourcesRes.data || []).map(s => s.type);

      const autoSources = ["news", "blogs", "forums", "reviews", "google-news"];
      if (connectedProviders.includes("twitter")) autoSources.push("twitter");
      if (connectedProviders.includes("reddit")) autoSources.push("reddit");
      if (connectedProviders.includes("youtube")) autoSources.push("youtube");
      customTypes.forEach(t => { if (!autoSources.includes(t)) autoSources.push(t); });

      const now = new Date();
      const range = dateRange || scanDateRange;
      let dateFrom: Date;
      switch (range) {
        case "today":
          dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "7days":
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30days":
          dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      }

      setTimeout(() => setScanProgress("Scanning all connected sources..."), 1500);
      setTimeout(() => setScanProgress("Analyzing sentiment & detecting threats..."), 4000);
      setTimeout(() => setScanProgress("Detecting coordinated patterns & clustering narratives..."), 7000);

      const { data, error } = await supabase.functions.invoke("run-scan", {
        body: {
          org_id: currentOrg.id,
          keywords: autoKeywords,
          sources: autoSources,
          date_from: dateFrom.toISOString(),
          date_to: now.toISOString(),
          sentiment_filter: sentimentFilter,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const totalFound = data.total_found || data.mentions_created || 0;
      const filtered = data.filtered_out || 0;
      const dupes = data.duplicates_removed || 0;
      const aiFiltered = data.ai_filtered || 0;
      const created = data.mentions_created || 0;

      const details = [
        `${created} mentions saved`,
        totalFound > created ? `${totalFound} total found` : null,
        filtered > 0 ? `${filtered} filtered (junk/out-of-range)` : null,
        dupes > 0 ? `${dupes} duplicates removed` : null,
        aiFiltered > 0 ? `${aiFiltered} removed by AI quality filter` : null,
      ].filter(Boolean).join(" · ");

      toast({
        title: "Auto-scan complete!",
        description: details,
      });
      setScanProgress("");
      setScanDatePickerOpen(false);
      fetchRuns();
    } catch (err: any) {
      toast({ title: "Auto-scan failed", description: err.message, variant: "destructive" });
      setScanProgress("");
    } finally {
      setAutoScanning(false);
    }
  };

  // Load org keywords and check connected providers when builder opens
  useEffect(() => {
    if (!builderOpen || !currentOrg) return;
    // Load keywords
    supabase
      .from("keywords")
      .select("value")
      .eq("org_id", currentOrg.id)
      .limit(20)
      .then(({ data }) => {
        if (data && data.length > 0 && keywords.length === 0) {
          setKeywords(data.map(k => k.value));
        }
      });
    // Check which providers are connected
    supabase
      .from("org_api_keys")
      .select("provider")
      .eq("org_id", currentOrg.id)
      .then(({ data }) => {
        const providers = [...new Set((data || []).map(k => k.provider))];
        setConnectedProviders(providers);
      });
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (!dateFrom) setDateFrom(weekAgo.toISOString().split("T")[0]);
    if (!dateTo) setDateTo(now.toISOString().split("T")[0]);
  }, [builderOpen, currentOrg]);

  const toggleSource = (s: string) => {
    setSelectedSources(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords(prev => [...prev, kw]);
    }
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    setKeywords(prev => prev.filter(x => x !== kw));
  };

  const runScan = async () => {
    if (!currentOrg) return;
    setScanning(true);
    setScanProgress("Connecting to sources...");
    setScanResult(null);
    try {
      // Simulate progress stages
      setTimeout(() => setScanProgress("Crawling web content..."), 1500);
      setTimeout(() => setScanProgress("Analyzing sentiment & severity..."), 4000);
      setTimeout(() => setScanProgress("Clustering narratives..."), 7000);

      const { data, error } = await supabase.functions.invoke("run-scan", {
        body: {
          org_id: currentOrg.id,
          keywords,
          sources: selectedSources,
          date_from: dateFrom,
          date_to: dateTo,
          sentiment_filter: customSentimentFilter,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setScanResult({
        mentions: data.mentions_created || 0,
        emergencies: data.emergencies || 0,
        narratives: data.narratives_created || 0,
        scan_run_id: data.scan_run_id || "",
      });
      setScanProgress("");

      // Save schedule if enabled
      if (scheduleEnabled) {
        await supabase
          .from("tracking_profiles")
          .upsert({
            org_id: currentOrg.id,
            scan_schedule: scheduleInterval,
          }, { onConflict: "org_id" });

        // Also save selected sources
        const existingSources = await supabase.from("sources").select("type").eq("org_id", currentOrg.id);
        const existingTypes = (existingSources.data || []).map((s: any) => s.type);
        const newSources = selectedSources.filter(s => !existingTypes.includes(s));
        if (newSources.length > 0) {
          await supabase.from("sources").insert(
            newSources.map(s => ({ org_id: currentOrg.id, type: s, enabled: true }))
          );
        }

        toast({ title: "Schedule saved", description: `Scans will run every ${scheduleInterval}.` });
      }
      fetchRuns();
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
      setScanProgress("");
    } finally {
      setScanning(false);
    }
  };

  const deleteScan = async (scanId: string) => {
    setDeleting(true);
    try {
      // Delete mentions from this scan first, then the scan run
      await supabase.from("mentions").delete().eq("scan_run_id", scanId);
      const { error } = await supabase.from("scan_runs").delete().eq("id", scanId);
      if (error) throw error;
      setRuns(prev => prev.filter(r => r.id !== scanId));
      toast({ title: "Scan deleted", description: "Scan and its mentions have been removed." });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const deleteAllScans = async () => {
    if (!currentOrg) return;
    setDeleting(true);
    try {
      // Delete all mentions from scans, then all scan runs
      const scanIds = runs.map(r => r.id);
      if (scanIds.length > 0) {
        await supabase.from("mentions").delete().in("scan_run_id", scanIds);
      }
      await supabase.from("scan_runs").delete().eq("org_id", currentOrg.id);
      setRuns([]);
      toast({ title: "All scans deleted", description: "All scan data has been reset." });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteAllOpen(false);
    }
  };

  const formatDate = (d: string | null) =>
    d ? format(new Date(d), "MMM d, yyyy h:mm a") : "—";

  return (
    <div className="space-y-6 animate-fade-up">
      <UpgradeBanner feature="Unlimited Scans" className="mb-2" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scans</h1>
          <p className="text-sm text-muted-foreground mt-1">Run and manage source scans</p>
        </div>
        <div className="flex items-center gap-2">
          {runs.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setDeleteAllOpen(true)} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />Reset All
            </Button>
          )}
          <Button variant="outline" onClick={() => setBuilderOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Custom Scan
          </Button>
          <Button onClick={() => setScanDatePickerOpen(true)} disabled={autoScanning || scanning} className="gap-2">
            {autoScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {autoScanning ? "Scanning..." : "Auto Scan"}
          </Button>
        </div>
      </div>

      <PageGuide
        title="How Scans Work"
        subtitle="Search the web, social media, forums, and review sites for mentions of your brand"
        steps={[
          {
            icon: <Sparkles className="h-4 w-4 text-primary" />,
            title: "Auto Scan",
            description: "One click to scan all connected sources using all your tracked keywords. The fastest way to get comprehensive coverage.",
          },
          {
            icon: <Settings2 className="h-4 w-4 text-primary" />,
            title: "Custom Scan",
            description: "Build a targeted scan with specific keywords, sources, and date ranges. Great for investigating specific topics.",
          },
          {
            icon: <Brain className="h-4 w-4 text-primary" />,
            title: "AI Analysis",
            description: "Each scan runs AI sentiment analysis, severity scoring, and narrative clustering. Results feed into Mentions, Narratives, and Risk Console.",
          },
        ]}
        integrations={[
          { label: "Mentions", to: "/mentions", description: "Scan results become mentions" },
          { label: "Narratives", to: "/narratives", description: "AI clusters into narratives" },
          { label: "Risk Console", to: "/risk-console", description: "High-severity alerts" },
          { label: "Settings → Sources", to: "/settings?tab=sources", description: "Connect Twitter, Reddit, YouTube" },
        ]}
        tip="Connect Twitter, Reddit, or YouTube API keys in Settings → Sources to expand scan coverage beyond free web sources. Schedule recurring scans for hands-free monitoring."
      />

      {/* Auto-scan progress banner */}
      {autoScanning && scanProgress && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-card-foreground font-medium">{scanProgress}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Running full auto-scan across all connected sources with all tracked keywords</p>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
              <div className="h-full rounded-full bg-primary animate-pulse" style={{ width: "60%", transition: "width 1s" }} />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Scan className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No scans yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Run an auto-scan to instantly search all connected sources with your tracked keywords, or build a custom scan with specific parameters.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => setScanDatePickerOpen(true)} disabled={autoScanning} className="gap-2">
                {autoScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {autoScanning ? "Scanning..." : "Auto Scan — Full Coverage"}
              </Button>
              <Button variant="outline" onClick={() => setBuilderOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Custom Scan
              </Button>
            </div>
          </div>
        ) : (
          runs.map(run => {
            const sc = statusConfig[run.status || "pending"];
            const StatusIcon = sc.icon;
            return (
              <Card
                key={run.id}
                className="bg-card border-border p-5 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-4 flex-1 cursor-pointer"
                    onClick={() => navigate(`/mentions?scan=${run.id}`)}
                  >
                    <Scan className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-card-foreground">
                        {formatDate(run.started_at)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span className="capitalize">{run.status}</span>
                        {run.config_snapshot?.sources && (
                          <span>· {(run.config_snapshot.sources as string[]).join(", ")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm font-mono text-card-foreground">{run.total_mentions ?? 0}</div>
                      <div className="text-[10px] text-muted-foreground">mentions</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-mono ${(run.negative_pct ?? 0) > 10 ? "text-sentinel-amber" : "text-card-foreground"}`}>
                        {Number(run.negative_pct ?? 0).toFixed(0)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">negative</div>
                    </div>
                    {(run.emergencies_count ?? 0) > 0 && (
                      <Badge variant="outline" className="border-sentinel-red/30 text-sentinel-red text-[10px]">
                        {run.emergencies_count} emergency
                      </Badge>
                    )}
                    <div className="flex items-center gap-1.5">
                      <StatusIcon className={`h-4 w-4 ${sc.className}`} />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(run.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Delete single scan confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Scan</DialogTitle>
            <DialogDescription>
              This will permanently delete this scan and all its associated mentions. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteScan(deleteTarget)} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete all scans confirmation */}
      <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset All Scans</DialogTitle>
            <DialogDescription>
              This will permanently delete all {runs.length} scans and their associated mentions. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={deleteAllScans} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scan Builder Dialog */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              New Scan
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Date Range */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Date Range
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Sources */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Sources</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_SOURCES.map(s => {
                  const needsKey = s in SOURCES_NEEDING_KEYS;
                  const isConnected = !needsKey || connectedProviders.includes(s);
                  return (
                    <label
                      key={s}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors text-xs capitalize ${
                        selectedSources.includes(s)
                          ? isConnected
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-sentinel-amber/10 border-sentinel-amber/30 text-sentinel-amber"
                          : "bg-muted/30 border-border text-muted-foreground hover:border-primary/20"
                      }`}
                    >
                      <Checkbox
                        checked={selectedSources.includes(s)}
                        onCheckedChange={() => toggleSource(s)}
                        className="h-3.5 w-3.5"
                      />
                      {SOURCE_LABELS[s] || s}
                      {needsKey && !isConnected && (
                        <AlertTriangle className="h-3 w-3 text-sentinel-amber" />
                      )}
                      {needsKey && isConnected && (
                        <CheckCircle2 className="h-3 w-3 text-sentinel-emerald" />
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Warning for unconnected sources */}
              {selectedSources.some(s => s in SOURCES_NEEDING_KEYS && !connectedProviders.includes(s)) && (
                <div className="flex items-start gap-2 rounded-md bg-sentinel-amber/10 border border-sentinel-amber/20 p-3 mt-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-sentinel-amber mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      <strong className="text-card-foreground">API keys required:</strong>{" "}
                      {selectedSources
                        .filter(s => s in SOURCES_NEEDING_KEYS && !connectedProviders.includes(s))
                        .map(s => SOURCES_NEEDING_KEYS[s])
                        .join(", ")}{" "}
                      {selectedSources.filter(s => s in SOURCES_NEEDING_KEYS && !connectedProviders.includes(s)).length === 1 ? "requires" : "require"} API credentials.
                    </p>
                    <p>Go to <strong>Settings → Connections</strong> to connect your accounts. Without credentials, these sources will be skipped.</p>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary" onClick={() => { setBuilderOpen(false); navigate("/settings?tab=connections"); }}>
                      Go to Connections →
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Keywords */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Keywords</Label>
              <div className="flex gap-2">
                <Input
                  value={keywordInput}
                  onChange={e => setKeywordInput(e.target.value)}
                  placeholder="Add a keyword..."
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={addKeyword} disabled={!keywordInput.trim()}>
                  Add
                </Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {keywords.map(kw => (
                    <Badge
                      key={kw}
                      variant="secondary"
                      className="text-xs cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors"
                      onClick={() => removeKeyword(kw)}
                    >
                      {kw} ×
                    </Badge>
                  ))}
                </div>
              )}
              {keywords.length === 0 && (
                <p className="text-xs text-muted-foreground">Your org's keywords will be loaded automatically.</p>
              )}
            </div>

            <Separator />

            {/* Sentiment Filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="h-3 w-3" /> Sentiment Filter
              </Label>
              <div className="flex gap-2">
                {[
                  { value: "all", label: "All", desc: "Everything" },
                  { value: "negative", label: "Negative", desc: "Threats & risks" },
                  { value: "positive", label: "Positive", desc: "Good coverage" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setCustomSentimentFilter(opt.value)}
                    className={`flex-1 px-3 py-2 text-xs rounded-md border transition-colors ${
                      customSentimentFilter === opt.value
                        ? opt.value === "negative" ? "bg-destructive/10 border-destructive/30 text-destructive"
                        : opt.value === "positive" ? "bg-sentinel-emerald/10 border-sentinel-emerald/30 text-sentinel-emerald"
                        : "bg-primary/10 border-primary/30 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/20"
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-[10px] opacity-70">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Scan Progress */}
            {scanning && scanProgress && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-card-foreground font-medium">{scanProgress}</p>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
                    <div className="h-full rounded-full bg-primary animate-pulse" style={{ width: "60%", transition: "width 1s" }} />
                  </div>
                </div>
              </div>
            )}

            {/* Scan Result Summary */}
            {scanResult && !scanning && (
              <div className="space-y-3 p-4 rounded-lg bg-sentinel-emerald/5 border border-sentinel-emerald/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-sentinel-emerald" />
                  <span className="text-sm font-medium text-sentinel-emerald">Scan Complete</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-xl font-bold font-mono text-card-foreground">{scanResult.mentions}</div>
                    <div className="text-[10px] text-muted-foreground">Mentions Found</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-xl font-bold font-mono ${scanResult.emergencies > 0 ? "text-sentinel-red" : "text-card-foreground"}`}>{scanResult.emergencies}</div>
                    <div className="text-[10px] text-muted-foreground">Emergencies</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold font-mono text-card-foreground">{scanResult.narratives}</div>
                    <div className="text-[10px] text-muted-foreground">Narratives</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setBuilderOpen(false); setScanResult(null); navigate(`/mentions?scan=${scanResult.scan_run_id}`); }}>
                    <ExternalLink className="h-3 w-3 mr-1.5" /> View Mentions
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setBuilderOpen(false); setScanResult(null); navigate("/risk-console"); }}>
                    <AlertTriangle className="h-3 w-3 mr-1.5" /> Risk Console
                  </Button>
                </div>
              </div>
            )}

            {/* Schedule Option */}
            {!scanning && !scanResult && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium text-card-foreground">Schedule recurring scan</p>
                    <p className="text-[10px] text-muted-foreground">Automatically run this scan on a schedule</p>
                  </div>
                </div>
                <Checkbox checked={scheduleEnabled} onCheckedChange={(c) => setScheduleEnabled(!!c)} />
              </div>
            )}

            {scheduleEnabled && !scanning && !scanResult && (
              <div className="flex items-center gap-3 pl-10">
                <Label className="text-xs text-muted-foreground">Run every:</Label>
                {["6h", "12h", "daily", "weekly"].map(interval => (
                  <button
                    key={interval}
                    onClick={() => setScheduleInterval(interval)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      scheduleInterval === interval
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/20"
                    }`}
                  >
                    {interval}
                  </button>
                ))}
              </div>
            )}

            {/* Run Button */}
            {!scanResult && (
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  {selectedSources.length} sources · {keywords.length} keywords
                  {scheduleEnabled && ` · repeats ${scheduleInterval}`}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setBuilderOpen(false)}>Cancel</Button>
                  <Button onClick={runScan} disabled={scanning || selectedSources.length === 0}>
                    {scanning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        {scheduleEnabled ? "Schedule & Run Now" : "Run Scan"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Auto Scan Date Range Picker */}
      <Dialog open={scanDatePickerOpen} onOpenChange={setScanDatePickerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Auto Scan — Choose Time Range
            </DialogTitle>
            <DialogDescription>
              Select how far back to scan. Narrower ranges find fresher threats faster. Wider ranges catch more but may include older content.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {[
              { value: "today", label: "Today only", desc: "Just today's content — fastest scan" },
              { value: "7days", label: "Last 7 days", desc: "Recommended — catches recent activity" },
              { value: "30days", label: "Last 30 days", desc: "Wider net — more results, some older" },
              { value: "everything", label: "Everything", desc: "No date filter — comprehensive but slower" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setScanDateRange(opt.value)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  scanDateRange === opt.value
                    ? "bg-primary/10 border-primary/30"
                    : "bg-card border-border hover:border-primary/20"
                }`}
              >
                <div className="text-sm font-medium text-foreground">{opt.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
          
          {/* Sentiment Filter */}
          <div className="space-y-2 mt-4">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="h-3 w-3" /> What to look for
            </Label>
            <div className="flex gap-2">
              {[
                { value: "all", label: "Everything", desc: "All mentions" },
                { value: "negative", label: "Threats Only", desc: "Negative & mixed" },
                { value: "positive", label: "Positive Only", desc: "Good press" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSentimentFilter(opt.value)}
                  className={`flex-1 px-3 py-2 text-xs rounded-md border transition-colors ${
                    sentimentFilter === opt.value
                      ? opt.value === "negative" ? "bg-destructive/10 border-destructive/30 text-destructive"
                      : opt.value === "positive" ? "bg-sentinel-emerald/10 border-sentinel-emerald/30 text-sentinel-emerald"
                      : "bg-primary/10 border-primary/30 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/20"
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] opacity-70">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setScanDatePickerOpen(false)}>Cancel</Button>
            <Button onClick={() => runAutoScan()} disabled={autoScanning} className="gap-2">
              {autoScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {autoScanning ? "Scanning..." : "Start Scan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
