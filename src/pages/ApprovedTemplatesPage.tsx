import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import TemplateFormDialog from "@/components/templates/TemplateFormDialog";

interface Template {
  id: string;
  name: string;
  template_text: string;
  scenario_type: string | null;
  tone: string | null;
  platform_length: string | null;
  status: string | null;
}

const statusConfig: Record<string, { className: string; label: string }> = {
  active: { className: "border-sentinel-emerald/30 text-sentinel-emerald", label: "Active" },
  draft: { className: "border-muted-foreground/30 text-muted-foreground", label: "Draft" },
  under_review: { className: "border-sentinel-amber/30 text-sentinel-amber", label: "Under Review" },
  deprecated: { className: "border-muted-foreground/30 text-muted-foreground", label: "Deprecated" },
};

export default function ApprovedTemplatesPage() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchTemplates = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase
      .from("approved_templates")
      .select("id, name, template_text, scenario_type, tone, platform_length, status")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(200);
    setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, [currentOrg]);

  const handleSave = async (data: Omit<Template, "id">) => {
    if (!currentOrg) return;
    setSaving(true);
    try {
      if (editingTemplate) {
        const { error } = await supabase.from("approved_templates").update({
          name: data.name,
          template_text: data.template_text,
          scenario_type: data.scenario_type,
          tone: data.tone,
          platform_length: data.platform_length,
          status: data.status,
        }).eq("id", editingTemplate.id);
        if (error) throw error;
        toast({ title: "Template updated" });
      } else {
        const { error } = await supabase.from("approved_templates").insert({
          org_id: currentOrg.id,
          name: data.name,
          template_text: data.template_text,
          scenario_type: data.scenario_type,
          tone: data.tone,
          platform_length: data.platform_length,
          status: data.status,
        });
        if (error) throw error;
        toast({ title: "Template created" });
      }
      setDialogOpen(false);
      setEditingTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("approved_templates").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template deleted" });
      fetchTemplates();
    }
    setDeleteId(null);
  };

  const filtered = search
    ? templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : templates;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Approved Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Response templates with placeholders for approved facts</p>
        </div>
        <Button onClick={() => { setEditingTemplate(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add Template</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search templates..." className="pl-9 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : filtered.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No templates yet. Add templates for the strict response engine.</p>
          </Card>
        ) : (
          filtered.map(t => {
            const sc = statusConfig[t.status || "draft"] || statusConfig.draft;
            return (
              <Card key={t.id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer" onClick={() => { setEditingTemplate(t); setDialogOpen(true); }}>
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-card-foreground truncate">{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        {t.scenario_type && <Badge variant="secondary" className="text-[10px]">{t.scenario_type}</Badge>}
                        {t.tone && <Badge variant="secondary" className="text-[10px]">{t.tone}</Badge>}
                        {t.platform_length && <Badge variant="secondary" className="text-[10px]">{t.platform_length}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${sc.className}`}>{sc.label}</Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingTemplate(t); setDialogOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <TemplateFormDialog open={dialogOpen} onOpenChange={setDialogOpen} template={editingTemplate} onSave={handleSave} saving={saving} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this template. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
