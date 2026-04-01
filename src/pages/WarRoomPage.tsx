import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Radio, Siren, MessageSquareWarning, TrendingDown, Shield,
  Users, Clock, ExternalLink, Send, Wifi, WifiOff, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { format, formatDistanceToNow } from "date-fns";
import InfoTooltip from "@/components/InfoTooltip";
import PageGuide from "@/components/PageGuide";

interface LiveMention {
  id: string;
  content: string | null;
  source: string;
  severity: string | null;
  sentiment_label: string | null;
  author_name: string | null;
  created_at: string | null;
}

interface ActiveIncident {
  id: string;
  name: string;
  status: string | null;
  started_at: string | null;
}

interface TeamMember {
  user_id: string;
  email: string | null;
  full_name: string | null;
  lastSeen: number;
}

const severityColors: Record<string, string> = {
  critical: "border-sentinel-red/40 bg-sentinel-red/5",
  high: "border-sentinel-amber/40 bg-sentinel-amber/5",
  medium: "border-border",
  low: "border-border",
};

const sentimentDots: Record<string, string> = {
  negative: "bg-sentinel-red",
  positive: "bg-sentinel-emerald",
  neutral: "bg-muted-foreground",
  mixed: "bg-sentinel-amber",
};

export default function WarRoomPage() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [liveMentions, setLiveMentions] = useState<LiveMention[]>([]);
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState({ total24h: 0, negative24h: 0, critical24h: 0 });
  const mentionFeedRef = useRef<HTMLDivElement>(null);

  // Initial data load
  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    const since24h = new Date(Date.now() - 86400000).toISOString();

    Promise.all([
      supabase.from("mentions").select("id, content, source, severity, sentiment_label, author_name, created_at")
        .eq("org_id", currentOrg.id)
        .eq("mention_type", "brand")
        .gte("created_at", since24h)
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("incidents").select("id, name, status, started_at")
        .eq("org_id", currentOrg.id).eq("status", "active"),
      supabase.from("mentions").select("id", { count: "exact", head: true })
        .eq("org_id", currentOrg.id)
        .gte("created_at", since24h),
      supabase.from("mentions").select("id", { count: "exact", head: true })
        .eq("org_id", currentOrg.id)
        .eq("sentiment_label", "negative").gte("created_at", since24h),
      supabase.from("mentions").select("id", { count: "exact", head: true })
        .eq("org_id", currentOrg.id)
        .eq("severity", "critical").gte("created_at", since24h),
      supabase.from("org_memberships").select("user_id, invited_email")
        .eq("org_id", currentOrg.id).not("accepted_at", "is", null),
    ]).then(([mentionsRes, incRes, totalRes, negRes, critRes, membersRes]) => {
      setLiveMentions((mentionsRes.data as LiveMention[]) || []);
      setIncidents((incRes.data as ActiveIncident[]) || []);
      setStats({
        total24h: totalRes.count || 0,
        negative24h: negRes.count || 0,
        critical24h: critRes.count || 0,
      });
      setTeamMembers(
        (membersRes.data || []).map((m: any) => ({
          user_id: m.user_id,
          email: m.invited_email,
          full_name: null,
          lastSeen: m.user_id === user?.id ? Date.now() : Date.now() - 300000,
        }))
      );
      setLoading(false);
    });
  }, [currentOrg, user]);

  // Realtime subscription
  useEffect(() => {
    if (!currentOrg) return;

    const channel = supabase
      .channel(`warroom-${currentOrg.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mentions", filter: `org_id=eq.${currentOrg.id}` },
        (payload) => {
          const newMention = payload.new as LiveMention;
          setLiveMentions(prev => [newMention, ...prev].slice(0, 100));
          setStats(prev => ({
            total24h: prev.total24h + 1,
            negative24h: prev.negative24h + ((newMention.sentiment_label === "negative") ? 1 : 0),
            critical24h: prev.critical24h + ((newMention.severity === "critical") ? 1 : 0),
          }));
          // Auto-scroll
          if (mentionFeedRef.current) {
            mentionFeedRef.current.scrollTop = 0;
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents", filter: `org_id=eq.${currentOrg.id}` },
        () => {
          supabase.from("incidents").select("id, name, status, started_at")
            .eq("org_id", currentOrg.id).eq("status", "active")
            .then(({ data }) => setIncidents((data as ActiveIncident[]) || []));
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, [currentOrg]);

  const negPct = stats.total24h > 0 ? Math.round((stats.negative24h / stats.total24h) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-up">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageGuide
        title="War Room — Crisis coordination"
        subtitle="Real-time space for your team to coordinate during active incidents."
        steps={[
          { icon: <Radio className="h-4 w-4 text-primary" />, title: "Live feed", description: "Messages visible to all team members. Share intel, assign tasks, track decisions in real time." },
          { icon: <Siren className="h-4 w-4 text-primary" />, title: "Link an incident", description: "Attach the session to an active incident to consolidate all context in one place." },
          { icon: <Shield className="h-4 w-4 text-primary" />, title: "Situation panel", description: "Left panel shows live brand mentions and active incidents updating automatically." },
        ]}
        tip="Create an Incident record first, then activate the War Room for coordinated team response."
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sentinel-red/10">
            <Radio className="h-5 w-5 text-sentinel-red animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">War Room</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              Live incident command center
              <span className={`flex items-center gap-1 text-[10px] ${connected ? "text-sentinel-emerald" : "text-sentinel-red"}`}>
                {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {connected ? "Connected" : "Reconnecting..."}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs gap-1.5">
            <Users className="h-3 w-3" />
            {teamMembers.filter(m => Date.now() - m.lastSeen < 600000).length} online
          </Badge>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border p-4 space-y-1">
          <span className="text-xs text-muted-foreground">24h Mentions</span>
          <span className="text-xl font-bold text-card-foreground">{stats.total24h}</span>
        </Card>
        <Card className="bg-card border-border p-4 space-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-sentinel-red" /> Negative
          </span>
          <span className="text-xl font-bold text-sentinel-red">{stats.negative24h} <span className="text-sm text-muted-foreground font-normal">({negPct}%)</span></span>
        </Card>
        <Card className={`bg-card border-border p-4 space-y-1 ${stats.critical24h > 0 ? "sentinel-pulse-red border-sentinel-red/30" : ""}`}>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-sentinel-amber" /> Critical
          </span>
          <span className="text-xl font-bold text-sentinel-amber">{stats.critical24h}</span>
        </Card>
        <Card className="bg-card border-border p-4 space-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Siren className="h-3 w-3" /> Active Incidents
          </span>
          <span className="text-xl font-bold text-card-foreground">{incidents.length}</span>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Live Mention Feed */}
        <div className="lg:col-span-2">
          <Card className="bg-card border-border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4 text-primary" />
                Live Mention Stream
                <InfoTooltip text="Real-time feed of incoming mentions. New mentions appear automatically at the top." />
              </h3>
              <Badge variant="secondary" className="text-[10px]">{liveMentions.length} recent</Badge>
            </div>

            <div ref={mentionFeedRef} className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {liveMentions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No mentions in the last 24 hours</p>
              ) : (
                liveMentions.map(m => (
                  <div
                    key={m.id}
                    className={`p-3 rounded-lg border cursor-pointer hover:border-primary/30 transition-all ${severityColors[m.severity || "low"]}`}
                    onClick={() => navigate(`/mentions/${m.id}`)}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${sentimentDots[m.sentiment_label || "neutral"]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-card-foreground line-clamp-2">{m.content?.slice(0, 150) || "No content"}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className="text-[8px]">{m.source}</Badge>
                          {m.author_name && <span className="text-[10px] text-muted-foreground">{m.author_name}</span>}
                          {m.severity === "critical" && (
                            <Badge variant="outline" className="text-[8px] border-sentinel-red/30 text-sentinel-red">CRITICAL</Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {m.created_at ? formatDistanceToNow(new Date(m.created_at), { addSuffix: true }) : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Active Incidents */}
          <Card className="bg-card border-border p-5 space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Siren className="h-3 w-3" /> Active Incidents
            </h3>
            {incidents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active incidents</p>
            ) : (
              incidents.map(inc => (
                <div
                  key={inc.id}
                  className="p-3 rounded-lg border border-sentinel-red/20 bg-sentinel-red/5 cursor-pointer hover:border-sentinel-red/40 transition-colors"
                  onClick={() => navigate(`/incidents/${inc.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-card-foreground">{inc.name}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-2.5 w-2.5" />
                    {inc.started_at ? `Started ${formatDistanceToNow(new Date(inc.started_at), { addSuffix: true })}` : "Just started"}
                  </span>
                </div>
              ))
            )}
          </Card>

          {/* Team Presence */}
          <Card className="bg-card border-border p-5 space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Team ({teamMembers.length})
            </h3>
            <div className="space-y-2">
              {teamMembers.slice(0, 10).map(m => {
                const isOnline = Date.now() - m.lastSeen < 600000;
                const isYou = m.user_id === user?.id;
                return (
                  <div key={m.user_id} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-sentinel-emerald" : "bg-muted-foreground/30"}`} />
                    <span className="text-xs text-card-foreground truncate">
                      {m.full_name || m.email || "Team member"}
                      {isYou && <span className="text-muted-foreground ml-1">(you)</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Quick Stats */}
          <Card className="bg-card border-border p-5 space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="h-3 w-3" /> Threat Level
            </h3>
            <div className="space-y-2">
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full sentinel-gradient-risk transition-all duration-1000"
                  style={{ width: `${Math.min(100, negPct * 2 + stats.critical24h * 10)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Low</span>
                <span className="font-medium text-card-foreground">
                  {negPct > 40 || stats.critical24h > 3 ? "CRITICAL" : negPct > 20 ? "ELEVATED" : "NORMAL"}
                </span>
                <span>Critical</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
