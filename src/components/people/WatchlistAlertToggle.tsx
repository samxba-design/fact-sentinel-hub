/**
 * WatchlistAlertToggle — enable per-person alerts that fire when
 * new mentions appear for this person. Stored in tracking_profiles.settings.
 */
import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";

interface Props {
  personId: string;
  personName: string;
}

export default function WatchlistAlertToggle({ personId, personName }: Props) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    supabase
      .from("tracking_profiles")
      .select("settings")
      .eq("org_id", currentOrg.id)
      .maybeSingle()
      .then(({ data }) => {
        const watchlist: string[] = (data?.settings as any)?.watchlist_alerts || [];
        setEnabled(watchlist.includes(personId));
        setLoading(false);
      });
  }, [currentOrg, personId]);

  const toggle = async () => {
    if (!currentOrg) return;
    setSaving(true);
    const newEnabled = !enabled;

    // Load current settings
    const { data } = await supabase
      .from("tracking_profiles")
      .select("id, settings")
      .eq("org_id", currentOrg.id)
      .maybeSingle();

    const currentSettings = (data?.settings as any) || {};
    const currentList: string[] = currentSettings.watchlist_alerts || [];
    const newList = newEnabled
      ? [...new Set([...currentList, personId])]
      : currentList.filter((id: string) => id !== personId);

    const merged = { ...currentSettings, watchlist_alerts: newList };
    const { error } = data?.id
      ? await supabase.from("tracking_profiles").update({ settings: merged }).eq("org_id", currentOrg.id)
      : await supabase.from("tracking_profiles").insert({ org_id: currentOrg.id, settings: merged });

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setEnabled(newEnabled);
      toast({
        title: newEnabled ? `🔔 Watching ${personName}` : `🔕 Stopped watching ${personName}`,
        description: newEnabled
          ? "You'll be alerted when new mentions appear for this person."
          : "Watchlist alert removed.",
      });
    }
    setSaving(false);
  };

  if (loading) return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
      {enabled ? (
        <Bell className="h-4 w-4 text-primary flex-shrink-0" />
      ) : (
        <BellOff className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      )}
      <div className="flex-1">
        <Label className="text-sm font-medium text-foreground cursor-pointer" onClick={toggle}>
          Watchlist Alert
        </Label>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {enabled
            ? "Active — you'll be alerted when new mentions appear"
            : "Enable to get alerted when new mentions appear for this person"}
        </p>
      </div>
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Switch checked={enabled} onCheckedChange={toggle} />
      )}
    </div>
  );
}
