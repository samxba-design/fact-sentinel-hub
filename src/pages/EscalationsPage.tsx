import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketCheck, Plus, History, Settings2, Users, Mail } from "lucide-react";
import ContactPopover from "@/components/contacts/ContactPopover";
import SmartLink from "@/components/SmartLink";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import EscalationFormDialog from "@/components/escalations/EscalationFormDialog";
import EscalationDetailSheet from "@/components/escalations/EscalationDetailSheet";
import EmptyState from "@/components/EmptyState";

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
  const [tab, setTab] = useState("active");

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

  const activeEscalations = escalations.filter(e => e.status !== "resolved");
  const resolvedEscalations = escalations.filter(e => e.status === "resolved");
  const displayed = tab === "active" ? activeEscalations : tab === "resolved" ? resolvedEscalations : escalations;

  // Stats
  const criticalCount = escalations.filter(e => e.priority === "critical" && e.status !== "resolved").length;
  const openCount = escalations.filter(e => e.status === "open").length;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Escalations</h1>
          <p className="text-sm text-muted-foreground mt-1">Tickets requiring human review and approval</p>
        </div>
        <Button onClick={handleCreate}><Plus className="h-4 w-4 mr-2" />New Ticket</Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card border-border p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{escalations.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total</p>
        </Card>
        <Card className="bg-card border-border p-4 text-center">
          <p className="text-2xl font-bold text-sentinel-cyan">{openCount}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Open</p>
        </Card>
        <Card className="bg-card border-border p-4 text-center">
          <p className="text-2xl font-bold text-sentinel-red">{criticalCount}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Critical</p>
        </Card>
        <Card className="bg-card border-border p-4 text-center">
          <p className="text-2xl font-bold text-sentinel-emerald">{resolvedEscalations.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Resolved</p>
        </Card>
      </div>

      {/* Auto-escalation info */}
      <Card className="bg-muted/30 border-border p-4">
        <div className="flex items-start gap-3">
          <Settings2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Auto-Escalation Active</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tickets are auto-created when the response engine blocks a draft due to missing approved facts.
              Critical severity mentions also trigger automatic escalation tickets.
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <ContactPopover department={null}>
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Assigned to department leads</span>
              </ContactPopover>
              <SmartLink to="/settings?tab=alerts" className="text-xs">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> Email alerts configured in Settings</span>
              </SmartLink>
            </div>
          </div>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="active" className="gap-1.5">Active ({activeEscalations.length})</TabsTrigger>
          <TabsTrigger value="resolved" className="gap-1.5"><History className="h-3 w-3" /> Resolved ({resolvedEscalations.length})</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
            ) : displayed.length === 0 ? (
              <EmptyState
                icon={TicketCheck}
                title={tab === "resolved" ? "No resolved escalations" : "No escalation tickets yet"}
                description={tab === "resolved"
                  ? "Resolved escalations will appear here once tickets are closed."
                  : "Tickets are auto-created when the response engine blocks a draft or critical mentions are detected."}
                actionLabel={tab !== "resolved" ? "New Ticket" : undefined}
                onAction={tab !== "resolved" ? handleCreate : undefined}
              />
            ) : (
              displayed.map(e => (
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
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          {e.department ? (
                            <ContactPopover department={e.department}>
                              <span>{e.department}</span>
                            </ContactPopover>
                          ) : "—"} · {timeAgo(e.created_at)}
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
        </TabsContent>
      </Tabs>

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
