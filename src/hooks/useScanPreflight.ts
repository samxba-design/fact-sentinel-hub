import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";

export interface PreflightIssue {
  level: "error" | "warning";
  message: string;
  action?: { label: string; href: string };
}

export interface PreflightResult {
  canRun: boolean;
  issues: PreflightIssue[];
  connectedProviders: string[];
  keywordCount: number;
}

export function useScanPreflight(selectedSources: string[]) {
  const { currentOrg } = useOrg();
  const [result, setResult] = useState<PreflightResult>({
    canRun: true,
    issues: [],
    connectedProviders: [],
    keywordCount: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    setLoading(true);

    const SOURCES_NEED_KEYS = ["twitter", "youtube", "reddit"];

    Promise.all([
      supabase.from("keywords").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("status", "active"),
      supabase.from("org_api_keys").select("provider").eq("org_id", currentOrg.id),
    ]).then(([kwRes, keysRes]) => {
      if (cancelled) return;

      const keywordCount = kwRes.count ?? 0;
      const connectedProviders = [...new Set((keysRes.data || []).map((k: any) => k.provider))];
      const issues: PreflightIssue[] = [];

      // Error: no keywords at all
      if (keywordCount === 0) {
        issues.push({
          level: "error",
          message: "No keywords configured. Scans won't know what to look for.",
          action: { label: "Add Keywords", href: "/settings?tab=keywords" },
        });
      }

      // Warning: sources selected that need keys but aren't connected
      for (const source of selectedSources) {
        if (SOURCES_NEED_KEYS.includes(source) && !connectedProviders.includes(source)) {
          const label = source === "twitter" ? "X (Twitter)" : source === "youtube" ? "YouTube" : "Reddit";
          issues.push({
            level: "warning",
            message: `${label} selected but not connected — it will be skipped or fall back to web search.`,
            action: { label: "Connect", href: "/settings?tab=connections" },
          });
        }
      }

      // Warning: very few keywords
      if (keywordCount > 0 && keywordCount < 2) {
        issues.push({
          level: "warning",
          message: "Only 1 keyword configured. More keywords mean better coverage.",
          action: { label: "Add Keywords", href: "/settings?tab=keywords" },
        });
      }

      setResult({
        canRun: !issues.some(i => i.level === "error"),
        issues,
        connectedProviders,
        keywordCount,
      });
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [currentOrg, selectedSources.join(",")]);

  return { preflight: result, preflightLoading: loading };
}
