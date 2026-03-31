import { useState, useEffect, useMemo } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Target, Plus, TrendingUp, TrendingDown, Minus, MessageSquareWarning, Network, Search, ExternalLink, Scan, Trash2, Pencil, BarChart3, Eye, Loader2, User, Zap, Newspaper } from "lucide-react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import CompetitorIntelSheet from "@/components/competitors/CompetitorIntelSheet";
import PageGuide from "@/components/PageGuide";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";
import SuggestCompetitorsDialog from "@/components/competitors/SuggestCompetitorsDialog";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Competitor {
  id: string;
  name: string;
  domain: string | null;
  notes: string | null;
  mentionCount: number;
  narrativeCount: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  negPct: number;
  posPct: number;
  neuPct: number;
}

export default function CompetitorsPage() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [intelTarget, setIntelTarget] = useState<Competitor | null>(null);
  const [intelOpen, setIntelOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Competitor | null>(null);
  const [editTarget, setEditTarget] = useState<Competitor | null>(null);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  useEffect(() => {
    if (!currentOrg) return;
    loadCompetitors();
  }, [currentOrg]);

  const loadCompetitors = async () => {
    if (!currentOrg) return;
    setLoading(true);

    const { data: keywords } = await supabase
      .from("keywords")
      .select("*")
      .eq("org_id", currentOrg.id)
      .eq("type", "competitor");

    if (!keywords || keywords.length === 0) {
      setCompetitors([]);
      setLoading(false);
      return;
    }

    // Batch load all mentions and narratives for this org once
    const [mentionRes, narrativeRes] = await Promise.all([
      supabase.from("mentions").select("id, content, sentiment_label").eq("org_id", currentOrg.id).eq("mention_type","brand").limit(1000),
      supabase.from("narratives").select("id, name, description").eq("org_id", currentOrg.id).limit(500),
    ]);

    const allMentions = mentionRes.data || [];
    const allNarratives = narrativeRes.data || [];

    const comps: Competitor[] = keywords.map((kw) => {
      const kwLower = kw.value.toLowerCase();
      const matched = allMentions.filter(m => m.content?.toLowerCase().includes(kwLower));
      const total = matched.length || 1;
      const negCount = matched.filter(m => m.sentiment_label === "negative").length;
      const posCount = matched.filter(m => m.sentiment_label === "positive").length;
      const neuCount = total - negCount - posCount;

      let sentiment: Competitor["sentiment"] = "neutral";
      if (negCount > posCount) sentiment = "negative";
      else if (posCount > negCount) sentiment = "positive";
      else if (negCount > 0 && posCount > 0) sentiment = "mixed";

      const narrativeCount = allNarratives.filter(n =>
        n.name?.toLowerCase().includes(kwLower) || n.description?.toLowerCase().includes(kwLower)
      ).length;

      return {
        id: kw.id,
        name: kw.value,
        domain: null,
        notes: null,
        mentionCount: matched.length,
        narrativeCount,
        sentiment,
        negPct: Math.round((negCount / total) * 100),
        posPct: Math.round((posCount / total) * 100),
        neuPct: Math.round((neuCount / total) * 100),
      };
    });

    setCompetitors(comps);
    setLoading(false);
  };

  const addCompetitor = async () => {
    if (!newName.trim() || !currentOrg) return;
    const { error } = await supabase.from("keywords").insert({
      org_id: currentOrg.id,
      type: "competitor",
      value: newName.trim(),
      status: "active",
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Competitor added", description: `Now tracking "${newName.trim()}"` });
    setNewName("");
    setNewDomain("");
    setNewNotes("");
    setAddOpen(false);
    loadCompetitors();
  };

  const deleteCompetitor = async (comp: Competitor) => {
    const { error } = await supabase.from("keywords").delete().eq("id", comp.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Competitor removed", description: `"${comp.name}" is no longer tracked` });
      loadCompetitors();
    }
    setDeleteConfirm(null);
  };

  const renameCompetitor = async () => {
    if (!editTarget || !newName.trim()) return;
    const { error } = await supabase.from("keywords").update({ value: newName.trim() }).eq("id", editTarget.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Competitor updated", description: `Renamed to "${newName.trim()}"` });
      loadCompetitors();
    }
    setEditOpen(false);
    setEditTarget(null);
    setNewName("");
  };

  const viewMentions = (comp: Competitor) => {
    navigate(`/mentions?search=${encodeURIComponent(comp.name)}`);
  };

  const viewNarratives = (comp: Competitor) => {
    navigate(`/narratives?search=${encodeURIComponent(comp.name)}`);
  };

  const viewProfile = (comp: Competitor) => {
    navigate(`/competitors/${encodeURIComponent(comp.name)}`);
  };

  const scanCompetitor = async (comp: Competitor) => {
    if (!currentOrg) return;
    setScanningId(comp.id);
    try {
      const { data, error } = await supabase.functions.invoke("run-scan", {
        body: {
          org_id: currentOrg.id,
          keywords: [comp.name],
          sources: ["news", "google-news", "reddit", "social"],
          scan_context: "competitor",
        },
      });
      if (error) throw error;
      toast({
        title: "Competitor scan complete",
        description: `Found ${data?.mentions_created || 0} new mentions for "${comp.name}"`,
      });
      loadCompetitors();
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    } finally {
      setScanningId(null);
    }
  };

  const sentimentIcon = (s: Competitor["sentiment"]) => {
    if (s === "positive") return <TrendingUp className="h-4 w-4 text-[hsl(var(--sentinel-emerald))]" />;
    if (s === "negative") return <TrendingDown className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const sentimentColor = (s: Competitor["sentiment"]) => {
    if (s === "positive") return "bg-[hsl(var(--sentinel-emerald))]/10 text-[hsl(var(--sentinel-emerald))]";
    if (s === "negative") return "bg-destructive/10 text-destructive";
    if (s === "mixed") return "bg-[hsl(var(--sentinel-amber))]/10 text-[hsl(var(--sentinel-amber))]";
    return "bg-muted/30 text-muted-foreground";
  };

  const filtered = competitors.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalMentions = competitors.reduce((s, c) => s + c.mentionCount, 0);
  const totalNarratives = competitors.reduce((s, c) => s + c.narrativeCount, 0);
  const maxMentions = Math.max(...competitors.map(c => c.mentionCount), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Competitor Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">Track competitors across your monitored landscape</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/competitors/intel-feed")}>
            <Newspaper className="h-4 w-4 mr-2" /> Intel Feed
          </Button>
          {competitors.length >= 2 && (
            <>
              <Button variant={compareMode ? "default" : "outline"} onClick={() => setCompareMode(!compareMode)}>
                <BarChart3 className="h-4 w-4 mr-2" />{compareMode ? "Exit Compare" : "Compare"}
              </Button>
              <Button variant="outline" onClick={() => navigate("/competitors/benchmark")}>
                <TrendingUp className="h-4 w-4 mr-2" /> Benchmark
              </Button>
            </>
          )}
          <SuggestCompetitorsDialog onAdded={loadCompetitors} />
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Manually</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Competitor</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Competitor Name *</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Acme Corp" />
                  <p className="text-xs text-muted-foreground mt-1">This name will be used as a keyword to search across all sources during scans</p>
                </div>
                <Button onClick={addCompetitor} disabled={!newName.trim()} className="w-full">
                  Start Tracking
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <PageGuide
        title="How Competitor Analysis Works"
        subtitle="Track rival brands across your entire monitored landscape"
        steps={[
          {
            icon: <Target className="h-4 w-4 text-primary" />,
            title: "1. Add Competitors",
            description: "Add competitor names manually or use AI auto-detection to suggest rivals based on your industry and existing data.",
          },
          {
            icon: <Scan className="h-4 w-4 text-primary" />,
            title: "2. Tracked via Keywords",
            description: "Competitors are stored as 'competitor' keywords. Every scan automatically searches for them alongside your brand keywords.",
          },
          {
            icon: <TrendingUp className="h-4 w-4 text-primary" />,
            title: "3. Compare & Analyze",
            description: "Click any competitor to view their mentions, edit or remove them, or use Compare mode for side-by-side analysis.",
          },
        ]}
        integrations={[
          { label: "Scans", to: "/scans", description: "Competitors scanned automatically" },
          { label: "Mentions", to: "/mentions", description: "Filter by competitor" },
          { label: "Narratives", to: "/narratives", description: "Competitor narrative overlap" },
        ]}
        tip="Use AI Suggest to automatically discover competitors based on your organization's name, domain, and industry. The AI analyzes your existing data to recommend the most relevant rivals."
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Competitors Tracked</p>
                <p className="text-2xl font-bold text-foreground">{competitors.length}</p>
              </div>
              <Target className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Competitor Mentions</p>
                <p className="text-2xl font-bold text-foreground">{totalMentions}</p>
              </div>
              <MessageSquareWarning className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Related Narratives</p>
                <p className="text-2xl font-bold text-foreground">{totalNarratives}</p>
              </div>
              <Network className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Threat Matrix */}
      {competitors.length >= 2 && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Zap className="h-4 w-4 text-[hsl(var(--sentinel-amber))]" /> Threat Matrix
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Volume vs negativity — top-right quadrant needs immediate attention</p>
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="x" type="number" name="Mentions" label={{ value: "Mention Volume", position: "insideBottom", offset: -10, fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis dataKey="y" type="number" name="Negative %" domain={[0, 100]} label={{ value: "Negative %", angle: -90, position: "insideLeft", fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border rounded-lg p-2 shadow text-xs">
                        <p className="font-semibold text-foreground">{d.name}</p>
                        <p className="text-muted-foreground">{d.x} mentions · {d.y}% negative</p>
                      </div>
                    );
                  }} />
                  <ReferenceLine x={maxMentions / 2} stroke="hsl(var(--border))" strokeDasharray="4 4" />
                  <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="4 4" />
                  <Scatter
                    data={competitors.map(c => ({ name: c.name, x: c.mentionCount, y: c.negPct }))}
                    fill="hsl(var(--primary))"
                    shape={(props: any) => {
                      const { cx, cy, payload } = props;
                      const isHighRisk = payload.y > 50 && payload.x > maxMentions / 2;
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={8} fill={isHighRisk ? "hsl(0,84%,60%)" : "hsl(var(--primary))"} fillOpacity={0.8} />
                          <text x={cx} y={cy - 12} textAnchor="middle" fontSize={10} fill="hsl(var(--foreground))">{payload.name}</text>
                        </g>
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] text-muted-foreground">
              <span className="text-left">← Low Profile</span>
              <span className="text-right">High Profile →</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter competitors..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Compare Mode */}
      {compareMode && competitors.length >= 2 && (
        <Card>
          <CardContent className="pt-6 space-y-5">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Side-by-Side Comparison
            </h3>
            {/* Mention volume comparison */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mention Volume</p>
              {competitors.map(comp => (
                <div key={comp.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground truncate max-w-[200px]">{comp.name}</span>
                    <span className="text-muted-foreground">{comp.mentionCount}</span>
                  </div>
                  <Progress value={(comp.mentionCount / maxMentions) * 100} className="h-2" />
                </div>
              ))}
            </div>
            {/* Sentiment breakdown */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sentiment Breakdown</p>
              {competitors.map(comp => (
                <div key={comp.id} className="space-y-1">
                  <span className="text-sm font-medium text-foreground truncate max-w-[200px] block">{comp.name}</span>
                  <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
                    {comp.posPct > 0 && (
                      <div className="bg-[hsl(var(--sentinel-emerald))]" style={{ width: `${comp.posPct}%` }} title={`Positive: ${comp.posPct}%`} />
                    )}
                    {comp.neuPct > 0 && (
                      <div className="bg-muted-foreground/30" style={{ width: `${comp.neuPct}%` }} title={`Neutral: ${comp.neuPct}%`} />
                    )}
                    {comp.negPct > 0 && (
                      <div className="bg-destructive" style={{ width: `${comp.negPct}%` }} title={`Negative: ${comp.negPct}%`} />
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="text-[hsl(var(--sentinel-emerald))]">{comp.posPct}% pos</span>
                    <span>{comp.neuPct}% neu</span>
                    <span className="text-destructive">{comp.negPct}% neg</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Narrative overlap */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Narrative Overlap</p>
              {competitors.map(comp => (
                <div key={comp.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{comp.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => viewNarratives(comp)}>
                    {comp.narrativeCount} narratives <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Competitor cards */}
      {loading ? (
        <div className="text-sm text-muted-foreground animate-pulse py-12 text-center">Loading competitors...</div>
      ) : competitors.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No competitors tracked yet"
          description="Add competitors to monitor how they're mentioned across your scanned landscape. Compare sentiment, narrative overlap, and mention volume."
          actionLabel="Add First Competitor"
          onAction={() => setAddOpen(true)}
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map(comp => (
            <Card key={comp.id} className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => viewProfile(comp)}>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Target className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{comp.name}</h3>
                      {comp.domain && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />{comp.domain}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
                    <button onClick={() => viewMentions(comp)} className="text-center hover:opacity-70 transition-opacity cursor-pointer">
                      <p className="text-lg font-bold text-foreground">{comp.mentionCount}</p>
                      <p className="text-xs text-muted-foreground">Mentions</p>
                    </button>
                    <button onClick={() => viewNarratives(comp)} className="text-center hover:opacity-70 transition-opacity cursor-pointer">
                      <p className="text-lg font-bold text-foreground">{comp.narrativeCount}</p>
                      <p className="text-xs text-muted-foreground">Narratives</p>
                    </button>
                    <Badge className={sentimentColor(comp.sentiment)}>
                      {sentimentIcon(comp.sentiment)}
                      <span className="ml-1 capitalize">{comp.sentiment}</span>
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setIntelTarget(comp); setIntelOpen(true); }}
                      className="hidden sm:flex"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" /> Intel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => scanCompetitor(comp)}
                      disabled={scanningId === comp.id}
                      className="hidden sm:flex"
                    >
                      {scanningId === comp.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Scan className="h-3.5 w-3.5 mr-1.5" />}
                      Scan
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <span className="sr-only">Actions</span>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => viewProfile(comp)}>
                          <User className="h-4 w-4 mr-2" /> View Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => scanCompetitor(comp)} disabled={scanningId === comp.id}>
                          <Scan className="h-4 w-4 mr-2" /> {scanningId === comp.id ? "Scanning..." : "Scan Now"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => viewMentions(comp)}>
                          <Eye className="h-4 w-4 mr-2" /> View Mentions
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => viewNarratives(comp)}>
                          <Network className="h-4 w-4 mr-2" /> View Narratives
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setEditTarget(comp);
                          setNewName(comp.name);
                          setEditOpen(true);
                        }}>
                          <Pencil className="h-4 w-4 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteConfirm(comp)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={v => { setEditOpen(v); if (!v) { setEditTarget(null); setNewName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Competitor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Competitor name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={renameCompetitor} disabled={!newName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={v => { if (!v) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Competitor</AlertDialogTitle>
            <AlertDialogDescription>
              Stop tracking "{deleteConfirm?.name}"? This removes the keyword — existing mentions referencing this competitor will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteConfirm && deleteCompetitor(deleteConfirm)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CompetitorIntelSheet
        competitor={intelTarget}
        orgId={currentOrg?.id || ""}
        open={intelOpen}
        onOpenChange={setIntelOpen}
      />
    </div>
  );
}
