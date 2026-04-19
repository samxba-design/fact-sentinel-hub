import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { useTopicWatches, createTopicWatch, deleteTopicWatch, getBinanceImpactLabel } from "@/hooks/useTopicWatches";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Crosshair, Plus, TrendingUp, TrendingDown, Minus, Trash2, Pause, Play, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { LineChart, Line, ResponsiveContainer } from "recharts";

const COLORS = ["#f97316","#3b82f6","#a855f7","#22c55e","#ef4444","#eab308"];

function VelocityIcon({ v }: { v: number }) {
  if (v > 2) return <TrendingUp className="h-3 w-3 text-sentinel-red" />;
  if (v < -2) return <TrendingDown className="h-3 w-3 text-sentinel-emerald" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export default function TopicWatchPage() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { watches, loading, refetch } = useTopicWatches(currentOrg?.id);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", query: "", description: "", alert_threshold: 20, color: COLORS[0],
  });

  async function handleCreate() {
    if (!form.name || !form.query || !currentOrg) return;
    setSaving(true);
    try {
      await createTopicWatch(currentOrg.id, form);
      toast({ title: "Topic Watch created" });
      setOpen(false);
      setForm({ name: "", query: "", description: "", alert_threshold: 20, color: COLORS[0] });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteTopicWatch(id);
    refetch();
    toast({ title: "Watch archived" });
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
            <p className="text-sm text-muted-foreground">Monitor any narrative before it becomes your problem.</p>
          </div>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> New Watch</Button>
          </SheetTrigger>
          <SheetContent className="w-[440px]">
            <SheetHeader>
              <SheetTitle>New Topic Watch</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="e.g. XYZ Insider Trading" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Keywords</Label>
                <Input placeholder="xyz coin, insider trading, XYZ dump" value={form.query} onChange={e => setForm(f => ({ ...f, query: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Comma-separated — any match triggers inclusion.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea placeholder="What are you watching for?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Alert when Binance overlap exceeds <span className="text-primary font-semibold">{form.alert_threshold}%</span></Label>
                <Slider min={5} max={80} step={5} value={[form.alert_threshold]} onValueChange={([v]) => setForm(f => ({ ...f, alert_threshold: v }))} />
              </div>
              <div className="space-y-2">
                <Label>Colour</Label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-110"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <Button className="w-full mt-2" onClick={handleCreate} disabled={saving || !form.name || !form.query}>
                {saving ? "Creating…" : "Create Watch"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

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
          <p className="text-sm text-muted-foreground max-w-xs">Start monitoring any narrative before it becomes your problem. Takes 30 seconds to set up.</p>
          <Button size="sm" onClick={() => setOpen(true)} className="gap-2 mt-2"><Plus className="h-4 w-4" /> New Watch</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {watches.map(w => {
            const snap = w.latestSnapshot;
            const impact = getBinanceImpactLabel(snap?.binance_overlap_pct ?? 0);
            const velocity = snap?.velocity ?? 0;
            const sparkData = [{ v: 2 }, { v: 5 }, { v: snap?.total_mentions ?? 3 }]; // placeholder
            return (
              <Card key={w.id} className="bg-card border-border p-5 cursor-pointer hover:border-primary/40 transition-colors group"
                onClick={() => navigate(`/topic-watch/${w.id}`)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
                    <h3 className="font-semibold text-sm text-foreground leading-tight">{w.name}</h3>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => handleDelete(w.id, e)} className="p-1 hover:text-sentinel-red text-muted-foreground rounded">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Query chips */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {w.query.split(",").slice(0, 3).map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 bg-muted/40 text-muted-foreground rounded-full">{t.trim()}</span>
                  ))}
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
                    <Badge variant="outline" className={`text-[10px] ${impact.color} border-current`}>{impact.label} impact</Badge>
                    <Badge variant="outline" className="text-[10px]">{w.status}</Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <VelocityIcon v={velocity} />
                    <span>{Math.abs(velocity).toFixed(1)}/hr</span>
                  </div>
                </div>

                {snap && (
                  <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{snap.total_mentions} mentions</span>
                    <span>{snap.binance_overlap_pct}% Binance overlap</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
