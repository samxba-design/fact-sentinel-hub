import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Siren, Plus, Clock, User2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";

interface Incident {
  id: string;
  name: string;
  status: string | null;
  started_at: string | null;
  description: string | null;
}

export default function IncidentsPage() {
  const { currentOrg } = useOrg();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    supabase
      .from("incidents")
      .select("id, name, status, started_at, description")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setIncidents(data || []);
        setLoading(false);
      });
  }, [currentOrg]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-1">War room for active incidents</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />New Incident</Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : incidents.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No incidents. Create one when an active crisis requires coordinated response.</p>
          </Card>
        ) : (
          incidents.map(inc => (
            <Card key={inc.id} className={`bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer ${
              inc.status === "active" ? "sentinel-glow-red" : ""
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Siren className={`h-5 w-5 ${inc.status === "active" ? "text-sentinel-red animate-pulse-glow" : "text-muted-foreground"}`} />
                  <div>
                    <div className="text-sm font-medium text-card-foreground">{inc.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3" /> Started {inc.started_at ? new Date(inc.started_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] capitalize ${
                  inc.status === "active" ? "border-sentinel-red/30 text-sentinel-red" : "border-sentinel-emerald/30 text-sentinel-emerald"
                }`}>
                  {inc.status || "active"}
                </Badge>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
