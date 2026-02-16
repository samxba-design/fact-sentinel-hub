import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, Link2, AlertTriangle, ChevronDown, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface SelectableItem {
  id: string;
  label: string;
  sublabel?: string;
}

export default function IncidentFormDialog({ open, onOpenChange, onSaved, editData }: IncidentFormDialogProps) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [severity, setSeverity] = useState("high");

  // Linking
  const [allMentions, setAllMentions] = useState<SelectableItem[]>([]);
  const [allNarratives, setAllNarratives] = useState<SelectableItem[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [linkedMentionIds, setLinkedMentionIds] = useState<Set<string>>(new Set());
  const [linkedNarrativeIds, setLinkedNarrativeIds] = useState<Set<string>>(new Set());
  const [mentionPopoverOpen, setMentionPopoverOpen] = useState(false);
  const [narrativePopoverOpen, setNarrativePopoverOpen] = useState(false);

  const isEdit = !!editData;

  // Load available mentions & narratives when dialog opens
  useEffect(() => {
    if (!open || !currentOrg) return;
    setName(editData?.name || "");
    setDescription(editData?.description || "");
    setStatus(editData?.status || "active");
    setSeverity("high");
    setLinkedMentionIds(new Set());
    setLinkedNarrativeIds(new Set());

    if (!isEdit) {
      setLoadingOptions(true);
      Promise.all([
        supabase.from("mentions").select("id, content, source, author_name, severity")
          .eq("org_id", currentOrg.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("narratives").select("id, name, status")
          .eq("org_id", currentOrg.id).order("created_at", { ascending: false }).limit(50),
      ]).then(([mentionsRes, narrativesRes]) => {
        setAllMentions((mentionsRes.data || []).map(m => ({
          id: m.id,
          label: (m.content || "").slice(0, 80) || "No content",
          sublabel: `${m.source}${m.author_name ? ` · ${m.author_name}` : ""}${m.severity ? ` · ${m.severity}` : ""}`,
        })));
        setAllNarratives((narrativesRes.data || []).map(n => ({
          id: n.id,
          label: n.name,
          sublabel: n.status || "active",
        })));
        setLoadingOptions(false);
      });
    }
  }, [open, editData, currentOrg, isEdit]);

  const toggleMention = (id: string) => {
    setLinkedMentionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleNarrative = (id: string) => {
    setLinkedNarrativeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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

        const mentionInserts = [...linkedMentionIds].map(mid => ({ incident_id: data.id, mention_id: mid }));
        const narrativeInserts = [...linkedNarrativeIds].map(nid => ({ incident_id: data.id, narrative_id: nid }));

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

  const selectedMentions = allMentions.filter(m => linkedMentionIds.has(m.id));
  const selectedNarratives = allNarratives.filter(n => linkedNarrativeIds.has(n.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">🔴 Active</SelectItem>
                  <SelectItem value="monitoring">🟡 Monitoring</SelectItem>
                  <SelectItem value="resolved">🟢 Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">🚨 Critical</SelectItem>
                  <SelectItem value="high">🔴 High</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                  <SelectItem value="low">🟢 Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

          {/* Link mentions & narratives with dropdowns */}
          {!isEdit && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5" /> Link Evidence
              </Label>

              <Tabs defaultValue="narratives" className="w-full">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="narratives" className="text-xs">
                    Narratives {linkedNarrativeIds.size > 0 && <Badge variant="secondary" className="ml-1 text-[9px] h-4 px-1">{linkedNarrativeIds.size}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="mentions" className="text-xs">
                    Mentions {linkedMentionIds.size > 0 && <Badge variant="secondary" className="ml-1 text-[9px] h-4 px-1">{linkedMentionIds.size}</Badge>}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="narratives" className="space-y-2 mt-2">
                  {loadingOptions ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading narratives...</div>
                  ) : (
                    <>
                      <Popover open={narrativePopoverOpen} onOpenChange={setNarrativePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between text-xs font-normal h-9">
                            {linkedNarrativeIds.size === 0 ? "Select narratives to link..." : `${linkedNarrativeIds.size} narrative${linkedNarrativeIds.size > 1 ? "s" : ""} selected`}
                            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search narratives..." className="text-xs" />
                            <CommandList>
                              <CommandEmpty className="text-xs py-3 text-center">No narratives found.</CommandEmpty>
                              <CommandGroup>
                                {allNarratives.map(n => (
                                  <CommandItem key={n.id} value={n.label} onSelect={() => toggleNarrative(n.id)} className="text-xs cursor-pointer">
                                    <Check className={cn("h-3.5 w-3.5 mr-2 shrink-0", linkedNarrativeIds.has(n.id) ? "opacity-100" : "opacity-0")} />
                                    <div className="flex-1 min-w-0">
                                      <span className="truncate block">{n.label}</span>
                                      <span className="text-[10px] text-muted-foreground capitalize">{n.sublabel}</span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {selectedNarratives.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedNarratives.map(n => (
                            <Badge key={n.id} variant="secondary" className="text-[10px] gap-1 pr-1">
                              🧵 {n.label.slice(0, 30)}
                              <button onClick={() => toggleNarrative(n.id)}><X className="h-3 w-3" /></button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="mentions" className="space-y-2 mt-2">
                  {loadingOptions ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading mentions...</div>
                  ) : (
                    <>
                      <Popover open={mentionPopoverOpen} onOpenChange={setMentionPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between text-xs font-normal h-9">
                            {linkedMentionIds.size === 0 ? "Select mentions to link..." : `${linkedMentionIds.size} mention${linkedMentionIds.size > 1 ? "s" : ""} selected`}
                            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search mentions..." className="text-xs" />
                            <CommandList>
                              <CommandEmpty className="text-xs py-3 text-center">No mentions found.</CommandEmpty>
                              <CommandGroup>
                                {allMentions.map(m => (
                                  <CommandItem key={m.id} value={m.label} onSelect={() => toggleMention(m.id)} className="text-xs cursor-pointer">
                                    <Check className={cn("h-3.5 w-3.5 mr-2 shrink-0", linkedMentionIds.has(m.id) ? "opacity-100" : "opacity-0")} />
                                    <div className="flex-1 min-w-0">
                                      <span className="truncate block">{m.label}</span>
                                      <span className="text-[10px] text-muted-foreground">{m.sublabel}</span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {selectedMentions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedMentions.map(m => (
                            <Badge key={m.id} variant="secondary" className="text-[10px] gap-1 pr-1">
                              📌 {m.label.slice(0, 30)}...
                              <button onClick={() => toggleMention(m.id)}><X className="h-3 w-3" /></button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
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
