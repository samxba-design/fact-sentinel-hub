import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight, ChevronLeft, Loader2, Plus, X, CheckCircle2,
  AlertTriangle, Brain, Sparkles, Shield, Globe, Tag, Info,
  ExternalLink, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import {
  PLATFORMS, SOURCE_TYPES, RISK_TYPES, SEVERITIES, STATUSES,
  MONITORING_INTENTS, CREDIBILITY, RELATIONSHIP, ACTION_RECOMMENDATIONS,
  REASON_ADDED_PRESETS, WATCHLIST_PRESETS, SUGGESTED_TAGS,
  RISK_FLAG_LABELS, OWNERSHIP_TYPES,
} from "@/lib/entityConstants";

interface EvidenceLink { url: string; label: string; note: string; }

interface EntityForm {
  platform: string;
  url: string;
  handle: string;
  display_name: string;
  notes: string;
  reason_added: string;
  monitoring_intent: string;
  source_type: string;
  risk_type: string;
  severity: string;
  status: string;
  credibility: string;
  relationship_to_brand: string;
  ownership_type: string;
  action_recommendation: string;
  claimed_affiliation: string;
  actual_affiliation: string;
  tags: string[];
  watch_keywords: string;
  alert_enabled: boolean;
  evidence_links: EvidenceLink[];
  known_aliases: string;
  ai_suggested_type: string;
  ai_suggested_risk: string;
  ai_confidence: number;
  bio: string;
  follower_count: string;
  detected_topics: string[];
  risk_flags: Record<string, boolean>;
  why_flagged: string[];
}

const DEFAULT_FORM: EntityForm = {
  platform: "unknown", url: "", handle: "", display_name: "", notes: "",
  reason_added: "", monitoring_intent: "", source_type: "unknown",
  risk_type: "none", severity: "low", status: "active",
  credibility: "unverified", relationship_to_brand: "unknown",
  ownership_type: "unknown", action_recommendation: "",
  claimed_affiliation: "", actual_affiliation: "", tags: [],
  watch_keywords: "", alert_enabled: false, evidence_links: [],
  known_aliases: "", ai_suggested_type: "", ai_suggested_risk: "",
  ai_confidence: 0, bio: "", follower_count: "", detected_topics: [],
  risk_flags: {}, why_flagged: [],
};

const STEPS = ["Source", "Enrich", "Classify", "Details & Save"];

function toLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function detectPlatformFromUrl(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("youtube.com")) return "youtube";
  if (u.includes("reddit.com")) return "reddit";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("t.me") || u.includes("telegram.me")) return "telegram";
  if (u.includes("substack.com")) return "substack";
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("discord.gg") || u.includes("discord.com/invite")) return "discord";
  if (u.startsWith("http")) return "website";
  return "unknown";
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

export default function AddEntityDialog({ open, onOpenChange, onSaved }: Props) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<EntityForm>({ ...DEFAULT_FORM });
  const [enriching, setEnriching] = useState(false);
  const [enrichDone, setEnrichDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [evidenceInput, setEvidenceInput] = useState({ url: "", label: "", note: "" });

  const set = (k: keyof EntityForm, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(0);
      setForm({ ...DEFAULT_FORM });
      setEnriching(false);
      setEnrichDone(false);
      setTagInput("");
    }
  }, [open]);

  // Auto-detect platform when url changes
  const handleUrlChange = (val: string) => {
    set("url", val);
    const detected = detectPlatformFromUrl(val);
    if (detected !== "unknown") set("platform", detected);
    // Extract handle from URL
    const handleMatch = val.match(/(?:twitter\.com|x\.com|instagram\.com|tiktok\.com\/@)\/(@?[\w._-]+)/);
    if (handleMatch) set("handle", handleMatch[1].replace("@", ""));
  };

  // Enrich on step 1 mount
  useEffect(() => {
    if (step !== 1 || !form.url || enrichDone) return;
    runEnrich();
  }, [step]);

  const runEnrich = async () => {
    if (!form.url) { setEnrichDone(true); return; }
    setEnriching(true);
    try {
      // Preview enrichment — no entity_id yet, so we use a special preview endpoint
      // Fall back to basic heuristic enrichment response
      const { data, error } = await supabase.functions.invoke("enrich-entity", {
        body: {
          entity_id: "preview",
          url: form.url,
          platform: form.platform,
          handle: form.handle,
          preview: true,
        },
      });
      if (!error && data && !data.error) {
        if (data.risk_flags) set("risk_flags", data.risk_flags);
        if (data.why_flagged?.length) set("why_flagged", data.why_flagged);
        if (data.source_type_suggestion) set("ai_suggested_type", data.source_type_suggestion);
        if (data.risk_type_suggestion) set("ai_suggested_risk", data.risk_type_suggestion);
        if (data.suggested_tags?.length) {
          set("tags", [...new Set([...form.tags, ...data.suggested_tags])]);
        }
        if (typeof data.ai_confidence === "number") set("ai_confidence", data.ai_confidence);
      }
    } catch (_) {}
    setEnriching(false);
    setEnrichDone(true);
  };

  const acceptAiSuggestions = () => {
    if (form.ai_suggested_type && form.ai_suggested_type !== "unknown") set("source_type", form.ai_suggested_type);
    if (form.ai_suggested_risk && form.ai_suggested_risk !== "none") set("risk_type", form.ai_suggested_risk);
    toast({ title: "AI suggestions applied" });
  };

  const applyPreset = (preset: typeof WATCHLIST_PRESETS[0]) => {
    set("monitoring_intent", preset.intent);
    set("risk_type", preset.risk);
    set("severity", preset.severity);
    toast({ title: `Preset applied: ${preset.label}` });
  };

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || form.tags.includes(t)) return;
    set("tags", [...form.tags, t]);
  };

  const removeTag = (tag: string) => set("tags", form.tags.filter(t => t !== tag));

  const addEvidence = () => {
    if (!evidenceInput.url) return;
    set("evidence_links", [...form.evidence_links, { ...evidenceInput }]);
    setEvidenceInput({ url: "", label: "", note: "" });
  };

  const handleSave = async () => {
    if (!currentOrg) return;
    setSaving(true);
    try {
      const payload: any = {
        org_id: currentOrg.id,
        platform: form.platform,
        url: form.url || null,
        handle: form.handle || null,
        display_name: form.display_name || null,
        notes: form.notes || null,
        reason_added: form.reason_added || null,
        monitoring_intent: form.monitoring_intent || null,
        source_type: form.source_type,
        risk_type: form.risk_type,
        severity: form.severity,
        status: form.status,
        credibility: form.credibility || null,
        relationship_to_brand: form.relationship_to_brand || null,
        ownership_type: form.ownership_type || null,
        action_recommendation: form.action_recommendation || null,
        claimed_affiliation: form.claimed_affiliation || null,
        actual_affiliation: form.actual_affiliation || null,
        tags: form.tags.length ? form.tags : null,
        watch_keywords: form.watch_keywords
          ? form.watch_keywords.split(",").map(s => s.trim()).filter(Boolean)
          : null,
        alert_enabled: form.alert_enabled,
        evidence_links: form.evidence_links.length ? form.evidence_links : null,
        known_aliases: form.known_aliases
          ? form.known_aliases.split(",").map(s => s.trim()).filter(Boolean)
          : null,
        ai_suggested_type: form.ai_suggested_type || null,
        ai_suggested_risk: form.ai_suggested_risk || null,
        ai_confidence: form.ai_confidence || null,
        risk_flags: Object.keys(form.risk_flags).length ? form.risk_flags : null,
        first_seen_at: new Date().toISOString(),
        audit_log: [{ action: "created", at: new Date().toISOString(), by: "user" }],
      };

      const { data: inserted, error } = await (supabase as any)
        .from("entity_records")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      // Trigger real enrichment in background
      if (form.url && inserted?.id) {
        supabase.functions.invoke("enrich-entity", {
          body: { entity_id: inserted.id, url: form.url, platform: form.platform, handle: form.handle },
        }).catch(() => {});
      }

      toast({ title: "Entity added", description: form.display_name || form.handle || form.url || "New entity created" });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const platformObj = PLATFORMS.find(p => p.value === form.platform);
  const activeRiskFlags = Object.entries(form.risk_flags).filter(([, v]) => v === true);
  const canProceedStep0 = form.url || form.handle || form.display_name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Add Entity Record
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${
                i < step ? "bg-primary text-primary-foreground" :
                i === step ? "bg-primary/20 text-primary border border-primary/40" :
                "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        {/* ── STEP 0: Source ── */}
        {step === 0 && (
          <div className="space-y-4">
            {/* Watchlist presets */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Quick preset</Label>
              <div className="flex flex-wrap gap-1.5">
                {WATCHLIST_PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    className="text-[10px] px-2.5 py-1 rounded-full border border-border bg-muted/40 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Platform</Label>
                <Select value={form.platform} onValueChange={v => set("platform", v)}>
                  <SelectTrigger className="bg-muted border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(p => (
                      <SelectItem key={p.value} value={p.value}>
                        <span className="mr-2">{p.icon}</span>{p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Handle / Username</Label>
                <Input value={form.handle} onChange={e => set("handle", e.target.value)}
                  placeholder="@handle or username" className="bg-muted border-border" />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Profile URL</Label>
              <Input value={form.url} onChange={e => handleUrlChange(e.target.value)}
                placeholder="https://x.com/example — auto-detects platform" className="bg-muted border-border" />
              {form.url && form.platform !== "unknown" && (
                <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Platform detected: {platformObj?.label}
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Display name (optional)</Label>
              <Input value={form.display_name} onChange={e => set("display_name", e.target.value)}
                placeholder="Known name or account title" className="bg-muted border-border" />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Reason for adding</Label>
              <Select value={form.reason_added} onValueChange={v => set("reason_added", v)}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {REASON_ADDED_PRESETS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Notes</Label>
              <Textarea value={form.notes} onChange={e => set("notes", e.target.value)}
                placeholder="What do you know about this source? Why is it significant?" rows={2} className="bg-muted border-border text-sm" />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(1)} disabled={!canProceedStep0} className="gap-2">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 1: Enrich ── */}
        {step === 1 && (
          <div className="space-y-4">
            {enriching ? (
              <div className="flex flex-col items-center py-12 gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Analyzing profile…</p>
                  <p className="text-xs text-muted-foreground mt-1">Attempting to scrape and classify {form.url || form.handle}</p>
                </div>
              </div>
            ) : (
              <>
                {/* AI classification suggestions */}
                {(form.ai_suggested_type || form.ai_suggested_risk) && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">AI suggests</span>
                      {form.ai_confidence > 0 && (
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary ml-auto">
                          {Math.round(form.ai_confidence * 100)}% confidence
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {form.ai_suggested_type && (
                        <div className="bg-card border border-border rounded-lg p-2.5">
                          <p className="text-[10px] text-muted-foreground">Source type</p>
                          <p className="text-xs font-medium text-foreground mt-0.5">{toLabel(form.ai_suggested_type)}</p>
                        </div>
                      )}
                      {form.ai_suggested_risk && (
                        <div className="bg-card border border-border rounded-lg p-2.5">
                          <p className="text-[10px] text-muted-foreground">Risk type</p>
                          <p className="text-xs font-medium text-foreground mt-0.5">{toLabel(form.ai_suggested_risk)}</p>
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={acceptAiSuggestions} className="gap-1.5 h-7 text-xs">
                      <Sparkles className="h-3 w-3 text-primary" /> Accept AI suggestions
                    </Button>
                  </div>
                )}

                {/* Risk flags */}
                {activeRiskFlags.length > 0 && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                      <span className="text-sm font-medium text-red-400">Risk flags detected ({activeRiskFlags.length})</span>
                    </div>
                    {activeRiskFlags.map(([flag]) => (
                      <div key={flag} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1 flex-shrink-0" />
                        <span>{RISK_FLAG_LABELS[flag] || toLabel(flag)}</span>
                        {(form.risk_flags as any)[`${flag}_reason`] && (
                          <span className="text-red-400/70">— {(form.risk_flags as any)[`${flag}_reason`]}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Why flagged */}
                {form.why_flagged.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Why flagged</p>
                    {form.why_flagged.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Info className="h-3 w-3 text-amber-400 flex-shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggested tags */}
                {form.tags.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Suggested tags added</p>
                    <div className="flex flex-wrap gap-1.5">
                      {form.tags.map(t => (
                        <Badge key={t} variant="outline" className="text-[10px] border-primary/20 text-primary bg-primary/5">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {!form.ai_suggested_type && !form.ai_suggested_risk && activeRiskFlags.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Could not auto-enrich this source.</p>
                    <p className="text-xs mt-1">You can fill in classification manually in the next step.</p>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(0)} disabled={enriching}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep(2)} disabled={enriching} className="gap-2">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Classify ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Source type */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Source type</Label>
                <Select value={form.source_type} onValueChange={v => set("source_type", v)}>
                  <SelectTrigger className="bg-muted border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Brand", "Media", "Public", "Threat", "External", ""].map(group => {
                      const items = SOURCE_TYPES.filter(s => s.group === group);
                      if (!items.length) return null;
                      return (
                        <div key={group || "other"}>
                          {group && <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">{group}</div>}
                          {items.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </div>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Risk type */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Risk type</Label>
                <Select value={form.risk_type} onValueChange={v => set("risk_type", v)}>
                  <SelectTrigger className="bg-muted border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_TYPES.map(r => (
                      <SelectItem key={r.value} value={r.value}>
                        <span className={r.color}>{r.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Severity */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Severity</Label>
                <Select value={form.severity} onValueChange={v => set("severity", v)}>
                  <SelectTrigger className="bg-muted border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      { v: "low", c: "text-muted-foreground" },
                      { v: "moderate", c: "text-amber-400" },
                      { v: "high", c: "text-orange-400" },
                      { v: "critical", c: "text-red-400" },
                    ].map(s => (
                      <SelectItem key={s.v} value={s.v}>
                        <span className={`capitalize ${s.c}`}>{s.v}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
                <Select value={form.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger className="bg-muted border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Monitoring intent */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Monitoring intent</Label>
                <Select value={form.monitoring_intent} onValueChange={v => set("monitoring_intent", v)}>
                  <SelectTrigger className="bg-muted border-border text-xs">
                    <SelectValue placeholder="Why are you tracking this?" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONITORING_INTENTS.map(m => (
                      <SelectItem key={m} value={m}>{toLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Credibility */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Credibility</Label>
                <Select value={form.credibility} onValueChange={v => set("credibility", v)}>
                  <SelectTrigger className="bg-muted border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CREDIBILITY.map(c => (
                      <SelectItem key={c.value} value={c.value}>
                        <span className={c.color}>{c.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Relationship to brand */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Relationship to brand</Label>
                <Select value={form.relationship_to_brand} onValueChange={v => set("relationship_to_brand", v)}>
                  <SelectTrigger className="bg-muted border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP.map(r => (
                      <SelectItem key={r} value={r}>{toLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Action recommendation */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Action recommendation</Label>
                <Select value={form.action_recommendation} onValueChange={v => set("action_recommendation", v)}>
                  <SelectTrigger className="bg-muted border-border text-xs">
                    <SelectValue placeholder="What action?" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_RECOMMENDATIONS.map(a => (
                      <SelectItem key={a} value={a}>{toLabel(a)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep(3)} className="gap-2">Next <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Details & Save ── */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Summary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><span className="text-muted-foreground">Platform: </span><span className="text-foreground">{PLATFORMS.find(p => p.value === form.platform)?.label}</span></div>
                <div><span className="text-muted-foreground">Source type: </span><span className="text-foreground">{toLabel(form.source_type)}</span></div>
                <div><span className="text-muted-foreground">Risk: </span><span className="text-foreground">{toLabel(form.risk_type)}</span></div>
                <div><span className="text-muted-foreground">Severity: </span><span className={`capitalize font-medium ${form.severity === "critical" ? "text-red-400" : form.severity === "high" ? "text-orange-400" : form.severity === "moderate" ? "text-amber-400" : "text-muted-foreground"}`}>{form.severity}</span></div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Tags</Label>
              <div className="flex gap-2">
                <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  placeholder="Type and press Enter" className="bg-muted border-border text-sm"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); setTagInput(""); } }} />
                <Button variant="outline" size="sm" onClick={() => { addTag(tagInput); setTagInput(""); }}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map(t => (
                    <Badge key={t} variant="outline" className="text-xs gap-1.5 border-border">
                      {t}
                      <button onClick={() => removeTag(t)}><X className="h-2.5 w-2.5 hover:text-destructive" /></button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {SUGGESTED_TAGS.filter(t => !form.tags.includes(t)).slice(0, 12).map(t => (
                  <button key={t} onClick={() => addTag(t)}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted/40 hover:border-primary/30 hover:text-primary text-muted-foreground transition-colors">
                    + {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Claimed affiliation</Label>
                <Input value={form.claimed_affiliation} onChange={e => set("claimed_affiliation", e.target.value)}
                  placeholder="What they claim" className="bg-muted border-border text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Actual affiliation</Label>
                <Input value={form.actual_affiliation} onChange={e => set("actual_affiliation", e.target.value)}
                  placeholder="What you believe" className="bg-muted border-border text-sm" />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Known aliases (comma-separated)</Label>
              <Input value={form.known_aliases} onChange={e => set("known_aliases", e.target.value)}
                placeholder="alias1, alias2, alias3" className="bg-muted border-border text-sm" />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Watch keywords (comma-separated)</Label>
              <Input value={form.watch_keywords} onChange={e => set("watch_keywords", e.target.value)}
                placeholder="keyword1, keyword2" className="bg-muted border-border text-sm" />
            </div>

            {/* Evidence links */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Evidence links</Label>
              <div className="flex gap-2 mb-1.5">
                <Input value={evidenceInput.url} onChange={e => setEvidenceInput(p => ({ ...p, url: e.target.value }))}
                  placeholder="URL" className="bg-muted border-border text-sm flex-1" />
                <Input value={evidenceInput.label} onChange={e => setEvidenceInput(p => ({ ...p, label: e.target.value }))}
                  placeholder="Label" className="bg-muted border-border text-sm w-28" />
                <Button variant="outline" size="sm" onClick={addEvidence}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
              {form.evidence_links.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  <a href={ev.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground truncate flex-1">{ev.label || ev.url}</a>
                  <button onClick={() => set("evidence_links", form.evidence_links.filter((_, j) => j !== i))}><X className="h-3 w-3 hover:text-destructive" /></button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Enable alerts</p>
                <p className="text-[10px] text-muted-foreground">Get notified when new mentions match this entity</p>
              </div>
              <Switch checked={form.alert_enabled} onCheckedChange={v => set("alert_enabled", v)} />
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                {saving ? "Saving…" : "Save Entity"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
