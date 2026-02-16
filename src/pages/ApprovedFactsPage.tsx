import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookCheck, Plus, Search, CheckCircle2, Clock, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";

interface Fact {
  id: string;
  title: string;
  category: string | null;
  status: string | null;
  owner_department: string | null;
  last_reviewed: string | null;
  jurisdiction: string | null;
}

const statusConfig: Record<string, { icon: any; className: string; label: string }> = {
  active: { icon: CheckCircle2, className: "border-sentinel-emerald/30 text-sentinel-emerald", label: "Active" },
  under_review: { icon: Clock, className: "border-sentinel-amber/30 text-sentinel-amber", label: "Under Review" },
  deprecated: { icon: Archive, className: "border-muted-foreground/30 text-muted-foreground", label: "Deprecated" },
};

export default function ApprovedFactsPage() {
  const { currentOrg } = useOrg();
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    supabase
      .from("approved_facts")
      .select("id, title, category, status, owner_department, last_reviewed, jurisdiction")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setFacts(data || []);
        setLoading(false);
      });
  }, [currentOrg]);

  const filtered = search
    ? facts.filter(f => f.title.toLowerCase().includes(search.toLowerCase()))
    : facts;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Approved Facts</h1>
          <p className="text-sm text-muted-foreground mt-1">Governance library of verified facts</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Add Fact</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search facts..." className="pl-9 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : filtered.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No approved facts yet. Add facts to enable the strict response engine.</p>
          </Card>
        ) : (
          filtered.map(f => {
            const sc = statusConfig[f.status || "under_review"] || statusConfig.under_review;
            const StatusIcon = sc.icon;
            return (
              <Card key={f.id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <BookCheck className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-card-foreground">{f.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {f.owner_department || "—"} · {f.jurisdiction || "Global"} · Last reviewed {f.last_reviewed ? new Date(f.last_reviewed).toLocaleDateString() : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {f.category && <Badge variant="secondary" className="text-[10px]">{f.category}</Badge>}
                    <Badge variant="outline" className={`text-[10px] ${sc.className}`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {sc.label}
                    </Badge>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
