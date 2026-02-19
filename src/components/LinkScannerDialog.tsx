import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Link2, Loader2, Globe, AlertTriangle, TrendingUp, Shield,
  ExternalLink, Lock, Twitter, Hash, Eye, MapPin, Users,
  ThumbsUp, ThumbsDown, Minus, Info, ChevronDown, ChevronUp,
  Sparkles, MessageSquare, Share2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";

interface LinkAnalysis {
  success: boolean;
  url: string;
  title: string;
  description: string;
  paywall: { is_paywalled: boolean; paywall_type: string | null };
  analysis: any;
  social_pickup: Array<{ platform: string; url: string; title: string; snippet: string }>;
  media_pickup: Array<{ url: string; title: string; snippet: string; domain: string }>;
  data_confidence: any;
  scanned_at: string;
}

const sentimentColors: Record<string, string> = {
  positive: "text-sentinel-emerald",
  negative: "text-sentinel-red",
  neutral: "text-muted-foreground",
  mixed: "text-sentinel-amber",
};

const impactColors: Record<string, string> = {
  low: "bg-sentinel-emerald/10 text-sentinel-emerald border-sentinel-emerald/30",
  medium: "bg-sentinel-amber/10 text-sentinel-amber border-sentinel-amber/30",
  high: "bg-sentinel-red/10 text-sentinel-red border-sentinel-red/30",
  critical: "bg-sentinel-red/20 text-sentinel-red border-sentinel-red/50",
};

const platformIcons: Record<string, any> = {
  twitter: Twitter,
  reddit: MessageSquare,
  linkedin: Users,
  facebook: Users,
  youtube: Globe,
};

export default function LinkScannerDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LinkAnalysis | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true, sentiment: true, impact: true, social: true, media: false, claims: false, entities: false,
  });
  const { toast } = useToast();
  const { currentOrg } = useOrg();

  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const analyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-link", {
        body: { url: url.trim(), org_id: currentOrg?.id },
      });
      if (error) throw new Error(error.message);
      if (!data.success) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const SectionHeader = ({ title, icon: Icon, sectionKey, badge }: { title: string; icon: any; sectionKey: string; badge?: React.ReactNode }) => (
    <button onClick={() => toggleSection(sectionKey)} className="flex items-center justify-between w-full py-2">
      <span className="text-xs font-medium text-card-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" /> {title}
        {badge}
      </span>
      {expandedSections[sectionKey] ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
    </button>
  );

  const a = result?.analysis || {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Scan Link
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" /> Link Scanner
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Paste any URL to get an instant AI-powered intelligence report — sentiment, narrative analysis, social pickup, and impact assessment.
          </p>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="https://example.com/article..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && analyze()}
            className="flex-1"
          />
          <Button onClick={analyze} disabled={loading || !url.trim()} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Analyzing..." : "Analyze"}
          </Button>
        </div>

        {loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Scraping content, checking social pickup, running AI analysis...</p>
            <p className="text-xs text-muted-foreground/60">This usually takes 10-20 seconds</p>
          </div>
        )}

        {result && (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-3 pb-4">
              {/* Header */}
              <Card className="p-4 bg-muted/20 border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground line-clamp-2">{result.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{result.description}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        <Globe className="h-3 w-3 mr-1" />
                        {(() => { try { return new URL(result.url).hostname; } catch { return result.url; } })()}
                      </Badge>
                      {result.paywall.is_paywalled && (
                        <Badge variant="outline" className="text-[10px] border-sentinel-amber/30 text-sentinel-amber">
                          <Lock className="h-3 w-3 mr-1" />
                          Paywalled ({result.paywall.paywall_type})
                        </Badge>
                      )}
                      {a.content_type && (
                        <Badge variant="outline" className="text-[10px] capitalize">{a.content_type}</Badge>
                      )}
                      {a.publication_date && (
                        <Badge variant="outline" className="text-[10px]">{a.publication_date}</Badge>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => window.open(result.url, "_blank")}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </Card>

              {/* Data Confidence Banner */}
              {result.data_confidence && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-xs">
                  <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-muted-foreground">
                    {result.data_confidence.content_accessible ? "✅ Content scraped" : "⚠️ Limited content"} · 
                    {result.data_confidence.social_pickup_found ? ` ✅ ${result.social_pickup.length} social shares found` : " ℹ️ No social pickup detected"} · 
                    {result.data_confidence.media_pickup_found ? ` ✅ ${result.media_pickup.length} media pickups` : " ℹ️ No additional media coverage"} ·
                    {result.data_confidence.twitter_connection_needed && " ⚠️ Connect Twitter/X for better social tracking"}
                  </span>
                </div>
              )}

              {/* Summary */}
              <div>
                <SectionHeader title="Summary" icon={Eye} sectionKey="summary" />
                {expandedSections.summary && a.summary && (
                  <p className="text-sm text-foreground leading-relaxed">{a.summary}</p>
                )}
              </div>

              <Separator />

              {/* Sentiment */}
              <div>
                <SectionHeader title="Sentiment & Narrative" icon={ThumbsUp} sectionKey="sentiment" />
                {expandedSections.sentiment && a.sentiment && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {a.sentiment.label === "positive" && <ThumbsUp className="h-5 w-5 text-sentinel-emerald" />}
                        {a.sentiment.label === "negative" && <ThumbsDown className="h-5 w-5 text-sentinel-red" />}
                        {a.sentiment.label === "neutral" && <Minus className="h-5 w-5 text-muted-foreground" />}
                        {a.sentiment.label === "mixed" && <AlertTriangle className="h-5 w-5 text-sentinel-amber" />}
                        <span className={`text-sm font-semibold capitalize ${sentimentColors[a.sentiment.label] || ""}`}>
                          {a.sentiment.label}
                        </span>
                      </div>
                      {a.sentiment.confidence != null && (
                        <span className="text-xs text-muted-foreground">{a.sentiment.confidence}% confidence</span>
                      )}
                    </div>
                    {a.sentiment.reasoning && (
                      <p className="text-xs text-muted-foreground">{a.sentiment.reasoning}</p>
                    )}
                    {a.narratives?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Key Narratives:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {a.narratives.map((n: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]"><Hash className="h-3 w-3 mr-0.5" />{n}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Impact */}
              <div>
                <SectionHeader
                  title="Potential Impact"
                  icon={AlertTriangle}
                  sectionKey="impact"
                  badge={a.potential_impact?.level && (
                    <Badge variant="outline" className={`text-[9px] ml-2 ${impactColors[a.potential_impact.level] || ""}`}>
                      {a.potential_impact.level}
                    </Badge>
                  )}
                />
                {expandedSections.impact && a.potential_impact && (
                  <div className="space-y-2">
                    <p className="text-xs text-foreground">{a.potential_impact.reasoning}</p>
                    {a.potential_impact.affected_parties?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[10px] text-muted-foreground mr-1">Affected:</span>
                        {a.potential_impact.affected_parties.map((p: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{p}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Regional */}
              {a.regional_scope && (
                <>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-card-foreground">
                        {a.regional_scope.is_global ? "🌍 Global Relevance" : `📍 ${a.regional_scope.primary_region}`}
                      </p>
                      {a.regional_scope.relevant_regions?.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Relevant: {a.regional_scope.relevant_regions.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Social Pickup */}
              <div>
                <SectionHeader
                  title="Social Pickup"
                  icon={Share2}
                  sectionKey="social"
                  badge={<Badge variant="outline" className="text-[9px] ml-2">{result.social_pickup.length} found</Badge>}
                />
                {expandedSections.social && (
                  <div className="space-y-2">
                    {result.social_pickup.length === 0 ? (
                      <div className="p-3 rounded-lg bg-muted/20 text-center">
                        <p className="text-xs text-muted-foreground">No social shares detected yet.</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          💡 Connect Twitter/X API in Settings → Sources for real-time social tracking with engagement metrics.
                        </p>
                      </div>
                    ) : (
                      result.social_pickup.map((s, i) => {
                        const PIcon = platformIcons[s.platform] || Globe;
                        return (
                          <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/20 hover:bg-muted/30 cursor-pointer" onClick={() => window.open(s.url, "_blank")}>
                            <PIcon className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-card-foreground line-clamp-1">{s.title}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">{s.platform}</p>
                            </div>
                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Media Pickup */}
              <div>
                <SectionHeader
                  title="Media Coverage"
                  icon={Globe}
                  sectionKey="media"
                  badge={<Badge variant="outline" className="text-[9px] ml-2">{result.media_pickup.length} found</Badge>}
                />
                {expandedSections.media && (
                  <div className="space-y-2">
                    {result.media_pickup.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">No additional media coverage found.</p>
                    ) : (
                      result.media_pickup.map((m, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/20 hover:bg-muted/30 cursor-pointer" onClick={() => window.open(m.url, "_blank")}>
                          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-card-foreground line-clamp-1">{m.title}</p>
                            <p className="text-[10px] text-muted-foreground">{m.domain}</p>
                          </div>
                          <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Claims */}
              {a.claims?.length > 0 && (
                <div>
                  <SectionHeader title="Claims Extracted" icon={Shield} sectionKey="claims" badge={<Badge variant="outline" className="text-[9px] ml-2">{a.claims.length}</Badge>} />
                  {expandedSections.claims && (
                    <div className="space-y-2">
                      {a.claims.map((c: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/20">
                          <div className="flex-1">
                            <p className="text-xs text-foreground">{c.text}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-[9px] capitalize">{c.category}</Badge>
                              {c.verifiable && <Badge variant="outline" className="text-[9px] text-sentinel-emerald border-sentinel-emerald/30">Verifiable</Badge>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Key Entities */}
              {a.key_entities?.length > 0 && (
                <div>
                  <SectionHeader title="Key Entities" icon={Users} sectionKey="entities" badge={<Badge variant="outline" className="text-[9px] ml-2">{a.key_entities.length}</Badge>} />
                  {expandedSections.entities && (
                    <div className="space-y-1.5">
                      {a.key_entities.map((e: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/20">
                          <div>
                            <p className="text-xs font-medium text-foreground">{e.name}</p>
                            <p className="text-[10px] text-muted-foreground">{e.role}</p>
                          </div>
                          <Badge variant="outline" className={`text-[9px] capitalize ${sentimentColors[e.sentiment_toward] || ""}`}>
                            {e.sentiment_toward}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Reliability */}
              {a.reliability && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                  <Shield className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-card-foreground">Source Reliability: {a.reliability.score}/100</span>
                      <Badge variant="outline" className="text-[9px] capitalize">{a.reliability.source_type}</Badge>
                    </div>
                    {a.reliability.factors?.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{a.reliability.factors.join(" · ")}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Recommended Actions */}
              {a.recommended_actions?.length > 0 && (
                <Card className="p-3 bg-primary/5 border-primary/20">
                  <p className="text-xs font-medium text-primary mb-2">💡 Recommended Actions</p>
                  <ul className="space-y-1">
                    {a.recommended_actions.map((action: string, i: number) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                        <span className="text-primary mt-0.5">•</span>
                        {action}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
