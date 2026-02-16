import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BookCheck, Plus, Search, CheckCircle2, Clock, Archive, Pencil, Trash2,
  ExternalLink, FileText, Link2, ShieldCheck, Sparkles, MessageSquareText, AlertTriangle, ArrowRight, Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import FactFormDialog from "@/components/facts/FactFormDialog";
import { useNavigate } from "react-router-dom";

interface Fact {
  id: string;
  title: string;
  statement_text: string;
  category: string | null;
  status: string | null;
  owner_department: string | null;
  last_reviewed: string | null;
  jurisdiction: string | null;
  source_link: string | null;
}

const statusConfig: Record<string, { icon: any; className: string; label: string }> = {
  active: { icon: CheckCircle2, className: "border-sentinel-emerald/30 text-sentinel-emerald", label: "Active" },
  under_review: { icon: Clock, className: "border-sentinel-amber/30 text-sentinel-amber", label: "Under Review" },
  deprecated: { icon: Archive, className: "border-muted-foreground/30 text-muted-foreground", label: "Deprecated" },
};

const HOW_IT_WORKS = [
  {
    icon: Plus,
    title: "Add verified facts",
    description: "Document your organization's official positions, stats, and approved statements with source links.",
  },
  {
    icon: ShieldCheck,
    title: "AI uses them as ground truth",
    description: "When drafting responses, the AI only uses approved facts — never hallucinated data.",
  },
  {
    icon: Sparkles,
    title: "Templates auto-reference facts",
    description: "Response templates pull from this library, ensuring every public reply is accurate and consistent.",
  },
  {
    icon: AlertTriangle,
    title: "Missing facts trigger escalations",
    description: "If no matching fact exists for a claim, the system blocks the response and escalates for human review.",
  },
];

export default function ApprovedFactsPage() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFact, setEditingFact] = useState<Fact | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [templateCount, setTemplateCount] = useState<Record<string, number>>({});
  const [draftCount, setDraftCount] = useState(0);

  const fetchFacts = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [factsRes, templatesRes, draftsRes] = await Promise.all([
      supabase.from("approved_facts")
        .select("id, title, statement_text, category, status, owner_department, last_reviewed, jurisdiction, source_link")
        .eq("org_id", currentOrg.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("approved_templates")
        .select("id, required_fact_categories").eq("org_id", currentOrg.id),
      supabase.from("response_drafts")
        .select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
    ]);
    setFacts(factsRes.data || []);
    setDraftCount(draftsRes.count || 0);

    const counts: Record<string, number> = {};
    (templatesRes.data || []).forEach(t => {
      (t.required_fact_categories || []).forEach((cat: string) => {
        counts[cat] = (counts[cat] || 0) + 1;
      });
    });
    setTemplateCount(counts);
    setLoading(false);
  };

  useEffect(() => { fetchFacts(); }, [currentOrg]);

  const handleSave = async (data: Omit<Fact, "id">) => {
    if (!currentOrg) return;
    setSaving(true);
    try {
      if (editingFact) {
        const { error } = await supabase.from("approved_facts").update({
          title: data.title, statement_text: data.statement_text, category: data.category,
          jurisdiction: data.jurisdiction, source_link: data.source_link,
          owner_department: data.owner_department, status: data.status,
          last_reviewed: new Date().toISOString(),
        }).eq("id", editingFact.id);
        if (error) throw error;
        toast({ title: "Fact updated" });
      } else {
        const { error } = await supabase.from("approved_facts").insert({
          org_id: currentOrg.id, title: data.title, statement_text: data.statement_text,
          category: data.category, jurisdiction: data.jurisdiction, source_link: data.source_link,
          owner_department: data.owner_department, status: data.status,
          approved_by: data.status === "active" ? user?.id : null,
        });
        if (error) throw error;
        toast({ title: "Fact created" });
      }
      setDialogOpen(false);
      setEditingFact(null);
      fetchFacts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("approved_facts").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Fact deleted" });
      fetchFacts();
    }
    setDeleteId(null);
  };

  const filtered = search
    ? facts.filter(f => f.title.toLowerCase().includes(search.toLowerCase()) || f.statement_text.toLowerCase().includes(search.toLowerCase()) || f.category?.toLowerCase().includes(search.toLowerCase()))
    : facts;

  const categories = [...new Set(facts.map(f => f.category).filter(Boolean))] as string[];
  const activeFacts = facts.filter(f => f.status === "active").length;
  const reviewFacts = facts.filter(f => f.status === "under_review").length;
  const totalTemplatesLinked = Object.values(templateCount).reduce((a, b) => a + b, 0);

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookCheck className="h-6 w-6 text-primary" /> Approved Facts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your single source of truth — every AI-generated response is grounded in these verified statements
            </p>
          </div>
          <Button onClick={() => { setEditingFact(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Add Fact
          </Button>
        </div>

        {/* How it works banner — show when few or no facts */}
        {facts.length < 5 && !loading && (
          <Card className="bg-primary/5 border-primary/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">How Approved Facts power your responses</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {HOW_IT_WORKS.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <step.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{step.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card border-border p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{facts.length}</p>
            <p className="text-[11px] text-muted-foreground">Total Facts</p>
          </Card>
          <Card className="bg-card border-border p-4 text-center">
            <p className="text-2xl font-bold text-sentinel-emerald">{activeFacts}</p>
            <p className="text-[11px] text-muted-foreground">Active & Ready</p>
          </Card>
          <Card className="bg-card border-border p-4 text-center">
            <p className="text-2xl font-bold text-sentinel-amber">{reviewFacts}</p>
            <p className="text-[11px] text-muted-foreground">Under Review</p>
          </Card>
          <Card className="bg-card border-border p-4 text-center">
            <p className="text-2xl font-bold text-primary">{totalTemplatesLinked}</p>
            <p className="text-[11px] text-muted-foreground">Template Links</p>
          </Card>
        </div>

        {/* Where facts are used — connection cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="bg-card border-border p-4 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate("/respond")}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquareText className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">Response Drafting</p>
                <p className="text-[11px] text-muted-foreground">AI matches claims to facts before generating replies</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            {draftCount > 0 && <p className="text-[10px] text-primary mt-2">{draftCount} drafts generated using your facts</p>}
          </Card>
          <Card className="bg-card border-border p-4 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate("/approved-templates")}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">Response Templates</p>
                <p className="text-[11px] text-muted-foreground">Templates auto-inject approved facts by category</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            {totalTemplatesLinked > 0 && <p className="text-[10px] text-primary mt-2">{totalTemplatesLinked} template-fact connections</p>}
          </Card>
          <Card className="bg-card border-border p-4 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate("/escalations")}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">Escalation Safety Net</p>
                <p className="text-[11px] text-muted-foreground">No matching fact? Response is blocked & escalated</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Card>
        </div>

        {/* Category quick stats */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <Tooltip key={cat}>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-[10px] cursor-default gap-1">
                    {cat}
                    <span className="text-muted-foreground">({facts.filter(f => f.category === cat).length})</span>
                    {templateCount[cat] && (
                      <span className="flex items-center gap-0.5 text-primary">
                        <FileText className="h-2.5 w-2.5" />{templateCount[cat]}
                      </span>
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{facts.filter(f => f.category === cat).length} facts · Referenced by {templateCount[cat] || 0} templates</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search facts by title, content, or category..." className="pl-9 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
          ) : filtered.length === 0 ? (
            <Card className="bg-card border-border p-8 text-center">
              <BookCheck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No approved facts yet</p>
              <p className="text-xs text-muted-foreground mb-4">Add your first fact to activate the strict response engine — the AI will only respond using verified information.</p>
              <Button onClick={() => { setEditingFact(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add Your First Fact</Button>
            </Card>
          ) : (
            filtered.map(f => {
              const sc = statusConfig[f.status || "under_review"] || statusConfig.under_review;
              const StatusIcon = sc.icon;
              return (
                <Card key={f.id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-4 flex-1 min-w-0 cursor-pointer" onClick={() => { setEditingFact(f); setDialogOpen(true); }}>
                      <BookCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-card-foreground">{f.title}</div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.statement_text}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground flex-wrap">
                          <span>{f.owner_department || "—"}</span>
                          <span>·</span>
                          <span>{f.jurisdiction || "Global"}</span>
                          <span>·</span>
                          <span>Reviewed {f.last_reviewed ? new Date(f.last_reviewed).toLocaleDateString() : "—"}</span>
                          {f.source_link && (
                            <>
                              <span>·</span>
                              <a href={f.source_link} target="_blank" rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-0.5"
                                onClick={e => e.stopPropagation()}>
                                <ExternalLink className="h-2.5 w-2.5" /> Source
                              </a>
                            </>
                          )}
                          {f.category && templateCount[f.category] && (
                            <>
                              <span>·</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-0.5 text-primary cursor-default">
                                    <Link2 className="h-2.5 w-2.5" /> {templateCount[f.category]} templates
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Used by {templateCount[f.category]} response templates</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {f.category && <Badge variant="secondary" className="text-[10px]">{f.category}</Badge>}
                      <Badge variant="outline" className={`text-[10px] ${sc.className}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />{sc.label}
                      </Badge>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingFact(f); setDialogOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(f.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <FactFormDialog open={dialogOpen} onOpenChange={setDialogOpen} fact={editingFact} onSave={handleSave} saving={saving} />

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Fact</AlertDialogTitle>
              <AlertDialogDescription>This will permanently remove this approved fact. Any templates referencing its category will no longer have this fact available.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
