import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Siren, Plus, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import IncidentFormDialog from "@/components/incidents/IncidentFormDialog";
import EmptyState from "@/components/EmptyState";

interface Incident {
  id: string;
  name: string;
  status: string | null;
  started_at: string | null;
  description: string | null;
}

const statusColors: Record<string, string> = {
  active: "border-sentinel-red/30 text-sentinel-red",
  monitoring: "border-sentinel-amber/30 text-sentinel-amber",
  resolved: "border-sentinel-emerald/30 text-sentinel-emerald",
};

export default function IncidentsPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const fetchIncidents = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase
      .from("incidents")
      .select("id, name, status, started_at, description")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setIncidents(data || []);
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-1">War room for active incidents</p>
        </div>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Incident</Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : incidents.length === 0 ? (
          <EmptyState
            icon={Siren}
            title="No incidents yet"
            description="Create an incident when an active crisis requires coordinated response across your team."
            actionLabel="New Incident"
            onAction={() => setFormOpen(true)}
          />
        ) : (
          incidents.map(inc => (
            <Card
              key={inc.id}
              className={`bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer ${
                inc.status === "active" ? "sentinel-glow-red" : ""
              }`}
              onClick={() => navigate(`/incidents/${inc.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Siren className={`h-5 w-5 ${inc.status === "active" ? "text-sentinel-red animate-pulse" : "text-muted-foreground"}`} />
                  <div>
                    <div className="text-sm font-medium text-card-foreground">{inc.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3" /> Started {inc.started_at ? new Date(inc.started_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[inc.status || "active"]}`}>
                  {inc.status || "active"}
                </Badge>
              </div>
            </Card>
          ))
        )}
      </div>

      <IncidentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={fetchIncidents}
      />
    </div>
  );
}
