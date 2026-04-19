import { useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useResponseEfficacy, logResponseEvent, efficacyColor, efficacyBg, useEfficacySummary } from "@/hooks/useResponseEfficacy";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TrendingUp, TrendingDown, Minus, Plus, ExternalLink, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";

const RESPONSE_TYPES = ["statement","tweet","press_release","blog_post","spokesperson","other"];

interface Props {
  incidentId?: string;
}

function SentimentArrow({ before, after }: { before?: number; after?: number }) {
  if (before == null) return <span className="text-muted-foreground text-xs">—</span>;
  if (after == null) return <span className="text-muted-foreground text-xs">Pending 24h</span>;
  const delta = after - before;
  const pctBefore = Math.round(((before + 1) / 2) * 100);
  const pctAfter  = Math.round(((after  + 1) / 2) * 100);
  const Icon = delta > 0.05 ? TrendingUp : delta < -0.05 ? TrendingDown : Minus;
  const col = delta > 0.05 ? "text-emerald-500" : delta < -0.05 ? "text-sentinel-red" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{pctBefore}%</span>
      <Icon className={`h-3.5 w-3.5 ${col}`} />
      <span className={col}>{pctAfter}%</span>
    </div>
  );
}

export default function ResponseEfficacyPanel({ incidentId }: Props) {
  const { currentOrg } = useOrg();
  const { events, loading, refetch } = useResponseEfficacy(currentOrg?.id, incidentId);
  const summary = useEfficacySummary(currentOrg?.id);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    response_type: "statement", title: "", content_url: "", content_preview: "",
    published_at: new Date().toISOString().slice(0, 16),
  });

  async function handleLog() {
    if (!form.title || !currentOrg) return;
    setSaving(true);
    try {
      await logResponseEvent({
        org_id: currentOrg.id,
        incident_id: incidentId,
        ...form,
        published_at: new Date(form.published_at).toISOString(),
      });
      toast({ title: "Response logged", description: "Efficacy analysis will be available in 24h." });
      setOpen(false);
      setForm({ response_type: "statement", title: "", content_url: "", content_preview: "", published_at: new Date().toISOString().slice(0, 16) });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Summary + Log button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {summary.total >= 2 && (
            <>
              <div className="text-center">
                <p className="text-xl font-bold text-foreground">{summary.avgScore}</p>
                <p className="text-[10px] text-muted-foreground">avg score</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-emerald-500">{summary.effective}/{summary.total}</p>
                <p className="text-[10px] text-muted-foreground">effective</p>
              </div>
              {summary.bestTitle && (
                <div className="text-xs text-muted-foreground">Best: <span className="text-foreground">{summary.bestTitle}</span></div>
              )}
            </>
          )}
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2"><Plus className="h-3.5 w-3.5" /> Log Response</Button>
          </SheetTrigger>
          <SheetContent className="w-[420px]">
            <SheetHeader><SheetTitle>Log a Response</SheetTitle></SheetHeader>
            <div className="space-y-4 mt-6">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select value={form.response_type} onChange={e => setForm(f => ({ ...f, response_type: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-card border border-border rounded-lg text-foreground focus:outline-none">
                  {RESPONSE_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input placeholder="e.g. Official statement on XYZ allegations" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Published at</Label>
                <Input type="datetime-local" value={form.published_at} onChange={e => setForm(f => ({ ...f, published_at: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>URL <span className="text-muted-foreground">(optional)</span></Label>
                <Input placeholder="https://…" value={form.content_url} onChange={e => setForm(f => ({ ...f, content_url: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Preview <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea placeholder="First 2–3 sentences of the response…" rows={3} value={form.content_preview} onChange={e => setForm(f => ({ ...f, content_preview: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={handleLog} disabled={saving || !form.title}>
                {saving ? "Logging…" : "Log Response"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Events */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : events.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No responses logged yet.</p>
          <p className="text-xs mt-1">Log a statement or post to measure whether it moved sentiment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(ev => (
            <Card key={ev.id} className={`border p-4 space-y-3 ${efficacyBg(ev.efficacy_label)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{ev.response_type.replace("_", " ")}</Badge>
                    <p className="text-sm font-medium text-foreground">{ev.title}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{format(new Date(ev.published_at), "MMM d, HH:mm")}</span>
                    {ev.content_url && (
                      <a href={ev.content_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> View
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-center flex-shrink-0">
                  {ev.efficacy_label === "pending" ? (
                    <div className="text-xs text-muted-foreground">
                      <Clock className="h-4 w-4 mx-auto mb-0.5 opacity-50" />
                      <span>Pending</span>
                    </div>
                  ) : (
                    <>
                      <p className={`text-2xl font-bold ${efficacyColor(ev.efficacy_label)}`}>{ev.efficacy_score}</p>
                      <p className={`text-[10px] capitalize ${efficacyColor(ev.efficacy_label)}`}>{ev.efficacy_label}</p>
                    </>
                  )}
                </div>
              </div>

              {/* Before/after */}
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">Sentiment</p>
                  <SentimentArrow before={ev.sentiment_before ?? undefined} after={ev.sentiment_after ?? undefined} />
                </div>
                {ev.volume_before != null && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Volume (2h→24h)</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">{ev.volume_before}</span>
                      <Minus className="h-3 w-3 text-muted-foreground" />
                      <span className={ev.volume_after != null && ev.volume_after < ev.volume_before ? "text-emerald-500" : "text-sentinel-amber"}>
                        {ev.volume_after ?? "—"}
                      </span>
                    </div>
                  </div>
                )}
                {ev.efficacy_label === "pending" && (
                  <p className="text-[10px] text-muted-foreground">Analysis available 24h after publish</p>
                )}
              </div>

              {ev.content_preview && (
                <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">
                  "{ev.content_preview.slice(0, 160)}{ev.content_preview.length > 160 ? "…" : ""}"
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
