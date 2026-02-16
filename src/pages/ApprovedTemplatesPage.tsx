import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";

interface Template {
  id: string;
  name: string;
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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    supabase
      .from("approved_templates")
      .select("id, name, scenario_type, tone, platform_length, status")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setTemplates(data || []);
        setLoading(false);
      });
  }, [currentOrg]);

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
        <Button><Plus className="h-4 w-4 mr-2" />Add Template</Button>
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
              <Card key={t.id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-card-foreground">{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        {t.scenario_type && <Badge variant="secondary" className="text-[10px]">{t.scenario_type}</Badge>}
                        {t.tone && <Badge variant="secondary" className="text-[10px]">{t.tone}</Badge>}
                        {t.platform_length && <Badge variant="secondary" className="text-[10px]">{t.platform_length}</Badge>}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${sc.className}`}>{sc.label}</Badge>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
