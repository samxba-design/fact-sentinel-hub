import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, AlertTriangle, Flame, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

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
  const [feed, setFeed] = useState<LiveMention[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load initial recent mentions
  useEffect(() => {
    if (!currentOrg) return;
    supabase
      .from("mentions")
      .select("id, content, source, severity, sentiment_label, posted_at, author_name, created_at")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setFeed(data || []));
  }, [currentOrg]);

  // Subscribe to realtime inserts
  useEffect(() => {
    if (!currentOrg) return;

    const channel = supabase
      .channel("live-mentions")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mentions",
          filter: `org_id=eq.${currentOrg.id}`,
        },
        (payload) => {
          const newMention = payload.new as LiveMention;
          setFeed((prev) => [newMention, ...prev].slice(0, 20));
          
          // Play alert sound for critical
          if (soundOn && newMention.severity === "critical") {
            try {
              // Simple beep using Web Audio API
              const ctx = new AudioContext();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 880;
              gain.gain.value = 0.3;
              osc.start();
              osc.stop(ctx.currentTime + 0.2);
            } catch {}
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOrg, soundOn]);

  if (feed.length === 0) return null;

  return (
    <Card className="bg-card border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <Radio className="h-4 w-4 text-sentinel-red animate-pulse" />
          Live Threat Feed
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setSoundOn(!soundOn)}
            title={soundOn ? "Mute alerts" : "Enable alert sounds"}
          >
            {soundOn ? (
              <Volume2 className="h-3.5 w-3.5 text-primary" />
            ) : (
              <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
          <Badge variant="outline" className="text-[10px] text-sentinel-emerald border-sentinel-emerald/30">
            Live
          </Badge>
        </div>
      </div>
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
                  <span className="capitalize">{m.source}</span>
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
    </Card>
  );
}
