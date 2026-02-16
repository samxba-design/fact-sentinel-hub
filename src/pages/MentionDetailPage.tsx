import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Breadcrumbs from "@/components/Breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, ExternalLink, Shield, AlertTriangle, Bot, Flame, Flag,
  MessageCircleReply, TicketCheck, Siren, User, Globe, BarChart3,
  ThumbsUp, ThumbsDown, Minus, Hash, EyeOff, Clock, CheckCircle2, MoreVertical,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface MentionDetail {
  id: string;
  source: string;
  content: string | null;
  author_name: string | null;
  author_handle: string | null;
  author_verified: boolean | null;
  author_follower_count: number | null;
  sentiment_label: string | null;
  sentiment_score: number | null;
  sentiment_confidence: number | null;
  severity: string | null;
  language: string | null;
  posted_at: string | null;
  created_at: string | null;
  url: string | null;
  status: string | null;
  flags: any;
  metrics: any;
  scan_run_id: string | null;
}

interface ClaimExtraction {
  id: string;
  claim_text: string;
  category: string | null;
  confidence: number | null;
}

interface TopicLink {
  topic_id: string;
  topics: { name: string } | null;
}

interface NarrativeLink {
  narrative_id: string;
  narratives: { name: string; status: string | null } | null;
}

const severityColors: Record<string, string> = {
  low: "border-sentinel-emerald/30 text-sentinel-emerald bg-sentinel-emerald/5",
  medium: "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5",
  high: "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5",
  critical: "border-sentinel-red/50 text-sentinel-red bg-sentinel-red/10",
};

const sentimentIcons: Record<string, any> = {
  positive: ThumbsUp,
  negative: ThumbsDown,
  neutral: Minus,
  mixed: BarChart3,
};

const sentimentColors: Record<string, string> = {
  positive: "text-sentinel-emerald",
  negative: "text-sentinel-red",
  neutral: "text-muted-foreground",
  mixed: "text-sentinel-amber",
};

export default function MentionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [mention, setMention] = useState<MentionDetail | null>(null);
  const [claims, setClaims] = useState<ClaimExtraction[]>([]);
  const [topics, setTopics] = useState<TopicLink[]>([]);
  const [narratives, setNarratives] = useState<NarrativeLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !currentOrg) return;
    setLoading(true);

    Promise.all([
      supabase.from("mentions").select("*").eq("id", id).eq("org_id", currentOrg.id).single(),
      supabase.from("claim_extractions").select("id, claim_text, category, confidence").eq("mention_id", id),
      supabase.from("mention_topics").select("topic_id, topics(name)").eq("mention_id", id),
      supabase.from("mention_narratives").select("narrative_id, narratives(name, status)").eq("mention_id", id),
    ]).then(([mentionRes, claimsRes, topicsRes, narrativesRes]) => {
      setMention(mentionRes.data as MentionDetail);
      setClaims((claimsRes.data as any) || []);
      setTopics((topicsRes.data as any) || []);
      setNarratives((narrativesRes.data as any) || []);
      setLoading(false);
    });
  }, [id, currentOrg]);

  const formatReach = (count: number | null) => {
    if (!count) return "0";
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return String(count);
  };

  const updateStatus = async (newStatus: string) => {
    if (!mention) return;
    const { error } = await supabase.from("mentions").update({ status: newStatus }).eq("id", mention.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMention({ ...mention, status: newStatus });
      toast({ title: `Mention ${newStatus}` });
    }
  };

  const handleRespond = () => {
    navigate("/respond");
  };

  const handleEscalate = async () => {
    if (!mention || !currentOrg) return;
    try {
      const { error } = await supabase.from("escalations").insert({
        org_id: currentOrg.id,
        title: `Escalation: ${mention.author_name || mention.author_handle || "Unknown"} on ${mention.source}`,
        description: `Auto-escalated mention from ${mention.source}`,
        pasted_text: mention.content,
        priority: mention.severity === "critical" ? "critical" : mention.severity === "high" ? "high" : "medium",
        related_mention_ids: [mention.id],
      });
      if (error) throw error;
      toast({ title: "Escalation created", description: "A new ticket was created for this mention." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleAddToIncident = async () => {
    // For now navigate to incidents - in the future this could open a picker
    navigate("/incidents");
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-up">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!mention) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/mentions")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Mentions
        </Button>
        <Card className="bg-card border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Mention not found.</p>
        </Card>
      </div>
    );
  }

  const flags = (mention.flags as any) || {};
  const metrics = (mention.metrics as any) || {};
  const SentimentIcon = sentimentIcons[mention.sentiment_label || "neutral"] || Minus;

  return (
    <div className="space-y-6 animate-fade-up max-w-5xl">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[
        { label: "Mentions", href: "/mentions" },
        { label: mention.author_name || mention.author_handle || "Mention Detail" },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {mention.status && mention.status !== "new" && (
            <Badge variant="outline" className={`text-xs ${
              mention.status === "ignored" ? "text-muted-foreground" : mention.status === "snoozed" ? "text-sentinel-amber" : "text-sentinel-emerald"
            }`}>
              {mention.status === "ignored" && <EyeOff className="h-3 w-3 mr-1" />}
              {mention.status === "snoozed" && <Clock className="h-3 w-3 mr-1" />}
              {mention.status === "resolved" && <CheckCircle2 className="h-3 w-3 mr-1" />}
              {mention.status}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={handleRespond}>
            <MessageCircleReply className="h-3.5 w-3.5 mr-1.5" /> Respond
          </Button>
          <Button size="sm" variant="outline" onClick={handleEscalate}>
            <TicketCheck className="h-3.5 w-3.5 mr-1.5" /> Escalate
          </Button>
          <Button size="sm" variant="outline" onClick={handleAddToIncident}>
            <Siren className="h-3.5 w-3.5 mr-1.5" /> Add to Incident
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="px-2">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {mention.status !== "ignored" && (
                <DropdownMenuItem onClick={() => updateStatus("ignored")}>
                  <EyeOff className="h-3.5 w-3.5 mr-2" /> Ignore
                </DropdownMenuItem>
              )}
              {mention.status !== "snoozed" && (
                <DropdownMenuItem onClick={() => updateStatus("snoozed")}>
                  <Clock className="h-3.5 w-3.5 mr-2" /> Snooze
                </DropdownMenuItem>
              )}
              {mention.status !== "resolved" && (
                <DropdownMenuItem onClick={() => updateStatus("resolved")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Mark Resolved
                </DropdownMenuItem>
              )}
              {mention.status && mention.status !== "new" && (
                <DropdownMenuItem onClick={() => updateStatus("new")}>
                  Reopen
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content Card */}
      <Card className="bg-card border-border p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{mention.author_name || "Unknown"}</span>
                {mention.author_verified && (
                  <Shield className="h-3.5 w-3.5 text-primary" />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{mention.author_handle || "—"}</span>
                <span>·</span>
                <span>{formatReach(mention.author_follower_count)} followers</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] capitalize">{mention.source}</Badge>
            <Badge variant="outline" className={`text-[10px] ${severityColors[mention.severity || "low"]}`}>
              {mention.severity || "low"}
            </Badge>
          </div>
        </div>

        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-lg p-4 border border-border">
          {mention.content || "No content available."}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            {mention.posted_at && (
              <span>{format(new Date(mention.posted_at), "MMM d, yyyy 'at' h:mm a")}</span>
            )}
            {mention.language && (
              <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{mention.language.toUpperCase()}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {mention.url && (
              <a
                href={mention.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View original source
              </a>
            )}
            {mention.scan_run_id && (
              <span className="flex items-center gap-1 text-muted-foreground text-[10px]">
                <Bot className="h-3 w-3" /> From scan run
              </span>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sentiment */}
        <Card className="bg-card border-border p-5 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sentiment Analysis</h3>
          <div className="flex items-center gap-3">
            <SentimentIcon className={`h-6 w-6 ${sentimentColors[mention.sentiment_label || "neutral"]}`} />
            <div>
              <div className={`text-lg font-bold capitalize ${sentimentColors[mention.sentiment_label || "neutral"]}`}>
                {mention.sentiment_label || "neutral"}
              </div>
              <div className="text-xs text-muted-foreground">
                Score: {mention.sentiment_score?.toFixed(2) ?? "—"} · Confidence: {mention.sentiment_confidence ? `${(Number(mention.sentiment_confidence) * 100).toFixed(0)}%` : "—"}
              </div>
            </div>
          </div>
        </Card>

        {/* Metrics */}
        <Card className="bg-card border-border p-5 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Engagement Metrics</h3>
          <p className="text-[10px] text-muted-foreground italic">Metrics are AI-estimated and may not reflect actual engagement</p>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Likes", value: metrics.likes },
              { label: "Shares", value: metrics.shares },
              { label: "Comments", value: metrics.comments },
            ].map(m => (
              <div key={m.label} className="text-center">
                <div className="text-lg font-bold font-mono text-foreground">{m.value != null ? formatReach(m.value) : "N/A"}</div>
                <div className="text-[10px] text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Flags */}
        <Card className="bg-card border-border p-5 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Flags & Indicators</h3>
          {Object.keys(flags).length === 0 ? (
            <p className="text-xs text-muted-foreground">No flags detected.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {flags.misinformation && (
                <Badge variant="outline" className="border-sentinel-red/30 text-sentinel-red text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Misinformation
                </Badge>
              )}
              {flags.coordinated && (
                <Badge variant="outline" className="border-sentinel-purple/30 text-sentinel-purple text-xs">
                  <Flag className="h-3 w-3 mr-1" /> Coordinated
                </Badge>
              )}
              {flags.bot_likely && (
                <Badge variant="outline" className="border-sentinel-amber/30 text-sentinel-amber text-xs">
                  <Bot className="h-3 w-3 mr-1" /> Bot Likely
                </Badge>
              )}
              {flags.viral_potential && (
                <Badge variant="outline" className="border-sentinel-cyan/30 text-sentinel-cyan text-xs">
                  <Flame className="h-3 w-3 mr-1" /> Viral Potential
                </Badge>
              )}
              {flags.emergency && (
                <Badge variant="outline" className="border-sentinel-red/50 text-sentinel-red text-xs">
                  <Siren className="h-3 w-3 mr-1" /> Emergency
                </Badge>
              )}
              {flags.false_claim && (
                <Badge variant="outline" className="border-sentinel-amber/30 text-sentinel-amber text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" /> False Claim
                </Badge>
              )}
            </div>
          )}
        </Card>

        {/* Topics */}
        <Card className="bg-card border-border p-5 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Hash className="h-3 w-3" /> Topics
          </h3>
          {topics.length === 0 ? (
            <p className="text-xs text-muted-foreground">No topics linked.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topics.map(t => (
                <Badge key={t.topic_id} variant="secondary" className="text-xs">
                  {(t.topics as any)?.name || t.topic_id}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Narratives */}
      {narratives.length > 0 && (
        <Card className="bg-card border-border p-5 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Linked Narratives</h3>
          <div className="space-y-2">
            {narratives.map(n => (
              <div key={n.narrative_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                <span className="text-sm text-foreground">{(n.narratives as any)?.name || n.narrative_id}</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {(n.narratives as any)?.status || "active"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Claims */}
      {claims.length > 0 && (
        <Card className="bg-card border-border p-5 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Extracted Claims</h3>
          <div className="space-y-2">
            {claims.map(c => (
              <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">{c.category || "general"}</Badge>
                <div className="flex-1">
                  <p className="text-sm text-foreground">{c.claim_text}</p>
                  {c.confidence && (
                    <p className="text-[10px] text-muted-foreground mt-1">Confidence: {(Number(c.confidence) * 100).toFixed(0)}%</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
