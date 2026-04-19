import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Brain, ChevronDown, ChevronRight, ExternalLink,
  CheckCircle2, XCircle, AlertCircle, HelpCircle,
  Search, Telescope, TrendingUp, TrendingDown,
  Minus, AlertTriangle, Shield, Users, Clock,
  FileText, Link2, Zap, Loader2, RefreshCw,
} from "lucide-react";

interface ThreatResearchPanelProps {
  text: string;
  watchId?: string;
  initialData?: any;
  compact?: boolean;
}

const THREAT_STYLES: Record<string, string> = {
  critical: "bg-sentinel-red/10 border-sentinel-red/30 text-sentinel-red",
  high:     "bg-orange-500/10 border-orange-500/30 text-orange-500",
  medium:   "bg-sentinel-amber/10 border-sentinel-amber/30 text-sentinel-amber",
  low:      "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
};

const VERDICT_ICONS: Record<string, React.ReactNode> = {
  confirmed:    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  likely_true:  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  unverified:   <HelpCircle className="h-3.5 w-3.5 text-sentinel-amber" />,
  disputed:     <AlertCircle className="h-3.5 w-3.5 text-orange-500" />,
  false:        <XCircle className="h-3.5 w-3.5 text-sentinel-red" />,
};

const VERDICT_LABELS: Record<string, string> = {
  confirmed:    "Confirmed",
  likely_true:  "Likely true",
  unverified:   "Unverified",
  disputed:     "Disputed",
  false:        "False",
};

const URGENCY_STYLES: Record<string, string> = {
  immediate: "text-sentinel-red",
  "24h":     "text-orange-500",
  "72h":     "text-sentinel-amber",
  monitor:   "text-muted-foreground",
};

type Stage = "idle" | "extracting" | "searching" | "scraping" | "analysing" | "synthesising" | "done" | "error";

const STAGE_LABELS: Record<Stage, string> = {
  idle:        "Click Research to analyse",
  extracting:  "Extracting entities & generating search queries…",
  searching:   "Searching web from multiple angles…",
  scraping:    "Deep-reading top sources…",
  analysing:   "Extracting intelligence from each source…",
  synthesising:"Building threat assessment…",
  done:        "Research complete",
  error:       "Research failed",
};

export default function ThreatResearchPanel({ text, watchId, initialData, compact = false }: ThreatResearchPanelProps) {
  const { currentOrg } = useOrg();
  const [stage, setStage] = useState<Stage>(initialData ? "done" : "idle");
  const [data, setData] = useState<any>(initialData ?? null);
  const [error, setError] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    factChecks: true,
    sources: false,
    spread: false,
    entities: false,
    actions: true,
  });

  function toggle(section: string) {
    setOpenSections(s => ({ ...s, [section]: !s[section] }));
  }

  // Simulated progress — we don't have streaming, so fake stages
  async function runResearch() {
    if (!text || !currentOrg) return;
    setError("");
    setData(null);

    const stages: Stage[] = ["extracting", "searching", "scraping", "analysing", "synthesising"];
    for (const s of stages) {
      setStage(s);
      await new Promise(r => setTimeout(r, 400));
    }

    try {
      const { data: result, error: fnErr } = await supabase.functions.invoke("research-topic-watch", {
        body: { text, org_id: currentOrg.id, watch_id: watchId },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (result?.error) throw new Error(result.error);
      setData(result);
      setStage("done");
    } catch (e: any) {
      setError(e.message);
      setStage("error");
    }
  }

  const synthesis = data?.synthesis;
  const threatLevel = synthesis?.threat_level ?? "low";

  if (stage === "idle") {
    return (
      <Card className={`bg-card border-border p-4 ${compact ? "" : "p-5"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Telescope className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Threat Research</span>
            <span className="text-xs text-muted-foreground">— AI crawls, fact-checks, and builds a knowledge tree</span>
          </div>
          <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={runResearch}>
            <Search className="h-3.5 w-3.5" /> Research now
          </Button>
        </div>
      </Card>
    );
  }

  if (stage !== "done" && stage !== "error") {
    return (
      <Card className="bg-card border-border p-5">
        <div className="flex items-center gap-3 mb-5">
          <Telescope className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Threat Research</span>
        </div>

        <div className="space-y-3">
          {(["extracting", "searching", "scraping", "analysing", "synthesising"] as Stage[]).map((s, i) => {
            const stages = ["extracting", "searching", "scraping", "analysing", "synthesising"];
            const currentIdx = stages.indexOf(stage);
            const thisIdx = i;
            const done = thisIdx < currentIdx;
            const active = thisIdx === currentIdx;
            return (
              <div key={s} className={`flex items-center gap-3 transition-opacity ${active || done ? "opacity-100" : "opacity-30"}`}>
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-border flex-shrink-0" />
                )}
                <span className={`text-xs ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {STAGE_LABELS[s]}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  if (stage === "error") {
    return (
      <Card className="bg-sentinel-red/5 border-sentinel-red/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-sentinel-red" />
          <span className="text-sm font-medium text-sentinel-red">Research failed</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{error}</p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={runResearch}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <Card className={`p-4 border ${THREAT_STYLES[threatLevel] ?? THREAT_STYLES.low}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4" />
              <span className="text-sm font-bold uppercase tracking-wider">{threatLevel} threat</span>
              <span className="text-[10px] text-muted-foreground ml-2">{data.sources_relevant}/{data.sources_found} relevant sources · {data.sources_scraped} deep-read</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{synthesis?.executive_summary}</p>
            {synthesis?.threat_level_reasoning && (
              <p className="text-xs text-muted-foreground mt-1 italic">{synthesis.threat_level_reasoning}</p>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 flex-shrink-0" onClick={runResearch} title="Re-run research">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {synthesis?.binance_exposure_detail && (
          <div className="mt-3 pt-3 border-t border-current/20">
            <p className="text-xs font-medium mb-1">Binance exposure</p>
            <p className="text-xs leading-relaxed">{synthesis.binance_exposure_detail}</p>
          </div>
        )}
      </Card>

      {/* Fact-checks */}
      {(data.fact_checks?.length ?? 0) > 0 && (
        <Collapsible open={openSections.factChecks} onOpenChange={() => toggle("factChecks")}>
          <CollapsibleTrigger asChild>
            <Card className="bg-card border-border p-4 cursor-pointer hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Claim Verification</span>
                  <Badge variant="outline" className="text-[10px]">{data.fact_checks.length} claims</Badge>
                </div>
                {openSections.factChecks ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </Card>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 mt-1">
              {data.fact_checks.map((fc: any, i: number) => (
                <Card key={i} className="bg-card border-border p-4">
                  <div className="flex items-start gap-2.5">
                    <div className="flex-shrink-0 mt-0.5">{VERDICT_ICONS[fc.verdict] ?? <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-foreground">{VERDICT_LABELS[fc.verdict] ?? fc.verdict}</span>
                        {fc.confidence && (
                          <span className="text-[10px] text-muted-foreground">{fc.confidence}% confidence</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-1.5 italic">"{fc.claim}"</p>
                      <p className="text-xs text-foreground leading-relaxed">{fc.assessment}</p>
                      {fc.supporting_sources?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {fc.supporting_sources.map((url: string, j: number) => (
                            <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                              <Link2 className="h-2.5 w-2.5" />
                              {(() => { try { return new URL(url).hostname.replace("www.", ""); } catch { return url.slice(0, 30); } })()}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Recommended actions */}
      {(synthesis?.recommended_actions?.length ?? 0) > 0 && (
        <Collapsible open={openSections.actions} onOpenChange={() => toggle("actions")}>
          <CollapsibleTrigger asChild>
            <Card className="bg-card border-border p-4 cursor-pointer hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Recommended Actions</span>
                  <Badge variant="outline" className="text-[10px]">{synthesis.recommended_actions.length}</Badge>
                </div>
                {openSections.actions ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </Card>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 mt-1">
              {synthesis.recommended_actions.map((a: any, i: number) => (
                <Card key={i} className="bg-card border-border px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className={`text-[10px] font-bold uppercase mt-0.5 w-14 flex-shrink-0 ${URGENCY_STYLES[a.urgency] ?? "text-muted-foreground"}`}>{a.urgency}</span>
                    <div className="flex-1">
                      <p className="text-xs text-foreground">{a.action}</p>
                      {a.owner && <p className="text-[10px] text-muted-foreground mt-0.5">→ {a.owner}</p>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Spread map */}
      {data.spread_map && (
        <Collapsible open={openSections.spread} onOpenChange={() => toggle("spread")}>
          <CollapsibleTrigger asChild>
            <Card className="bg-card border-border p-4 cursor-pointer hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Narrative Spread</span>
                  {data.spread_map.trajectory && (
                    <Badge variant="outline" className={`text-[10px] ${data.spread_map.trajectory === "accelerating" ? "text-sentinel-red border-sentinel-red/40" : data.spread_map.trajectory === "fading" ? "text-emerald-500 border-emerald-500/40" : ""}`}>
                      {data.spread_map.trajectory}
                    </Badge>
                  )}
                </div>
                {openSections.spread ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </Card>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="bg-card border-border p-4 mt-1 space-y-4">
              {data.spread_map.origin && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Origin</p>
                  <p className="text-xs text-foreground">
                    <span className="font-medium">{data.spread_map.origin.author ?? "Unknown"}</span> on {data.spread_map.origin.source ?? "unknown platform"}
                    {data.spread_map.origin.date && <span className="text-muted-foreground ml-1">· {data.spread_map.origin.date?.slice(0, 10)}</span>}
                  </p>
                </div>
              )}
              {data.spread_map.dominant_framing && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">How it's being framed</p>
                  <p className="text-xs text-foreground italic">"{data.spread_map.dominant_framing}"</p>
                </div>
              )}
              {data.spread_map.binance_narrative_exposure && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Binance framing</p>
                  <p className="text-xs text-foreground">{data.spread_map.binance_narrative_exposure}</p>
                </div>
              )}
              {data.spread_map.counter_narratives?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Counter-narratives</p>
                  <ul className="space-y-0.5">
                    {data.spread_map.counter_narratives.map((n: string, i: number) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5"><Shield className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" />{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(data.spread_map.spread_timeline?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Timeline</p>
                  <div className="space-y-2 border-l-2 border-border pl-3">
                    {data.spread_map.spread_timeline.map((t: any, i: number) => (
                      <div key={i} className="relative">
                        <div className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-primary" />
                        <div className="text-[10px] text-muted-foreground">{t.date?.slice(0, 10) ?? "?"} · {t.source}</div>
                        <div className="text-xs text-foreground">{t.amplification}</div>
                        {t.url && (
                          <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                            <ExternalLink className="h-2.5 w-2.5" />{(() => { try { return new URL(t.url).hostname.replace("www.", ""); } catch { return t.url.slice(0, 40); } })()}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Entity profiles */}
      {(data.entity_profiles?.length ?? 0) > 0 && (
        <Collapsible open={openSections.entities} onOpenChange={() => toggle("entities")}>
          <CollapsibleTrigger asChild>
            <Card className="bg-card border-border p-4 cursor-pointer hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Entity Profiles</span>
                  <Badge variant="outline" className="text-[10px]">{data.entity_profiles.length}</Badge>
                </div>
                {openSections.entities ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </Card>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
              {data.entity_profiles.map((e: any, i: number) => (
                <Card key={i} className="bg-card border-border p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-xs font-medium text-foreground">{e.name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize flex-shrink-0">{e.type}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-1.5">{e.role}</p>
                  {e.mention_count > 0 && (
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-muted-foreground">{e.mention_count} mentions:</span>
                      {e.sentiment_breakdown?.negative > 0 && <span className="text-sentinel-red">{e.sentiment_breakdown.negative} neg</span>}
                      {e.sentiment_breakdown?.positive > 0 && <span className="text-emerald-500">{e.sentiment_breakdown.positive} pos</span>}
                      {e.sentiment_breakdown?.neutral > 0 && <span className="text-muted-foreground">{e.sentiment_breakdown.neutral} neu</span>}
                    </div>
                  )}
                  {e.key_claims_about?.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {e.key_claims_about.slice(0, 2).map((c: string, j: number) => (
                        <li key={j} className="text-[10px] text-foreground flex items-start gap-1"><span className="text-muted-foreground">·</span>{c}</li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Source list */}
      {(data.source_list?.length ?? 0) > 0 && (
        <Collapsible open={openSections.sources} onOpenChange={() => toggle("sources")}>
          <CollapsibleTrigger asChild>
            <Card className="bg-card border-border p-4 cursor-pointer hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Source Intelligence</span>
                  <Badge variant="outline" className="text-[10px]">{data.source_list.length} sources</Badge>
                </div>
                {openSections.sources ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </Card>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 mt-1">
              {data.source_list.map((s: any, i: number) => (
                <Card key={i} className="bg-card border-border p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:underline flex items-center gap-1 leading-snug">
                      {s.headline ?? s.title}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                    <Badge variant="outline" className="text-[10px] capitalize flex-shrink-0">{s.source}</Badge>
                  </div>
                  {s.publication_date && <p className="text-[10px] text-muted-foreground mb-1">{s.publication_date?.slice(0, 10)}{s.author ? ` · ${s.author}` : ""}</p>}
                  {s.credibility_note && <p className="text-[10px] text-muted-foreground italic mb-1.5">{s.credibility_note}</p>}
                  {s.key_facts?.length > 0 && (
                    <ul className="space-y-0.5 mb-1.5">
                      {s.key_facts.slice(0, 3).map((f: string, j: number) => (
                        <li key={j} className="text-[10px] text-foreground flex items-start gap-1">
                          <span className="text-muted-foreground mt-0.5">·</span>{f}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.binance_mentions?.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-border">
                      <p className="text-[10px] font-medium text-primary mb-0.5">Binance mentions:</p>
                      {s.binance_mentions.slice(0, 1).map((m: string, j: number) => (
                        <p key={j} className="text-[10px] text-muted-foreground italic">"{m.slice(0, 200)}"</p>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {s.corroborates?.length > 0 && <span className="text-[10px] text-emerald-500">✓ corroborates</span>}
                    {s.contradicts?.length > 0 && <span className="text-[10px] text-sentinel-red">✗ contradicts</span>}
                    {s.adds?.length > 0 && <span className="text-[10px] text-primary">+ adds new info</span>}
                  </div>
                </Card>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Key unknowns + monitoring keywords */}
      {(synthesis?.key_unknowns?.length > 0 || synthesis?.monitoring_keywords?.length > 0) && (
        <Card className="bg-card border-border p-4 space-y-3">
          {synthesis?.key_unknowns?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                <HelpCircle className="h-3 w-3" /> Key unknowns
              </p>
              <ul className="space-y-0.5">
                {synthesis.key_unknowns.map((u: string, i: number) => (
                  <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                    <span className="text-muted-foreground flex-shrink-0 mt-0.5">?</span>{u}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {synthesis?.monitoring_keywords?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                <Search className="h-3 w-3" /> Additional terms to monitor
              </p>
              <div className="flex flex-wrap gap-1">
                {synthesis.monitoring_keywords.map((k: string, i: number) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-muted/40 text-foreground rounded-full border border-border">{k}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <p className="text-[10px] text-muted-foreground text-right">
        Research generated {data.generated_at ? new Date(data.generated_at).toLocaleString() : "just now"} · {data.sources_found} sources found · {data.sources_scraped} deep-read
      </p>
    </div>
  );
}
