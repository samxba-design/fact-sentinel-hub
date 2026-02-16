import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Network, ArrowLeft, Quote, MessageSquareWarning,
  TrendingUp, Shield, Calendar, Gauge
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Narrative {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  confidence: number | null;
  first_seen: string | null;
  last_seen: string | null;
  example_phrases: string[] | null;
}

interface LinkedMention {
  id: string;
  content: string | null;
  source: string;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
  author_name: string | null;
}

export default function NarrativeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [mentions, setMentions] = useState<LinkedMention[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!id || !currentOrg) return;
    setLoading(true);

    const [narrRes, linksRes] = await Promise.all([
      supabase.from("narratives").select("*").eq("id", id).eq("org_id", currentOrg.id).single(),
      supabase.from("mention_narratives").select("mention_id").eq("narrative_id", id),
    ]);

    setNarrative(narrRes.data as Narrative | null);

    const mentionIds = (linksRes.data || []).map((l: any) => l.mention_id);
    if (mentionIds.length > 0) {
      const { data } = await supabase
        .from("mentions")
        .select("id, content, source, sentiment_label, severity, posted_at, author_name")
        .in("id", mentionIds)
        .order("posted_at", { ascending: false })
        .limit(50);
      setMentions(data || []);
    } else {
      setMentions([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id, currentOrg]);

  const handleStatusChange = async (newStatus: string) => {
    if (!narrative) return;
    const { error } = await supabase
      .from("narratives")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", narrative.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNarrative({ ...narrative, status: newStatus });
      toast({ title: "Status updated" });
    }
  };

  const timeAgo = (d: string | null) => d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "—";

  const confidencePct = narrative?.confidence != null ? Math.round(Number(narrative.confidence) * 100) : null;
  const confidenceColor = confidencePct != null
    ? confidencePct >= 70 ? "text-sentinel-red" : confidencePct >= 40 ? "text-sentinel-amber" : "text-sentinel-emerald"
    : "text-muted-foreground";

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-up">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!narrative) {
    return (
      <div className="space-y-4 animate-fade-up">
        <Button variant="ghost" size="sm" onClick={() => navigate("/narratives")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Card className="bg-card border-border p-8 text-center">
          <p className="text-muted-foreground">Narrative not found.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[
        { label: "Narratives", href: "/narratives" },
        { label: narrative.name },
      ]} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Network className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">{narrative.name}</h1>
          </div>
        </div>
        <Select value={narrative.status || "active"} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="watch">Watch</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Top row: details + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Description & phrases */}
        <Card className="bg-card border-border p-5 lg:col-span-2 space-y-5">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
            <p className="text-sm text-card-foreground leading-relaxed">
              {narrative.description || "No description provided."}
            </p>
          </div>

          {(narrative.example_phrases?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Quote className="h-3.5 w-3.5" /> Example Phrases
              </h3>
              <div className="space-y-2">
                {narrative.example_phrases!.map((phrase, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted/50 border border-border text-sm text-card-foreground italic">
                    "{phrase}"
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Stats sidebar */}
        <div className="space-y-4">
          <Card className="bg-card border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> Confidence</span>
              <span className={`text-2xl font-bold font-mono ${confidenceColor}`}>
                {confidencePct != null ? `${confidencePct}%` : "—"}
              </span>
            </div>
            {confidencePct != null && (
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    confidencePct >= 70 ? "bg-sentinel-red" : confidencePct >= 40 ? "bg-sentinel-amber" : "bg-sentinel-emerald"
                  }`}
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
            )}
          </Card>

          <Card className="bg-card border-border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3 w-3" /> First Seen</span>
              <span className="text-xs text-card-foreground">{timeAgo(narrative.first_seen)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3 w-3" /> Last Seen</span>
              <span className="text-xs text-card-foreground">{timeAgo(narrative.last_seen)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><MessageSquareWarning className="h-3 w-3" /> Linked Mentions</span>
              <span className="text-sm font-mono text-card-foreground">{mentions.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Shield className="h-3 w-3" /> Status</span>
              <Badge variant="outline" className={`text-[10px] capitalize ${
                narrative.status === "active" ? "border-sentinel-emerald/30 text-sentinel-emerald" :
                narrative.status === "watch" ? "border-sentinel-amber/30 text-sentinel-amber" :
                narrative.status === "resolved" ? "border-primary/30 text-primary" :
                "border-muted-foreground/30 text-muted-foreground"
              }`}>
                {narrative.status || "active"}
              </Badge>
            </div>
          </Card>
        </div>
      </div>

      {/* Linked mentions */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
          <MessageSquareWarning className="h-4 w-4 text-primary" /> Linked Mentions ({mentions.length})
        </h3>
        {mentions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No mentions linked to this narrative yet.</p>
        ) : (
          <div className="space-y-2">
            {mentions.map(m => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/mentions/${m.id}`)}
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm text-card-foreground truncate">{m.content || "No content"}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span className="capitalize">{m.source}</span>
                    {m.author_name && <><span>·</span><span>{m.author_name}</span></>}
                    {m.posted_at && <><span>·</span><span>{timeAgo(m.posted_at)}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[10px] capitalize ${
                    m.sentiment_label === "negative" ? "border-sentinel-red/30 text-sentinel-red" :
                    m.sentiment_label === "positive" ? "border-sentinel-emerald/30 text-sentinel-emerald" :
                    "border-muted-foreground/30 text-muted-foreground"
                  }`}>
                    {m.sentiment_label || "neutral"}
                  </Badge>
                  {m.severity && m.severity !== "low" && (
                    <Badge variant="outline" className={`text-[10px] capitalize ${
                      m.severity === "critical" ? "border-sentinel-red/30 text-sentinel-red" :
                      m.severity === "high" ? "border-sentinel-amber/30 text-sentinel-amber" :
                      "border-muted-foreground/30 text-muted-foreground"
                    }`}>
                      {m.severity}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
