import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Save, Loader2, Zap, Languages } from "lucide-react";
import { Label } from "@/components/ui/label";
import InfoTooltip from "@/components/InfoTooltip";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";

interface SourceSchedule {
  type: string;
  enabled: boolean;
  frequency: string;
}

const FREQUENCY_OPTIONS = [
  { value: "0 */1 * * *", label: "Every hour" },
  { value: "0 */2 * * *", label: "Every 2 hours" },
  { value: "0 */4 * * *", label: "Every 4 hours" },
  { value: "0 */6 * * *", label: "Every 6 hours" },
  { value: "0 */12 * * *", label: "Every 12 hours" },
  { value: "0 9 * * *", label: "Daily (9 AM)" },
  { value: "0 9 * * 1", label: "Weekly (Mon 9 AM)" },
];

const SOURCE_LABELS: Record<string, string> = {
  web: "Web / News",
  "google-news": "Google News",
  reviews: "Review Sites",
  "app-store": "App Stores",
  reddit: "Reddit",
  youtube: "YouTube",
  twitter: "X (Twitter)",
  podcasts: "Podcasts",
  forums: "Forums",
  rss: "RSS Feeds",
};

export default function BulkScanSchedulingTab() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState<SourceSchedule[]>([]);
  const [multiLangEnabled, setMultiLangEnabled] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    Promise.all([
      supabase.from("sources").select("type, enabled").eq("org_id", currentOrg.id),
      supabase.from("tracking_profiles").select("settings").eq("org_id", currentOrg.id).maybeSingle(),
    ]).then(([sourcesRes, profileRes]) => {
      const sources = sourcesRes.data || [];
      const settings = (profileRes.data?.settings as Record<string, any>) || {};
      const scanSchedules = settings.scan_schedules || {};
      setMultiLangEnabled(settings.multi_language_detection ?? false);
      setAutoTranslate(settings.auto_translate ?? true);

      setSchedules(
        sources.map(s => ({
          type: s.type,
          enabled: scanSchedules[s.type] !== undefined ? (s.enabled ?? false) : false, // Default OFF
          frequency: scanSchedules[s.type] || "0 9 * * *",
        }))
      );
      setLoading(false);
    });
  }, [currentOrg]);

  const updateFrequency = (type: string, frequency: string) => {
    setSchedules(prev => prev.map(s => s.type === type ? { ...s, frequency } : s));
  };

  const toggleEnabled = (type: string) => {
    setSchedules(prev => prev.map(s => s.type === type ? { ...s, enabled: !s.enabled } : s));
  };

  const handleSave = async () => {
    if (!currentOrg) return;
    setSaving(true);
    try {
      const scanSchedules: Record<string, string> = {};
      schedules.forEach(s => { scanSchedules[s.type] = s.frequency; });

      // Update tracking_profiles settings
      const { data: existing } = await supabase
        .from("tracking_profiles")
        .select("id, settings")
        .eq("org_id", currentOrg.id)
        .maybeSingle();

      const newSettings = {
        ...((existing?.settings as Record<string, any>) || {}),
        scan_schedules: scanSchedules,
        multi_language_detection: multiLangEnabled,
        auto_translate: autoTranslate,
      };

      if (existing) {
        await supabase.from("tracking_profiles").update({ settings: newSettings }).eq("id", existing.id);
      } else {
        await supabase.from("tracking_profiles").insert({ org_id: currentOrg.id, settings: newSettings });
      }

      // Update source enabled states
      for (const s of schedules) {
        await supabase.from("sources").update({ enabled: s.enabled }).eq("org_id", currentOrg.id).eq("type", s.type);
      }

      toast({ title: "Scan schedules saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-64 rounded-lg" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Bulk Scan Scheduling
            <InfoTooltip text="Configure different scan frequencies per source. High-velocity sources like Twitter can scan hourly, while slower sources like podcasts can scan weekly." />
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Set custom scan intervals for each source type</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Schedules
        </Button>
      </div>

      {schedules.length === 0 ? (
        <Card className="bg-card border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No sources configured. Add sources in the Sources tab first.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {schedules.map(s => (
            <Card key={s.type} className={`bg-card border-border p-4 transition-all ${!s.enabled ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-4">
                <Switch checked={s.enabled} onCheckedChange={() => toggleEnabled(s.type)} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-card-foreground">
                    {SOURCE_LABELS[s.type] || s.type}
                  </span>
                </div>
                <Select value={s.frequency} onValueChange={(v) => updateFrequency(s.type, v)} disabled={!s.enabled}>
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map(f => (
                      <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-[9px] shrink-0">
                  <Zap className="h-2.5 w-2.5 mr-0.5" />
                  {FREQUENCY_OPTIONS.find(f => f.value === s.frequency)?.label || "Custom"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
