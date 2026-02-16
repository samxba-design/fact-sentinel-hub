import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, UserPlus, Copy, Check, Loader2, Trash2, Shield, Eye, Edit3, Scan,
  Crown, Link2, Calendar, Mail
} from "lucide-react";

interface Member {
  id: string;
  user_id: string;
  role: string;
  accepted_at: string | null;
  invited_email: string | null;
  profile?: { full_name: string | null; email: string | null; avatar_url: string | null };
}

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner", icon: Crown, description: "Full control — billing, delete org, manage all" },
  { value: "admin", label: "Admin", icon: Shield, description: "Manage members, settings, and all data" },
  { value: "analyst", label: "Analyst", icon: Scan, description: "Run scans, manage mentions, create escalations" },
  { value: "approver", label: "Approver", icon: Check, description: "Approve facts, templates, and responses" },
  { value: "viewer", label: "Viewer", icon: Eye, description: "Read-only access to all data" },
];

const roleColors: Record<string, string> = {
  owner: "text-primary border-primary/30 bg-primary/5",
  admin: "text-sentinel-amber border-sentinel-amber/30 bg-sentinel-amber/5",
  analyst: "text-sentinel-cyan border-sentinel-cyan/30 bg-sentinel-cyan/5",
  approver: "text-sentinel-emerald border-sentinel-emerald/30 bg-sentinel-emerald/5",
  viewer: "text-muted-foreground border-border bg-muted/30",
};

export default function TeamManagementTab() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("analyst");
  const [inviting, setInviting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  const currentUserRole = members.find(m => m.user_id === user?.id)?.role;
  const isOwnerOrAdmin = currentUserRole === "owner" || currentUserRole === "admin";

  const fetchMembers = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase
      .from("org_memberships")
      .select("id, user_id, role, accepted_at, invited_email")
      .eq("org_id", currentOrg.id)
      .order("created_at");

    if (data) {
      // Fetch profiles for each member
      const userIds = data.map(m => m.user_id).filter(Boolean);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      setMembers(data.map(m => ({
        ...m,
        profile: profileMap.get(m.user_id) || undefined,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, [currentOrg]);

  const handleInvite = async () => {
    if (!currentOrg || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      // Check if user exists by email in profiles
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", inviteEmail.trim().toLowerCase())
        .maybeSingle();

      if (existingProfile) {
        // Check if already a member
        const { data: existingMember } = await supabase
          .from("org_memberships")
          .select("id")
          .eq("org_id", currentOrg.id)
          .eq("user_id", existingProfile.id)
          .maybeSingle();

        if (existingMember) {
          toast({ title: "Already a member", description: "This user is already part of this organization.", variant: "destructive" });
          setInviting(false);
          return;
        }

        // Add membership directly
        const { error } = await supabase.from("org_memberships").insert({
          org_id: currentOrg.id,
          user_id: existingProfile.id,
          role: inviteRole as any,
          invited_email: inviteEmail.trim().toLowerCase(),
          accepted_at: new Date().toISOString(),
        });
        if (error) throw error;
      } else {
        // Create a pending invitation (user doesn't exist yet)
        // We use a placeholder user_id — in production you'd use an invite system
        const { error } = await supabase.from("org_memberships").insert({
          org_id: currentOrg.id,
          user_id: user!.id, // Temporary — will be updated when they sign up
          role: inviteRole as any,
          invited_email: inviteEmail.trim().toLowerCase(),
        });
        if (error) throw error;
      }

      toast({ title: "Invitation sent", description: `${inviteEmail} has been invited as ${inviteRole}.` });
      setInviteEmail("");
      setInviteOpen(false);
      await fetchMembers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (member: Member, newRole: string) => {
    if (!isOwnerOrAdmin || member.role === "owner") return;
    setUpdatingRole(member.id);
    try {
      const { error } = await supabase
        .from("org_memberships")
        .update({ role: newRole as any })
        .eq("id", member.id);
      if (error) throw error;
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role: newRole } : m));
      toast({ title: "Role updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const { error } = await supabase.from("org_memberships").delete().eq("id", removeTarget.id);
      if (error) throw error;
      setMembers(prev => prev.filter(m => m.id !== removeTarget.id));
      toast({ title: "Member removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/auth?invite=${currentOrg?.id}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
    toast({ title: "Link copied", description: "Share this link to invite people to your organization." });
  };

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-card-foreground">Team Members</h3>
          <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={copyInviteLink}>
            {linkCopied ? <Check className="h-3 w-3 mr-1.5" /> : <Link2 className="h-3 w-3 mr-1.5" />}
            {linkCopied ? "Copied!" : "Copy Invite Link"}
          </Button>
          {isOwnerOrAdmin && (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-3 w-3 mr-1.5" /> Invite
            </Button>
          )}
        </div>
      </div>

      {/* Role Legend */}
      <div className="flex flex-wrap gap-2">
        {ROLE_OPTIONS.map(role => (
          <div key={role.value} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <role.icon className="h-3 w-3" />
            <span className="font-medium">{role.label}</span>
            <span>— {role.description}</span>
          </div>
        ))}
      </div>

      {/* Members List */}
      <Card className="bg-card border-border divide-y divide-border">
        {members.map(member => {
          const displayName = member.profile?.full_name || member.invited_email || "Unknown";
          const displayEmail = member.profile?.email || member.invited_email || "";
          const isPending = !member.accepted_at;
          const isSelf = member.user_id === user?.id;
          const canManage = isOwnerOrAdmin && !isSelf && member.role !== "owner";

          return (
            <div key={member.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-card-foreground truncate">{displayName}</span>
                    {isSelf && <Badge variant="outline" className="text-[9px] px-1">You</Badge>}
                    {isPending && <Badge variant="secondary" className="text-[9px] px-1">Pending</Badge>}
                  </div>
                  {displayEmail && <p className="text-[11px] text-muted-foreground truncate">{displayEmail}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {canManage ? (
                  <Select value={member.role} onValueChange={(v) => handleRoleChange(member, v)} disabled={updatingRole === member.id}>
                    <SelectTrigger className="w-28 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.filter(r => r.value !== "owner").map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className={`text-[10px] ${roleColors[member.role] || ""}`}>
                    {member.role}
                  </Badge>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setRemoveTarget(member)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Invite Team Member
            </DialogTitle>
            <DialogDescription>
              Invite someone to join your organization. They'll receive access based on the role you assign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email Address
              </Label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleInvite()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.filter(r => r.value !== "owner").map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <div className="flex items-center gap-2">
                        <r.icon className="h-3 w-3" />
                        <span>{r.label}</span>
                        <span className="text-muted-foreground text-[10px]">— {r.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Remove {removeTarget?.profile?.full_name || removeTarget?.invited_email} from this organization? They'll lose all access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing}>
              {removing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
