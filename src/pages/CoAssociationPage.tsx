import { useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useCoAssociation, type CoAssociationEntity } from "@/hooks/useCoAssociation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Slider } from "@/components/ui/slider";

const RISK_STYLES: Record<string, string> = {
  critical: "text-sentinel-red border-sentinel-red/40 bg-sentinel-red/10 animate-pulse",
  high:     "text-orange-500 border-orange-500/40 bg-orange-500/10",
  elevated: "text-sentinel-amber border-sentinel-amber/40 bg-sentinel-amber/10",
  low:      "text-muted-foreground border-border bg-muted/20",
};

const CATEGORY_ICONS: Record<string, string> = {
  competitor: "🏢", coin: "🪙", person: "👤", regulator: "🏛", event: "📅", unknown: "🔗",
};

function TrendIcon({ t }: { t: string }) {
  if (t === "rising") return <TrendingUp className="h-3 w-3 text-sentinel-red" />;
  if (t === "falling") return <TrendingDown className="h-3 w-3 text-emerald-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function AssociationCard({ entity }: { entity: CoAssociationEntity }) {
  const [expanded, setExpanded] = useState(false);
  const riskStyle = RISK_STYLES[entity.riskLevel];

  return (
    <Card className={`border p-4 space-y-3 ${entity.riskLevel === "critical" ? "border-sentinel-red/40" : "border-border"} bg-card`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{CATEGORY_ICONS[entity.category] ?? "🔗"}</span>
          <div>
            <p className="font-bold text-sm text-foreground capitalize">{entity.entity}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{entity.category}</p>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] capitalize ${riskStyle}`}>{entity.riskLevel}</Badge>
      </div>

      {/* Co-occurrence + trend */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground">{entity.coOccurrences}</span>
          <span className="text-muted-foreground">co-occurrences</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <TrendIcon t={entity.trend} />
          <span className="capitalize">{entity.trend}</span>
        </div>
      </div>

      {/* Sentiment bar */}
      <div>
        <div className="flex h-1.5 rounded-full overflow-hidden w-full">
          <div className="bg-emerald-500" style={{ width: `${entity.positivePct}%` }} />
          <div className="bg-muted-foreground/30" style={{ width: `${entity.neutralPct}%` }} />
          <div className="bg-sentinel-red" style={{ width: `${entity.negativePct}%` }} />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
          <span>{entity.positivePct}% pos</span>
          <span>{entity.negativePct}% neg</span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        First seen together {formatDistanceToNow(new Date(entity.firstSeen), { addSuffix: true })}
      </p>

      {entity.sampleExcerpts.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Hide excerpts" : "Show excerpts"}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {entity.sampleExcerpts.map((ex, i) => (
                <p key={i} className="text-[10px] text-muted-foreground bg-muted/30 rounded p-1.5 leading-relaxed">…{ex}…</p>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function CoAssociationPage() {
  const { currentOrg } = useOrg();
  const [days, setDays] = useState(30);
  const [minCoOcc, setMinCoOcc] = useState(3);
  const { entities, risingRisks, loading } = useCoAssociation(currentOrg?.id, days, minCoOcc);

  const criticals = entities.filter(e => e.riskLevel === "critical");
  const highs = entities.filter(e => e.riskLevel === "high");

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Link2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Guilt-by-Association Signals</h1>
          <p className="text-sm text-muted-foreground">What keeps appearing alongside your brand — before it becomes a direct threat.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-6 items-end">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Time window</p>
          <div className="flex gap-1">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${days === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 w-48">
          <p className="text-xs text-muted-foreground">Min co-occurrences: <span className="text-foreground font-medium">{minCoOcc}</span></p>
          <Slider min={2} max={20} step={1} value={[minCoOcc]} onValueChange={([v]) => setMinCoOcc(v)} />
        </div>
      </div>

      {/* Alert banner for criticals */}
      {criticals.length > 0 && (
        <Card className="border-sentinel-red/40 bg-sentinel-red/5 p-4">
          <div className="flex items-center gap-2 text-sentinel-red text-sm font-medium">
            <span>⚠</span>
            <span>{criticals.length} critical association{criticals.length > 1 ? "s" : ""} detected:</span>
            <span className="font-bold">{criticals.map(e => e.entity).join(", ")}</span>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : entities.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Link2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No significant co-occurrences found. Try lowering the minimum threshold or expanding the time window.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {entities.map(e => <AssociationCard key={e.entity} entity={e} />)}
          </div>

          {/* Rising risks */}
          {risingRisks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-sentinel-red" /> Rising Risks
                <span className="text-xs text-muted-foreground font-normal">— entities whose co-occurrence increased most this week</span>
              </h2>
              <div className="space-y-2">
                {risingRisks.map((e, i) => (
                  <div key={e.entity} className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-2.5">
                    <span className="text-sm font-bold text-muted-foreground w-5">#{i + 1}</span>
                    <span className="text-base">{CATEGORY_ICONS[e.category]}</span>
                    <span className="font-semibold text-sm text-foreground capitalize flex-1">{e.entity}</span>
                    <span className="text-xs text-muted-foreground">{e.coOccurrences} co-occurrences</span>
                    <Badge variant="outline" className={`text-[10px] capitalize ${RISK_STYLES[e.riskLevel]}`}>{e.riskLevel}</Badge>
                    <TrendingUp className="h-3.5 w-3.5 text-sentinel-red" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
