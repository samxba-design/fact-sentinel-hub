import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SourceBadge from "@/components/SourceBadge";
import { Radio, AlertTriangle, WifiOff, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import InfoTooltip from "@/components/InfoTooltip";
import { useLiveNarratives, buildLiveFilter } from "@/hooks/useLiveNarratives";

interface LiveMention {
  id: string;
  content: string | null;
  source: string;
  severity: string | null;
  sentiment_label: string | null;
  posted_at: string | null;
  author_name: string | null;
  created_at: string | null;
}

const severityGlow: Record<string, string> = {
  critical: "border-sentinel-red/40 sentinel-glow-red",
  high: "border-sentinel-amber/30 sentinel-glow-amber",
  medium: "border-border",
  low: "border-border",
};

const severityDot: Record<string, string> = {
  critical: "bg-sentinel-red",
  high: "bg-sentinel-amber",
  medium: "bg-primary",
  low: "bg-muted-foreground",
};

export default function LiveThreatFeed() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { config } = useLiveNarratives();
  const [feed, setFeed] = useState<LiveMention[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { sentimentFilter, severityFilter } = buildLiveFilter(config);

  const loadFeed = async () => {
    if (!currentOrg) return;
    setRefreshing(true);
    let q = supabase
      .from("mentions")
      .select("id, content, source, severity, sentiment_label, posted_at, author_name, created_at")
      .eq("org_id", currentOrg.id)
      .eq("mention_type", "brand")
      .order("created_at", { ascending: false })
      .limit(15);

    // Apply filters when live mode is on
    if (config.enabled) {
      if (sentimentFilter && sentimentFilter.length > 0) q = q.in("sentiment_label", sentimentFilter);
      if (severityFilter && severityFilter.length > 0) q = q.in("severity", severityFilter);
      if (config.sources.length > 0) q = q.in("source", config.sources);
    }

    const { data } = await q;
    setFeed((data as LiveMention[]) || []);
    setRefreshing(false);
  };

  // Load feed on mount and config change
  useEffect(() => { loadFeed(); }, [currentOrg, config.enabled, config.sentiment, config.minSeverity, JSON.stringify(config.sources)]);

  // Realtime subscription — only when enabled AND showLiveFeed is on
  useEffect(() => {
    if (!currentOrg || !config.enabled || !config.showLiveFeed) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const channel = supabase
      .channel(`live-threat-feed-${currentOrg.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "mentions",
        filter: `org_id=eq.${currentOrg.id}`,
      }, (payload) => {
        const newMention = payload.new as LiveMention;
        // Client-side filter matching
        if (sentimentFilter && !sentimentFilter.includes(newMention.sentiment_label || "")) return;
        if (severityFilter && !severityFilter.includes(newMention.severity || "")) return;
        if (config.sources.length > 0 && !config.sources.includes(newMention.source)) return;
        setFeed(prev => [newMention, ...prev].slice(0, 20));
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [currentOrg?.id, config.enabled, config.showLiveFeed, JSON.stringify(sentimentFilter), JSON.stringify(severityFilter), JSON.stringify(config.sources)]);

  return (
    <Card className="bg-card border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-card-foreground flex items-center gap-2">
          {config.enabled && config.showLiveFeed
            ? <Radio className="h-4 w-4 text-primary animate-pulse" />
            : <Radio className="h-4 w-4 text-muted-foreground" />
          }
          Recent Scan Detections
          {config.enabled && config.showLiveFeed && (
            <span className="text-[10px] text-emerald-500 bg-emerald-500/10 rounded-full px-1.5 py-0.5">Live</span>
          )}
          {!config.enabled && (
            <span className="text-[10px] text-muted-foreground bg-muted/50 rounded-full px-1.5 py-0.5 flex items-center gap-1">
              <WifiOff className="h-2.5 w-2.5" /> Static
            </span>
          )}
          <InfoTooltip text="Shows recent mentions from your scans. Enable Live Monitoring in Narrative Now to receive real-time updates as new mentions arrive." />
        </span>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={loadFeed} disabled={refreshing} title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {feed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No detections yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Run a scan to start monitoring mentions</p>
        </div>
      ) : (
      <div className="space-y-2 max-h-[320px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {feed.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-start gap-3 p-3 rounded-lg bg-muted/20 border cursor-pointer hover:bg-muted/40 transition-colors ${
                severityGlow[m.severity || "low"] || "border-border"
              }`}
              onClick={() => navigate(`/mentions/${m.id}`)}
            >
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${severityDot[m.severity || "low"]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-card-foreground line-clamp-2">{m.content || "No content"}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <SourceBadge source={m.source} className="text-[8px] py-0 px-1.5" />
                  <span>·</span>
                  <span>{m.author_name || "Unknown"}</span>
                  <span>·</span>
                  <span>{m.created_at ? formatDistanceToNow(new Date(m.created_at), { addSuffix: true }) : "—"}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant="outline" className={`text-[9px] capitalize ${
                  m.severity === "critical" ? "border-sentinel-red/30 text-sentinel-red" :
                  m.severity === "high" ? "border-sentinel-amber/30 text-sentinel-amber" :
                  ""
                }`}>
                  {m.severity || "low"}
                </Badge>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      )}
    </Card>
  );
}
