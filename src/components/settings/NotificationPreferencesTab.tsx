import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Mail, AlertTriangle, TrendingUp, Flame, Users, FileText, Scan, Save, Loader2, Sun, Moon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Preferences {
  critical_alerts: boolean;
  mention_spikes: boolean;
  negative_spikes: boolean;
  viral_risk: boolean;
  escalation_assigned: boolean;
  escalation_updated: boolean;
  weekly_digest: boolean;
  new_scan_complete: boolean;
  email_enabled: boolean;
}

const defaultPrefs: Preferences = {
  critical_alerts: true,
  mention_spikes: true,
  negative_spikes: true,
  viral_risk: true,
  escalation_assigned: true,
  escalation_updated: true,
  weekly_digest: true,
  new_scan_complete: false,
  email_enabled: true,
};

const NOTIFICATION_GROUPS = [
  {
    title: "Critical Alerts",
    description: "Immediate notifications for urgent detections",
    icon: AlertTriangle,
    items: [
      { key: "critical_alerts" as const, label: "Critical mentions", desc: "When critical-severity mentions are detected" },
      { key: "mention_spikes" as const, label: "Mention spikes", desc: "Unusual volume increases (3x+ in an hour)" },
      { key: "negative_spikes" as const, label: "Negative sentiment surges", desc: "10+ negative mentions in 24 hours" },
      { key: "viral_risk" as const, label: "Viral risk alerts", desc: "Content flagged with viral potential" },
    ],
  },
  {
    title: "Escalations",
    description: "Updates on escalation tickets",
    icon: Users,
    items: [
      { key: "escalation_assigned" as const, label: "Assigned to me", desc: "When an escalation is assigned to you" },
      { key: "escalation_updated" as const, label: "Status updates", desc: "When escalations you're involved in are updated" },
    ],
  },
  {
    title: "Reports & Scans",
    description: "Scheduled summaries and scan notifications",
    icon: FileText,
    items: [
      { key: "weekly_digest" as const, label: "Weekly digest", desc: "Summary of mentions, narratives, and risk events" },
      { key: "new_scan_complete" as const, label: "Scan complete", desc: "When a monitoring scan finishes" },
    ],
  },
];

export default function NotificationPreferencesTab() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    if (!currentOrg || !user) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("org_id", currentOrg.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setPrefs({
          critical_alerts: data.critical_alerts,
          mention_spikes: data.mention_spikes,
          negative_spikes: data.negative_spikes,
          viral_risk: data.viral_risk,
          escalation_assigned: data.escalation_assigned,
          escalation_updated: data.escalation_updated,
          weekly_digest: data.weekly_digest,
          new_scan_complete: data.new_scan_complete,
          email_enabled: data.email_enabled,
        });
        setHasExisting(true);
      }
      setLoading(false);
    };
    fetch();
  }, [currentOrg, user]);

  const toggle = (key: keyof Preferences) => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!currentOrg || !user) return;
    setSaving(true);
    try {
      if (hasExisting) {
        const { error } = await supabase
          .from("notification_preferences")
          .update(prefs)
          .eq("org_id", currentOrg.id)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notification_preferences")
          .insert({ ...prefs, org_id: currentOrg.id, user_id: user.id });
        if (error) throw error;
        setHasExisting(true);
      }
      toast({ title: "Preferences saved", description: "Your notification settings have been updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <Card className="bg-card border-border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-card-foreground">Email Notifications</h3>
              <p className="text-xs text-muted-foreground">Master toggle — disable to pause all email notifications</p>
            </div>
          </div>
          <Switch checked={prefs.email_enabled} onCheckedChange={() => toggle("email_enabled")} />
        </div>
        {prefs.email_enabled && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <div>
              <Label className="text-sm text-card-foreground">Email Theme</Label>
              <p className="text-xs text-muted-foreground">Choose how your email notifications look</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEmailTheme("dark")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  emailTheme === "dark" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Moon className="h-3 w-3" /> Dark
              </button>
              <button
                onClick={() => setEmailTheme("light")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  emailTheme === "light" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sun className="h-3 w-3" /> Light
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Notification groups */}
      {prefs.email_enabled && NOTIFICATION_GROUPS.map(group => {
        const Icon = group.icon;
        return (
          <Card key={group.title} className="bg-card border-border p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Icon className="h-4 w-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">{group.title}</h3>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
            </div>
            <div className="space-y-3 pl-7">
              {group.items.map(item => (
                <div key={item.key} className="flex items-center justify-between py-2">
                  <div>
                    <Label className="text-sm text-card-foreground cursor-pointer">{item.label}</Label>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch checked={prefs[item.key]} onCheckedChange={() => toggle(item.key)} />
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {!prefs.email_enabled && (
        <Card className="bg-card border-border p-6 text-center">
          <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">All email notifications are paused</p>
          <p className="text-xs text-muted-foreground mt-1">Enable the master toggle above to configure individual notifications</p>
        </Card>
      )}

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Preferences
      </Button>
    </div>
  );
}
