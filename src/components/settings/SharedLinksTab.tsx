import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Link2, Plus, Copy, Trash2, Eye, EyeOff, Check, Loader2,
  BarChart3, Search, Brain, Users, Shield, AlertTriangle,
  MessageSquare, FileText, ChevronDown, ChevronUp, Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import InfoTooltip from "@/components/InfoTooltip";
import { format } from "date-fns";

interface SharedLinkPermissions {
  monitoring: boolean;
  intelligence: boolean;
  operations: boolean;
  assets: boolean;
}

interface SharedLink {
  id: string;
  token: string;
  label: string | null;
  permissions: SharedLinkPermissions;
  is_active: boolean;
  created_at: string;
  expires_at?: string | null;
}

const PERMISSION_GROUPS = [
  {
    key: "monitoring" as const,
    label: "Monitoring",
    icon: BarChart3,
    description: "Dashboard, Mentions, Narratives",
    color: "text-sentinel-emerald",
    bgColor: "bg-sentinel-emerald/10",
    borderColor: "border-sentinel-emerald/30",
    pages: ["Dashboard overview & metrics", "Mention feed & detail views", "Narrative clusters & timelines"],
  },
  {
    key: "intelligence" as const,
    label: "Intelligence",
    icon: Brain,
    description: "People, Competitors, Risk Console",
    color: "text-sentinel-cyan",
    bgColor: "bg-sentinel-cyan/10",
    borderColor: "border-sentinel-cyan/30",
    pages: ["People & influencer profiles", "Competitor tracking", "Risk console & threat scoring"],
  },
  {
    key: "operations" as const,
    label: "Operations",
    icon: Shield,
    description: "Incidents, Escalations, Respond",
    color: "text-sentinel-amber",
    bgColor: "bg-sentinel-amber/10",
    borderColor: "border-sentinel-amber/30",
    pages: ["Incident war rooms & timelines", "Escalation queue & assignments", "AI response drafting tool"],
  },
  {
    key: "assets" as const,
    label: "Assets & Reports",
    icon: FileText,
    description: "Facts, Templates, PDF Reports",
    color: "text-sentinel-purple",
    bgColor: "bg-sentinel-purple/10",
    borderColor: "border-sentinel-purple/30",
    pages: ["Approved facts library", "Response templates", "Generate & download PDF reports"],
  },
];

export default function SharedLinksTab() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newLabel, setNewLabel] = useState("");
  const [newPermissions, setNewPermissions] = useState<SharedLinkPermissions>({
    monitoring: true,
    intelligence: true,
    operations: true,
    assets: true,
  });
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["shared-links", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data, error } = await supabase
        .from("shared_links")
        .select("*")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as SharedLink[];
    },
    enabled: !!currentOrg,
  });

  const allOn = Object.values(newPermissions).every(Boolean);
  const allOff = Object.values(newPermissions).every(v => !v);

  const toggleAll = (on: boolean) => {
    setNewPermissions({ monitoring: on, intelligence: on, operations: on, assets: on });
  };

  const createLink = async () => {
    if (!currentOrg || !user) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("shared_links").insert([{
        org_id: currentOrg.id,
        created_by: user.id,
        label: newLabel.trim() || null,
        permissions: JSON.parse(JSON.stringify(newPermissions)),
      }]);
      if (error) throw error;
      toast({ title: "Shared link created", description: "Anyone with this link can view the allowed sections." });
      setNewLabel("");
      setNewPermissions({ monitoring: true, intelligence: true, operations: true, assets: true });
      setShowCreateForm(false);
      queryClient.invalidateQueries({ queryKey: ["shared-links", currentOrg.id] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (link: SharedLink) => {
    const { error } = await supabase.from("shared_links").update({ is_active: !link.is_active }).eq("id", link.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["shared-links", currentOrg?.id] });
      toast({ title: link.is_active ? "Link revoked" : "Link reactivated" });
    }
  };

  const deleteLink = async (link: SharedLink) => {
    const { error } = await supabase.from("shared_links").delete().eq("id", link.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["shared-links", currentOrg?.id] });
      toast({ title: "Link deleted" });
    }
  };

  const copyLink = (link: SharedLink) => {
    const url = `${window.location.origin}/shared/${link.token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activeCount = (perms: SharedLinkPermissions) => Object.values(perms).filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Link2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-card-foreground">Shared View Links</p>
          <p>Generate secure, read-only links that let external stakeholders — clients, executives, partners — view your monitoring data <strong>without needing an account</strong>. Control exactly which sections they can access.</p>
        </div>
      </div>

      {/* Create new link */}
      {!showCreateForm ? (
        <Button onClick={() => setShowCreateForm(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Create Shared Link
        </Button>
      ) : (
        <Card className="bg-card border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-card-foreground">New Shared Link</h4>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>Cancel</Button>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Label (optional)</Label>
            <Input
              placeholder="e.g. Board report link, Client portal, Agency access..."
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
            />
          </div>

          {/* Quick toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Permissions</Label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleAll(true)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${allOn ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                Full Access
              </button>
              <button
                onClick={() => toggleAll(false)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${allOff ? "bg-muted border-border text-muted-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                View Only Default
              </button>
            </div>
          </div>

          {/* Permission groups */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PERMISSION_GROUPS.map(group => {
              const Icon = group.icon;
              const isOn = newPermissions[group.key];
              const isExpanded = expandedGroup === group.key;

              return (
                <div
                  key={group.key}
                  className={`rounded-lg border overflow-hidden transition-all ${
                    isOn ? `${group.bgColor} ${group.borderColor}` : "bg-muted/30 border-border"
                  }`}
                >
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`h-4 w-4 shrink-0 ${isOn ? group.color : "text-muted-foreground/50"}`} />
                      <div className="min-w-0">
                        <span className={`text-sm font-medium ${isOn ? "text-card-foreground" : "text-muted-foreground"}`}>
                          {group.label}
                        </span>
                        <p className="text-[10px] text-muted-foreground">{group.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                        className="text-muted-foreground hover:text-foreground p-1"
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      <Switch
                        checked={isOn}
                        onCheckedChange={checked =>
                          setNewPermissions(prev => ({ ...prev, [group.key]: checked }))
                        }
                      />
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border/50 bg-card/30 px-3 py-2">
                      <ul className="text-[10px] text-muted-foreground space-y-0.5">
                        {group.pages.map((page, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <div className={`h-1 w-1 rounded-full ${isOn ? group.color.replace("text-", "bg-") : "bg-muted-foreground/30"}`} />
                            {page}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Note about what viewers CAN'T access */}
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            Shared viewers never have access to Settings, Team Management, Scans, or Admin features regardless of permissions.
          </p>

          <Button onClick={createLink} disabled={creating || Object.values(newPermissions).every(v => !v)} className="gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Generate Link
          </Button>
        </Card>
      )}

      {/* Existing links */}
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : links.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <Link2 className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No shared links yet.</p>
          <p className="text-xs text-muted-foreground">Create a link above to share read-only access with external stakeholders.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Security warning banner */}
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 mb-4 text-xs text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Shared links are public — treat them like passwords. Anyone with the link can view your organization's data.</span>
          </div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Active Links ({links.filter(l => l.is_active).length} of {links.length})
          </Label>
          {links.map(link => (
            <div
              key={link.id}
              className={`rounded-lg border p-3 transition-all ${
                link.is_active ? "bg-muted/50 border-border" : "bg-muted/20 border-dashed border-border/50 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-card-foreground">
                      {link.label || "Untitled link"}
                    </span>
                    {link.is_active ? (
                      <Badge variant="outline" className="text-[9px] bg-sentinel-emerald/10 text-sentinel-emerald border-sentinel-emerald/30">
                        <Eye className="h-2.5 w-2.5 mr-0.5" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/30">
                        <EyeOff className="h-2.5 w-2.5 mr-0.5" /> Revoked
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">
                      {activeCount(link.permissions)}/4 groups enabled
                    </span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] text-muted-foreground">
                      Created {new Date(link.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] text-muted-foreground">
                      Expires: {link.expires_at ? format(new Date(link.expires_at), "MMM d, yyyy") : "Never"}
                    </span>
                  </div>
                  {/* Permission pills */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {PERMISSION_GROUPS.map(group => (
                      <Badge
                        key={group.key}
                        variant="outline"
                        className={`text-[9px] ${
                          link.permissions[group.key]
                            ? `${group.bgColor} ${group.color} ${group.borderColor}`
                            : "bg-muted/50 text-muted-foreground/50 border-border/50 line-through"
                        }`}
                      >
                        {group.label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => copyLink(link)}
                    disabled={!link.is_active}
                    title="Copy link"
                  >
                    {copiedId === link.id ? <Check className="h-3.5 w-3.5 text-sentinel-emerald" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => toggleActive(link)}
                    title={link.is_active ? "Revoke" : "Reactivate"}
                  >
                    {link.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteLink(link)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
