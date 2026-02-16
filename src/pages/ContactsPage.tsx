import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Search, Users, Mail, Phone, Building2, Crown, Pencil, Trash2, Loader2, UserCheck, TicketCheck, Bell, Link2
} from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/EmptyState";

interface InternalContact {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  role_title: string | null;
  phone: string | null;
  notes: string | null;
  is_department_lead: boolean | null;
  created_at: string | null;
}

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  accepted_at: string | null;
  invited_email: string | null;
  profile?: { full_name: string | null; email: string | null };
}

const DEPARTMENTS = ["Legal", "Communications", "Marketing", "Engineering", "Executive", "HR", "Finance", "Operations", "Other"];

export default function ContactsPage() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<InternalContact[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<InternalContact | null>(null);
  const [tab, setTab] = useState("all");

  const fetchData = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [contactsRes, membersRes] = await Promise.all([
      supabase.from("internal_contacts").select("*").eq("org_id", currentOrg.id).order("department").order("name"),
      supabase.from("org_memberships").select("id, user_id, role, accepted_at, invited_email").eq("org_id", currentOrg.id),
    ]);

    setContacts(contactsRes.data || []);
    
    // Fetch profiles for members
    const memberData = membersRes.data || [];
    if (memberData.length > 0) {
      const userIds = memberData.map(m => m.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      setMembers(memberData.map(m => ({ ...m, profile: profileMap.get(m.user_id) || undefined })));
    } else {
      setMembers([]);
    }
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("internal_contacts").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Contact removed" });
      setContacts(prev => prev.filter(c => c.id !== id));
    }
  };

  const departments = [...new Set(contacts.map(c => c.department).filter(Boolean))] as string[];

  const filteredContacts = contacts.filter(c => {
    if (deptFilter !== "all" && c.department !== deptFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.department?.toLowerCase().includes(q) || c.role_title?.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredMembers = members.filter(m => {
    if (search) {
      const q = search.toLowerCase();
      return m.profile?.full_name?.toLowerCase().includes(q) || m.profile?.email?.toLowerCase().includes(q) || m.invited_email?.toLowerCase().includes(q);
    }
    return true;
  });

  const departmentLeads = contacts.filter(c => c.is_department_lead);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-1">Internal directory — team members & external contacts</p>
        </div>
        <Button onClick={() => { setEditData(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Contact
        </Button>
      </div>

      <PageGuide
        title="How Contacts Work"
        subtitle="Internal directory for escalation routing and team coordination"
        steps={[
          {
            icon: <Users className="h-4 w-4 text-primary" />,
            title: "1. Build Your Directory",
            description: "Add internal contacts with department, role, email, and phone. Mark department leads for automatic escalation routing.",
          },
          {
            icon: <TicketCheck className="h-4 w-4 text-primary" />,
            title: "2. Escalation Routing",
            description: "When escalation tickets are created, they're routed to the relevant department lead. Contacts appear as clickable popovers across the platform.",
          },
          {
            icon: <Bell className="h-4 w-4 text-primary" />,
            title: "3. Alert Notifications",
            description: "Department leads receive alert emails for critical threats in their area. Configure notification preferences per contact.",
          },
        ]}
        integrations={[
          { label: "Escalations", to: "/escalations", description: "Ticket routing" },
          { label: "Settings → Team", to: "/settings?tab=team", description: "Manage team roles" },
          { label: "Settings → Alerts", to: "/settings?tab=alerts", description: "Alert email config" },
        ]}
        tip="Mark at least one department lead per key department (Legal, Communications, Executive) to enable smart escalation routing."
      />

      {/* Department leads summary */}
      {departmentLeads.length > 0 && (
        <Card className="bg-muted/30 border-border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Department Leads</p>
          <div className="flex flex-wrap gap-3">
            {departmentLeads.map(lead => (
              <div
                key={lead.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => { setEditData(lead); setFormOpen(true); }}
              >
                <Crown className="h-3.5 w-3.5 text-sentinel-amber" />
                <div>
                  <p className="text-xs font-medium text-card-foreground">{lead.name}</p>
                  <p className="text-[10px] text-muted-foreground">{lead.department}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts..." className="pl-9 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="all" className="gap-1.5"><Users className="h-3 w-3" /> All Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="members" className="gap-1.5"><UserCheck className="h-3 w-3" /> Team Members ({members.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
            ) : filteredContacts.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No contacts yet"
                description="Add your first contact to build your internal directory for escalation routing."
                actionLabel="Add Contact"
                onAction={() => { setEditData(null); setFormOpen(true); }}
              />
            ) : (
              filteredContacts.map(c => (
                <Card key={c.id} className="bg-card border-border p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-card-foreground">{c.name}</span>
                          {c.is_department_lead && (
                            <Badge variant="outline" className="text-[10px] border-sentinel-amber/30 text-sentinel-amber">
                              <Crown className="h-2.5 w-2.5 mr-0.5" /> Lead
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {c.role_title && <span>{c.role_title}</span>}
                          {c.department && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {c.department}
                            </span>
                          )}
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-primary hover:underline" onClick={e => e.stopPropagation()}>
                              <Mail className="h-3 w-3" /> {c.email}
                            </a>
                          )}
                          {c.phone && (
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditData(c); setFormOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
            ) : filteredMembers.length === 0 ? (
              <EmptyState
                icon={UserCheck}
                title="No team members found"
                description="Invite team members from the Settings page to collaborate on monitoring."
              />
            ) : (
              filteredMembers.map(m => (
                <Card key={m.id} className="bg-card border-border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                        {(m.profile?.full_name || m.invited_email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-card-foreground">
                          {m.profile?.full_name || m.invited_email || "Unknown"}
                        </span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <Badge variant="secondary" className="text-[10px] capitalize">{m.role}</Badge>
                          {m.profile?.email && (
                            <a href={`mailto:${m.profile.email}`} className="flex items-center gap-1 text-primary hover:underline">
                              <Mail className="h-3 w-3" /> {m.profile.email}
                            </a>
                          )}
                          {!m.accepted_at && <Badge variant="outline" className="text-[10px] text-sentinel-amber">Pending invite</Badge>}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={fetchData}
        editData={editData}
      />
    </div>
  );
}

function ContactFormDialog({ open, onOpenChange, onSaved, editData }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  editData: InternalContact | null;
}) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isLead, setIsLead] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editData?.name || "");
      setEmail(editData?.email || "");
      setDepartment(editData?.department || "");
      setRoleTitle(editData?.role_title || "");
      setPhone(editData?.phone || "");
      setNotes(editData?.notes || "");
      setIsLead(editData?.is_department_lead || false);
    }
  }, [open, editData]);

  const handleSave = async () => {
    if (!currentOrg || !name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      email: email.trim() || null,
      department: department || null,
      role_title: roleTitle.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      is_department_lead: isLead,
    };

    try {
      if (editData) {
        const { error } = await supabase.from("internal_contacts").update(payload).eq("id", editData.id);
        if (error) throw error;
        toast({ title: "Contact updated" });
      } else {
        const { error } = await supabase.from("internal_contacts").insert({ ...payload, org_id: currentOrg.id });
        if (error) throw error;
        toast({ title: "Contact added" });
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Contact" : "Add Contact"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com" type="email" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 0123" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role Title</Label>
              <Input value={roleTitle} onChange={e => setRoleTitle(e.target.value)} placeholder="e.g. VP of Comms" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isLead} onCheckedChange={setIsLead} />
            <Label className="text-sm">Department Lead</Label>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional context..." rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editData ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
