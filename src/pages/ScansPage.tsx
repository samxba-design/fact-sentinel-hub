import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Scan, Plus, Clock, CheckCircle2, XCircle, Loader2, Zap, Calendar } from "lucide-react";
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

const ALL_SOURCES = ["twitter", "reddit", "news", "forums", "blogs", "tiktok", "youtube"];

export default function ScansPage() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Builder state
  const [selectedSources, setSelectedSources] = useState<string[]>(["twitter", "reddit", "news"]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  // Load org keywords as defaults when builder opens
  useEffect(() => {
    if (!builderOpen || !currentOrg) return;
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
    // Set default date range: last 7 days
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
    try {
      const { data, error } = await supabase.functions.invoke("run-scan", {
        body: {
          org_id: currentOrg.id,
          keywords,
          sources: selectedSources,
          date_from: dateFrom,
          date_to: dateTo,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Scan complete!",
        description: `${data.mentions_created} mentions found, ${data.emergencies} emergencies detected`,
      });
      setBuilderOpen(false);
      fetchRuns();
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
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
        <Button onClick={() => setBuilderOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />New Scan
        </Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : runs.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No scans yet. Create your first scan to start monitoring.</p>
          </Card>
        ) : (
          runs.map(run => {
            const sc = statusConfig[run.status || "pending"];
            const StatusIcon = sc.icon;
            return (
              <Card key={run.id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
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
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

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
                {ALL_SOURCES.map(s => (
                  <label
                    key={s}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors text-xs capitalize ${
                      selectedSources.includes(s)
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-muted/30 border-border text-muted-foreground hover:border-primary/20"
                    }`}
                  >
                    <Checkbox
                      checked={selectedSources.includes(s)}
                      onCheckedChange={() => toggleSource(s)}
                      className="h-3.5 w-3.5"
                    />
                    {s}
                  </label>
                ))}
              </div>
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

            {/* Run Button */}
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                {selectedSources.length} sources · {keywords.length} keywords
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
                      Run Scan
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
