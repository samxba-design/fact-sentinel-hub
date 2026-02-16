import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketCheck, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import EscalationFormDialog from "@/components/escalations/EscalationFormDialog";
import EscalationDetailSheet from "@/components/escalations/EscalationDetailSheet";

interface Escalation {
  id: string;
  title: string;
  description: string | null;
  department: string | null;
  priority: string | null;
  status: string | null;
  pasted_text: string | null;
  created_at: string | null;
}

const priorityColors: Record<string, string> = {
  low: "border-muted-foreground/30 text-muted-foreground",
  medium: "border-sentinel-amber/30 text-sentinel-amber",
  high: "border-sentinel-red/30 text-sentinel-red",
  critical: "border-sentinel-red/50 text-sentinel-red bg-sentinel-red/5",
};

const statusColors: Record<string, string> = {
  open: "border-sentinel-cyan/30 text-sentinel-cyan",
  in_progress: "border-sentinel-amber/30 text-sentinel-amber",
  resolved: "border-sentinel-emerald/30 text-sentinel-emerald",
};

export default function EscalationsPage() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<Escalation | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<Escalation | null>(null);

  const fetchEscalations = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase
      .from("escalations")
      .select("id, title, description, department, priority, status, pasted_text, created_at")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setEscalations(data || []);
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => { fetchEscalations(); }, [fetchEscalations]);

  const handleCreate = () => { setEditData(null); setFormOpen(true); };
  const handleEdit = (e: Escalation) => { setEditData(e); setFormOpen(true); setDetailOpen(false); };
  const handleRowClick = (e: Escalation) => { setSelected(e); setDetailOpen(true); };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("escalations").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Escalation deleted" });
      setDetailOpen(false);
      fetchEscalations();
    }
  };

  const timeAgo = (d: string | null) => {
    if (!d) return "—";
    const diff = Date.now() - new Date(d).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Escalations</h1>
          <p className="text-sm text-muted-foreground mt-1">Tickets requiring human review and approval</p>
        </div>
        <Button onClick={handleCreate}><Plus className="h-4 w-4 mr-2" />New Ticket</Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : escalations.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No escalation tickets yet. Create one or they are auto-created when the response engine blocks a draft.</p>
          </Card>
        ) : (
          escalations.map(e => (
            <Card
              key={e.id}
              className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => handleRowClick(e)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <TicketCheck className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium text-card-foreground">{e.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {e.department || "—"} · {timeAgo(e.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`text-[10px] ${priorityColors[e.priority || "medium"]}`}>
                    {e.priority || "medium"}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[e.status || "open"]}`}>
                    {(e.status || "open").replace("_", " ")}
                  </Badge>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <EscalationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={fetchEscalations}
        editData={editData}
      />

      <EscalationDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        escalation={selected}
        onEdit={() => selected && handleEdit(selected)}
        onDelete={() => selected && handleDelete(selected.id)}
      />
    </div>
  );
}
