import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Users, Search, Building2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";

interface AddPersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface OrgMember {
  user_id: string;
  role: string;
  profile: { full_name: string | null; email: string | null } | null;
}

interface InternalContact {
  id: string;
  name: string;
  email: string | null;
  role_title: string | null;
  department: string | null;
}

const TIERS = [
  { value: "executive", label: "Executive", desc: "C-suite, board members" },
  { value: "spokesperson", label: "Spokesperson", desc: "Official public representatives" },
  { value: "security", label: "Security", desc: "Security team members" },
  { value: "compliance", label: "Compliance", desc: "Regulatory & compliance" },
  { value: "product", label: "Product", desc: "Product leaders" },
  { value: "other", label: "Other", desc: "General monitoring" },
];

export default function AddPersonDialog({ open, onOpenChange, onSaved }: AddPersonDialogProps) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"new" | "team">("new");

  // New person fields
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [tier, setTier] = useState("other");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [linkedinHandle, setLinkedinHandle] = useState("");

  // Unified search across team members + internal contacts
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [contacts, setContacts] = useState<InternalContact[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [alreadyTracked, setAlreadyTracked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !currentOrg) return;
    setName(""); setTitle(""); setTier("other"); setTwitterHandle(""); setLinkedinHandle("");
    setTeamSearch("");
    setLoadingTeam(true);

    // Load org members, internal contacts, and already-tracked people in parallel
    Promise.all([
      supabase
        .from("org_memberships")
        .select("user_id, role")
        .eq("org_id", currentOrg.id)
        .not("accepted_at", "is", null),
      supabase
        .from("internal_contacts")
        .select("id, name, email, role_title, department")
        .eq("org_id", currentOrg.id),
      supabase
        .from("org_people")
        .select("person_id, people(name)")
        .eq("org_id", currentOrg.id),
    ]).then(async ([membersRes, contactsRes, trackedRes]) => {
      // Resolve member profiles
      const memberData = membersRes.data || [];
      if (memberData.length > 0) {
        const profileRes = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", memberData.map(d => d.user_id));
        const profiles = profileRes.data || [];
        setMembers(memberData.map(d => ({
          user_id: d.user_id,
          role: d.role,
          profile: profiles.find(p => p.id === d.user_id) || null,
        })));
      } else {
        setMembers([]);
      }

      setContacts((contactsRes.data || []) as InternalContact[]);

      // Track names of already-monitored people to prevent duplicates
      const tracked = new Set<string>();
      for (const t of (trackedRes.data || [])) {
        const personName = (t as any).people?.name?.toLowerCase();
        if (personName) tracked.add(personName);
      }
      setAlreadyTracked(tracked);
      setLoadingTeam(false);
    });
  }, [open, currentOrg]);

  // Name typeahead suggestions from team members + contacts
  const nameSuggestions = (() => {
    if (tab !== "new" || name.length < 2) return [];
    const q = name.toLowerCase();
    const suggestions: { label: string; subtitle: string; name: string; title?: string }[] = [];
    
    for (const m of members) {
      const n = m.profile?.full_name;
      if (n && n.toLowerCase().includes(q)) {
        suggestions.push({
          label: n,
          subtitle: `${m.role} · ${m.profile?.email || ""}`,
          name: n,
        });
      }
    }
    for (const c of contacts) {
      if (c.name.toLowerCase().includes(q)) {
        suggestions.push({
          label: c.name,
          subtitle: [c.role_title, c.department].filter(Boolean).join(" · ") || c.email || "",
          name: c.name,
          title: c.role_title || undefined,
        });
      }
    }
    return suggestions.slice(0, 5);
  })();

  const handleAddNew = async () => {
    if (!currentOrg || !name.trim()) return;
    
    // Warn if already tracked
    if (alreadyTracked.has(name.trim().toLowerCase())) {
      toast({ title: "Already monitored", description: `${name} is already being tracked.`, variant: "destructive" });
      return;
    }
    
    setSaving(true);
    try {
      const handles: Record<string, string> = {};
      if (twitterHandle) handles.twitter = twitterHandle;
      if (linkedinHandle) handles.linkedin = linkedinHandle;

      const { data: person, error: personErr } = await supabase
        .from("people")
        .insert({
          name: name.trim(),
          titles: title ? [title] : [],
          handles: Object.keys(handles).length > 0 ? handles : {},
        })
        .select()
        .single();
      if (personErr) throw personErr;

      const { error: linkErr } = await supabase
        .from("org_people")
        .insert({
          org_id: currentOrg.id,
          person_id: person.id,
          tier,
          status: "confirmed",
        });
      if (linkErr) throw linkErr;

      toast({ title: "Person added", description: `${name} is now being monitored.` });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddFromTeam = async (displayName: string, roleTitle?: string) => {
    if (!currentOrg) return;
    
    if (alreadyTracked.has(displayName.toLowerCase())) {
      toast({ title: "Already monitored", description: `${displayName} is already being tracked.` });
      return;
    }
    
    setSaving(true);
    try {
      const { data: person, error: personErr } = await supabase
        .from("people")
        .insert({
          name: displayName,
          titles: roleTitle ? [roleTitle] : [],
        })
        .select()
        .single();
      if (personErr) throw personErr;

      const { error: linkErr } = await supabase
        .from("org_people")
        .insert({
          org_id: currentOrg.id,
          person_id: person.id,
          tier: "other",
          status: "confirmed",
        });
      if (linkErr) throw linkErr;

      toast({ title: "Person added for monitoring", description: `${displayName} is now being tracked.` });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filteredMembers = members.filter(m => {
    if (!teamSearch) return true;
    const q = teamSearch.toLowerCase();
    return (
      m.profile?.full_name?.toLowerCase().includes(q) ||
      m.profile?.email?.toLowerCase().includes(q)
    );
  });

  const filteredContacts = contacts.filter(c => {
    if (!teamSearch) return true;
    const q = teamSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.role_title?.toLowerCase().includes(q) ||
      c.department?.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Add Person to Monitor
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as "new" | "team")}>
          <TabsList className="bg-muted w-full">
            <TabsTrigger value="new" className="flex-1 gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> New Person
            </TabsTrigger>
            <TabsTrigger value="team" className="flex-1 gap-1.5">
              <Users className="h-3.5 w-3.5" /> From Team
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-4 mt-4">
            <div className="space-y-2 relative">
              <Label>Full Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Start typing to search team or enter new name..." className="bg-muted border-border" />
              {/* Typeahead dropdown */}
              {nameSuggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                  <p className="text-[10px] text-muted-foreground px-3 pt-2 pb-1">Existing team members</p>
                  {nameSuggestions.map((s, i) => (
                    <button
                      key={i}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setName(s.name);
                        if (s.title) setTitle(s.title);
                      }}
                    >
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{s.subtitle}</p>
                      </div>
                      {alreadyTracked.has(s.name.toLowerCase()) && (
                        <Badge variant="secondary" className="text-[9px] ml-auto shrink-0">Already tracked</Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Title / Role</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. CEO, Head of Communications" className="bg-muted border-border" />
            </div>
            <div className="space-y-2">
              <Label>Monitoring Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIERS.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <span>{t.label}</span>
                        <span className="text-[10px] text-muted-foreground">— {t.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Twitter Handle</Label>
                <Input value={twitterHandle} onChange={e => setTwitterHandle(e.target.value)} placeholder="@handle" className="bg-muted border-border" />
              </div>
              <div className="space-y-2">
                <Label>LinkedIn</Label>
                <Input value={linkedinHandle} onChange={e => setLinkedinHandle(e.target.value)} placeholder="linkedin.com/in/..." className="bg-muted border-border" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleAddNew} disabled={saving || !name.trim()}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Person
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search team members and contacts..."
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                className="pl-9 bg-muted border-border"
              />
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {loadingTeam ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
              ) : (
                <>
                  {/* Org Members Section */}
                  {filteredMembers.length > 0 && (
                    <>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 pt-2 pb-1 flex items-center gap-1">
                        <Users className="h-3 w-3" /> Team Members
                      </p>
                      {filteredMembers.map(m => {
                        const displayName = m.profile?.full_name || m.profile?.email || "Unnamed";
                        const tracked = alreadyTracked.has(displayName.toLowerCase());
                        return (
                          <div key={m.user_id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {m.profile?.email} · <Badge variant="secondary" className="text-[9px]">{m.role}</Badge>
                              </p>
                            </div>
                            {tracked ? (
                              <Badge variant="outline" className="text-[9px] shrink-0">Tracked</Badge>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => handleAddFromTeam(displayName)} disabled={saving}>
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Internal Contacts Section */}
                  {filteredContacts.length > 0 && (
                    <>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 pt-3 pb-1 flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> Internal Contacts
                      </p>
                      {filteredContacts.map(c => {
                        const tracked = alreadyTracked.has(c.name.toLowerCase());
                        return (
                          <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {[c.role_title, c.department].filter(Boolean).join(" · ") || c.email || "No details"}
                              </p>
                            </div>
                            {tracked ? (
                              <Badge variant="outline" className="text-[9px] shrink-0">Tracked</Badge>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => handleAddFromTeam(c.name, c.role_title || undefined)} disabled={saving}>
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}

                  {filteredMembers.length === 0 && filteredContacts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {teamSearch ? "No matches found." : "No team members or contacts yet."}
                    </p>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
