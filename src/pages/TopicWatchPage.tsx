import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { useTopicWatches, deleteTopicWatch, getBinanceImpactLabel } from "@/hooks/useTopicWatches";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Crosshair, Plus, TrendingUp, TrendingDown, Minus, Trash2, Sparkles,
  AlertTriangle, ArrowRight, Edit2, ChevronRight, Loader2, Tag, Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import ThreatResearchPanel from "@/components/ThreatResearchPanel";

const COLORS = ["#ef4444", "#f97316", "#f59e0b", "#3b82f6", "#a855f7", "#22c55e"];

const THREAT_TYPE_LABELS: Record<string, string> = {
  regulatory: "⚖️ Regulatory",
  market_manipulation: "📉 Market Manipulation",
  insider_trading: "🔍 Insider Trading",
  reputation: "💬 Reputation",
  competitor: "🏢 Competitor",
  scam: "⚠️ Scam",
  unknown: "❓ Unknown",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "text-sentinel-red border-sentinel-red/40 bg-sentinel-red/10",
  high:     "text-orange-500 border-orange-500/40 bg-orange-500/10",
  medium:   "text-sentinel-amber border-sentinel-amber/40 bg-sentinel-amber/10",
  low:      "text-muted-foreground border-border bg-muted/10",
};

const CONNECTION_STYLES: Record<string, string> = {
  direct:   "text-sentinel-red",
  indirect: "text-orange-500",
  potential:"text-sentinel-amber",
  none:     "text-muted-foreground",
};

type Step = "input" | "analyzing" | "review" | "creating" | "error";

interface Analysis {
  name: string;
  query: string;
  description: string;
  threat_type: string;
  severity: string;
  alert_threshold: number;
  reasoning: string;
  named_entities: string[];
  binance_connection: string;
  suggested_color: string;
}

function VelocityIcon({ v }: { v: number }) {
  if (v > 2) return <TrendingUp className="h-3 w-3 text-sentinel-red" />;
  if (v < -2) return <TrendingDown className="h-3 w-3 text-emerald-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export default function TopicWatchPage() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { watches, loading, refetch } = useTopicWatches(currentOrg?.id);
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [inputText, setInputText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [editedAnalysis, setEditedAnalysis] = useState<Analysis | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [tableError, setTableError] = useState<string | null>(null);

  function openSheet() {
    setOpen(true);
    setStep("input");
    setInputText("");
    setAnalysis(null);
    setEditedAnalysis(null);
    setErrorMsg("");
    setTableError(null);
  }

  async function handleAnalyze() {
    if (!inputText.trim() || !currentOrg) return;
    setStep("analyzing");
    setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("analyze-topic-watch", {
        body: { action: "analyze", text: inputText, org_id: currentOrg.id },
      });
      // Supabase wraps network/runtime errors in error.message
      if (error) throw new Error(error.message || "Edge function unreachable — check Supabase function logs");
      // Our function always returns JSON; a non-200 comes back in data.error
      if (data?.error) throw new Error(data.error);
      if (data?.tableError) setTableError(data.tableError);
      if (!data?.analysis) throw new Error("No analysis returned — check GOOGLE_API_KEY or LOVABLE_API_KEY is set in Edge Function secrets");
      setAnalysis(data.analysis);
      setEditedAnalysis({ ...data.analysis });
      setStep("review");
    } catch (e: any) {
      setErrorMsg(e.message);
      setStep("error");
    }
  }

  async function handleCreate() {
    if (!editedAnalysis || !currentOrg) return;
    setStep("creating");
    try {
      const { data, error } = await supabase.functions.invoke("analyze-topic-watch", {
        body: { action: "create", org_id: currentOrg.id, watch_data: editedAnalysis },
      });
      if (error) throw new Error(error.message || "Edge function unreachable — check Supabase function logs");
      if (data?.error) throw new Error(data.error);
      toast({ title: "Topic Watch created", description: `Now monitoring: ${editedAnalysis.name}` });
      setOpen(false);
      refetch();
    } catch (e: any) {
      setErrorMsg(e.message);
      setStep("error");
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteTopicWatch(id);
    refetch();
    toast({ title: "Watch archived" });
  }

  // Render sheet content
  function renderSheetBody() {
    // ── Step: Input ──────────────────────────────────────────────────
    if (step === "input") return (
      <div className="space-y-5 mt-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Paste intelligence text</Label>
          <p className="text-xs text-muted-foreground">
            Paste a tweet thread, news excerpt, alert, or your own notes. Gemini will extract the watch parameters automatically.
          </p>
          <Textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            rows={8}
            placeholder={`Paste intelligence here. For example:

"On-chain investigator ZachXBT posted at 07:26 UTC alleging a coordinated pump-and-dump on $RAVE involving insiders across Binance, Bitget, and Gate.io. He said insiders held over 90% of supply, named Binance's Yi He and Bitget's Gracy Chen, and offered a $25K whistleblower bounty."`}
            className="text-sm resize-none"
          />
        </div>
        <Button
          className="w-full gap-2"
          onClick={handleAnalyze}
          disabled={!inputText.trim()}
        >
          <Sparkles className="h-4 w-4" />
          Analyse with AI
          <ArrowRight className="h-4 w-4 ml-auto" />
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          AI extracts keywords, threat type, severity, and alert threshold.
        </p>
      </div>
    );

    // ── Step: Analyzing ──────────────────────────────────────────────
    if (step === "analyzing") return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="relative">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <Sparkles className="h-4 w-4 text-primary absolute -top-1 -right-1" />
        </div>
        <p className="text-sm font-medium text-foreground">Analysing intelligence…</p>
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          Identifying entities, extracting keywords, assessing Binance exposure, and setting alert threshold.
        </p>
      </div>
    );

    // ── Step: Review ─────────────────────────────────────────────────
    if (step === "review" && editedAnalysis) return (
      <div className="space-y-5 mt-4 overflow-y-auto max-h-[75vh]">
        {tableError && (
          <div className="text-xs text-sentinel-amber bg-sentinel-amber/10 border border-sentinel-amber/30 rounded-lg p-3">
            ⚠ <strong>Table not ready:</strong> {tableError}
          </div>
        )}

        {/* AI reasoning */}
        <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Assessment</p>
          <p className="text-xs text-foreground leading-relaxed">{editedAnalysis.reasoning}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLES[editedAnalysis.severity] ?? ""}`}>
              {editedAnalysis.severity?.toUpperCase() ?? "?"}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {THREAT_TYPE_LABELS[editedAnalysis.threat_type] ?? editedAnalysis.threat_type}
            </Badge>
            <span className={`text-[10px] font-medium ${CONNECTION_STYLES[editedAnalysis.binance_connection] ?? ""}`}>
              Binance: {editedAnalysis.binance_connection}
            </span>
          </div>
        </div>

        {/* Named entities */}
        {editedAnalysis.named_entities?.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Tag className="h-3 w-3" /> Named Entities Detected
            </p>
            <div className="flex flex-wrap gap-1">
              {editedAnalysis.named_entities.map(e => (
                <span key={e} className="text-[10px] px-2 py-0.5 bg-muted/40 text-foreground rounded-full border border-border">{e}</span>
              ))}
            </div>
          </div>
        )}

        <hr className="border-border" />

        {/* Editable fields */}
        <div className="space-y-1.5">
          <Label>Watch Name</Label>
          <Input value={editedAnalysis.name} onChange={e => setEditedAnalysis(a => a ? { ...a, name: e.target.value } : a)} />
        </div>

        <div className="space-y-1.5">
          <Label>Monitor Keywords</Label>
          <Textarea
            value={editedAnalysis.query}
            onChange={e => setEditedAnalysis(a => a ? { ...a, query: e.target.value } : a)}
            rows={3}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">Comma-separated. Any match → mention is included in this watch.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={editedAnalysis.description}
            onChange={e => setEditedAnalysis(a => a ? { ...a, description: e.target.value } : a)}
            rows={2}
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>
            Alert threshold: <span className="text-primary font-semibold">{editedAnalysis.alert_threshold}%</span>
          </Label>
          <p className="text-xs text-muted-foreground">Alert when this % of matching posts also mention Binance.</p>
          <Slider
            min={1} max={80} step={1}
            value={[editedAnalysis.alert_threshold]}
            onValueChange={([v]) => setEditedAnalysis(a => a ? { ...a, alert_threshold: v } : a)}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1% (very sensitive)</span>
            <span>80% (direct threat only)</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Colour</Label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button key={c} onClick={() => setEditedAnalysis(a => a ? { ...a, suggested_color: c } : a)}
                className={`w-7 h-7 rounded-full transition-transform ${(editedAnalysis.suggested_color ?? "") === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-110"}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        <div className="flex gap-2 pb-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setStep("input")}>
            ← Edit text
          </Button>
          <Button className="flex-1 gap-2" onClick={handleCreate} disabled={!editedAnalysis.name || !editedAnalysis.query}>
            <Plus className="h-4 w-4" /> Create Watch
          </Button>
        </div>

        {/* Threat research panel — runs automatically in review */}
        <div className="pb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Threat Research</p>
          <ThreatResearchPanel text={inputText} compact />
        </div>
      </div>
    );

    // ── Step: Creating ───────────────────────────────────────────────
    if (step === "creating") return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Creating watch…</p>
      </div>
    );

    // ── Step: Error ──────────────────────────────────────────────────
    if (step === "error") return (
      <div className="space-y-4 mt-4">
        <div className="bg-sentinel-red/10 border border-sentinel-red/30 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-sentinel-red">Something went wrong</p>
          <p className="text-xs text-muted-foreground break-words">{errorMsg}</p>
          {errorMsg.toLowerCase().includes("table") && (
            <p className="text-xs text-sentinel-amber mt-2">
              <strong>This usually means the migration hasn't been applied.</strong> Run the SQL in <code className="bg-muted px-1 rounded">supabase/migrations/20240420000001_intel_features.sql</code> via Supabase Dashboard → SQL editor.
            </p>
          )}
        </div>
        <Button variant="outline" className="w-full" onClick={() => setStep("input")}>← Try again</Button>
      </div>
    );

    return null;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Crosshair className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Topic Watch</h1>
            <p className="text-sm text-muted-foreground">Monitor any narrative before it becomes your problem. Paste intel → AI configures it.</p>
          </div>
        </div>

        <Button size="sm" className="gap-2" onClick={openSheet}>
          <Sparkles className="h-4 w-4" /> New Watch
        </Button>
      </div>

      {/* Sheet */}
      <Sheet open={open} onOpenChange={o => { if (!o) setOpen(false); }}>
        <SheetContent className="w-[480px] sm:w-[520px] overflow-hidden flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {step === "review" ? "Review Watch — Edit if needed" : "New Topic Watch"}
            </SheetTitle>
            <SheetDescription>
              {step === "input" && "Paste any intelligence text — Gemini will extract the watch configuration."}
              {step === "review" && "AI has generated a watch config. Review and adjust before creating."}
              {step === "analyzing" && "Analysing with Gemini 2.5 Flash…"}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {renderSheetBody()}
          </div>
        </SheetContent>
      </Sheet>

      {/* Watch list */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : watches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
          <div className="p-4 rounded-full bg-muted/30">
            <Crosshair className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold text-foreground">No topic watches yet.</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Paste any threat intel — a tweet, news excerpt, or your own notes — and AI will turn it into a monitoring watch in seconds.
          </p>
          <Button size="sm" onClick={openSheet} className="gap-2 mt-2">
            <Sparkles className="h-4 w-4" /> Create your first watch
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {watches.map(w => {
            const snap = w.latestSnapshot;
            const impact = getBinanceImpactLabel(snap?.binance_overlap_pct ?? 0);
            const velocity = snap?.velocity ?? 0;
            const sparkData = [{ v: 1 }, { v: 2 }, { v: snap?.total_mentions ?? 3 }];
            return (
              <Card key={w.id}
                className="bg-card border-border p-5 cursor-pointer hover:border-primary/40 transition-colors group"
                onClick={() => navigate(`/topic-watch/${w.id}`)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
                    <h3 className="font-semibold text-sm text-foreground leading-tight line-clamp-1">{w.name}</h3>
                  </div>
                  <button onClick={e => handleDelete(w.id, e)}
                    className="p-1 hover:text-sentinel-red text-muted-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {w.description && (
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{w.description}</p>
                )}

                {/* Query chips */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {w.query.split(",").slice(0, 4).map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 bg-muted/40 text-muted-foreground rounded-full">{t.trim()}</span>
                  ))}
                  {w.query.split(",").length > 4 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-muted/40 text-muted-foreground rounded-full">+{w.query.split(",").length - 4} more</span>
                  )}
                </div>

                {/* Sparkline */}
                <div className="h-10 mb-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparkData}>
                      <Line type="monotone" dataKey="v" stroke={w.color} strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${impact.color} border-current`}>
                      {impact.label} impact
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{w.status}</Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <VelocityIcon v={velocity} />
                    <span>{Math.abs(velocity).toFixed(1)}/hr</span>
                  </div>
                </div>

                {snap && (
                  <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{snap.total_mentions.toLocaleString()} mentions</span>
                    <span>{snap.binance_overlap_pct}% Binance overlap</span>
                  </div>
                )}

                <div className="flex items-center justify-end mt-2">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
