import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ChevronDown, ChevronRight, Target, Search, Share2, Globe, ExternalLink,
  Shield, AlertTriangle, Building2, Zap, FileText, Users, Eye, CheckCircle2,
  Minus, ThumbsUp, ThumbsDown, BarChart3, MapPin, Hash, Lock,
} from "lucide-react";

interface MentionDetailedViewProps {
  flags: any;
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

export default function MentionDetailedView({ flags }: MentionDetailedViewProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    breakdown: true, brand: false, reach: false, discovery: true,
    seo: false, social: false, media: false, claims: false,
    entities: false, reliability: false, actions: false, impact: true,
  });

  const hasDetailedData = flags?.content_breakdown || flags?.brand_impact || flags?.search_discovery ||
    flags?.claims?.length > 0 || flags?.key_entities?.length > 0 || flags?.social_pickup?.length > 0 ||
    flags?.media_pickup?.length > 0 || flags?.reach_and_impact || flags?.search_visibility ||
    flags?.potential_impact || flags?.recommended_actions?.length > 0;

  if (!hasDetailedData) return null;

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const SectionHeader = ({ title, icon: Icon, sectionKey, badge }: { title: string; icon: any; sectionKey: string; badge?: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => toggle(sectionKey)}
      className="flex items-center justify-between w-full py-2 px-1 rounded-md hover:bg-muted/30 transition-colors group"
    >
      <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-primary" /> {title}
        {badge}
      </span>
      {expanded[sectionKey]
        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      }
    </button>
  );

  const sd = flags.search_discovery;
  const sv = flags.search_visibility;
  const bi = flags.brand_impact;
  const ri = flags.reach_and_impact;
  const pi = flags.potential_impact;
  const cb = flags.content_breakdown;

  return (
    <Card className="bg-card border-border p-5 space-y-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" /> Detailed Scan Intelligence
        </h3>
        {flags.scanned_at && (
          <span className="text-[10px] text-muted-foreground">
            Scanned {new Date(flags.scanned_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Content Breakdown */}
      {cb && (
        <>
          <SectionHeader title="Content Breakdown" icon={FileText} sectionKey="breakdown" />
          {expanded.breakdown && (
            <div className="px-1 pb-2 space-y-2">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Main Topic</p>
                <p className="text-xs text-foreground">{cb.main_topic}</p>
              </div>
              {cb.key_points?.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Key Points</p>
                  <ul className="space-y-1">
                    {cb.key_points.map((p: string, i: number) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span><span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-3 flex-wrap">
                {cb.tone && <Badge variant="outline" className="text-[10px] capitalize">{cb.tone}</Badge>}
                {cb.target_audience && <Badge variant="outline" className="text-[10px]">{cb.target_audience}</Badge>}
              </div>
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Potential Impact */}
      {pi && (
        <>
          <SectionHeader
            title="Potential Impact"
            icon={AlertTriangle}
            sectionKey="impact"
            badge={pi.level && <Badge variant="outline" className={`text-[9px] ml-2 ${impactColors[pi.level] || ""}`}>{pi.level}</Badge>}
          />
          {expanded.impact && (
            <div className="px-1 pb-2 space-y-2">
              <p className="text-xs text-foreground leading-relaxed">{pi.reasoning}</p>
              {pi.affected_parties?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-muted-foreground mr-1">Affected:</span>
                  {pi.affected_parties.map((p: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{p}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Brand Impact */}
      {bi && (
        <>
          <SectionHeader
            title="Brand Impact"
            icon={Building2}
            sectionKey="brand"
            badge={bi.overall_brand_risk && bi.overall_brand_risk !== "none" && (
              <Badge variant="outline" className={`text-[9px] ml-2 ${impactColors[bi.overall_brand_risk] || ""}`}>{bi.overall_brand_risk} risk</Badge>
            )}
          />
          {expanded.brand && (
            <div className="px-1 pb-2 space-y-2">
              {bi.brands_mentioned?.length > 0 && bi.brands_mentioned.map((b: any, i: number) => (
                <div key={i} className="flex items-start justify-between p-2 rounded-md bg-muted/20">
                  <div>
                    <p className="text-xs font-medium text-foreground">{b.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{b.context}</p>
                  </div>
                  <Badge variant="outline" className={`text-[9px] capitalize ${sentimentColors[b.sentiment_toward] || ""}`}>{b.sentiment_toward}</Badge>
                </div>
              ))}
              {bi.reputation_implications && <p className="text-xs text-foreground">{bi.reputation_implications}</p>}
              {bi.brand_threats?.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-sentinel-red uppercase mb-1">⚠ Threats</p>
                  <ul className="space-y-1">
                    {bi.brand_threats.map((t: string, i: number) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="text-sentinel-red mt-0.5 shrink-0">•</span><span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Reach & Virality */}
      {ri && (
        <>
          <SectionHeader
            title="Reach & Virality"
            icon={Zap}
            sectionKey="reach"
            badge={ri.virality_potential && <Badge variant="outline" className={`text-[9px] ml-2 ${impactColors[ri.virality_potential] || ""}`}>{ri.virality_potential} virality</Badge>}
          />
          {expanded.reach && (
            <div className="px-1 pb-2 space-y-2">
              {ri.estimated_reach && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20">
                  <Target className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Estimated Reach</p>
                    <p className="text-xs font-medium text-foreground">{ri.estimated_reach}</p>
                  </div>
                </div>
              )}
              {ri.virality_reasoning && <p className="text-xs text-foreground">{ri.virality_reasoning}</p>}
              {ri.shareability_factors?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {ri.shareability_factors.map((f: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{f}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Search Discovery */}
      {sd && sd.verified_keywords?.length > 0 && (
        <>
          <SectionHeader
            title="Search Discovery — How People Find This"
            icon={Target}
            sectionKey="discovery"
            badge={<Badge variant="outline" className="text-[9px] ml-2">{sd.surfacing_count}/{sd.total_verified} keywords</Badge>}
          />
          {expanded.discovery && (
            <div className="px-1 pb-2 space-y-2">
              <p className="text-[10px] text-muted-foreground">
                Search terms people use to find this content. Verified against actual Google results.
              </p>
              <div className="space-y-1.5">
                {sd.verified_keywords.map((kw: any, i: number) => (
                  <div key={i} className="flex items-center gap-2.5 p-2 rounded-md bg-muted/20">
                    {kw.surfaces_article ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-sentinel-emerald shrink-0" />
                    ) : kw.surfaces_domain ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-sentinel-amber shrink-0" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">"{kw.keyword}"</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {kw.surfaces_article ? (
                          <span className="text-[10px] text-sentinel-emerald">Exact article at rank #{kw.rank}</span>
                        ) : kw.surfaces_domain ? (
                          <span className="text-[10px] text-amber-500">Site appears at #{kw.rank} — different page</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Not in top 10</span>
                        )}
                        {kw.competing_count > 0 && (
                          <span className="text-[10px] text-muted-foreground">· {kw.competing_count} competitors</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {sd.unverified_keywords?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {sd.unverified_keywords.map((kw: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{kw.keyword}</Badge>
                  ))}
                </div>
              )}
              <div className="p-2 rounded-md bg-primary/5 border border-primary/10">
                <p className="text-[10px] text-foreground">
                  <Zap className="h-3 w-3 inline mr-1 text-primary" />
                  {sd.surfacing_count === 0
                    ? "This article doesn't rank for any tested keywords."
                    : sd.surfacing_count === sd.total_verified
                      ? "Strong search visibility — ranks for all tested keywords."
                      : `Ranks for ${sd.surfacing_count} of ${sd.total_verified} tested keywords.`
                  }
                </p>
              </div>
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Search Visibility */}
      {sv && (
        <>
          <SectionHeader
            title="Search Visibility"
            icon={Search}
            sectionKey="seo"
            badge={<Badge variant="outline" className={`text-[9px] ml-2 ${sv.is_indexed ? "text-sentinel-emerald border-sentinel-emerald/30" : "text-sentinel-amber border-sentinel-amber/30"}`}>{sv.is_indexed ? "Indexed" : "Not found"}</Badge>}
          />
          {expanded.seo && (
            <div className="px-1 pb-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-md bg-muted/20">
                  <p className="text-[10px] text-muted-foreground">Indexed</p>
                  <p className="text-xs font-medium text-foreground">{sv.is_indexed ? "✅ Yes" : "❌ No"}</p>
                </div>
                {sv.search_rank && (
                  <div className="p-2 rounded-md bg-muted/20">
                    <p className="text-[10px] text-muted-foreground">Position</p>
                    <p className="text-xs font-medium text-foreground">#{sv.search_rank}</p>
                  </div>
                )}
              </div>
              {sv.competing_results?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase">Competing Results</p>
                  {sv.competing_results.slice(0, 3).map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-muted/20 text-xs cursor-pointer hover:bg-muted/30" onClick={() => window.open(r.url, "_blank")}>
                      <span className="text-foreground flex-1 truncate">{r.title}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{r.domain}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Social Pickup */}
      {flags.social_pickup?.length > 0 && (
        <>
          <SectionHeader title="Social Pickup" icon={Share2} sectionKey="social" badge={<Badge variant="outline" className="text-[9px] ml-2">{flags.social_pickup.length}</Badge>} />
          {expanded.social && (
            <div className="px-1 pb-2 space-y-1.5">
              {flags.social_pickup.map((s: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/20 hover:bg-muted/30 cursor-pointer" onClick={() => window.open(s.url, "_blank")}>
                  <Globe className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{s.title}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{s.platform}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Media Coverage */}
      {flags.media_pickup?.length > 0 && (
        <>
          <SectionHeader title="Media Coverage" icon={Globe} sectionKey="media" badge={<Badge variant="outline" className="text-[9px] ml-2">{flags.media_pickup.length}</Badge>} />
          {expanded.media && (
            <div className="px-1 pb-2 space-y-1.5">
              {flags.media_pickup.map((m: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/20 hover:bg-muted/30 cursor-pointer" onClick={() => window.open(m.url, "_blank")}>
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{m.title}</p>
                    <p className="text-[10px] text-muted-foreground">{m.domain}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Claims */}
      {flags.claims?.length > 0 && (
        <>
          <SectionHeader title="Claims Extracted" icon={Shield} sectionKey="claims" badge={<Badge variant="outline" className="text-[9px] ml-2">{flags.claims.length}</Badge>} />
          {expanded.claims && (
            <div className="px-1 pb-2 space-y-1.5">
              {flags.claims.map((c: any, i: number) => (
                <div key={i} className="p-2 rounded-md bg-muted/20">
                  <p className="text-xs text-foreground">{c.text}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[9px] capitalize">{c.category}</Badge>
                    {c.verifiable && <Badge variant="outline" className="text-[9px] text-sentinel-emerald border-sentinel-emerald/30">Verifiable</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Key Entities */}
      {flags.key_entities?.length > 0 && (
        <>
          <SectionHeader title="Key Entities" icon={Users} sectionKey="entities" badge={<Badge variant="outline" className="text-[9px] ml-2">{flags.key_entities.length}</Badge>} />
          {expanded.entities && (
            <div className="px-1 pb-2 space-y-1.5">
              {flags.key_entities.map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/20">
                  <div>
                    <p className="text-xs font-medium text-foreground">{e.name}</p>
                    <p className="text-[10px] text-muted-foreground">{e.role}</p>
                  </div>
                  <Badge variant="outline" className={`text-[9px] capitalize ${sentimentColors[e.sentiment_toward] || ""}`}>{e.sentiment_toward}</Badge>
                </div>
              ))}
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Reliability */}
      {flags.reliability && (
        <>
          <SectionHeader title="Source Reliability" icon={Shield} sectionKey="reliability" />
          {expanded.reliability && (
            <div className="px-1 pb-2">
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20">
                <Shield className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <span className="text-xs font-medium text-foreground">Score: {flags.reliability.score}/100</span>
                  <Badge variant="outline" className="text-[9px] capitalize ml-2">{flags.reliability.source_type}</Badge>
                  {flags.reliability.factors?.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{flags.reliability.factors.join(" · ")}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <Separator className="my-1" />
        </>
      )}

      {/* Regional Scope */}
      {flags.regional_scope && (
        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">
              {flags.regional_scope.is_global ? "🌍 Global" : `📍 ${flags.regional_scope.primary_region}`}
            </p>
            {flags.regional_scope.relevant_regions?.length > 0 && (
              <p className="text-[10px] text-muted-foreground">{flags.regional_scope.relevant_regions.join(", ")}</p>
            )}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {flags.recommended_actions?.length > 0 && (
        <>
          <Separator className="my-1" />
          <SectionHeader title="Recommended Actions" icon={Zap} sectionKey="actions" />
          {expanded.actions && (
            <div className="px-1 pb-2">
              <div className="p-2.5 rounded-md bg-primary/5 border border-primary/10">
                <ul className="space-y-1">
                  {flags.recommended_actions.map((a: string, i: number) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5 shrink-0">•</span><span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
