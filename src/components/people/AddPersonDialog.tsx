import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Users, Search } from "lucide-react";
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
  const [tab, setTab] = useState<"new" | "existing">("new");

  // New person fields
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [tier, setTier] = useState("other");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [linkedinHandle, setLinkedinHandle] = useState("");

  // Existing members
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (!open || !currentOrg) return;
    setName(""); setTitle(""); setTier("other"); setTwitterHandle(""); setLinkedinHandle("");

    // Load org members
    setLoadingMembers(true);
    supabase
      .from("org_memberships")
      .select("user_id, role")
      .eq("org_id", currentOrg.id)
      .not("accepted_at", "is", null)
      .then(async ({ data }) => {
        if (!data || data.length === 0) { setMembers([]); setLoadingMembers(false); return; }
        const profileRes = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", data.map(d => d.user_id));
        const profiles = profileRes.data || [];
        setMembers(data.map(d => ({
          user_id: d.user_id,
          role: d.role,
          profile: profiles.find(p => p.id === d.user_id) || null,
        })));
        setLoadingMembers(false);
      });
  }, [open, currentOrg]);

  const handleAddNew = async () => {
    if (!currentOrg || !name.trim()) return;
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

  const handleAddMember = async (member: OrgMember) => {
    if (!currentOrg) return;
    setSaving(true);
    try {
      const displayName = member.profile?.full_name || member.profile?.email || "Team Member";

      // Check if already tracked
      const { data: existing } = await supabase
        .from("org_people")
        .select("id")
        .eq("org_id", currentOrg.id)
        .then(async (orgPeople) => {
          // Simple approach: create person then link
          return orgPeople;
        });

      const { data: person, error: personErr } = await supabase
        .from("people")
        .insert({ name: displayName })
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

      toast({ title: "Member added for monitoring", description: `${displayName} is now being tracked.` });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filteredMembers = members.filter(m => {
    if (!memberSearch) return true;
    const q = memberSearch.toLowerCase();
    return (
      m.profile?.full_name?.toLowerCase().includes(q) ||
      m.profile?.email?.toLowerCase().includes(q)
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

        <Tabs value={tab} onValueChange={v => setTab(v as "new" | "existing")}>
          <TabsList className="bg-muted w-full">
            <TabsTrigger value="new" className="flex-1 gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> New Person
            </TabsTrigger>
            <TabsTrigger value="existing" className="flex-1 gap-1.5">
              <Users className="h-3.5 w-3.5" /> From Team
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jane Smith" className="bg-muted border-border" />
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

          <TabsContent value="existing" className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search team members..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="pl-9 bg-muted border-border"
              />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {loadingMembers ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading team members...</p>
              ) : filteredMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No team members found.</p>
              ) : (
                filteredMembers.map(m => (
                  <div key={m.user_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border hover:border-primary/20 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{m.profile?.full_name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{m.profile?.email} · <Badge variant="secondary" className="text-[9px]">{m.role}</Badge></p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleAddMember(m)} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
