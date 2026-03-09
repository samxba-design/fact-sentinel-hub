import { useState, useCallback } from "react";

export interface DashboardWidget {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: "metrics", label: "Key Metrics", visible: true, order: 0 },
  { id: "sparklines", label: "Sentiment Sparklines", visible: true, order: 1 },
  { id: "forecast", label: "Sentiment Forecast", visible: true, order: 2 },
  { id: "risk-sentiment", label: "Risk Index & Sentiment", visible: true, order: 3 },
  { id: "timeline-volume", label: "Activity & Volume", visible: true, order: 4 },
  { id: "narrative-monitoring-feed", label: "Narratives, Monitoring & Feed", visible: true, order: 5 },
  { id: "watchlist-threats", label: "Top Tracked Threats", visible: true, order: 6 },
  { id: "sources", label: "Source Breakdown", visible: true, order: 7 },
];

const STORAGE_KEY = "sentiwatch_dashboard_layout";

function loadLayout(): DashboardWidget[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as DashboardWidget[];
      // Merge with defaults to handle new widgets added in code
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

  const moveWidget = useCallback((id: string, direction: "up" | "down") => {
    setWidgets(prev => {
      const idx = prev.findIndex(w => w.id === id);
      if (idx < 0) return prev;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const updated = [...prev];
      [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
      const reordered = updated.map((w, i) => ({ ...w, order: i }));
      persist(reordered);
      return reordered;
    });
  }, [persist]);

  const resetLayout = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { widgets, toggleWidget, moveWidget, resetLayout };
}
