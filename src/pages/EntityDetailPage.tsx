import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, RefreshCw, Shield, CheckCircle2, AlertTriangle, Globe,
  ExternalLink, Plus, X, Loader2, Brain, Tag, Info, Clock, Eye,
  User2, MapPin, Link2, Hash, StickyNote, FileText, Bell, Save,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import PageGuide from "@/components/PageGuide";
import {
  PLATFORMS, SOURCE_TYPES, RISK_TYPES, SEVERITIES, STATUSES,
  MONITORING_INTENTS, CREDIBILITY, RELATIONSHIP, ACTION_RECOMMENDATIONS,
  OWNERSHIP_TYPES, SUGGESTED_TAGS, RISK_FLAG_LABELS,
} from "@/lib/entityConstants";

function toLabel(s: string | null | undefined) {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface EntityRecord {
  id: string;
  platform: string;
  url: string | null;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  profile_image_url: string | null;
  follower_count: number | null;
  following_count: number | null;
  verified: boolean | null;
  account_created_at: string | null;
  region: string | null;
  language: string | null;
  website_in_bio: string | null;
  detected_topics: string[] | null;
  recent_posts: any;
  engagement_pattern: string | null;
  source_type: string;
  risk_type: string;
  intent_type: string | null;
  credibility: string | null;
  relationship_to_brand: string | null;
  ownership_type: string | null;
  severity: string;
  confidence: string;
  status: string;
  action_recommendation: string | null;
  monitoring_intent: string | null;
  watch_keywords: string[] | null;
  alert_enabled: boolean;
  risk_flags: any;
  ai_suggested_type: string | null;
  ai_suggested_risk: string | null;
  ai_suggested_flags: any;
  ai_confidence: number | null;
  enrichment_confidence: any;
  enriched_at: string | null;
  tags: string[] | null;
  notes: string | null;
  reason_added: string | null;
  claimed_affiliation: string | null;
  actual_affiliation: string | null;
  known_aliases: string[] | null;
  evidence_links: any;
  linked_incident_ids: string[] | null;
  linked_narrative_ids: string[] | null;
  linked_people_ids: string[] | null;
  audit_log: any;
  why_flagged: string[] | null;
  changed_fields: string[] | null;
  created_at: string;
  updated_at: string;
  first_seen_at: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground border-muted-foreground/30",
  moderate: "text-amber-400 border-amber-400/30",
  high: "text-orange-400 border-orange-400/30",
  critical: "text-red-400 border-red-400/30 bg-red-400/5",
};

export default function EntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [entity, setEntity] = useState<EntityRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [editingSidebar, setEditingSidebar] = useState(false);
  const [sidebarDraft, setSidebarDraft] = useState<Partial<EntityRecord>>({});
  const [tagInput, setTagInput] = useState("");
  const [evidenceInput, setEvidenceInput] = useState({ url: "", label: "", note: "" });

  const fetchEntity = useCallback(async () => {
    if (!id) return;
    const { data } = await (supabase as any).from("entity_records").select("*").eq("id", id).maybeSingle();
    setEntity(data as EntityRecord | null);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchEntity(); }, [fetchEntity]);

  const patch = async (fields: Partial<EntityRecord>) => {
    if (!id) return;
    const { error } = await (supabase as any).from("entity_records").update({
      ...fields,
      audit_log: entity?.audit_log ? [
        ...(Array.isArray(entity.audit_log) ? entity.audit_log : []),
        { action: "updated", fields: Object.keys(fields), at: new Date().toISOString() },
      ] : [{ action: "updated", fields: Object.keys(fields), at: new Date().toISOString() }],
    } as any).eq("id", id);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setEntity(prev => prev ? { ...prev, ...fields } : prev);
  };

  const handleReEnrich = async () => {
    if (!entity) return;
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-entity", {
        body: { entity_id: entity.id, url: entity.url, platform: entity.platform, handle: entity.handle },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({ title: "Enrichment complete", description: `${data.fields_found?.length || 0} fields updated` });
      await fetchEntity();
    } catch (err: any) {
      toast({ title: "Enrichment failed", description: err.message, variant: "destructive" });
    } finally {
      setEnriching(false);
    }
  };

  const saveSidebar = async () => {
    await patch(sidebarDraft);
    setEditingSidebar(false);
    setSidebarDraft({});
    toast({ title: "Profile updated" });
  };

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t) return;
    const current = entity?.tags || [];
    if (current.includes(t)) return;
    patch({ tags: [...current, t] });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    patch({ tags: (entity?.tags || []).filter(t => t !== tag) });
  };

  const platformObj = entity ? PLATFORMS.find(p => p.value === entity.platform) : null;
  const initials = (entity?.display_name || entity?.handle || "?").slice(0, 2).toUpperCase();
  const riskObj = entity ? RISK_TYPES.find(r => r.value === entity.risk_type) : null;
  const statusObj = entity ? STATUSES.find(s => s.value === entity.status) : null;
  const activeFlags = entity?.risk_flags ? Object.entries(entity.risk_flags).filter(([k, v]) => v === true && !k.endsWith("_reason")) : [];

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-up">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-6">
          <Skeleton className="w-72 h-96 rounded-xl flex-shrink-0" />
          <Skeleton className="flex-1 h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="text-center py-20">
        <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">Entity not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/entities")} className="mt-4">← Back to Entities</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/entities")} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Entities
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-foreground font-medium">{entity.display_name || entity.handle || entity.url || entity.id.slice(0, 8)}</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── LEFT SIDEBAR ── */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-3">
          <Card className="bg-card border-border p-5 space-y-4">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center text-xl font-bold text-primary relative">
                {initials}
                {entity.verified && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div className="text-center">
                {editingSidebar ? (
                  <Input
                    defaultValue={entity.display_name || ""}
                    onChange={e => setSidebarDraft(d => ({ ...d, display_name: e.target.value }))}
                    className="bg-muted border-border text-sm text-center mb-1"
                  />
                ) : (
                  <h2 className="text-base font-semibold text-foreground">{entity.display_name || "Unknown"}</h2>
                )}
                {entity.handle && <p className="text-xs text-muted-foreground">@{entity.handle}</p>}
              </div>
            </div>

            {/* Platform + verified */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs gap-1.5">
                <span>{platformObj?.icon}</span>{platformObj?.label || entity.platform}
              </Badge>
              {entity.verified && <Badge variant="outline" className="text-xs text-primary border-primary/30">✓ Verified</Badge>}
            </div>

            {/* Bio */}
            {entity.bio && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{entity.bio}</p>
            )}

            {/* Metrics */}
            {(entity.follower_count != null || entity.following_count != null) && (
              <div className="flex gap-3 text-center">
                {entity.follower_count != null && (
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground">{entity.follower_count.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">followers</p>
                  </div>
                )}
                {entity.following_count != null && (
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground">{entity.following_count.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">following</p>
                  </div>
                )}
              </div>
            )}

            {/* Metadata rows */}
            <div className="space-y-1.5">
              {entity.region && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 flex-shrink-0" /> {entity.region}
                </div>
              )}
              {entity.language && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3 flex-shrink-0" /> {entity.language}
                </div>
              )}
              {entity.website_in_bio && (
                <a href={entity.website_in_bio} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary hover:underline">
                  <Link2 className="h-3 w-3 flex-shrink-0" /> {entity.website_in_bio.replace(/^https?:\/\//, "")}
                </a>
              )}
              {entity.url && (
                <a href={entity.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3 w-3 flex-shrink-0" /> View profile
                </a>
              )}
              {entity.enriched_at && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                  <Clock className="h-3 w-3" /> Enriched {formatDistanceToNow(new Date(entity.enriched_at), { addSuffix: true })}
                </div>
              )}
            </div>

            {/* Actions */}
            {editingSidebar ? (
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 gap-1.5" onClick={saveSidebar}>
                  <Save className="h-3.5 w-3.5" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingSidebar(false); setSidebarDraft({}); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={handleReEnrich} disabled={enriching}>
                  {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {enriching ? "Enriching…" : "Re-enrich"}
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => setEditingSidebar(true)}>
                  Edit
                </Button>
              </div>
            )}
          </Card>

          {/* Risk pill */}
          <Card className={`bg-card border p-3 ${entity.severity === "critical" ? "border-red-500/30" : "border-border"}`}>
            <div className="flex items-center justify-between">
              <div>
                <Badge variant="outline" className={`text-xs capitalize ${SEVERITY_COLORS[entity.severity] || ""}`}>
                  {entity.severity}
                </Badge>
                {riskObj && (
                  <p className={`text-xs mt-1 ${riskObj.color}`}>{riskObj.label}</p>
                )}
              </div>
              {statusObj && (
                <Badge variant="outline" className={`text-[10px] ${statusObj.color}`}>{statusObj.label}</Badge>
              )}
            </div>
          </Card>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 min-w-0">
          <PageGuide
            title="Entity Intelligence Record"
            subtitle="Full profile of a tracked account, source, or actor"
            steps={[
              { icon: <Brain className="h-4 w-4 text-primary" />, title: "Overview", description: "AI classification, risk flags, and detected topics." },
              { icon: <Shield className="h-4 w-4 text-primary" />, title: "Classification", description: "Edit source type, risk, credibility, and monitoring settings." },
              { icon: <FileText className="h-4 w-4 text-primary" />, title: "Evidence", description: "Attach URLs, screenshots, and case notes." },
            ]}
          />

          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="bg-muted border border-border">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="classification">Classification</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="audit">Audit Log</TabsTrigger>
            </TabsList>

            {/* ── OVERVIEW ── */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* AI vs Manual */}
              {(entity.ai_suggested_type || entity.ai_suggested_risk) && (
                <Card className="bg-card border-border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-medium text-foreground">AI vs Manual Classification</h3>
                    {entity.ai_confidence != null && (
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary ml-auto">
                        {Math.round((entity.ai_confidence || 0) * 100)}% AI confidence
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground mb-1">Source type</p>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">AI</span>
                          <span className="text-muted-foreground">{toLabel(entity.ai_suggested_type)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">You</span>
                          <span className="text-foreground font-medium">{toLabel(entity.source_type)}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Risk type</p>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">AI</span>
                          <span className="text-muted-foreground">{toLabel(entity.ai_suggested_risk)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">You</span>
                          <span className={`font-medium ${riskObj?.color || "text-foreground"}`}>{riskObj?.label || toLabel(entity.risk_type)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Risk flags */}
              <Card className="bg-card border-border p-4 space-y-3">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" /> Risk Flags
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(RISK_FLAG_LABELS).map(([flag, label]) => {
                    const flagVal = entity.risk_flags?.[flag];
                    const isTrue = flagVal === true;
                    const reason = entity.risk_flags?.[`${flag}_reason`];
                    return (
                      <div key={flag} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${isTrue ? "bg-red-500/5 border border-red-500/15" : "bg-muted/30"}`}>
                        {isTrue
                          ? <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                          : <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0 mt-0.5" />}
                        <div>
                          <span className={isTrue ? "text-red-300 font-medium" : "text-muted-foreground/60"}>{label}</span>
                          {reason && <p className="text-[10px] text-muted-foreground mt-0.5">{reason}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Why flagged */}
                {entity.why_flagged && entity.why_flagged.length > 0 && (
                  <div className="pt-2 border-t border-border space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Why flagged</p>
                    {entity.why_flagged.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Info className="h-3 w-3 text-amber-400 flex-shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Detected topics */}
              {entity.detected_topics && entity.detected_topics.length > 0 && (
                <Card className="bg-card border-border p-4 space-y-2">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Hash className="h-4 w-4 text-primary" /> Detected Topics
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {entity.detected_topics.map(t => (
                      <Badge key={t} variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5">{t}</Badge>
                    ))}
                  </div>
                </Card>
              )}

              {/* Recent posts */}
              {entity.recent_posts && Array.isArray(entity.recent_posts) && entity.recent_posts.length > 0 && (
                <Card className="bg-card border-border p-4 space-y-3">
                  <h3 className="text-sm font-medium text-foreground">Recent Posts</h3>
                  {(entity.recent_posts as any[]).slice(0, 3).map((post: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs border-b border-border/50 last:border-0 pb-2 last:pb-0">
                      <div className="flex-1 text-muted-foreground">{post.text?.slice(0, 200)}</div>
                      {post.url && (
                        <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-primary flex-shrink-0">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </Card>
              )}

              {/* Related entities */}
              {((entity.linked_incident_ids?.length || 0) + (entity.linked_narrative_ids?.length || 0) + (entity.linked_people_ids?.length || 0)) > 0 && (
                <Card className="bg-card border-border p-4 space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Related Entities</h3>
                  <div className="flex flex-wrap gap-2">
                    {(entity.linked_incident_ids || []).map(id => (
                      <button key={id} onClick={() => navigate(`/incidents/${id}`)}
                        className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors">
                        Incident
                      </button>
                    ))}
                    {(entity.linked_narrative_ids || []).map(id => (
                      <button key={id} onClick={() => navigate(`/narratives/${id}`)}
                        className="text-xs px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors">
                        Narrative
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </TabsContent>

            {/* ── CLASSIFICATION ── */}
            <TabsContent value="classification" className="space-y-4 mt-4">
              <Card className="bg-card border-border p-5">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Source type", key: "source_type", options: SOURCE_TYPES.map(s => ({ value: s.value, label: s.label })) },
                    { label: "Risk type", key: "risk_type", options: RISK_TYPES.map(r => ({ value: r.value, label: r.label })) },
                    { label: "Severity", key: "severity", options: SEVERITIES.map(s => ({ value: s, label: toLabel(s) })) },
                    { label: "Status", key: "status", options: STATUSES.map(s => ({ value: s.value, label: s.label })) },
                    { label: "Monitoring intent", key: "monitoring_intent", options: MONITORING_INTENTS.map(m => ({ value: m, label: toLabel(m) })) },
                    { label: "Credibility", key: "credibility", options: CREDIBILITY.map(c => ({ value: c.value, label: c.label })) },
                    { label: "Relationship", key: "relationship_to_brand", options: RELATIONSHIP.map(r => ({ value: r, label: toLabel(r) })) },
                    { label: "Action", key: "action_recommendation", options: ACTION_RECOMMENDATIONS.map(a => ({ value: a, label: toLabel(a) })) },
                  ].map(({ label, key, options }) => (
                    <div key={key}>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
                      <Select value={(entity as any)[key] || ""} onValueChange={v => patch({ [key]: v } as any)}>
                        <SelectTrigger className="bg-muted border-border text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="bg-card border-border p-5 space-y-4">
                {/* Tags */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Tags</Label>
                  <div className="flex gap-2 mb-1.5">
                    <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
                      placeholder="Add tag and press Enter" className="bg-muted border-border text-sm"
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }} />
                    <Button variant="outline" size="sm" onClick={() => addTag(tagInput)}><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(entity.tags || []).map(t => (
                      <Badge key={t} variant="outline" className="text-xs gap-1.5 border-border">
                        {t}
                        <button onClick={() => removeTag(t)}><X className="h-2.5 w-2.5 hover:text-destructive" /></button>
                      </Badge>
                    ))}
                    {SUGGESTED_TAGS.filter(t => !(entity.tags || []).includes(t)).slice(0, 8).map(t => (
                      <button key={t} onClick={() => addTag(t)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted/40 hover:border-primary/30 hover:text-primary text-muted-foreground transition-colors">
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Watch keywords */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Watch keywords (comma-separated)</Label>
                  <Textarea
                    defaultValue={(entity.watch_keywords || []).join(", ")}
                    onBlur={e => patch({ watch_keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                    rows={2} className="bg-muted border-border text-sm"
                  />
                </div>

                {/* Alert toggle */}
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <Bell className="h-4 w-4 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Alert enabled</p>
                    <p className="text-[10px] text-muted-foreground">Notify when new mentions appear for this entity</p>
                  </div>
                  <Switch checked={entity.alert_enabled} onCheckedChange={v => patch({ alert_enabled: v })} />
                </div>

                {/* Affiliations */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Claimed affiliation</Label>
                    <Input defaultValue={entity.claimed_affiliation || ""} onBlur={e => patch({ claimed_affiliation: e.target.value })} className="bg-muted border-border text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Actual affiliation</Label>
                    <Input defaultValue={entity.actual_affiliation || ""} onBlur={e => patch({ actual_affiliation: e.target.value })} className="bg-muted border-border text-sm" />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Notes</Label>
                  <Textarea defaultValue={entity.notes || ""} onBlur={e => patch({ notes: e.target.value })} rows={3} className="bg-muted border-border text-sm" />
                </div>
              </Card>
            </TabsContent>

            {/* ── EVIDENCE ── */}
            <TabsContent value="evidence" className="space-y-4 mt-4">
              <Card className="bg-card border-border p-5 space-y-4">
                <h3 className="text-sm font-medium text-foreground">Evidence Links</h3>
                <div className="flex gap-2">
                  <Input value={evidenceInput.url} onChange={e => setEvidenceInput(p => ({ ...p, url: e.target.value }))}
                    placeholder="URL" className="bg-muted border-border text-sm flex-1" />
                  <Input value={evidenceInput.label} onChange={e => setEvidenceInput(p => ({ ...p, label: e.target.value }))}
                    placeholder="Label" className="bg-muted border-border text-sm w-28" />
                  <Button variant="outline" size="sm" onClick={() => {
                    if (!evidenceInput.url) return;
                    const links = Array.isArray(entity.evidence_links) ? entity.evidence_links : [];
                    patch({ evidence_links: [...links, { ...evidenceInput }] });
                    setEvidenceInput({ url: "", label: "", note: "" });
                  }}><Plus className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="space-y-1.5">
                  {(Array.isArray(entity.evidence_links) ? entity.evidence_links : []).map((ev: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 border-b border-border/50">
                      <ExternalLink className="h-3 w-3 flex-shrink-0 text-primary" />
                      <a href={ev.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground truncate flex-1">{ev.label || ev.url}</a>
                      {ev.note && <span className="text-muted-foreground/60 truncate max-w-[120px]">{ev.note}</span>}
                      <button onClick={() => {
                        const links = (Array.isArray(entity.evidence_links) ? entity.evidence_links : []) as any[];
                        patch({ evidence_links: links.filter((_: any, j: number) => j !== i) });
                      }}><X className="h-3 w-3 hover:text-destructive" /></button>
                    </div>
                  ))}
                  {(!entity.evidence_links || (entity.evidence_links as any[]).length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-4">No evidence links yet. Add URLs, screenshots, or archive links.</p>
                  )}
                </div>

                {entity.reason_added && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">Reason added: <span className="text-foreground">{entity.reason_added}</span></p>
                  </div>
                )}

                {/* Known aliases */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Known aliases (comma-separated)</Label>
                  <Input
                    defaultValue={(entity.known_aliases || []).join(", ")}
                    onBlur={e => patch({ known_aliases: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                    className="bg-muted border-border text-sm"
                  />
                </div>
              </Card>
            </TabsContent>

            {/* ── AUDIT LOG ── */}
            <TabsContent value="audit" className="mt-4">
              <Card className="bg-card border-border p-5 space-y-3">
                <h3 className="text-sm font-medium text-foreground">Audit Trail</h3>
                {Array.isArray(entity.audit_log) && entity.audit_log.length > 0 ? (
                  <div className="space-y-2">
                    {(entity.audit_log as any[]).slice().reverse().map((entry: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize">{entry.action || "event"}</Badge>
                            {entry.source && <span className="text-[10px] text-muted-foreground">via {entry.source}</span>}
                            {entry.fields?.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">· {entry.fields.join(", ")}</span>
                            )}
                            {typeof entry.confidence === "number" && (
                              <span className="text-[10px] text-muted-foreground">· {Math.round(entry.confidence * 100)}% confidence</span>
                            )}
                          </div>
                          {entry.at && (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {format(new Date(entry.at), "MMM d, yyyy HH:mm")} · {formatDistanceToNow(new Date(entry.at), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No audit entries yet.</p>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
