import { useEffect, useState } from "react";
import SourceIntelSheet from "@/components/mentions/SourceIntelSheet";
import SourceBadge, { formatReachDisplay } from "@/components/SourceBadge";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Breadcrumbs from "@/components/Breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import InfoTooltip from "@/components/InfoTooltip";
import {
  ArrowLeft, ExternalLink, Shield, AlertTriangle, Bot, Flame, Flag,
  MessageCircleReply, TicketCheck, Siren, User, Globe, BarChart3,
  ThumbsUp, ThumbsDown, Minus, Hash, EyeOff, Clock, CheckCircle2, MoreVertical,
  Trash2, Sparkles, Loader2, AlertCircle, Ban, CalendarClock, Eye, ChevronDown, Search,
  Network, Link2,
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

// Clean junk content (markdown links, SVG data URIs, navigation chrome)
function cleanContentText(raw: string | null): string {
  if (!raw) return "";
  let text = raw;
  // Remove markdown image tags with data URIs
  text = text.replace(/!\[.*?\]\(data:.*?\)/g, "");
  // Remove markdown links but keep link text
  text = text.replace(/\[([^\]]*)\]\(https?:[^)]*\)/g, "$1");
  // Remove raw URLs
  text = text.replace(/https?:\/\/\S+/g, "");
  // Remove SVG/data URI fragments
  text = text.replace(/data:image\/[^,]+,[^\s)]+/g, "");
  // Remove leftover markdown artifacts
  text = text.replace(/[#*_~`>]/g, "");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  // If result is too short or just navigation junk, return empty
  if (text.length < 30) return "";
  return text;
}

export default function MentionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [mention, setMention] = useState<MentionDetail | null>(null);
  const [claims, setClaims] = useState<ClaimExtraction[]>([]);
  const [topics, setTopics] = useState<TopicLink[]>([]);
  const [narratives, setNarratives] = useState<NarrativeLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<{ summary: string; impact: string; action: string } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sourceIntelOpen, setSourceIntelOpen] = useState(false);
  const [similarMentions, setSimilarMentions] = useState<MentionDetail[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  const getDomain = (url: string | null): string => {
    if (!url) return "unknown";
    try { return new URL(url).hostname.replace("www.", ""); } catch { return "unknown"; }
  };
  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/mentions");
    }
  };

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

  // Find similar mentions from other sources (for coordinated activity detection)
  useEffect(() => {
    if (!mention || !currentOrg) return;
    const content = cleanContentText(mention.content);
    if (content.length < 40) return;

    const flags = mention.flags || {};
    if (!flags.coordinated && !flags.misinformation && !flags.bot_likely) return;

    setSimilarLoading(true);
    const searchSnippet = content.slice(0, 60);
    supabase
      .from("mentions")
      .select("id, source, content, url, posted_at, sentiment_label, severity, author_name, flags, created_at, author_handle, author_verified, author_follower_count, sentiment_score, sentiment_confidence, language, metrics, scan_run_id, status")
      .eq("org_id", currentOrg.id)
      .neq("id", mention.id)
      .ilike("content", `%${searchSnippet}%`)
      .limit(20)
      .then(({ data }) => {
        setSimilarMentions((data as MentionDetail[]) || []);
        setSimilarLoading(false);
      });
  }, [mention, currentOrg]);

  const formatReach = (count: number | null) => {
    if (!count) return "0";
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return String(count);
  };

  const ignoreSource = async (domain: string) => {
    if (!currentOrg) return;
    const { error } = await supabase.from("ignored_sources").insert({
      org_id: currentOrg.id,
      domain,
      reason: "Blocked from mention detail",
    });
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Already blocked", description: `${domain} is already on your block list.` });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      return;
    }
    toast({ title: "Source blocked", description: `${domain} will be hidden from future results.` });
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
    const cleanContent = cleanContentText(mention?.content || null);
    navigate("/respond", { state: { prefillText: cleanContent, sourceMentionId: mention?.id } });
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
    navigate("/incidents");
  };

  const deleteMention = async () => {
    if (!mention) return;
    setDeleting(true);
    const { error } = await supabase.from("mentions").delete().eq("id", mention.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setDeleting(false);
    } else {
      toast({ title: "Mention deleted" });
      goBack();
    }
  };

  // Generate AI summary
  const generateSummary = async () => {
    if (!mention?.content || summaryLoading) return;
    setSummaryLoading(true);
    try {
      const cleanContent = cleanContentText(mention.content);
      const res = await supabase.functions.invoke("generate-ai-summary", {
        body: {
          content: cleanContent,
          source: mention.source,
          severity: mention.severity,
          sentiment: mention.sentiment_label,
          author: mention.author_name || mention.author_handle,
        },
      });
      if (res.error) throw new Error(res.error.message);
      setAiSummary(res.data);
    } catch (err: any) {
      toast({ title: "Summary failed", description: err.message, variant: "destructive" });
    } finally {
      setSummaryLoading(false);
    }
  };

  // Auto-generate summary when mention loads
  useEffect(() => {
    if (mention?.content && !aiSummary && !summaryLoading) {
      generateSummary();
    }
  }, [mention]);

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
      {/* Back button - prominent */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back to Results
        </Button>
        <Breadcrumbs items={[
          { label: "Mentions", href: "/mentions" },
          { label: mention.author_name || mention.author_handle || "Mention Detail" },
        ]} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
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
              <DropdownMenuItem onClick={deleteMention} className="text-destructive focus:text-destructive" disabled={deleting}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* AI Summary Card */}
      <Card className="bg-primary/5 border-primary/20 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> AI Analysis
          </h3>
          {aiSummary && (
            <Button size="sm" variant="ghost" onClick={generateSummary} disabled={summaryLoading} className="h-6 text-[10px]">
              Regenerate
            </Button>
          )}
        </div>
        {summaryLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing content...
          </div>
        ) : aiSummary ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">What's being said</p>
              <p className="text-sm text-foreground">{aiSummary.summary}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Potential impact</p>
              <p className="text-sm text-foreground">{aiSummary.impact}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Suggested action</p>
              <p className="text-sm text-foreground">{aiSummary.action}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" /> Could not generate summary.
            <Button size="sm" variant="ghost" onClick={generateSummary} className="h-6 text-xs">Try again</Button>
          </div>
        )}
      </Card>

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
                {mention.author_handle && <span>{mention.author_handle}</span>}
                {(() => {
                  const reach = formatReachDisplay(mention.author_follower_count, mention.source);
                  if (!reach) return null;
                  return (
                    <>
                      {mention.author_handle && <span>·</span>}
                      <span>{reach.value} {reach.label}</span>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={mention.source} />
            {mention.url && getDomain(mention.url) !== "unknown" && (() => {
              const domain = getDomain(mention.url);
              const authorDisplay = (mention.author_name || "").toLowerCase();
              const isDuplicate = authorDisplay === domain.toLowerCase();
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-[10px] cursor-pointer hover:border-primary/50 transition-colors gap-1"
                    >
                      <Globe className="h-3 w-3" />
                      {domain}
                      <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                    </Badge>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setSourceIntelOpen(true)}>
                      <Sparkles className="h-3.5 w-3.5 mr-2 text-primary" /> Source Intelligence
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(`/mentions?source=${mention.source}`)}>
                      <Search className="h-3.5 w-3.5 mr-2" /> All mentions from this source
                    </DropdownMenuItem>
                    {mention.url && (
                      <DropdownMenuItem onClick={() => window.open(mention.url!, "_blank")}>
                        <ExternalLink className="h-3.5 w-3.5 mr-2" /> Visit {domain}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate(`/people?search=${encodeURIComponent(mention.author_name || mention.author_handle || "")}`)}>
                      <User className="h-3.5 w-3.5 mr-2" /> Track author in People
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => ignoreSource(domain)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Ban className="h-3.5 w-3.5 mr-2" /> Block this source
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })()}
            <Badge variant="outline" className={`text-[10px] ${severityColors[mention.severity || "low"]}`}>
              <span className="text-muted-foreground mr-1">Severity:</span> {mention.severity || "low"}
            </Badge>
          </div>
        </div>

        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-lg p-4 border border-border">
          {cleanContentText(mention.content) || (
            <span className="text-muted-foreground italic">
              Content could not be extracted. {mention.url && <a href={mention.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View original source →</a>}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            {mention.posted_at ? (
              <span className="flex items-center gap-1 font-medium text-foreground">
                <CalendarClock className="h-3 w-3 text-primary" />
                Published {format(new Date(mention.posted_at), "MMM d, yyyy 'at' h:mm a")}
              </span>
            ) : (
              <span className="text-muted-foreground/60 italic flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                Publish date unknown
              </span>
            )}
            {mention.created_at && (
              <span className="flex items-center gap-1 text-muted-foreground/60">
                <Eye className="h-3 w-3" />
                Detected {format(new Date(mention.created_at), "MMM d, yyyy 'at' h:mm a")}
              </span>
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
                Score: {mention.sentiment_score?.toFixed(2) ?? "—"} · Confidence: {mention.sentiment_confidence ? `${(Number(mention.sentiment_confidence) > 1 ? Number(mention.sentiment_confidence).toFixed(0) : (Number(mention.sentiment_confidence) * 100).toFixed(0))}%` : "—"}
                <InfoTooltip text="How confident the AI is in this sentiment classification. Higher = more certain the sentiment label is correct." />
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

        {/* Similar Content from Other Sources — coordination warning */}
        {(flags.coordinated || flags.misinformation || flags.bot_likely) && (
          <Card className="bg-sentinel-amber/5 border-sentinel-amber/20 p-5 space-y-3">
            <h3 className="text-xs font-medium text-sentinel-amber uppercase tracking-wider flex items-center gap-1.5">
              <Network className="h-3 w-3" /> Similar Content from Other Sources
            </h3>
            {flags.coordinated && (
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-sentinel-amber/10 border border-sentinel-amber/20">
                <AlertCircle className="h-3.5 w-3.5 text-sentinel-amber mt-0.5 shrink-0" />
                <p className="text-xs text-foreground">
                  This mention was flagged as potentially <strong>coordinated activity</strong> — similar content may have been distributed across multiple sources simultaneously.
                </p>
              </div>
            )}
            {similarLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching for similar content…
              </div>
            ) : similarMentions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No similar content found from other sources.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Found <strong>{similarMentions.length}</strong> similar mention{similarMentions.length > 1 ? "s" : ""} from{" "}
                  <strong>{new Set(similarMentions.map(m => getDomain(m.url))).size}</strong> other source{new Set(similarMentions.map(m => getDomain(m.url))).size > 1 ? "s" : ""}:
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {similarMentions.map(sm => (
                    <div
                      key={sm.id}
                      className="flex items-center gap-2 p-2.5 rounded-md bg-card border border-border hover:border-primary/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/mentions/${sm.id}`)}
                    >
                      <Badge variant="outline" className="text-[10px] shrink-0">{sm.source}</Badge>
                      <span className="text-[10px] text-muted-foreground shrink-0">{getDomain(sm.url)}</span>
                      <span className="text-xs text-foreground truncate flex-1">
                        {cleanContentText(sm.content).slice(0, 80)}
                      </span>
                      {sm.posted_at && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {format(new Date(sm.posted_at), "MMM d")}
                        </span>
                      )}
                      <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <p className="text-[10px] text-muted-foreground w-full">Sources:</p>
                  {[...new Set(similarMentions.map(m => getDomain(m.url)))].map(domain => (
                    <Badge key={domain} variant="outline" className="text-[10px] border-sentinel-amber/30 text-sentinel-amber">
                      <Globe className="h-2.5 w-2.5 mr-1" />{domain}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Topics */}
        <Card className="bg-card border-border p-5 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Hash className="h-3 w-3" /> Topics
          </h3>
          {topics.length === 0 ? (
            <p className="text-xs text-muted-foreground">No topics linked to this mention yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topics.map(t => (
                <Badge key={t.topic_id} variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80">
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
              <div
                key={n.narrative_id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/narratives/${n.narrative_id}`)}
              >
                <span className="text-sm text-primary hover:underline">{(n.narratives as any)?.name || n.narrative_id}</span>
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
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      Confidence: {(Number(c.confidence) > 1 ? Number(c.confidence).toFixed(0) : (Number(c.confidence) * 100).toFixed(0))}%
                      <InfoTooltip text="How confident the AI is that this specific claim was actually made in the content. Higher = clearer and more explicit claim." />
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <SourceIntelSheet
        domain={mention?.url ? getDomain(mention.url) : null}
        open={sourceIntelOpen}
        onOpenChange={setSourceIntelOpen}
        onIgnore={(d) => ignoreSource(d)}
      />
    </div>
  );
}
