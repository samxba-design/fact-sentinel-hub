import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageGuide from "@/components/PageGuide";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, MessageCircleReply, AlertTriangle, CheckCircle2, Ban, Loader2,
  ExternalLink, BookCheck, FileText, Copy, Link2, Search, X, Save, History,
  ChevronDown, ChevronUp, Clock, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import UpgradeBanner from "@/components/UpgradeBanner";
import ResponseCopilot from "@/components/respond/ResponseCopilot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Claim { claim_text: string; category: string; }
interface MatchedFact { id: string; title: string; statement: string; }
interface LinkUsed { fact_id: string; link: string; }
interface ResponseResult {
  status: "blocked" | "draft";
  message: string;
  claims: Claim[];
  matched_facts: MatchedFact[];
  unmatched_claims?: string[];
  links_used?: LinkUsed[];
  template_used?: { id: string; name: string } | null;
  escalation_id?: string;
  draft_id?: string;
}

interface TagItem { id: string; label: string; type: "narrative" | "incident" | "mention"; }

export default function RespondPage() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as any) || {};
  const [inputText, setInputText] = useState(prefill.prefillText || "");
  const [platform, setPlatform] = useState("general");
  const [intent, setIntent] = useState("");
  const [result, setResult] = useState<ResponseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftHistory, setDraftHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [factsCount, setFactsCount] = useState<number | null>(null);

  // Internal linking
  const [tagSearch, setTagSearch] = useState("");
  const [tagResults, setTagResults] = useState<TagItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [searching, setSearching] = useState(false);

  // Check if approved facts exist
  useEffect(() => {
    if (!currentOrg) return;
    supabase.from("approved_facts").select("id", { count: "exact", head: true })
      .eq("org_id", currentOrg.id).eq("status", "active")
      .then(({ count }) => setFactsCount(count ?? 0));
  }, [currentOrg]);

  useEffect(() => {
    if (!currentOrg || tagSearch.length < 2) { setTagResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const [narr, inc, men] = await Promise.all([
        supabase.from("narratives").select("id, name").eq("org_id", currentOrg.id).ilike("name", `%${tagSearch}%`).limit(3),
        supabase.from("incidents").select("id, name").eq("org_id", currentOrg.id).ilike("name", `%${tagSearch}%`).limit(3),
        supabase.from("mentions").select("id, content, source").eq("org_id", currentOrg.id).eq("mention_type", "brand").textSearch("content", tagSearch, { type: "plain" }).limit(3),
      ]);
      setTagResults([
        ...(narr.data || []).map(n => ({ id: n.id, label: n.name, type: "narrative" as const })),
        ...(inc.data || []).map(i => ({ id: i.id, label: i.name, type: "incident" as const })),
        ...(men.data || []).map(m => ({ id: m.id, label: `[${m.source}] ${(m.content || "").slice(0, 50)}...`, type: "mention" as const })),
      ]);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [tagSearch, currentOrg]);

  const addTag = (item: TagItem) => {
    if (!tags.find(t => t.id === item.id)) setTags(prev => [...prev, item]);
    setTagSearch("");
    setTagResults([]);
  };

  const handleGenerate = async () => {
    if (!currentOrg || !inputText || !intent) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("strict-respond", {
        body: {
          input_text: inputText, platform, intent, org_id: currentOrg.id,
          linked_ids: tags.map(t => ({ id: t.id, type: t.type })),
        },
      });
      if (error) throw new Error(error.message || "Failed to generate response");
      if (data?.error) throw new Error(data.error);
      setResult(data as ResponseResult);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const saveDraft = async () => {
    if (!currentOrg || !result || result.status !== "draft") return;
    setSaving(true);
    try {
      const { error } = await supabase.from("response_drafts").insert({
        org_id: currentOrg.id,
        source_type: prefill.sourceMentionId ? "mention" : "paste",
        source_mention_id: prefill.sourceMentionId || null,
        input_text: inputText,
        output_text: result.message,
        status: "draft",
        facts_used: result.matched_facts.map(f => ({ id: f.id, title: f.title, statement: f.statement })),
        claims_extracted: result.claims,
        created_by: user?.id || null,
      });
      if (error) throw error;
      toast({ title: "Draft saved", description: "Saved to your response drafts." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = useCallback(async () => {
    if (!currentOrg) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from("response_drafts")
      .select("id, input_text, output_text, status, created_at, source_type")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setDraftHistory(data || []);
    setLoadingHistory(false);
  }, [currentOrg]);

  const typeIcons: Record<string, string> = { narrative: "🧵", incident: "🚨", mention: "📌" };

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl">
      <UpgradeBanner feature="AI Response Drafting" className="mb-2" />
      {prefill.sourceMentionId && (
        <Button variant="ghost" size="sm" onClick={() => navigate(`/mentions/${prefill.sourceMentionId}`)} className="gap-1.5 -mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Mention
        </Button>
      )}
      <div>
        <h1 className="text-2xl font-bold text-foreground">How To Respond</h1>
        <p className="text-sm text-muted-foreground mt-1">Strict response engine & AI copilot</p>
      </div>

      <Tabs defaultValue="strict" className="space-y-4">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="strict"><MessageCircleReply className="h-3.5 w-3.5 mr-1.5" /> Strict Engine</TabsTrigger>
          <TabsTrigger value="copilot"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI Copilot</TabsTrigger>
        </TabsList>

        <TabsContent value="copilot">
          <ResponseCopilot prefillText={prefill.prefillText} mentionId={prefill.sourceMentionId} />
        </TabsContent>

        <TabsContent value="strict" className="space-y-6">

      <PageGuide
        title="How the Response Engine Works"
        subtitle="AI drafts grounded exclusively in your approved facts — never hallucinated"
        steps={[
          {
            icon: <AlertTriangle className="h-4 w-4 text-primary" />,
            title: "1. Paste the Content",
            description: "Paste the negative post, comment, or article you need to respond to. Select the platform and your response intent.",
          },
          {
            icon: <BookCheck className="h-4 w-4 text-primary" />,
            title: "2. AI Extracts & Matches",
            description: "AI extracts claims from the text, then matches each claim against your approved facts library. If any claims can't be matched, the response is blocked and an escalation ticket is auto-created.",
          },
          {
            icon: <MessageCircleReply className="h-4 w-4 text-primary" />,
            title: "3. Draft or Escalate",
            description: "If all claims match, a response is generated using only approved facts and templates. You can link narratives, incidents, or mentions for additional context.",
          },
        ]}
        integrations={[
          { label: "Approved Facts", to: "/approved-facts", description: "Ground truth library" },
          { label: "Templates", to: "/approved-templates", description: "Response templates" },
          { label: "Escalations", to: "/escalations", description: "Blocked response tickets" },
          { label: "Mentions", to: "/mentions", description: "Link source mentions" },
        ]}
        tip="The more approved facts you add, the fewer responses get blocked. Link related narratives or incidents to give the AI better context for nuanced responses."
      />

      {factsCount === 0 && (
        <Card className="border-sentinel-amber/30 bg-sentinel-amber/5 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-sentinel-amber" />
            <div>
              <p className="text-sm font-medium text-card-foreground">No approved facts configured</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The response engine only generates drafts from approved facts. Add your first facts before generating responses.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/approved-facts")}>
            <BookCheck className="h-3.5 w-3.5 mr-1.5" /> Add Approved Facts
          </Button>
        </Card>
      )}

      <Card className="bg-card border-border p-6 space-y-5">
        <div className="space-y-2">
          <Label className="text-foreground">Paste the post or text you need to respond to</Label>
          <Textarea value={inputText} onChange={e => setInputText(e.target.value)}
            placeholder="Paste the negative post, comment, or text here..."
            className="min-h-[120px] bg-muted border-border" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-foreground">Platform constraints</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="short">X (short)</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="long">Long form</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Response intent</Label>
            <Select value={intent} onValueChange={setIntent}>
              <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select intent..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="clarify">Clarify misinformation</SelectItem>
                <SelectItem value="support">Support issue</SelectItem>
                <SelectItem value="scam">Scam warning</SelectItem>
                <SelectItem value="outage">Outage update</SelectItem>
                <SelectItem value="regulatory">Regulatory rumor</SelectItem>
                <SelectItem value="executive">Executive rumor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Internal linking */}
        <div className="space-y-2">
          <Label className="text-foreground flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5" /> Link to narrative, incident, or mention
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={tagSearch} onChange={e => setTagSearch(e.target.value)}
              placeholder="Search to tag a related item..." className="pl-9 text-sm bg-muted border-border" />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          {tagResults.length > 0 && (
            <div className="border border-border rounded-lg bg-card max-h-36 overflow-y-auto">
              {tagResults.map(r => (
                <button key={r.id} onClick={() => addTag(r)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2 border-b border-border last:border-0">
                  <span>{typeIcons[r.type]}</span>
                  <Badge variant="outline" className="text-[8px] shrink-0">{r.type}</Badge>
                  <span className="truncate text-foreground">{r.label}</span>
                </button>
              ))}
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => (
                <Badge key={t.id} variant="secondary" className="text-[10px] gap-1 pr-1">
                  {typeIcons[t.type]} {t.label.slice(0, 35)}{t.label.length > 35 ? "..." : ""}
                  <button onClick={() => setTags(p => p.filter(x => x.id !== t.id))}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button onClick={handleGenerate} disabled={!inputText || !intent || loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircleReply className="h-4 w-4 mr-2" />}
          {loading ? "Analyzing & Matching Facts..." : "Generate Approved Response"}
        </Button>
      </Card>

      {/* Claims Extracted */}
      {result && result.claims.length > 0 && (
        <Card className="bg-card border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Claims Extracted</h3>
          <div className="space-y-2">
            {result.claims.map((c, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">{c.category}</Badge>
                <span className="text-card-foreground">{c.claim_text}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Result: Blocked */}
      {result && result.status === "blocked" && (
        <Card className="bg-sentinel-red/5 border-sentinel-red/20 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Ban className="h-5 w-5 text-sentinel-red" />
            <span className="text-sm font-medium text-sentinel-red">Response Blocked</span>
          </div>
          <p className="text-sm text-card-foreground">{result.message}</p>
          {result.unmatched_claims && result.unmatched_claims.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Unmatched Claims (need approved facts):</p>
              {result.unmatched_claims.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-sentinel-amber">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{c}
                </div>
              ))}
            </div>
          )}
          {result.matched_facts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Partially Matched Facts:</p>
              {result.matched_facts.map(f => (
                <div key={f.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <BookCheck className="h-3 w-3 mt-0.5 shrink-0 text-sentinel-emerald" />
                  <span><strong>{f.title}</strong>: {f.statement}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
            <AlertTriangle className="h-3 w-3" />
            Escalation ticket created. Add approved facts and templates before responding publicly.
          </div>
        </Card>
      )}

      {/* Result: Draft */}
      {result && result.status === "draft" && (
        <div className="space-y-4">
          <Card className="bg-sentinel-emerald/5 border-sentinel-emerald/20 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-sentinel-emerald" />
                <span className="text-sm font-medium text-sentinel-emerald">Draft Generated</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(result.message)}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />Copy
                </Button>
                <Button size="sm" variant="outline" onClick={saveDraft} disabled={saving} className="border-sentinel-emerald/40 text-sentinel-emerald hover:bg-sentinel-emerald/10">
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Save Draft
                </Button>
              </div>
            </div>
            <div className="text-sm text-card-foreground whitespace-pre-wrap leading-relaxed bg-muted/50 rounded-lg p-4 border border-border">
              {result.message}
            </div>
            {result.template_used && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3 w-3" /> Template used: <strong>{result.template_used.name}</strong>
              </div>
            )}
          </Card>

          <Card className="bg-card border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BookCheck className="h-4 w-4 text-sentinel-emerald" /> Facts Used
            </h3>
            <div className="space-y-3">
              {result.matched_facts.map(f => (
                <div key={f.id} className="text-xs space-y-1">
                  <div className="font-medium text-card-foreground">{f.title}</div>
                  <div className="text-muted-foreground italic">"{f.statement}"</div>
                </div>
              ))}
            </div>
          </Card>

          {result.links_used && result.links_used.length > 0 && (
            <Card className="bg-card border-border p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-primary" /> Links Used
              </h3>
              <div className="space-y-2">
                {result.links_used.map((l, i) => (
                  <a key={i} href={l.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline block truncate">
                    {l.link}
                  </a>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Draft history */}
      <Card className="bg-card border-border">
        <button
          onClick={() => { setHistoryOpen(!historyOpen); if (!historyOpen) loadHistory(); }}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/40 transition-colors text-left"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-card-foreground">
            <History className="h-4 w-4 text-muted-foreground" /> Draft History
            <span className="text-xs text-muted-foreground font-normal">— your saved response drafts</span>
          </div>
          {historyOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {historyOpen && (
          <div className="border-t border-border p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Last 10 saved drafts</p>
              <Button variant="ghost" size="sm" onClick={loadHistory} disabled={loadingHistory} className="h-6 text-xs">
                <RefreshCw className={`h-3 w-3 mr-1 ${loadingHistory ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
            {loadingHistory ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : draftHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No saved drafts yet. Generate a response and click Save Draft.</p>
            ) : (
              draftHistory.map(d => (
                <div key={d.id} className="border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1.5 truncate italic">
                        Input: {(d.input_text || "").slice(0, 100)}{(d.input_text || "").length > 100 ? "…" : ""}
                      </p>
                      <p className="text-sm text-card-foreground line-clamp-2">
                        {(d.output_text || "").slice(0, 200)}{(d.output_text || "").length > 200 ? "…" : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <Badge variant="outline" className={`text-[9px] capitalize ${d.status === "draft" ? "border-primary/30 text-primary" : d.status === "approved" ? "border-emerald-500/30 text-emerald-400" : "border-muted-foreground/30 text-muted-foreground"}`}>
                        {d.status}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2 text-primary hover:bg-primary/10"
                        onClick={() => { setInputText(d.input_text || ""); setResult(null); toast({ title: "Loaded into editor" }); }}
                      >
                        Re-use
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}
