import { useState, useCallback } from "react";

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

function loadLayout(): DashboardWidget[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as DashboardWidget[];
      const savedMap = new Map(parsed.map(w => [w.id, w]));
      return DEFAULT_WIDGETS.map(dw => ({
        ...dw,
        visible: savedMap.get(dw.id)?.visible ?? dw.visible,
        order: savedMap.get(dw.id)?.order ?? dw.order,
      })).sort((a, b) => a.order - b.order);
    }
  } catch {}
  return DEFAULT_WIDGETS;
}

export function useDashboardLayout() {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(loadLayout);

  const persist = useCallback((updated: DashboardWidget[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const toggleWidget = useCallback((id: string) => {
    setWidgets(prev => {
      const updated = prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
      persist(updated);
      return updated;
    });
  }, [persist]);

  const reorderWidgets = useCallback((orderedIds: string[]) => {
    setWidgets(prev => {
      const map = new Map(prev.map(w => [w.id, w]));
      const reordered = orderedIds
        .map((id, i) => {
          const w = map.get(id);
          return w ? { ...w, order: i } : null;
        })
        .filter(Boolean) as DashboardWidget[];
      persist(reordered);
      return reordered;
    });
  }, [persist]);

  const resetLayout = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { widgets, toggleWidget, reorderWidgets, resetLayout };
}
