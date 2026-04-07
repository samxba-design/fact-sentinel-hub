/**
 * useLiveNarratives — manages the "Live Narratives" feature toggle and filter config.
 *
 * Persisted in two layers:
 *  1. localStorage (instant, no round-trip) for dashboard render
 *  2. tracking_profiles.settings (sync to server for cross-device consistency)
 *
 * Why opt-out by default:
 *  - Supabase realtime uses a persistent WebSocket; every browser tab that has
 *    the dashboard open maintains one. At scale this consumes bandwidth + Supabase
 *    Realtime connection quota. Users should consciously enable it.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";

export type LiveNarrativeSentiment = "all" | "negative" | "negative-mixed" | "critical-only";
export type LiveNarrativeMinSeverity = "all" | "medium" | "high" | "critical";

export interface LiveNarrativeConfig {
  /** Master toggle — false = no realtime sub, no live queries */
  enabled: boolean;
  /** Which sentiments to surface */
  sentiment: LiveNarrativeSentiment;
  /** Minimum severity to show */
  minSeverity: LiveNarrativeMinSeverity;
  /** Source filter — empty array = all sources */
  sources: string[];
  /** Show narrative clustering panel */
  showNarratives: boolean;
  /** Show the live threat ticker */
  showLiveFeed: boolean;
}

const STORAGE_KEY = "sentiwatch_live_narratives_v1";

const DEFAULTS: LiveNarrativeConfig = {
  enabled: false,          // OFF by default — saves bandwidth
  sentiment: "all",
  minSeverity: "all",
  sources: [],
  showNarratives: true,
  showLiveFeed: true,
};

function loadLocal(): LiveNarrativeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* */ }
  return DEFAULTS;
}

export function useLiveNarratives() {
  const { currentOrg } = useOrg();
  const [config, setConfig] = useState<LiveNarrativeConfig>(loadLocal);
  const [saving, setSaving] = useState(false);

  // Load server-side config on org change (in case user is on a new device)
  useEffect(() => {
    if (!currentOrg) return;
    supabase
      .from("tracking_profiles")
      .select("settings")
      .eq("org_id", currentOrg.id)
      .maybeSingle()
      .then(({ data }) => {
        const serverCfg = (data?.settings as any)?.live_narratives;
        if (serverCfg) {
          const merged = { ...DEFAULTS, ...serverCfg };
          setConfig(merged);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
      });
  }, [currentOrg?.id]);

  const update = useCallback((patch: Partial<LiveNarrativeConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      // Persist locally immediately
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // Persist to server async (best-effort)
      if (currentOrg) {
        setSaving(true);
        supabase
          .from("tracking_profiles")
          .select("settings")
          .eq("org_id", currentOrg.id)
          .maybeSingle()
          .then(({ data }) => {
            const existingSettings = (data?.settings as Record<string, any>) || {};
            return supabase
              .from("tracking_profiles")
              .upsert({
                org_id: currentOrg.id,
                settings: { ...existingSettings, live_narratives: next },
              })
              .eq("org_id", currentOrg.id);
          })
          .finally(() => setSaving(false));
      }
      return next;
    });
  }, [currentOrg?.id]);

  const toggle = useCallback(() => {
    update({ enabled: !config.enabled });
  }, [config.enabled, update]);

  return { config, update, toggle, saving };
}

/** Returns a Supabase `.filter()` string (or null) based on LiveNarrativeConfig */
export function buildLiveFilter(config: LiveNarrativeConfig): {
  sentimentFilter: string[] | null;
  severityFilter: string[] | null;
} {
  let sentimentFilter: string[] | null = null;
  switch (config.sentiment) {
    case "negative":       sentimentFilter = ["negative"]; break;
    case "negative-mixed": sentimentFilter = ["negative", "mixed"]; break;
    case "critical-only":  sentimentFilter = ["negative"]; break; // combined with severity
    default:               sentimentFilter = null;
  }

  let severityFilter: string[] | null = null;
  switch (config.minSeverity) {
    case "medium":   severityFilter = ["medium", "high", "critical"]; break;
    case "high":     severityFilter = ["high", "critical"]; break;
    case "critical": severityFilter = ["critical"]; break;
    default:         severityFilter = null;
  }
  // critical-only sentiment overrides to high+critical severity
  if (config.sentiment === "critical-only") {
    severityFilter = ["high", "critical"];
  }

  return { sentimentFilter, severityFilter };
}
