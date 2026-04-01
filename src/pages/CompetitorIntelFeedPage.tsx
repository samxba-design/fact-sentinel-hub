import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Newspaper, ExternalLink, Loader2, ChevronLeft, ChevronRight,
  TrendingUp, AlertTriangle, MessageCircle,
  Zap, TrendingDown,
} from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { useToast } from "@/hooks/use-toast";
import EmptyState from "@/components/EmptyState";
import { formatDistanceToNow } from "date-fns";

interface FeedItem {
  id: string;
  competitorName: string;
  content: string | null;
  source: string;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
  url: string | null;
  author_name: string | null;
}

interface CompetitorKeyword {
  id: string;
  value: string;
}

const COLORS = [
  "hsl(var(--sentinel-emerald))",
  "hsl(var(--sentinel-amber))",
  "hsl(0, 84%, 60%)", // destructive red
  "hsl(var(--primary))",
];

export default function CompetitorIntelFeedPage() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [competitors, setCompetitors] = useState<CompetitorKeyword[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 25;

  useEffect(() => {
    if (!currentOrg) return;
    loadCompetitors();
  }, [currentOrg]);

  useEffect(() => {
    if (!currentOrg || competitors.length === 0) return;
    loadFeed();
  }, [currentOrg, competitors, selectedCompetitor, sentimentFilter, page]);

  const loadCompetitors = async () => {
    if (!currentOrg) return;
    const { data } = await supabase
      .from("keywords")
      .select("id, value")
      .eq("org_id", currentOrg.id)
      .eq("type", "competitor");
    setCompetitors(data || []);
  };

  const loadFeed = async () => {
    if (!currentOrg || competitors.length === 0) return;
    setLoading(true);

    const keywords = selectedCompetitor
      ? [selectedCompetitor]
      : competitors.map(c => c.value);

    let query = supabase
      .from("mentions")
      .select("id, content, source, sentiment_label, severity, posted_at, url, author_name")
      .eq("org_id", currentOrg.id)
      .eq("mention_type", "competitor");

    // Filter by competitor keywords
    if (keywords.length > 0) {
      const orClauses = keywords.map(kw => `content.ilike.%${kw}%`).join(",");
      query = query.or(orClauses);
    }

    if (sentimentFilter) {
      query = query.eq("sentiment_label", sentimentFilter);
    }

    const { data, error } = await query
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

    if (error) {
      toast({ title: "Error loading feed", description: error.message, variant: "destructive" });
      setFeedItems([]);
    } else {
      // Enrich with competitor name matching
      const enriched = (data || []).map(m => {
        const matchedCompetitor = competitors.find(c =>
          m.content?.toLowerCase().includes(c.value.toLowerCase())
        );
        return {
          ...m,
          competitorName: matchedCompetitor?.value || "Unknown",
        } as FeedItem;
      });
      setFeedItems(enriched);
    }
    setLoading(false);
  };

  const runAllScans = async () => {
    if (!currentOrg || competitors.length === 0) return;
    setScanning(true);
    let totalCreated = 0;

    for (const comp of competitors) {
      try {
        const { data } = await supabase.functions.invoke("run-scan", {
          body: {
            org_id: currentOrg.id,
            keywords: [comp.value],
            sources: ["news", "google-news", "reddit"],
          },
        });
        totalCreated += data?.mentions_created || 0;
      } catch (err) {
        console.error(`Scan failed for ${comp.value}:`, err);
      }
    }

    toast({
      title: "All scans complete",
      description: `Found ${totalCreated} new mentions across all competitors`,
    });
    loadFeed();
    setScanning(false);
  };

  const sentimentColor = (label: string | null) => {
    if (label === "positive") return "bg-[hsl(var(--sentinel-emerald))]/10 text-[hsl(var(--sentinel-emerald))]";
    if (label === "negative") return "bg-destructive/10 text-destructive";
    return "bg-muted/30 text-muted-foreground";
  };

  const severityColor = (s: string | null) => {
    if (s === "critical") return "bg-destructive/10 text-destructive";
    if (s === "high") return "bg-destructive/10 text-destructive";
    if (s === "medium") return "bg-[hsl(var(--sentinel-amber))]/10 text-[hsl(var(--sentinel-amber))]";
    return "bg-muted/30 text-muted-foreground";
  };

  const getCompetitorColor = (compName: string) => {
    const index = competitors.findIndex(c => c.value === compName);
    return COLORS[index % COLORS.length];
  };

  if (loading && feedItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground animate-pulse">
        Loading intelligence feed...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageGuide
        title="Competitive Intelligence Feed"
        subtitle="Chronological feed of all competitor mentions — completely separate from your brand data."
        steps={[
          { icon: <Newspaper className="h-4 w-4 text-primary" />, title: "Filter by competitor", description: "Click the colored competitor pills to filter to one competitor. Or view all together." },
          { icon: <Zap className="h-4 w-4 text-primary" />, title: "Scan all competitors", description: "The 'Scan All' button runs a fresh scan for every tracked competitor in sequence." },
          { icon: <TrendingDown className="h-4 w-4 text-primary" />, title: "Sentiment badges", description: "Each mention shows sentiment and severity — quickly spot negative coverage about competitors." },
        ]}
        tip="Competitor mentions are stored separately and never mix with your brand health metrics."
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-primary" /> Competitive Intelligence Feed
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time mentions of all competitors</p>
        </div>
        <Button onClick={runAllScans} disabled={scanning || competitors.length === 0}>
          {scanning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...
            </>
          ) : (
            <>
              <TrendingUp className="h-4 w-4 mr-2" /> Run All Scans
            </>
          )}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Competitor</p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={selectedCompetitor === null ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => { setSelectedCompetitor(null); setPage(0); }}
                >
                  All Competitors
                </Badge>
                {competitors.map(c => (
                  <Badge
                    key={c.id}
                    variant={selectedCompetitor === c.value ? "default" : "outline"}
                    className="cursor-pointer"
                    style={selectedCompetitor === c.value ? { backgroundColor: getCompetitorColor(c.value) } : {}}
                    onClick={() => { setSelectedCompetitor(c.value); setPage(0); }}
                  >
                    {c.value}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sentiment</p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={sentimentFilter === null ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => { setSentimentFilter(null); setPage(0); }}
                >
                  All
                </Badge>
                <Badge
                  variant={sentimentFilter === "positive" ? "default" : "outline"}
                  className={`cursor-pointer ${sentimentFilter === "positive" ? "bg-[hsl(var(--sentinel-emerald))]" : ""}`}
                  onClick={() => { setSentimentFilter("positive"); setPage(0); }}
                >
                  Positive
                </Badge>
                <Badge
                  variant={sentimentFilter === "neutral" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => { setSentimentFilter("neutral"); setPage(0); }}
                >
                  Neutral
                </Badge>
                <Badge
                  variant={sentimentFilter === "negative" ? "default" : "outline"}
                  className={`cursor-pointer ${sentimentFilter === "negative" ? "bg-destructive" : ""}`}
                  onClick={() => { setSentimentFilter("negative"); setPage(0); }}
                >
                  Negative
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feed Items */}
      {competitors.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="No competitors tracked yet"
          description="Add competitors on the Competitor Analysis page and run a scan to see their mentions here."
        />
      ) : feedItems.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No competitor mentions yet"
          description={
            selectedCompetitor
              ? `No mentions found for "${selectedCompetitor}". Run a scan to discover competitor activity.`
              : "No mentions found. Run a scan to discover competitor activity."
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {feedItems.map(item => (
              <Card key={item.id} className="hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    {/* Left: Competitor Badge */}
                    <Badge
                      className="text-xs px-2 py-1 text-white shrink-0 mt-0.5"
                      style={{ backgroundColor: getCompetitorColor(item.competitorName) }}
                    >
                      {item.competitorName}
                    </Badge>

                    {/* Middle: Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-3 mb-2">{item.content}</p>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{item.source}</Badge>
                        {item.author_name && <span>{item.author_name}</span>}
                        {item.posted_at && (
                          <span>
                            {formatDistanceToNow(new Date(item.posted_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Badges + Link */}
                    <div className="flex items-center gap-2 shrink-0">
                      {item.sentiment_label && (
                        <Badge className={`text-[10px] ${sentimentColor(item.sentiment_label)}`}>
                          {item.sentiment_label}
                        </Badge>
                      )}
                      {item.severity && (
                        <Badge className={`text-[10px] ${severityColor(item.severity)}`}>
                          {item.severity}
                        </Badge>
                      )}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-4 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={feedItems.length < ITEMS_PER_PAGE}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
