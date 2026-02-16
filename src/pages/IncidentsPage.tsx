import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Siren, Plus, Clock, Network, MessageSquare, Users, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import IncidentFormDialog from "@/components/incidents/IncidentFormDialog";
import EmptyState from "@/components/EmptyState";
import PageGuide from "@/components/PageGuide";
import { format } from "date-fns";

interface Incident {
  id: string;
  name: string;
  status: string | null;
  started_at: string | null;
  description: string | null;
  mention_count: number;
  narrative_count: number;
}

const statusColors: Record<string, string> = {
  active: "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5",
  monitoring: "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5",
  resolved: "border-sentinel-emerald/30 text-sentinel-emerald bg-sentinel-emerald/5",
};

const statusIcons: Record<string, string> = {
  active: "🔴",
  monitoring: "🟡",
  resolved: "🟢",
};

export default function IncidentsPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchIncidents = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    const { data: rawIncidents } = await supabase
      .from("incidents")
      .select("id, name, status, started_at, description")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!rawIncidents || rawIncidents.length === 0) {
      setIncidents([]);
      setLoading(false);
      return;
    }

    // Fetch counts in parallel
    const ids = rawIncidents.map(i => i.id);
    const [mentionCounts, narrativeCounts] = await Promise.all([
      supabase.from("incident_mentions").select("incident_id").in("incident_id", ids),
      supabase.from("incident_narratives").select("incident_id").in("incident_id", ids),
    ]);

    const mCountMap: Record<string, number> = {};
    const nCountMap: Record<string, number> = {};
    (mentionCounts.data || []).forEach(r => { mCountMap[r.incident_id] = (mCountMap[r.incident_id] || 0) + 1; });
    (narrativeCounts.data || []).forEach(r => { nCountMap[r.incident_id] = (nCountMap[r.incident_id] || 0) + 1; });

    setIncidents(rawIncidents.map(i => ({
      ...i,
      mention_count: mCountMap[i.id] || 0,
      narrative_count: nCountMap[i.id] || 0,
    })));
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const filtered = statusFilter === "all" ? incidents : incidents.filter(i => i.status === statusFilter);
  const counts = {
    all: incidents.length,
    active: incidents.filter(i => i.status === "active").length,
    monitoring: incidents.filter(i => i.status === "monitoring").length,
    resolved: incidents.filter(i => i.status === "resolved").length,
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-1">War room for active incidents</p>
        </div>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Incident</Button>
      </div>

      <PageGuide
        title="How Incidents Work"
        subtitle="Centralized war rooms for coordinated crisis response"
        steps={[
          {
            icon: <Siren className="h-4 w-4 text-primary" />,
            title: "1. Create an Incident",
            description: "When a crisis emerges, create an incident to consolidate all related data — mentions, narratives, and stakeholders — in one place.",
          },
          {
            icon: <Network className="h-4 w-4 text-primary" />,
            title: "2. Link Evidence",
            description: "Select mentions and narratives from dropdown lists to attach to the incident. This builds a timeline and helps your team understand the full picture.",
          },
          {
            icon: <Users className="h-4 w-4 text-primary" />,
            title: "3. Coordinate Response",
            description: "Track events on the timeline, add notes, and use the response engine to draft approved replies. Active incidents increase scan frequency automatically.",
          },
        ]}
        integrations={[
          { label: "Mentions", to: "/mentions", description: "Link specific mentions" },
          { label: "Narratives", to: "/narratives", description: "Track related narratives" },
          { label: "Respond", to: "/respond", description: "Draft incident responses" },
          { label: "Escalations", to: "/escalations", description: "Auto-created tickets" },
        ]}
        tip="Enable Incident Mode in settings to automatically increase scan frequency and prioritize critical threats on your dashboard during active crises."
      />

      {/* Status filter tabs */}
      {incidents.length > 0 && (
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all" className="text-xs">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="active" className="text-xs">🔴 Active ({counts.active})</TabsTrigger>
            <TabsTrigger value="monitoring" className="text-xs">🟡 Monitoring ({counts.monitoring})</TabsTrigger>
            <TabsTrigger value="resolved" className="text-xs">🟢 Resolved ({counts.resolved})</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
        ) : filtered.length === 0 ? (
          incidents.length > 0 ? (
            <Card className="bg-card border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">No {statusFilter} incidents.</p>
            </Card>
          ) : (
            <EmptyState
              icon={Siren}
              title="No incidents yet"
              description="Create an incident when an active crisis requires coordinated response across your team."
              actionLabel="New Incident"
              onAction={() => setFormOpen(true)}
            />
          )
        ) : (
          filtered.map(inc => (
            <Card
              key={inc.id}
              className={`bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer ${
                inc.status === "active" ? "sentinel-glow-red" : ""
              }`}
              onClick={() => navigate(`/incidents/${inc.id}`)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <Siren className={`h-5 w-5 mt-0.5 shrink-0 ${inc.status === "active" ? "text-sentinel-red animate-pulse" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-card-foreground">{inc.name}</div>
                    {inc.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{inc.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {inc.started_at ? format(new Date(inc.started_at), "MMM d, yyyy") : "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {inc.mention_count} mentions
                      </span>
                      <span className="flex items-center gap-1">
                        <Network className="h-3 w-3" />
                        {inc.narrative_count} narratives
                      </span>
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] capitalize shrink-0 ${statusColors[inc.status || "active"]}`}>
                  {statusIcons[inc.status || "active"]} {inc.status || "active"}
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
