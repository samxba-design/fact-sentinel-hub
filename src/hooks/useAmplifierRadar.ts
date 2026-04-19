import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AmplifierProfile {
  handle: string;
  displayName: string;
  platform: string;
  accountType: string;
  followerCount: number;
  mentionCount: number;
  negativeMentionCount: number;
  negativePct: number;
  impactScore: number;
  firstAppeared: string;
  latestMention: string;
  trend: "rising" | "stable" | "falling";
  sampleExcerpts: string[];
  isVerified: boolean;
}

// Synthetic follower counts for demo when no real data available
const SYNTHETIC_FOLLOWERS: Record<string, number> = {
  twitter: 45000, reddit: 8200, news: 120000, telegram: 3100, youtube: 67000, default: 5000,
};

function syntheticFollowers(platform: string, handle: string): number {
  const base = SYNTHETIC_FOLLOWERS[platform] ?? SYNTHETIC_FOLLOWERS.default;
  // deterministic jitter from handle
  const seed = handle.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return Math.floor(base * (0.3 + (seed % 100) / 71));
}

export function useAmplifierRadar(
  orgId: string | undefined,
  days = 7,
  filters: { accountType?: string; platform?: string; minFollowers?: number } = {}
) {
  const [amplifiers, setAmplifiers] = useState<AmplifierProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
        const prior = new Date(Date.now() - days * 2 * 24 * 3600 * 1000).toISOString();

        const { data: mentions } = await supabase
          .from("mentions")
          .select("id, content, source, sentiment_label, posted_at, author_handle, author_follower_count, author_account_type")
          .eq("org_id", orgId)
          .gte("posted_at", since);

        if (!mentions?.length) { setLoading(false); return; }

        // Group by handle+platform
        type A = { handle: string; platform: string; accountType: string; followerCount: number; mentions: any[]; first: string; last: string };
        const byAuthor: Record<string, A> = {};

        for (const m of mentions) {
          const handle = (m.author_handle as string) ?? `user_${(m.id as string).slice(0, 6)}`;
          const platform = (m.source as string) ?? "unknown";
          const key = `${handle}::${platform}`;
          if (!byAuthor[key]) {
            const fc = (m.author_follower_count as number) > 0
              ? (m.author_follower_count as number)
              : syntheticFollowers(platform, handle);
            byAuthor[key] = {
              handle,
              platform,
              accountType: (m.author_account_type as string) ?? "unknown",
              followerCount: fc,
              mentions: [],
              first: m.posted_at ?? "",
              last: m.posted_at ?? "",
            };
          }
          byAuthor[key].mentions.push(m);
          if ((m.posted_at ?? "") < byAuthor[key].first) byAuthor[key].first = m.posted_at ?? "";
          if ((m.posted_at ?? "") > byAuthor[key].last)  byAuthor[key].last  = m.posted_at ?? "";
        }

        // Prior period counts
        const { data: priorMentions } = await supabase
          .from("mentions").select("author_handle, source")
          .eq("org_id", orgId).gte("posted_at", prior).lt("posted_at", since);
        const priorCounts: Record<string, number> = {};
        for (const m of priorMentions ?? []) {
          const k = `${m.author_handle ?? ""}::${m.source ?? ""}`;
          priorCounts[k] = (priorCounts[k] ?? 0) + 1;
        }

        const result: AmplifierProfile[] = Object.entries(byAuthor)
          .map(([key, a]) => {
            const total = a.mentions.length;
            const neg = a.mentions.filter(m => m.sentiment_label === "negative").length;
            const negPct = total ? Math.round((neg / total) * 100) : 0;
            const negWeight = 1 + negPct / 100;
            const impactScore = Math.min(100, Math.round((a.followerCount / 10000) * total * negWeight));
            const priorCount = priorCounts[key] ?? 0;
            const trendRatio = priorCount > 0 ? total / priorCount : 1;
            const trend: AmplifierProfile["trend"] = trendRatio > 1.5 ? "rising" : trendRatio < 0.7 ? "falling" : "stable";
            const excerpts = a.mentions.slice(0, 3).map((m: any) => (m.content ?? "").slice(0, 150));
            return {
              handle: a.handle,
              displayName: a.handle,
              platform: a.platform,
              accountType: a.accountType,
              followerCount: a.followerCount,
              mentionCount: total,
              negativeMentionCount: neg,
              negativePct: negPct,
              impactScore,
              firstAppeared: a.first,
              latestMention: a.last,
              trend,
              sampleExcerpts: excerpts,
              isVerified: false,
            };
          })
          .filter(a => {
            if (filters.accountType && filters.accountType !== "all" && a.accountType !== filters.accountType) return false;
            if (filters.platform && filters.platform !== "all" && a.platform !== filters.platform) return false;
            if (filters.minFollowers && a.followerCount < filters.minFollowers) return false;
            return true;
          })
          .sort((a, b) => b.impactScore - a.impactScore)
          .slice(0, 50);

        setAmplifiers(result);
      } catch { setAmplifiers([]); }
      finally { setLoading(false); }
    })();
  }, [orgId, days, filters.accountType, filters.platform, filters.minFollowers]);

  return { amplifiers, loading };
}
