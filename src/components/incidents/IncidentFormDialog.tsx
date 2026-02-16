import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, X, Link2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface IncidentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editData?: {
    id: string;
    name: string;
    description: string | null;
    status: string | null;
  } | null;
}

interface SearchResult {
  id: string;
  label: string;
  type: "mention" | "narrative";
}

export default function IncidentFormDialog({ open, onOpenChange, onSaved, editData }: IncidentFormDialogProps) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");

  // Linking
  const [linkSearch, setLinkSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkedMentions, setLinkedMentions] = useState<SearchResult[]>([]);
  const [linkedNarratives, setLinkedNarratives] = useState<SearchResult[]>([]);

  const isEdit = !!editData;

  useEffect(() => {
    if (open) {
      setName(editData?.name || "");
      setDescription(editData?.description || "");
      setStatus(editData?.status || "active");
      setLinkedMentions([]);
      setLinkedNarratives([]);
      setLinkSearch("");
      setSearchResults([]);
    }
  }, [open, editData]);

  const handleSearch = useCallback(async (q: string) => {
    if (!currentOrg || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const [mentionsRes, narrativesRes] = await Promise.all([
      supabase.from("mentions").select("id, content, author_name, source")
        .eq("org_id", currentOrg.id).ilike("content", `%${q}%`).limit(5),
      supabase.from("narratives").select("id, name")
        .eq("org_id", currentOrg.id).ilike("name", `%${q}%`).limit(5),
    ]);
    const results: SearchResult[] = [
      ...(mentionsRes.data || []).map(m => ({
        id: m.id,
        label: `[${m.source}] ${(m.content || "").slice(0, 60)}...`,
        type: "mention" as const,
      })),
      ...(narrativesRes.data || []).map(n => ({
        id: n.id,
        label: n.name,
        type: "narrative" as const,
      })),
    ];
    setSearchResults(results);
    setSearching(false);
  }, [currentOrg]);

  useEffect(() => {
    const t = setTimeout(() => handleSearch(linkSearch), 300);
    return () => clearTimeout(t);
  }, [linkSearch, handleSearch]);

  const addLink = (item: SearchResult) => {
    if (item.type === "mention" && !linkedMentions.find(m => m.id === item.id)) {
      setLinkedMentions(prev => [...prev, item]);
    } else if (item.type === "narrative" && !linkedNarratives.find(n => n.id === item.id)) {
      setLinkedNarratives(prev => [...prev, item]);
    }
    setLinkSearch("");
    setSearchResults([]);
  };

  const handleSave = async () => {
    if (!currentOrg || !name.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from("incidents")
          .update({ name, description: description || null, status, updated_at: new Date().toISOString() })
          .eq("id", editData.id);
        if (error) throw error;
        await supabase.from("incident_events").insert({
          incident_id: editData.id, event_type: "status_change",
          description: `Status changed to ${status}`,
        });
        toast({ title: "Incident updated" });
      } else {
        const { data, error } = await supabase
          .from("incidents")
          .insert({
            org_id: currentOrg.id, name, description: description || null,
            status, owner_id: user?.id || null, started_at: new Date().toISOString(),
          })
          .select().single();
        if (error) throw error;

        // Link mentions and narratives
        const mentionInserts = linkedMentions.map(m => ({ incident_id: data.id, mention_id: m.id }));
        const narrativeInserts = linkedNarratives.map(n => ({ incident_id: data.id, narrative_id: n.id }));

        await supabase.from("incident_events").insert({
          incident_id: data.id, event_type: "created", description: "Incident created",
        });
        if (mentionInserts.length > 0) {
          await supabase.from("incident_mentions").insert(mentionInserts);
        }
        if (narrativeInserts.length > 0) {
          await supabase.from("incident_narratives").insert(narrativeInserts);
        }
        toast({ title: "Incident created", description: `Linked ${mentionInserts.length} mentions, ${narrativeInserts.length} narratives` });
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Incident" : "New Incident"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Incident Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Data breach rumor — Twitter" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Context about the incident..." rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Value proposition */}
          <div className="bg-muted/50 rounded-lg p-3 border border-border">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-sentinel-amber mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">Why create an incident?</strong> Incidents act as war-rooms that group related mentions and narratives.
                When active, scan frequency increases and alert thresholds tighten for faster detection.
              </div>
            </div>
          </div>

          {/* Link mentions & narratives */}
          {!isEdit && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5" /> Link Mentions & Narratives
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  placeholder="Search mentions or narratives to link..."
                  className="pl-9 text-sm"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              {searchResults.length > 0 && (
                <div className="border border-border rounded-lg bg-card max-h-40 overflow-y-auto">
                  {searchResults.map(r => (
                    <button key={r.id} onClick={() => addLink(r)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2 border-b border-border last:border-0">
                      <Badge variant="outline" className="text-[8px] shrink-0">{r.type}</Badge>
                      <span className="truncate text-foreground">{r.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {(linkedMentions.length > 0 || linkedNarratives.length > 0) && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {linkedMentions.map(m => (
                    <Badge key={m.id} variant="secondary" className="text-[10px] gap-1 pr-1">
                      📌 {m.label.slice(0, 30)}...
                      <button onClick={() => setLinkedMentions(p => p.filter(x => x.id !== m.id))}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  {linkedNarratives.map(n => (
                    <Badge key={n.id} variant="secondary" className="text-[10px] gap-1 pr-1">
                      🧵 {n.label.slice(0, 30)}
                      <button onClick={() => setLinkedNarratives(p => p.filter(x => x.id !== n.id))}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
