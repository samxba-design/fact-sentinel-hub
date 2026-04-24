import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DashboardWidget {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: "narrative-now",            label: "Narrative Now (Brand Overview)",   visible: true,  order: 0 },
  { id: "metrics",                  label: "Key Metrics",                       visible: true,  order: 1 },
  { id: "sparklines",               label: "Sentiment Sparklines",              visible: true,  order: 2 },
  { id: "forecast",                 label: "Sentiment Forecast",                visible: true,  order: 3 },
  { id: "risk-sentiment",           label: "Risk Index & Sentiment",            visible: true,  order: 4 },
  { id: "timeline-volume",          label: "Activity & Volume",                 visible: true,  order: 5 },
  { id: "narrative-monitoring-feed",label: "Narratives, Monitoring & Feed",     visible: true,  order: 6 },
  { id: "active-threats",           label: "Active Threats",                    visible: true,  order: 7 },
  { id: "watchlist-threats",        label: "Top Tracked Threats",               visible: true,  order: 8 },
  { id: "competitor-feed",          label: "Competitor Activity Feed",          visible: false, order: 9 },
  { id: "sources",                  label: "Source Breakdown",                  visible: true,  order: 10 },
];

const STORAGE_KEY = "sentiwatch_dashboard_layout_v2"; // bumped version to clear old layout

function mergeWithDefaults(saved: DashboardWidget[]): DashboardWidget[] {
  const savedMap = new Map(saved.map(w => [w.id, w]));
  return DEFAULT_WIDGETS.map(dw => ({
    ...dw,
    visible: savedMap.get(dw.id)?.visible ?? dw.visible,
    order: savedMap.get(dw.id)?.order ?? dw.order,
  })).sort((a, b) => a.order - b.order);
}

function loadLayout(): DashboardWidget[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as DashboardWidget[];
      return mergeWithDefaults(parsed);
    }
  } catch {}
  return DEFAULT_WIDGETS;
}

export function useDashboardLayout(orgId?: string) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(loadLayout);
  const dbWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch from DB when orgId is available
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("tracking_profiles")
      .select("settings")
      .eq("org_id", orgId)
      .maybeSingle()
      .then(({ data }) => {
        const dbLayout = (data?.settings as any)?.dashboard_layout_v2;
        if (dbLayout && Array.isArray(dbLayout)) {
          setWidgets(mergeWithDefaults(dbLayout));
        }
      });
  }, [orgId]);

  const persistToDb = useCallback((updated: DashboardWidget[], currentOrgId: string) => {
    if (dbWriteTimer.current) clearTimeout(dbWriteTimer.current);
    dbWriteTimer.current = setTimeout(async () => {
      try {
        const { data: existing } = await supabase
          .from("tracking_profiles")
          .select("settings")
          .eq("org_id", currentOrgId)
          .maybeSingle();
        const existingSettings = (existing?.settings as Record<string, unknown>) || {};
        await supabase
          .from("tracking_profiles")
          .upsert(
            { org_id: currentOrgId, settings: { ...existingSettings, dashboard_layout_v2: updated } },
            { onConflict: "org_id" }
          );
      } catch {
        // silent — localStorage is the primary store
      }
    }, 800);
  }, []);

  const persist = useCallback((updated: DashboardWidget[], currentOrgId?: string) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (currentOrgId) persistToDb(updated, currentOrgId);
  }, [persistToDb]);

  const saveLayout = useCallback((updated: DashboardWidget[]) => {
    persist(updated, orgId);
  }, [persist, orgId]);

  const toggleWidget = useCallback((id: string) => {
    setWidgets(prev => {
      const updated = prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
      persist(updated, orgId);
      return updated;
    });
  }, [persist, orgId]);

  const reorderWidgets = useCallback((orderedIds: string[]) => {
    setWidgets(prev => {
      const map = new Map(prev.map(w => [w.id, w]));
      const reordered = orderedIds
        .map((id, i) => {
          const w = map.get(id);
          return w ? { ...w, order: i } : null;
        })
        .filter(Boolean) as DashboardWidget[];
      persist(reordered, orgId);
      return reordered;
    });
  }, [persist, orgId]);

  const resetLayout = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { widgets, toggleWidget, reorderWidgets, resetLayout, saveLayout };
}
