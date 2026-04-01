/**
 * Noise Filter Rules — auto-ignore patterns applied to all future scans.
 * Rules stored in org_settings JSONB or a new noise_rules table.
 * Using org_settings for now (no migration required).
 */
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Filter, Plus, Trash2, RefreshCw, AlertTriangle, Info, CheckCircle, Save,
  Globe, MessageSquare, User, Tag, TrendingUp, EyeOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import PageGuide from "@/components/PageGuide";

interface NoiseRule {
  id: string;
  type: "domain" | "keyword" | "author" | "source" | "sentiment_below" | "follower_below";
  value: string;
  label?: string;
  enabled: boolean;
  created_at: string;
}

const RULE_TYPE_CONFIG: Record<string, { label: string; icon: any; placeholder: string; description: string }> = {
  domain:           { label: "Domain",           icon: Globe,          placeholder: "e.g. reddit.com, spamsite.net",  description: "Ignore all mentions from this domain" },
  keyword:          { label: "Keyword match",    icon: MessageSquare,  placeholder: "e.g. 'competitor', 'unrelated'", description: "Ignore mentions containing this word or phrase" },
  author:           { label: "Author/Handle",    icon: User,           placeholder: "e.g. @spambot, John Doe",        description: "Ignore all mentions from this author" },
  source:           { label: "Source platform",  icon: Tag,            placeholder: "e.g. hackernews, youtube",       description: "Ignore all mentions from this source platform" },
  sentiment_below:  { label: "Min. confidence",  icon: TrendingUp,     placeholder: "e.g. 0.3 (30%)",                description: "Ignore mentions with sentiment confidence below this value (0–1)" },
  follower_below:   { label: "Min. followers",   icon: User,           placeholder: "e.g. 100",                      description: "Ignore mentions from authors with fewer followers than this" },
};

const PRESET_RULES: Omit<NoiseRule, "id" | "created_at">[] = [
  { type: "domain",         value: "wikipedia.org",    label: "Wikipedia",           enabled: true },
  { type: "domain",         value: "investopedia.com", label: "Investopedia",        enabled: true },
  { type: "follower_below", value: "10",               label: "< 10 followers",      enabled: false },
  { type: "sentiment_below",value: "0.2",              label: "Low confidence <20%", enabled: false },
];

function generateId() {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function NoiseFiltersPage() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [rules, setRules] = useState<NoiseRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);

  // New rule form
  const [newType, setNewType] = useState<string>("domain");
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    const { data } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", currentOrg.id)
      .maybeSingle();

    const settings = (data?.settings as any) || {};
    const savedRules: NoiseRule[] = settings.noise_rules || [];
    setRules(savedRules);
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => { load(); }, [load]);

  const persist = async (updatedRules: NoiseRule[]) => {
    if (!currentOrg) return;
    setSaving(true);

    // Load current settings to merge
    const { data } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", currentOrg.id)
      .maybeSingle();
    const currentSettings = (data?.settings as any) || {};
    const merged = { ...currentSettings, noise_rules: updatedRules };

    const { error } = await supabase
      .from("organizations")
      .update({ settings: merged })
      .eq("id", currentOrg.id);

    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setDirty(false);
    }
  };

  const addRule = async () => {
    if (!newValue.trim()) return;
    const rule: NoiseRule = {
      id: generateId(),
      type: newType as NoiseRule["type"],
      value: newValue.trim(),
      label: newLabel.trim() || undefined,
      enabled: true,
      created_at: new Date().toISOString(),
    };
    const updated = [...rules, rule];
    setRules(updated);
    setNewValue("");
    setNewLabel("");
    await persist(updated);
    toast({ title: "Rule added", description: `${RULE_TYPE_CONFIG[newType].label}: ${rule.value}` });
  };

  const toggleRule = async (id: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    setRules(updated);
    await persist(updated);
  };

  const removeRule = async (id: string) => {
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    await persist(updated);
    toast({ title: "Rule removed" });
  };

  const addPreset = async (preset: typeof PRESET_RULES[0]) => {
    if (rules.some(r => r.type === preset.type && r.value === preset.value)) {
      toast({ title: "Already added", description: `${preset.value} is already in your rules.` });
      return;
    }
    const rule: NoiseRule = { ...preset, id: generateId(), created_at: new Date().toISOString() };
    const updated = [...rules, rule];
    setRules(updated);
    await persist(updated);
    toast({ title: `Preset added: ${preset.label}` });
  };

  // Apply rules retroactively to existing mentions
  const applyRetroactively = async () => {
    if (!currentOrg || rules.filter(r => r.enabled).length === 0) return;
    setApplying(true);

    const enabledRules = rules.filter(r => r.enabled);
    let updated = 0;

    try {
      // Process domain rules
      const domainRules = enabledRules.filter(r => r.type === "domain");
      if (domainRules.length > 0) {
        const { data: allMentions } = await supabase
          .from("mentions")
          .select("id, url")
          .eq("org_id", currentOrg.id)
          .eq("mention_type", "brand")
          .not("status", "in", '("ignored","resolved")');

        const toIgnore = (allMentions || [])
          .filter(m => m.url && domainRules.some(r => m.url?.includes(r.value)))
          .map(m => m.id);

        if (toIgnore.length > 0) {
          // Batch in 500s
          for (let i = 0; i < toIgnore.length; i += 500) {
            await supabase.from("mentions").update({ status: "ignored" }).in("id", toIgnore.slice(i, i + 500));
          }
          updated += toIgnore.length;
        }
      }

      // Process keyword rules
      const keywordRules = enabledRules.filter(r => r.type === "keyword");
      for (const rule of keywordRules) {
        const { data } = await supabase
          .from("mentions")
          .select("id")
          .eq("org_id", currentOrg.id)
          .eq("mention_type", "brand")
          .not("status", "in", '("ignored","resolved")')
          .ilike("content", `%${rule.value}%`);

        const ids = (data || []).map(m => m.id);
        if (ids.length > 0) {
          for (let i = 0; i < ids.length; i += 500) {
            await supabase.from("mentions").update({ status: "ignored" }).in("id", ids.slice(i, i + 500));
          }
          updated += ids.length;
        }
      }

      toast({
        title: "Rules applied",
        description: `${updated} existing mentions marked as ignored based on your rules.`,
      });
    } catch (err: any) {
      toast({ title: "Error applying rules", description: err.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const enabledCount = rules.filter(r => r.enabled).length;
  const TypeIcon = RULE_TYPE_CONFIG[newType]?.icon || Filter;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Filter className="h-6 w-6 text-primary" /> Noise Filter Rules
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-ignore patterns applied when processing scan results. {enabledCount} active rule{enabledCount !== 1 ? "s" : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={applyRetroactively}
            disabled={applying || enabledCount === 0}
          >
            {applying ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5 mr-1.5" />}
            Apply to Existing
          </Button>
        </div>
      </div>

      <PageGuide
        title="How Noise Filters Work"
        subtitle="Rules automatically suppress low-value or irrelevant mentions"
        steps={[
          { icon: <Filter className="h-4 w-4 text-primary" />, title: "Create rules", description: "Block by domain, keyword, author, source platform, or follower count." },
          { icon: <RefreshCw className="h-4 w-4 text-primary" />, title: "Applied on ingest", description: "New mentions matching enabled rules are automatically marked ignored." },
          { icon: <EyeOff className="h-4 w-4 text-primary" />, title: "Apply to existing", description: "Click 'Apply to Existing' to retroactively ignore all current matching mentions." },
        ]}
        tip="Rules don't delete data — they mark mentions as 'ignored' so they don't clutter your dashboard or alerts."
      />

      {/* Add new rule */}
      <Card className="bg-card border-border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> Add Rule
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Rule type</Label>
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RULE_TYPE_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <div className="flex items-center gap-2">
                      <v.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {v.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Value</Label>
            <Input
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              placeholder={RULE_TYPE_CONFIG[newType]?.placeholder}
              onKeyDown={e => { if (e.key === "Enter") addRule(); }}
              className="bg-muted border-border"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{RULE_TYPE_CONFIG[newType]?.description}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Label (optional)</Label>
            <Input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Friendly name"
              className="bg-muted border-border"
            />
          </div>
        </div>
        <Button onClick={addRule} disabled={!newValue.trim() || saving} className="gap-2">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Rule
        </Button>
      </Card>

      {/* Presets */}
      <Card className="bg-card border-border p-5 space-y-3">
        <h3 className="text-sm font-semibold text-card-foreground">Suggested Presets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PRESET_RULES.map(preset => {
            const cfg = RULE_TYPE_CONFIG[preset.type];
            const alreadyAdded = rules.some(r => r.type === preset.type && r.value === preset.value);
            return (
              <div
                key={`${preset.type}-${preset.value}`}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border"
              >
                <div className="flex items-center gap-2">
                  <cfg.icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-card-foreground">{preset.label}</p>
                    <p className="text-[10px] text-muted-foreground">{cfg.label}: {preset.value}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={alreadyAdded ? "ghost" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => addPreset(preset)}
                  disabled={alreadyAdded || saving}
                >
                  {alreadyAdded ? <CheckCircle className="h-3 w-3 text-emerald-400" /> : <Plus className="h-3 w-3 mr-1" />}
                  {alreadyAdded ? "Added" : "Add"}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Active rules */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-card-foreground">Your Rules ({rules.length})</h3>

        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
        ) : rules.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <Filter className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No filter rules yet. Add one above or pick a preset.</p>
          </Card>
        ) : (
          rules.map(rule => {
            const cfg = RULE_TYPE_CONFIG[rule.type] || RULE_TYPE_CONFIG.keyword;
            const RuleIcon = cfg.icon;
            return (
              <Card
                key={rule.id}
                className={`bg-card border-border p-4 transition-opacity ${rule.enabled ? "" : "opacity-50"}`}
              >
                <div className="flex items-center gap-3">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => toggleRule(rule.id)}
                    className="flex-shrink-0"
                  />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <RuleIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {cfg.label}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">
                      {rule.label || rule.value}
                    </p>
                    {rule.label && (
                      <p className="text-[10px] text-muted-foreground font-mono">{rule.value}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {rule.enabled ? (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                        <CheckCircle className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Disabled</span>
                    )}
                    <button
                      onClick={() => removeRule(rule.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {enabledCount > 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 border border-border">
          <Info className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
          <p>
            <strong>{enabledCount} active rule{enabledCount !== 1 ? "s" : ""}</strong> will suppress matching mentions in future scans.
            Click <strong>Apply to Existing</strong> to also hide previously ingested matches.
          </p>
        </div>
      )}
    </div>
  );
}
