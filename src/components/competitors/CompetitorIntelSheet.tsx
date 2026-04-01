import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scan, Loader2, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useToast } from "@/hooks/use-toast";

interface Competitor {
  id: string;
  name: string;
}

interface Props {
  competitor: Competitor | null;
  orgId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface MentionRow {
  id: string;
  content: string | null;
  source: string;
  sentiment_label: string | null;
  posted_at: string | null;
  url: string | null;
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by","from",
  "is","are","was","were","be","been","this","that","these","those","it","its","as",
  "i","we","you","he","she","they","their","our","your","his","her","not","no","has",
  "have","had","will","would","could","should","may","might","can","said","says","new",
  "also","more","than","just","about","over","up","out","into","after","before","during","between",
]);

const SENTIMENT_COLORS = {
  positive: "#22c55e",
  neutral: "#94a3b8",
  negative: "#ef4444",
};

function extractTopics(mentions: MentionRow[], topN = 8): string[] {
  const freq: Record<string, number> = {};
  for (const m of mentions) {
    if (!m.content) continue;
    const tokens = m.content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3 && !STOPWORDS.has(t));
    for (const t of tokens) {
      freq[t] = (freq[t] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
}

function sentimentBadgeClass(label: string | null) {
  if (label === "positive") return "bg-[hsl(var(--sentinel-emerald))]/10 text-[hsl(var(--sentinel-emerald))]";
  if (label === "negative") return "bg-destructive/10 text-destructive";
  return "bg-muted/30 text-muted-foreground";
}

export default function CompetitorIntelSheet({ competitor, orgId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [mentions, setMentions] = useState<MentionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open || !competitor || !orgId) return;
    fetchMentions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, competitor?.id, orgId]);

  const fetchMentions = async () => {
    if (!competitor || !orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("mentions")
      .select("id, content, source, sentiment_label, posted_at, url")
      .eq("org_id", orgId)
      .ilike("content", `%${competitor.name}%`)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(20);

    if (error) {
      toast({ title: "Error loading mentions", description: error.message, variant: "destructive" });
    } else {
      setMentions(data || []);
    }
    setLoading(false);
  };

  const runScan = async () => {
    if (!competitor || !orgId) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-scan", {
        body: {
          org_id: orgId,
          keywords: [competitor.name],
          sources: ["news", "google-news", "reddit"],
        },
      });
      if (error) throw error;
      toast({
        title: "Scan complete",
        description: `Found ${data?.mentions_created || 0} new mentions for "${competitor.name}"`,
      });
      fetchMentions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Scan failed", description: msg, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const posCount = mentions.filter((m) => m.sentiment_label === "positive").length;
  const negCount = mentions.filter((m) => m.sentiment_label === "negative").length;
  const neuCount = mentions.length - posCount - negCount;

  const donutData = [
    { name: "Positive", value: posCount, color: SENTIMENT_COLORS.positive },
    { name: "Neutral", value: neuCount, color: SENTIMENT_COLORS.neutral },
    { name: "Negative", value: negCount, color: SENTIMENT_COLORS.negative },
  ].filter((d) => d.value > 0);

  const topics = extractTopics(mentions);
  const recentMentions = mentions.slice(0, 5);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] overflow-y-auto">
        <SheetHeader className="flex flex-row items-center justify-between pr-6">
          <SheetTitle>{competitor?.name ?? ""} Intelligence</SheetTitle>
          <Button size="sm" variant="outline" onClick={runScan} disabled={scanning || !competitor}>
            {scanning ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Scan className="h-3.5 w-3.5 mr-1.5" />
            )}
            {scanning ? "Scanning…" : "Scan"}
          </Button>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground animate-pulse text-sm">
            Loading intelligence…
          </div>
        ) : mentions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <p className="text-sm text-muted-foreground">
              No mentions found. Run a scan to discover competitor activity.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Sentiment Summary */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Sentiment Summary
              </h3>
              <div className="flex items-center gap-4">
                <div style={{ width: 120, height: 120 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={52}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {donutData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2">
                  <Badge className="bg-[hsl(var(--sentinel-emerald))]/10 text-[hsl(var(--sentinel-emerald))] w-fit">
                    Positive {posCount}
                  </Badge>
                  <Badge className="bg-muted/30 text-muted-foreground w-fit">
                    Neutral {neuCount}
                  </Badge>
                  <Badge className="bg-destructive/10 text-destructive w-fit">
                    Negative {negCount}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Top 5 Recent Mentions */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Recent Mentions
              </h3>
              <div className="space-y-3">
                {recentMentions.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg border border-border bg-muted/10 space-y-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {m.source}
                      </Badge>
                      <Badge className={`text-[10px] ${sentimentBadgeClass(m.sentiment_label)}`}>
                        {m.sentiment_label ?? "unknown"}
                      </Badge>
                      {m.url && (
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="ml-auto"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-foreground line-clamp-2">{m.content}</p>
                    {m.posted_at && (
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(m.posted_at), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Key Topics */}
            {topics.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Key Topics
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="text-[10px] rounded-full capitalize"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
