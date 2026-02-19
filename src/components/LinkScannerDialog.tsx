import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  ThumbsUp, ThumbsDown, Minus, Info, ChevronDown, ChevronRight,
  Sparkles, MessageSquare, Share2, Save, TicketCheck, MessageCircleReply,
  Network, CheckCircle2, FileText, Settings, Search, Building2, Zap,
  Target, BarChart3, Download, Image,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";

interface SimilarMention {
  id: string;
  content: string;
  url: string | null;
  source: string;
  sentiment: string | null;
  severity: string | null;
  posted_at: string | null;
  author: string | null;
}

interface LinkAnalysis {
  success: boolean;
  url: string;
  title: string;
  description: string;
  paywall: { is_paywalled: boolean; paywall_type: string | null };
  analysis: any;
  social_pickup: Array<{ platform: string; url: string; title: string; snippet: string }>;
  media_pickup: Array<{ url: string; title: string; snippet: string; domain: string }>;
  similar_mentions: SimilarMention[];
  search_visibility: any;
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
    summary: true, breakdown: true, brand: true, reach: true,
    sentiment: true, impact: true, social: true, media: false,
    similar: true, claims: false, entities: false, seo: true,
    discovery: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"jpg" | "pdf" | null>(null);

  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const expandAllSections = () => setExpandedSections({
    summary: true, breakdown: true, brand: true, reach: true,
    sentiment: true, impact: true, social: true, media: true,
    similar: true, claims: true, entities: true, seo: true,
    discovery: true,
  });

  const exportAsJpg = async () => {
    if (!resultsRef.current) return;
    setExporting("jpg");
    expandAllSections();
    // Wait for DOM to update with all sections expanded
    await new Promise(r => setTimeout(r, 300));
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(resultsRef.current, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background").trim()
          ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--background").trim()})`
          : "#1a1a2e",
        scale: 2,
        useCORS: true,
        scrollY: -window.scrollY,
        windowHeight: resultsRef.current.scrollHeight,
      });
      const link = document.createElement("a");
      link.download = `link-scan-${new Date().toISOString().slice(0, 10)}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
      toast({ title: "Exported as JPG" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const exportAsPdf = async () => {
    if (!resultsRef.current) return;
    setExporting("pdf");
    expandAllSections();
    await new Promise(r => setTimeout(r, 300));
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(resultsRef.current, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background").trim()
          ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--background").trim()})`
          : "#1a1a2e",
        scale: 2,
        useCORS: true,
        scrollY: -window.scrollY,
        windowHeight: resultsRef.current.scrollHeight,
      });
      const imgData = canvas.toDataURL("image/png");
      const printWin = window.open("", "_blank");
      if (printWin) {
        printWin.document.write(`
          <html><head><title>Link Scan Report</title>
          <style>@media print { body { margin: 0; } img { width: 100%; height: auto; } }</style>
          </head><body>
          <img src="${imgData}" style="width:100%;height:auto;" />
          </body></html>
        `);
        printWin.document.close();
        printWin.onload = () => {
          printWin.print();
          printWin.close();
        };
        toast({ title: "PDF print dialog opened" });
      }
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const analyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setSaved(false);
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

  const saveAsMention = async () => {
    if (!result || !currentOrg) return;
    setSaving(true);
    try {
      const a = result.analysis || {};
      const sd = (result as any)?.search_discovery;
      const sv = result?.search_visibility;
      const { error } = await supabase.from("mentions").insert({
        org_id: currentOrg.id,
        source: a.content_type || "news",
        content: a.summary || result.description || result.title,
        url: result.url,
        author_name: a.author || null,
        sentiment_label: a.sentiment?.label || "neutral",
        sentiment_score: a.sentiment?.score || 0,
        sentiment_confidence: (a.sentiment?.confidence || 50) / 100,
        severity: a.potential_impact?.level === "critical" ? "critical" : a.potential_impact?.level || "low",
        posted_at: a.publication_date || null,
        status: "new",
        flags: {
          from_link_scanner: true,
          paywall: result.paywall.is_paywalled,
          paywall_type: result.paywall.paywall_type,
          social_pickup_count: result.social_pickup.length,
          media_pickup_count: result.media_pickup.length,
          reliability_score: a.reliability?.score || null,
          // Rich scan data
          content_breakdown: a.content_breakdown || null,
          brand_impact: a.brand_impact || null,
          reach_and_impact: a.reach_and_impact || null,
          claims: a.claims || null,
          key_entities: a.key_entities || null,
          regional_scope: a.regional_scope || null,
          reliability: a.reliability || null,
          recommended_actions: a.recommended_actions || null,
          narratives: a.narratives || null,
          sentiment_reasoning: a.sentiment?.reasoning || null,
          potential_impact: a.potential_impact || null,
          search_discovery: sd || null,
          search_visibility: sv || null,
          social_pickup: result.social_pickup || [],
          media_pickup: result.media_pickup || [],
          data_confidence: result.data_confidence || null,
          scanned_at: result.scanned_at,
        },
        metrics: {
          social_pickup: result.social_pickup.length,
          media_pickup: result.media_pickup.length,
        },
      });
      if (error) throw error;
      setSaved(true);
      toast({ title: "Saved as mention", description: "Full scan intelligence saved — view detailed analysis on the mention page." });
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const createEscalation = async () => {
    if (!result || !currentOrg) return;
    try {
      const a = result.analysis || {};
      const { error } = await supabase.from("escalations").insert({
        org_id: currentOrg.id,
        title: `Link Analysis: ${result.title || result.url}`,
        description: `AI Analysis of ${result.url}\n\nSummary: ${a.summary || "N/A"}\nSentiment: ${a.sentiment?.label || "N/A"}\nImpact: ${a.potential_impact?.level || "N/A"}\n\nSocial: ${result.social_pickup.length} | Media: ${result.media_pickup.length}`,
        priority: a.potential_impact?.level === "critical" ? "critical" : a.potential_impact?.level === "high" ? "high" : "medium",
        pasted_text: a.summary || result.description,
      });
      if (error) throw error;
      toast({ title: "Escalation created" });
      setOpen(false);
      navigate("/escalations");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const draftResponse = () => {
    if (!result) return;
    const a = result.analysis || {};
    const context = `Source: ${result.url}\n\nKey Points:\n${a.summary || ""}\n\nClaims:\n${(a.claims || []).map((c: any) => `- ${c.text} (${c.category})`).join("\n") || "None"}\n\nSentiment: ${a.sentiment?.label || "N/A"}`;
    setOpen(false);
    navigate("/respond", { state: { prefillText: context } });
  };

  const trackNarrative = async () => {
    if (!result || !currentOrg) return;
    try {
      const a = result.analysis || {};
      const narrativeName = a.narratives?.[0] || result.title?.slice(0, 60) || "Link Scanner Narrative";
      const { error } = await supabase.from("narratives").insert({
        org_id: currentOrg.id,
        name: narrativeName,
        description: `From link analysis: ${result.url}. ${a.summary || ""}`,
        status: "active",
        confidence: (a.reliability?.score || 50) / 100,
        example_phrases: a.narratives?.slice(0, 5) || [],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      });
      if (error) throw error;
      toast({ title: "Narrative created", description: `"${narrativeName}" is now being tracked.` });
      setOpen(false);
      navigate("/narratives");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const SectionHeader = ({ title, icon: Icon, sectionKey, badge, className }: { title: string; icon: any; sectionKey: string; badge?: React.ReactNode; className?: string }) => {
    const isExpanded = expandedSections[sectionKey];
    return (
      <button
        type="button"
        onClick={() => toggleSection(sectionKey)}
        className={`flex items-center justify-between w-full py-2.5 px-1 rounded-md hover:bg-muted/30 transition-colors group ${className || ""}`}
      >
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-primary" /> {title}
          {badge}
        </span>
        {isExpanded
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        }
      </button>
    );
  };

  const a = result?.analysis || {};
  const dc = result?.data_confidence;
  const sv = result?.search_visibility;
  const sd = (result as any)?.search_discovery;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Scan Link
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-5 w-5 text-primary" /> Link Scanner
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            AI-powered intelligence report — content analysis, brand impact, reach assessment, and search visibility.
          </p>
        </DialogHeader>

        <div className="flex gap-2 px-6 pb-3">
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
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Scraping, analyzing content, checking search visibility...</p>
            <p className="text-xs text-muted-foreground/60">This usually takes 15-30 seconds</p>
          </div>
        )}

        {result && (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div ref={resultsRef} className="space-y-1">
              {/* Header Card */}
              <Card className="p-4 bg-muted/20 border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground leading-snug">{result.title}</h3>
                    {result.description && (
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{result.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        <Globe className="h-3 w-3 mr-1" />
                        {(() => { try { return new URL(result.url).hostname; } catch { return result.url; } })()}
                      </Badge>
                      {result.paywall.is_paywalled && (
                        <Badge variant="outline" className="text-[10px] border-sentinel-amber/30 text-sentinel-amber">
                          <Lock className="h-3 w-3 mr-1" /> Paywalled ({result.paywall.paywall_type})
                        </Badge>
                      )}
                      {a.content_type && <Badge variant="outline" className="text-[10px] capitalize">{a.content_type}</Badge>}
                      {a.author && <Badge variant="outline" className="text-[10px]">By {a.author}</Badge>}
                      {a.publication_date && <Badge variant="outline" className="text-[10px]">{a.publication_date}</Badge>}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => window.open(result.url, "_blank")}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </Card>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 py-2">
                <Button size="sm" variant="outline" onClick={saveAsMention} disabled={saving || saved} className="gap-1.5 text-xs h-8">
                  {saved ? <CheckCircle2 className="h-3.5 w-3.5 text-sentinel-emerald" /> : <Save className="h-3.5 w-3.5" />}
                  {saved ? "Saved" : saving ? "Saving..." : "Save as Mention"}
                </Button>
                <Button size="sm" variant="outline" onClick={createEscalation} className="gap-1.5 text-xs h-8">
                  <TicketCheck className="h-3.5 w-3.5" /> Escalate
                </Button>
                <Button size="sm" variant="outline" onClick={draftResponse} className="gap-1.5 text-xs h-8">
                  <MessageCircleReply className="h-3.5 w-3.5" /> Draft Response
                </Button>
                <Button size="sm" variant="outline" onClick={trackNarrative} className="gap-1.5 text-xs h-8">
                  <Network className="h-3.5 w-3.5" /> Track Narrative
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <span className="text-[10px] text-muted-foreground mr-1">Export:</span>
                <Button size="sm" variant="secondary" onClick={exportAsJpg} disabled={!!exporting} className="gap-1.5 text-xs h-8 font-medium">
                  {exporting === "jpg" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Image className="h-3.5 w-3.5" />}
                  Export JPG
                </Button>
                <Button size="sm" variant="secondary" onClick={exportAsPdf} disabled={!!exporting} className="gap-1.5 text-xs h-8 font-medium">
                  {exporting === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Export PDF
                </Button>
              </div>

              {/* Data Confidence */}
              {dc && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-muted-foreground">
                      {dc.content_accessible ? "✅ Content scraped" : "⚠️ Limited content"} ·
                      {dc.social_pickup_found ? ` ✅ ${result.social_pickup.length} social shares` : " ℹ️ No social pickup"} ·
                      {dc.media_pickup_found ? ` ✅ ${result.media_pickup.length} media pickups` : " ℹ️ No media coverage"}
                    </span>
                  </div>
                  {(dc.twitter_connection_needed || dc.reddit_connection_needed) && (
                    <div className="flex items-start gap-2 p-2.5 rounded bg-sentinel-amber/5 border border-sentinel-amber/20">
                      <AlertTriangle className="h-3.5 w-3.5 text-sentinel-amber shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[11px] font-medium text-sentinel-amber">Limited social detection</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                          {dc.twitter_connection_needed && "Twitter/X API not connected — tweets and engagement data unavailable. "}
                          {dc.reddit_connection_needed && "Reddit API not connected — Reddit discussions unavailable. "}
                          Social results rely on web search which may miss content.
                        </p>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-primary px-2 mt-1 gap-1" onClick={() => { setOpen(false); navigate("/settings"); }}>
                          <Settings className="h-3 w-3" /> Configure in Settings → Sources
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Separator className="my-2" />

              {/* Summary */}
              <div>
                <SectionHeader title="Summary" icon={Eye} sectionKey="summary" />
                {expandedSections.summary && a.summary && (
                  <div className="px-1 pb-2">
                    <p className="text-sm text-foreground leading-relaxed">{a.summary}</p>
                  </div>
                )}
              </div>

              {/* Content Breakdown */}
              {a.content_breakdown && (
                <>
                  <Separator className="my-1" />
                  <div>
                    <SectionHeader title="Content Breakdown" icon={FileText} sectionKey="breakdown" />
                    {expandedSections.breakdown && (
                      <div className="px-1 pb-2 space-y-3">
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Main Topic</p>
                          <p className="text-xs text-foreground">{a.content_breakdown.main_topic}</p>
                        </div>
                        {a.content_breakdown.key_points?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Key Points</p>
                            <ul className="space-y-1.5">
                              {a.content_breakdown.key_points.map((p: string, i: number) => (
                                <li key={i} className="text-xs text-foreground flex items-start gap-2">
                                  <span className="text-primary mt-0.5 shrink-0">•</span>
                                  <span>{p}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="flex gap-3 flex-wrap">
                          {a.content_breakdown.tone && (
                            <div>
                              <p className="text-[10px] text-muted-foreground">Tone</p>
                              <Badge variant="outline" className="text-[10px] capitalize mt-0.5">{a.content_breakdown.tone}</Badge>
                            </div>
                          )}
                          {a.content_breakdown.target_audience && (
                            <div>
                              <p className="text-[10px] text-muted-foreground">Audience</p>
                              <Badge variant="outline" className="text-[10px] capitalize mt-0.5">{a.content_breakdown.target_audience}</Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Brand Impact */}
              {a.brand_impact && (
                <>
                  <Separator className="my-1" />
                  <div>
                    <SectionHeader
                      title="Brand Impact"
                      icon={Building2}
                      sectionKey="brand"
                      badge={a.brand_impact.overall_brand_risk && a.brand_impact.overall_brand_risk !== "none" && (
                        <Badge variant="outline" className={`text-[9px] ml-2 ${impactColors[a.brand_impact.overall_brand_risk] || ""}`}>
                          {a.brand_impact.overall_brand_risk} risk
                        </Badge>
                      )}
                    />
                    {expandedSections.brand && (
                      <div className="px-1 pb-2 space-y-3">
                        {a.brand_impact.brands_mentioned?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Brands Mentioned</p>
                            <div className="space-y-2">
                              {a.brand_impact.brands_mentioned.map((b: any, i: number) => (
                                <div key={i} className="flex items-start justify-between p-2.5 rounded-md bg-muted/20">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground">{b.name}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{b.context}</p>
                                  </div>
                                  <Badge variant="outline" className={`text-[9px] capitalize shrink-0 ml-2 ${sentimentColors[b.sentiment_toward] || ""}`}>
                                    {b.sentiment_toward}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {a.brand_impact.reputation_implications && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Reputation Implications</p>
                            <p className="text-xs text-foreground leading-relaxed">{a.brand_impact.reputation_implications}</p>
                          </div>
                        )}
                        {a.brand_impact.brand_threats?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-sentinel-red uppercase tracking-wider mb-1">⚠ Threats</p>
                            <ul className="space-y-1">
                              {a.brand_impact.brand_threats.map((t: string, i: number) => (
                                <li key={i} className="text-xs text-foreground flex items-start gap-2">
                                  <span className="text-sentinel-red mt-0.5 shrink-0">•</span><span>{t}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {a.brand_impact.brand_opportunities?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-sentinel-emerald uppercase tracking-wider mb-1">✓ Opportunities</p>
                            <ul className="space-y-1">
                              {a.brand_impact.brand_opportunities.map((o: string, i: number) => (
                                <li key={i} className="text-xs text-foreground flex items-start gap-2">
                                  <span className="text-sentinel-emerald mt-0.5 shrink-0">•</span><span>{o}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Reach & Impact */}
              {a.reach_and_impact && (
                <>
                  <Separator className="my-1" />
                  <div>
                    <SectionHeader
                      title="Reach & Virality"
                      icon={Zap}
                      sectionKey="reach"
                      badge={a.reach_and_impact.virality_potential && (
                        <Badge variant="outline" className={`text-[9px] ml-2 ${impactColors[a.reach_and_impact.virality_potential] || ""}`}>
                          {a.reach_and_impact.virality_potential} virality
                        </Badge>
                      )}
                    />
                    {expandedSections.reach && (
                      <div className="px-1 pb-2 space-y-3">
                        {a.reach_and_impact.estimated_reach && (
                          <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/20">
                            <Target className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <p className="text-[10px] text-muted-foreground">Estimated Reach</p>
                              <p className="text-xs font-medium text-foreground">{a.reach_and_impact.estimated_reach}</p>
                            </div>
                          </div>
                        )}
                        {a.reach_and_impact.virality_reasoning && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Virality Assessment</p>
                            <p className="text-xs text-foreground leading-relaxed">{a.reach_and_impact.virality_reasoning}</p>
                          </div>
                        )}
                        {a.reach_and_impact.shareability_factors?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Shareability Factors</p>
                            <div className="flex flex-wrap gap-1.5">
                              {a.reach_and_impact.shareability_factors.map((f: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-[10px]">{f}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {a.reach_and_impact.audience_engagement_signals && (
                          <p className="text-xs text-muted-foreground italic">{a.reach_and_impact.audience_engagement_signals}</p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator className="my-1" />

              {/* Sentiment & Narrative */}
              <div>
                <SectionHeader title="Sentiment & Narrative" icon={ThumbsUp} sectionKey="sentiment" />
                {expandedSections.sentiment && a.sentiment && (
                  <div className="px-1 pb-2 space-y-3">
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
                      <p className="text-xs text-muted-foreground leading-relaxed">{a.sentiment.reasoning}</p>
                    )}
                    {a.narratives?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Key Narratives</p>
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

              <Separator className="my-1" />

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
                  <div className="px-1 pb-2 space-y-2">
                    <p className="text-xs text-foreground leading-relaxed">{a.potential_impact.reasoning}</p>
                    {a.potential_impact.affected_parties?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] text-muted-foreground mr-1">Affected:</span>
                        {a.potential_impact.affected_parties.map((p: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{p}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Regional */}
              {a.regional_scope && (
                <>
                  <Separator className="my-1" />
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">
                        {a.regional_scope.is_global ? "🌍 Global Relevance" : `📍 ${a.regional_scope.primary_region}`}
                      </p>
                      {a.regional_scope.relevant_regions?.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Relevant: {a.regional_scope.relevant_regions.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              <Separator className="my-1" />

              {/* Search Engine Visibility */}
              <div>
                <SectionHeader
                  title="Search Visibility"
                  icon={Search}
                  sectionKey="seo"
                  badge={sv && (
                    <Badge variant="outline" className={`text-[9px] ml-2 ${sv.is_indexed ? "text-sentinel-emerald border-sentinel-emerald/30" : "text-sentinel-amber border-sentinel-amber/30"}`}>
                      {sv.is_indexed ? "Indexed" : "Not found"}
                    </Badge>
                  )}
                />
                {expandedSections.seo && (
                  <div className="px-1 pb-2 space-y-3">
                    {sv ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2.5 rounded-md bg-muted/20">
                            <p className="text-[10px] text-muted-foreground">Indexed</p>
                            <p className="text-xs font-medium text-foreground">{sv.is_indexed ? "✅ Yes" : "❌ Not found"}</p>
                          </div>
                          {sv.search_rank && (
                            <div className="p-2.5 rounded-md bg-muted/20">
                              <p className="text-[10px] text-muted-foreground">Search Position</p>
                              <p className="text-xs font-medium text-foreground">#{sv.search_rank}</p>
                            </div>
                          )}
                        </div>
                        {sv.search_snippet && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Search Snippet</p>
                            <p className="text-xs text-foreground italic leading-relaxed bg-muted/20 p-2.5 rounded-md">"{sv.search_snippet}"</p>
                          </div>
                        )}
                        {sv.title_search_query && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Searched For</p>
                            <p className="text-xs text-foreground font-mono bg-muted/20 p-2 rounded-md break-all">"{sv.title_search_query}"</p>
                          </div>
                        )}
                        {sv.competing_results?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Competing Results</p>
                            <div className="space-y-1.5">
                              {sv.competing_results.map((r: any, i: number) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 p-2 rounded bg-muted/20 hover:bg-muted/30 cursor-pointer text-xs"
                                  onClick={() => window.open(r.url, "_blank")}
                                >
                                  <BarChart3 className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-foreground flex-1 min-w-0 truncate">{r.title}</span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">{r.domain}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">Search visibility data unavailable for this URL.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Search Discovery — How People Find This */}
              {sd && sd.verified_keywords?.length > 0 && (
                <>
                  <Separator className="my-1" />
                  <div>
                    <SectionHeader
                      title="Search Discovery — How People Find This"
                      icon={Target}
                      sectionKey="discovery"
                      badge={
                        <Badge variant="outline" className="text-[9px] ml-2">
                          {sd.surfacing_count}/{sd.total_verified} keywords surface it
                        </Badge>
                      }
                    />
                    {expandedSections.discovery && (
                      <div className="px-1 pb-2 space-y-3">
                        <p className="text-[10px] text-muted-foreground">
                          These are search terms real people would use to find this content. Verified keywords show whether the article actually appears in Google results for that term.
                        </p>
                        
                        {/* Verified Keywords */}
                        <div className="space-y-1.5">
                          {sd.verified_keywords.map((kw: any, i: number) => (
                            <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-md bg-muted/20">
                              <div className="shrink-0">
                                {kw.surfaces_article ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-sentinel-emerald" />
                                ) : (
                                  <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground">"{kw.keyword}"</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {kw.surfaces_article ? (
                                    <span className="text-[10px] text-sentinel-emerald">
                                      Rank #{kw.rank} in results
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">
                                      Not in top 10 results
                                    </span>
                                  )}
                                  {kw.competing_count > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      · {kw.competing_count} competitors
                                    </span>
                                  )}
                                </div>
                                {kw.top_competitor && !kw.surfaces_article && (
                                  <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                                    Top result: {kw.top_competitor}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Unverified / Additional Keywords */}
                        {sd.unverified_keywords?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Additional Keywords (not verified)</p>
                            <div className="flex flex-wrap gap-1.5">
                              {sd.unverified_keywords.map((kw: any, i: number) => (
                                <Badge key={i} variant="outline" className="text-[10px]">
                                  {kw.keyword}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Summary insight */}
                        <div className="p-2.5 rounded-md bg-primary/5 border border-primary/10">
                          <p className="text-[10px] text-foreground">
                            <Zap className="h-3 w-3 inline mr-1 text-primary" />
                            {sd.surfacing_count === 0
                              ? "This article doesn't rank for any tested keywords — it may be new, poorly optimized, or competing against established content."
                              : sd.surfacing_count === sd.total_verified
                                ? "This article ranks for all tested keywords — it has strong search visibility and is likely being widely discovered."
                                : `This article ranks for ${sd.surfacing_count} of ${sd.total_verified} tested keywords. People searching the other terms will find competitor content instead.`
                            }
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator className="my-1" />

              {/* Social Pickup */}
              <div>
                <SectionHeader
                  title="Social Pickup"
                  icon={Share2}
                  sectionKey="social"
                  badge={<Badge variant="outline" className="text-[9px] ml-2">{result.social_pickup.length} verified</Badge>}
                />
                {expandedSections.social && (
                  <div className="px-1 pb-2 space-y-2">
                    {result.social_pickup.length === 0 ? (
                      <div className="p-3 rounded-lg bg-muted/20 text-center">
                        <p className="text-xs text-muted-foreground">No verified social shares detected.</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {dc?.twitter_connection_needed
                            ? "⚠️ Connect Twitter/X and Reddit APIs in Settings → Sources for direct monitoring."
                            : "Social detection uses web search — some shares may not be indexed yet."}
                        </p>
                      </div>
                    ) : (
                      result.social_pickup.map((s, i) => {
                        const PIcon = platformIcons[s.platform] || Globe;
                        return (
                          <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-muted/20 hover:bg-muted/30 cursor-pointer" onClick={() => window.open(s.url, "_blank")}>
                            <PIcon className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground">{s.title}</p>
                              {s.snippet && <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{s.snippet}</p>}
                              <p className="text-[10px] text-muted-foreground/60 capitalize mt-0.5">{s.platform}</p>
                            </div>
                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <Separator className="my-1" />

              {/* Media Coverage */}
              <div>
                <SectionHeader
                  title="Media Coverage"
                  icon={Globe}
                  sectionKey="media"
                  badge={<Badge variant="outline" className="text-[9px] ml-2">{result.media_pickup.length} verified</Badge>}
                />
                {expandedSections.media && (
                  <div className="px-1 pb-2 space-y-2">
                    {result.media_pickup.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">No verified additional media coverage found.</p>
                    ) : (
                      result.media_pickup.map((m, i) => (
                        <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-muted/20 hover:bg-muted/30 cursor-pointer" onClick={() => window.open(m.url, "_blank")}>
                          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground">{m.title}</p>
                            {m.snippet && <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{m.snippet}</p>}
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{m.domain}</p>
                          </div>
                          <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <Separator className="my-1" />

              {/* Similar in Mentions */}
              <div>
                <SectionHeader
                  title="Similar in Your Mentions"
                  icon={FileText}
                  sectionKey="similar"
                  badge={<Badge variant="outline" className="text-[9px] ml-2">{result.similar_mentions?.length || 0} found</Badge>}
                />
                {expandedSections.similar && (
                  <div className="px-1 pb-2 space-y-2">
                    {(!result.similar_mentions || result.similar_mentions.length === 0) ? (
                      <p className="text-xs text-muted-foreground py-2">No similar content found in your existing mentions.</p>
                    ) : (
                      result.similar_mentions.map((m, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 p-2.5 rounded-md bg-muted/20 hover:bg-muted/30 cursor-pointer"
                          onClick={() => { setOpen(false); navigate(`/mentions/${m.id}`); }}
                        >
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground leading-relaxed">{m.content}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[9px] capitalize">{m.source}</Badge>
                              {m.sentiment && (
                                <Badge variant="outline" className={`text-[9px] capitalize ${sentimentColors[m.sentiment] || ""}`}>
                                  {m.sentiment}
                                </Badge>
                              )}
                              {m.author && <span className="text-[10px] text-muted-foreground">{m.author}</span>}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Claims */}
              {a.claims?.length > 0 && (
                <>
                  <Separator className="my-1" />
                  <div>
                    <SectionHeader title="Claims Extracted" icon={Shield} sectionKey="claims" badge={<Badge variant="outline" className="text-[9px] ml-2">{a.claims.length}</Badge>} />
                    {expandedSections.claims && (
                      <div className="px-1 pb-2 space-y-2">
                        {a.claims.map((c: any, i: number) => (
                          <div key={i} className="p-2.5 rounded-md bg-muted/20">
                            <p className="text-xs text-foreground leading-relaxed">{c.text}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge variant="outline" className="text-[9px] capitalize">{c.category}</Badge>
                              {c.verifiable && <Badge variant="outline" className="text-[9px] text-sentinel-emerald border-sentinel-emerald/30">Verifiable</Badge>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Key Entities */}
              {a.key_entities?.length > 0 && (
                <>
                  <Separator className="my-1" />
                  <div>
                    <SectionHeader title="Key Entities" icon={Users} sectionKey="entities" badge={<Badge variant="outline" className="text-[9px] ml-2">{a.key_entities.length}</Badge>} />
                    {expandedSections.entities && (
                      <div className="px-1 pb-2 space-y-1.5">
                        {a.key_entities.map((e: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-2.5 rounded-md bg-muted/20">
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
                </>
              )}

              {/* Reliability */}
              {a.reliability && (
                <>
                  <Separator className="my-1" />
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                    <Shield className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">Source Reliability: {a.reliability.score}/100</span>
                        <Badge variant="outline" className="text-[9px] capitalize">{a.reliability.source_type}</Badge>
                      </div>
                      {a.reliability.factors?.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{a.reliability.factors.join(" · ")}</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Recommended Actions */}
              {a.recommended_actions?.length > 0 && (
                <>
                  <Separator className="my-1" />
                  <Card className="p-3 bg-primary/5 border-primary/20">
                    <p className="text-xs font-semibold text-primary mb-2">💡 Recommended Actions</p>
                    <ul className="space-y-1.5">
                      {a.recommended_actions.map((action: string, i: number) => (
                        <li key={i} className="text-xs text-foreground flex items-start gap-2">
                          <span className="text-primary mt-0.5 shrink-0">•</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
