import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Pencil, Plus, Siren, Clock, User2, MessageSquare,
  Trash2, Link2, Loader2, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import IncidentFormDialog from "@/components/incidents/IncidentFormDialog";

interface Incident {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  owner_id: string | null;
  created_at: string | null;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  description: string | null;
  created_at: string | null;
}

interface LinkedMention {
  mention_id: string;
  mentions: { content: string | null; source: string; author_name: string | null; severity: string | null } | null;
}

interface LinkedNarrative {
  narrative_id: string;
  narratives: { name: string; status: string | null } | null;
}

const statusColors: Record<string, string> = {
  active: "border-sentinel-red/30 text-sentinel-red",
  monitoring: "border-sentinel-amber/30 text-sentinel-amber",
  resolved: "border-sentinel-emerald/30 text-sentinel-emerald",
};

const eventTypeIcons: Record<string, string> = {
  created: "🚨",
  status_change: "🔄",
  mention_added: "📌",
  narrative_added: "🧵",
  note: "📝",
  resolved: "✅",
};

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [mentions, setMentions] = useState<LinkedMention[]>([]);
  const [narratives, setNarratives] = useState<LinkedNarrative[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  // Attach mention state
  const [mentionIdInput, setMentionIdInput] = useState("");
  const [attachingMention, setAttachingMention] = useState(false);

  // Add note state
  const [noteInput, setNoteInput] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id || !currentOrg) return;
    setLoading(true);
    const [incRes, eventsRes, mentionsRes, narrativesRes] = await Promise.all([
      supabase.from("incidents").select("*").eq("id", id).eq("org_id", currentOrg.id).single(),
      supabase.from("incident_events").select("*").eq("incident_id", id).order("created_at", { ascending: true }),
      supabase.from("incident_mentions").select("mention_id, mentions(content, source, author_name, severity)").eq("incident_id", id),
      supabase.from("incident_narratives").select("narrative_id, narratives(name, status)").eq("incident_id", id),
    ]);
    setIncident(incRes.data as Incident);
    setEvents((eventsRes.data as any) || []);
    setMentions((mentionsRes.data as any) || []);
    setNarratives((narrativesRes.data as any) || []);
    setLoading(false);
  }, [id, currentOrg]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAttachMention = async () => {
    if (!id || !mentionIdInput.trim()) return;
    setAttachingMention(true);
    try {
      // Search for mention by partial content or id
      const { data: found } = await supabase
        .from("mentions")
        .select("id")
        .eq("org_id", currentOrg!.id)
        .or(`id.eq.${mentionIdInput.trim()},content.ilike.%${mentionIdInput.trim()}%`)
        .limit(1)
        .single();
      if (!found) throw new Error("Mention not found");

      const { error } = await supabase.from("incident_mentions").insert({ incident_id: id, mention_id: found.id });
      if (error) throw error;

      await supabase.from("incident_events").insert({
        incident_id: id,
        event_type: "mention_added",
        description: `Mention attached`,
      });

      setMentionIdInput("");
      toast({ title: "Mention attached" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAttachingMention(false);
    }
  };

  const handleDetachMention = async (mentionId: string) => {
    if (!id) return;
    await supabase.from("incident_mentions").delete().eq("incident_id", id).eq("mention_id", mentionId);
    toast({ title: "Mention removed" });
    fetchAll();
  };

  const handleDetachNarrative = async (narrativeId: string) => {
    if (!id) return;
    await supabase.from("incident_narratives").delete().eq("incident_id", id).eq("narrative_id", narrativeId);
    toast({ title: "Narrative removed" });
    fetchAll();
  };

  const handleAddNote = async () => {
    if (!id || !noteInput.trim()) return;
    setAddingNote(true);
    try {
      await supabase.from("incident_events").insert({
        incident_id: id,
        event_type: "note",
        description: noteInput.trim(),
      });
      setNoteInput("");
      toast({ title: "Note added" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAddingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-up">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/incidents")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Card className="bg-card border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Incident not found.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/incidents")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Incidents
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
        </Button>
      </div>

      {/* Incident Header Card */}
      <Card className={`bg-card border-border p-6 space-y-3 ${incident.status === "active" ? "sentinel-glow-red" : ""}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Siren className={`h-6 w-6 ${incident.status === "active" ? "text-sentinel-red animate-pulse" : "text-muted-foreground"}`} />
            <div>
              <h1 className="text-xl font-bold text-foreground">{incident.name}</h1>
              {incident.description && (
                <p className="text-sm text-muted-foreground mt-1">{incident.description}</p>
              )}
            </div>
          </div>
          <Badge variant="outline" className={`text-xs capitalize ${statusColors[incident.status || "active"]}`}>
            {incident.status || "active"}
          </Badge>
        </div>

        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Started {incident.started_at ? format(new Date(incident.started_at), "MMM d, yyyy h:mm a") : "—"}
          </span>
          {incident.ended_at && (
            <span className="flex items-center gap-1">
              Ended {format(new Date(incident.ended_at), "MMM d, yyyy h:mm a")}
            </span>
          )}
          <span className="flex items-center gap-1">
            <User2 className="h-3 w-3" /> Owner assigned
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">{mentions.length} mentions</span>
          <span className="text-muted-foreground">{narratives.length} narratives</span>
          <span className="text-muted-foreground">{events.length} events</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline (main column) */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-card border-border p-5 space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Timeline</h3>

            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">No events yet.</p>
            ) : (
              <div className="relative space-y-0">
                {events.map((ev, i) => (
                  <div key={ev.id} className="flex gap-3 pb-4 relative">
                    {/* Timeline line */}
                    {i < events.length - 1 && (
                      <div className="absolute left-[15px] top-7 bottom-0 w-px bg-border" />
                    )}
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm shrink-0 z-10">
                      {eventTypeIcons[ev.event_type] || "•"}
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-sm text-foreground">{ev.description || ev.event_type}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {ev.created_at ? format(new Date(ev.created_at), "MMM d, h:mm a") : "—"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Add note */}
            <div className="flex gap-2">
              <Input
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder="Add a timeline note..."
                className="flex-1"
                onKeyDown={e => { if (e.key === "Enter") handleAddNote(); }}
              />
              <Button size="sm" onClick={handleAddNote} disabled={addingNote || !noteInput.trim()}>
                {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </Card>
        </div>

        {/* Sidebar: Linked items */}
        <div className="space-y-4">
          {/* Linked Mentions */}
          <Card className="bg-card border-border p-5 space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Linked Mentions</h3>

            {mentions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No mentions linked.</p>
            ) : (
              <div className="space-y-2">
                {mentions.map(m => (
                  <div key={m.mention_id} className="flex items-start justify-between gap-2 p-2 rounded bg-muted/30 border border-border">
                    <div
                      className="flex-1 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => navigate(`/mentions/${m.mention_id}`)}
                    >
                      <p className="text-xs text-foreground line-clamp-2">
                        {(m.mentions as any)?.content?.slice(0, 80) || "—"}...
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[8px]">{(m.mentions as any)?.source}</Badge>
                        <span className="text-[10px] text-muted-foreground">{(m.mentions as any)?.author_name}</span>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => handleDetachMention(m.mention_id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={mentionIdInput}
                onChange={e => setMentionIdInput(e.target.value)}
                placeholder="Search mention..."
                className="flex-1 text-xs"
                onKeyDown={e => { if (e.key === "Enter") handleAttachMention(); }}
              />
              <Button size="sm" variant="outline" onClick={handleAttachMention} disabled={attachingMention || !mentionIdInput.trim()}>
                {attachingMention ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
              </Button>
            </div>
          </Card>

          {/* Linked Narratives */}
          <Card className="bg-card border-border p-5 space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Linked Narratives</h3>

            {narratives.length === 0 ? (
              <p className="text-xs text-muted-foreground">No narratives linked.</p>
            ) : (
              <div className="space-y-2">
                {narratives.map(n => (
                  <div key={n.narrative_id} className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border">
                    <div>
                      <p className="text-xs text-foreground">{(n.narratives as any)?.name || "—"}</p>
                      <Badge variant="outline" className="text-[8px] mt-1 capitalize">
                        {(n.narratives as any)?.status || "active"}
                      </Badge>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => handleDetachNarrative(n.narrative_id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <IncidentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={fetchAll}
        editData={incident}
      />
    </div>
  );
}
