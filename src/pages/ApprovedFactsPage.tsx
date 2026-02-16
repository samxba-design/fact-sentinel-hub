import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BookCheck, Plus, Search, CheckCircle2, Clock, Archive, Pencil, Trash2, ExternalLink, FileText, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import FactFormDialog from "@/components/facts/FactFormDialog";

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

export default function ApprovedFactsPage() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFact, setEditingFact] = useState<Fact | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [templateCount, setTemplateCount] = useState<Record<string, number>>({});

  const fetchFacts = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [factsRes, templatesRes] = await Promise.all([
      supabase.from("approved_facts")
        .select("id, title, statement_text, category, status, owner_department, last_reviewed, jurisdiction, source_link")
        .eq("org_id", currentOrg.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("approved_templates")
        .select("id, required_fact_categories").eq("org_id", currentOrg.id),
    ]);
    setFacts(factsRes.data || []);

    // Count how many templates reference each fact category
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

  // Category stats
  const categories = [...new Set(facts.map(f => f.category).filter(Boolean))] as string[];

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Approved Facts</h1>
            <p className="text-sm text-muted-foreground mt-1">Governance library of verified facts — used by the response engine and templates</p>
          </div>
          <Button onClick={() => { setEditingFact(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add Fact</Button>
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
              <p className="text-sm text-muted-foreground">No approved facts yet. Add facts to enable the strict response engine.</p>
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
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
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
              <AlertDialogDescription>This will permanently remove this approved fact. This action cannot be undone.</AlertDialogDescription>
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
