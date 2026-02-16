import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe, Shield, Users, Target, Eye, Sparkles, Loader2,
  TrendingDown, TrendingUp, AlertTriangle, Ban, ExternalLink,
  Newspaper, Link2, BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface SourceIntelSheetProps {
  domain: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mentionCount?: number;
  onIgnore?: (domain: string) => void;
}

interface SourceProfile {
  identity: string;
  audience: string;
  credibility: string;
  reach_estimate: string;
  bias_tendency?: string;
  competitor_connections?: { competitor: string; relationship: string }[];
  key_topics?: string[];
  risk_assessment: string;
  recommendation: string;
  internal_stats: {
    total_mentions: number;
    sentiment: Record<string, number>;
    severity: Record<string, number>;
    unique_authors: number;
    first_seen: string | null;
    last_seen: string | null;
  };
}

const credibilityColors: Record<string, string> = {
  high: "text-sentinel-emerald border-sentinel-emerald/30 bg-sentinel-emerald/5",
  medium: "text-sentinel-amber border-sentinel-amber/30 bg-sentinel-amber/5",
  low: "text-sentinel-red border-sentinel-red/30 bg-sentinel-red/5",
  unknown: "text-muted-foreground border-border bg-muted/30",
};

export default function SourceIntelSheet({ domain, open, onOpenChange, mentionCount, onIgnore }: SourceIntelSheetProps) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<SourceProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    if (!domain || !currentOrg || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("analyze-source", {
        body: { domain, org_id: currentOrg.id },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setProfile(data);
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Fetch on open if no profile cached
  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (isOpen && !profile && !loading) {
      fetchProfile();
    }
  };

  const stats = profile?.internal_stats;
  const totalSentiment = stats ? Object.values(stats.sentiment).reduce((a, b) => a + b, 0) : 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-primary" />
            {domain || "Source"}
          </SheetTitle>
          <div className="flex items-center gap-2">
            {domain && (
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" /> Visit site
              </a>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] gap-1"
              onClick={() => {
                if (domain) navigate(`/mentions?source=all`);
                // The domain filter is handled via the mentions page source panel
              }}
            >
              <Eye className="h-3 w-3" /> View all mentions
            </Button>
            {onIgnore && domain && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive"
                onClick={() => { onIgnore(domain); onOpenChange(false); }}
              >
                <Ban className="h-3 w-3" /> Block
              </Button>
            )}
          </div>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <Sparkles className="h-4 w-4 text-primary" />
              Generating source intelligence...
            </div>
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
          </div>
        ) : error ? (
          <div className="pt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
            <Button size="sm" onClick={fetchProfile}>Retry</Button>
          </div>
        ) : profile ? (
          <div className="space-y-4 pt-2">
            {/* Identity Card */}
            <Card className="p-4 bg-primary/5 border-primary/20 space-y-2">
              <h4 className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> AI Intelligence
              </h4>
              <p className="text-sm text-foreground leading-relaxed">{profile.identity}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[10px] ${credibilityColors[profile.credibility] || credibilityColors.unknown}`}>
                  <Shield className="h-3 w-3 mr-1" /> Credibility: {profile.credibility}
                </Badge>
                {profile.bias_tendency && (
                  <Badge variant="outline" className="text-[10px]">
                    Bias: {profile.bias_tendency}
                  </Badge>
                )}
              </div>
            </Card>

            {/* Quick Stats Row */}
            {stats && (
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 text-center">
                  <div className="text-lg font-bold font-mono text-foreground">{stats.total_mentions}</div>
                  <div className="text-[10px] text-muted-foreground">Detections</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-lg font-bold font-mono text-foreground">{stats.unique_authors}</div>
                  <div className="text-[10px] text-muted-foreground">Authors</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-lg font-bold font-mono text-sentinel-red">
                    {totalSentiment > 0 ? `${Math.round((stats.sentiment.negative / totalSentiment) * 100)}%` : "0%"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Negative</div>
                </Card>
              </div>
            )}

            {/* Sentiment Breakdown Bar */}
            {stats && totalSentiment > 0 && (
              <Card className="p-4 space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sentiment from this source</h4>
                <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                  {stats.sentiment.positive > 0 && (
                    <div className="bg-sentinel-emerald h-full" style={{ width: `${(stats.sentiment.positive / totalSentiment) * 100}%` }} title={`Positive: ${stats.sentiment.positive}`} />
                  )}
                  {stats.sentiment.neutral > 0 && (
                    <div className="bg-muted-foreground/30 h-full" style={{ width: `${(stats.sentiment.neutral / totalSentiment) * 100}%` }} title={`Neutral: ${stats.sentiment.neutral}`} />
                  )}
                  {stats.sentiment.mixed > 0 && (
                    <div className="bg-sentinel-amber h-full" style={{ width: `${(stats.sentiment.mixed / totalSentiment) * 100}%` }} title={`Mixed: ${stats.sentiment.mixed}`} />
                  )}
                  {stats.sentiment.negative > 0 && (
                    <div className="bg-sentinel-red h-full" style={{ width: `${(stats.sentiment.negative / totalSentiment) * 100}%` }} title={`Negative: ${stats.sentiment.negative}`} />
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sentinel-emerald inline-block" /> {stats.sentiment.positive} positive</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sentinel-amber inline-block" /> {stats.sentiment.mixed} mixed</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sentinel-red inline-block" /> {stats.sentiment.negative} negative</span>
                </div>
              </Card>
            )}

            {/* Audience & Reach */}
            <Card className="p-4 space-y-3">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Audience</p>
                    <p className="text-sm text-foreground">{profile.audience}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Reach</p>
                    <p className="text-sm text-foreground">{profile.reach_estimate}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Topics */}
            {profile.key_topics && profile.key_topics.length > 0 && (
              <Card className="p-4 space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Newspaper className="h-3 w-3" /> Typical Coverage
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {profile.key_topics.map((topic, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{topic}</Badge>
                  ))}
                </div>
              </Card>
            )}

            {/* Competitor Connections */}
            {profile.competitor_connections && profile.competitor_connections.length > 0 && (
              <Card className="p-4 space-y-2 border-sentinel-amber/20">
                <h4 className="text-xs font-medium text-sentinel-amber uppercase tracking-wider flex items-center gap-1.5">
                  <Link2 className="h-3 w-3" /> Competitor Connections
                </h4>
                <div className="space-y-2">
                  {profile.competitor_connections.map((conn, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                      <Target className="h-3.5 w-3.5 text-sentinel-amber mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs font-medium text-foreground">{conn.competitor}</span>
                        <p className="text-[10px] text-muted-foreground">{conn.relationship}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Separator />

            {/* Risk & Recommendation */}
            <Card className="p-4 space-y-3">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-sentinel-amber mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Risk Assessment</p>
                    <p className="text-sm text-foreground">{profile.risk_assessment}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Recommendation</p>
                    <p className="text-sm text-foreground">{profile.recommendation}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Refresh */}
            <Button size="sm" variant="outline" onClick={fetchProfile} disabled={loading} className="w-full gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Regenerate Intelligence
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
