import { useMemo } from "react";

interface ClusterableMention {
  id: string;
  content: string | null;
  source: string;
  severity: string | null;
  sentiment_label: string | null;
  posted_at: string | null;
  created_at: string | null;
  url: string | null;
  author_name: string | null;
}

export interface MentionCluster {
  id: string;
  representativeId: string;
  representativeContent: string;
  mentionIds: string[];
  sources: string[];
  severities: string[];
  sentiments: string[];
  count: number;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getShingles(text: string, size = 3): Set<string> {
  const words = text.split(" ").filter(w => w.length > 2);
  const shingles = new Set<string>();
  for (let i = 0; i <= words.length - size; i++) {
    shingles.add(words.slice(i, i + size).join(" "));
  }
  return shingles;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

export function useMentionClusters(
  mentions: ClusterableMention[],
  enabled: boolean,
  threshold = 0.4
): { clusters: MentionCluster[]; ungroupedIds: Set<string> } {
  return useMemo(() => {
    if (!enabled || mentions.length === 0) {
      return { clusters: [], ungroupedIds: new Set(mentions.map(m => m.id)) };
    }

    // Build shingles for each mention
    const mentionShingles = mentions.map(m => ({
      mention: m,
      normalized: normalizeText(m.content || ""),
      shingles: getShingles(normalizeText(m.content || "")),
    })).filter(ms => ms.normalized.length > 20);

    const clustered = new Set<string>();
    const clusters: MentionCluster[] = [];

    for (let i = 0; i < mentionShingles.length; i++) {
      if (clustered.has(mentionShingles[i].mention.id)) continue;

      const clusterMembers = [mentionShingles[i]];
      clustered.add(mentionShingles[i].mention.id);

      for (let j = i + 1; j < mentionShingles.length; j++) {
        if (clustered.has(mentionShingles[j].mention.id)) continue;
        const sim = jaccardSimilarity(mentionShingles[i].shingles, mentionShingles[j].shingles);
        if (sim >= threshold) {
          clusterMembers.push(mentionShingles[j]);
          clustered.add(mentionShingles[j].mention.id);
        }
      }

      if (clusterMembers.length >= 2) {
        const rep = clusterMembers[0].mention;
        clusters.push({
          id: `cluster-${rep.id}`,
          representativeId: rep.id,
          representativeContent: rep.content || "No content",
          mentionIds: clusterMembers.map(cm => cm.mention.id),
          sources: [...new Set(clusterMembers.map(cm => cm.mention.source))],
          severities: [...new Set(clusterMembers.map(cm => cm.mention.severity || "low"))],
          sentiments: [...new Set(clusterMembers.map(cm => cm.mention.sentiment_label || "neutral"))],
          count: clusterMembers.length,
        });
      }
    }

    const ungroupedIds = new Set(
      mentions.filter(m => !clustered.has(m.id)).map(m => m.id)
    );

    return { clusters: clusters.sort((a, b) => b.count - a.count), ungroupedIds };
  }, [mentions, enabled, threshold]);
}
