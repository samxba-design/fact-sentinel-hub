import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Shield, Plus, Search, CheckCircle2, RefreshCw, Eye,
  AlertTriangle, Users, Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import PageGuide from "@/components/PageGuide";
import AddEntityDialog from "@/components/entities/AddEntityDialog";
import {
  PLATFORMS, RISK_TYPES, STATUSES, SOURCE_TYPES,
} from "@/lib/entityConstants";

// ── Types ───────────────────────────────────────────────────────────
interface EntityRecord {
  id: string;
  org_id: string;
  display_name: string | null;
  handle: string | null;
  url: string | null;
  platform: string | null;
  source_type: string | null;
  risk_type: string | null;
  severity: string | null;
  status: string | null;
  follower_count: number | null;
  verified: boolean | null;
  tags: string[] | null;
  enriched_at: string | null;
  created_at: string;
  monitoring_intent: string | null;
  alert_enabled: boolean | null;
}

// ── Helpers ─────────────────────────────────────────────────────────
const platformIcon = (platform: string | null) => {
  const p = PLATFORMS.find(x => x.value === platform);
  return p ? p.icon : "•";
};

const riskTypeColor = (risk: string | null) => {
  const r = RISK_TYPES.find(x => x.value === risk);
  return r ? r.color : "text-muted-foreground";
};

const riskTypeLabel = (risk: string | null) => {
  const r = RISK_TYPES.find(x => x.value === risk);
  return r ? r.label : risk ?? "—";
};

const sourceTypeLabel = (s: string | null) => {
  const t = SOURCE_TYPES.find(x => x.value === s);
  return t ? t.label : s ?? "—";
};

const statusLabel = (s: string | null) => {
  const t = STATUSES.find(x => x.value === s);
  return t ? t.label : s ?? "—";
};

const statusColor = (s: string | null) => {
  const t = STATUSES.find(x => x.value === s);
  return t ? t.color : "text-muted-foreground";
};

const severityColor = (sev: string | null) => {
  switch (sev) {
    case "critical": return "bg-red-500/10 text-red-400 border-red-500/20";
    case "high":     return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    case "moderate": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "low":      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    default:         return "bg-muted/50 text-muted-foreground border-border";
  }
};

const displayLabel = (e: EntityRecord) => {
  if (e.display_name) return e.display_name;
  if (e.handle) return `@${e.handle}`;
  if (e.url) return e.url.length > 30 ? e.url.slice(0, 30) + "…" : e.url;
  return "Unknown";
};

// ── RISK_TYPE filter options (most common) ──────────────────────────
const RISK_FILTER_OPTIONS = [
  { value: "all",                 label: "All risk types" },
  { value: "none",                label: "Benign / No risk" },
  { value: "monitor_only",        label: "Monitor only" },
  { value: "misleading",          label: "Misleading" },
  { value: "false_info",          label: "False information" },
  { value: "disinformation",      label: "Disinformation" },
  { value: "malicious",           label: "Malicious" },
  { value: "impersonation",       label: "Impersonation" },
  { value: "scam_fraud",          label: "Scam / Fraud" },
  { value: "brand_abuse",         label: "Brand abuse" },
  { value: "coordinated_attack",  label: "Coordinated attack" },
];

// ── EntityCard ──────────────────────────────────────────────────────
function EntityCard({
  entity,
  onView,
  onEnrich,
  enriching,
}: {
  entity: EntityRecord;
  onView: () => void;
  onEnrich: () => void;
  enriching: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const label = displayLabel(entity);
  const icon = platformIcon(entity.platform);

  return (
    <Card
      className="p-4 cursor-pointer hover:border-primary/30 transition-all relative group"
      onClick={onView}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center text-xl shrink-0 select-none">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate">{label}</p>
            {entity.verified && (
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            )}
          </div>
          {entity.handle && entity.display_name && (
            <p className="text-xs text-muted-foreground truncate">@{entity.handle}</p>
          )}
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {entity.source_type && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
            {sourceTypeLabel(entity.source_type)}
          </Badge>
        )}
        {entity.risk_type && (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${riskTypeColor(entity.risk_type)}`}>
            {riskTypeLabel(entity.risk_type)}
          </Badge>
        )}
        {entity.severity && (
          <span className={`inline-flex items-center rounded-full border px-1.5 text-[10px] font-medium h-5 ${severityColor(entity.severity)}`}>
            {entity.severity}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span className={statusColor(entity.status)}>{statusLabel(entity.status)}</span>
        {entity.follower_count != null && (
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {entity.follower_count.toLocaleString()}
          </span>
        )}
      </div>

      {/* Tags */}
      {entity.tags && entity.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {entity.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="text-[10px] bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5"
            >
              {tag}
            </span>
          ))}
          {entity.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{entity.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        {entity.enriched_at
          ? `Enriched ${formatDistanceToNow(new Date(entity.enriched_at), { addSuffix: true })}`
          : `Added ${formatDistanceToNow(new Date(entity.created_at), { addSuffix: true })}`}
      </div>

      {/* Hover overlay */}
      {hovered && (
        <div
          className="absolute inset-0 bg-background/80 backdrop-blur-[1px] rounded-[inherit] flex items-center justify-center gap-2"
          onClick={e => e.stopPropagation()}
        >
          <Button size="sm" variant="default" className="h-8 gap-1.5" onClick={(e) => { e.stopPropagation(); onView(); }}>
            <Eye className="h-3.5 w-3.5" /> View
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={enriching}
            onClick={(e) => { e.stopPropagation(); onEnrich(); }}
          >
            {enriching
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Enrich
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function EntityRecordsPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  // ── Fetch ──────────────────────────────────────────────────────────
  const fetchEntities = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("entity_records")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Failed to load entities", description: error.message, variant: "destructive" });
    } else {
      setEntities((data as EntityRecord[]) ?? []);
    }
    setLoading(false);
  }, [currentOrg, toast]);

  useEffect(() => { fetchEntities(); }, [fetchEntities]);

  // ── Filter + sort ─────────────────────────────────────────────────
  const filtered = entities
    .filter(e => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (severityFilter !== "all" && e.severity !== severityFilter) return false;
      if (riskFilter !== "all" && e.risk_type !== riskFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const name = displayLabel(e).toLowerCase();
        const handle = (e.handle ?? "").toLowerCase();
        const url = (e.url ?? "").toLowerCase();
        if (!name.includes(q) && !handle.includes(q) && !url.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "name") return displayLabel(a).localeCompare(displayLabel(b));
      if (sortBy === "severity") {
        const order = { critical: 0, high: 1, moderate: 2, low: 3 };
        const sa = order[a.severity as keyof typeof order] ?? 4;
        const sb = order[b.severity as keyof typeof order] ?? 4;
        return sa - sb;
      }
      return 0;
    });

  // ── Stats ─────────────────────────────────────────────────────────
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const totalCount = entities.length;
  const criticalCount = entities.filter(e => e.severity === "critical").length;
  const underReviewCount = entities.filter(e => e.status === "under_review").length;
  const recentCount = entities.filter(e => new Date(e.created_at).getTime() >= sevenDaysAgo).length;

  // ── Enrich ────────────────────────────────────────────────────────
  const handleEnrich = async (e: EntityRecord) => {
    setEnrichingId(e.id);
    try {
      await supabase.functions.invoke("enrich-entity", {
        body: { entity_id: e.id, url: e.url, platform: e.platform, handle: e.handle },
      });
      await fetchEntities();
      toast({ title: "Enrich complete", description: `${displayLabel(e)} has been re-enriched.` });
    } catch (err: any) {
      toast({ title: "Enrich failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setEnrichingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Entity Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">Manually tracked accounts, sources, and actors</p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Entity
        </Button>
      </div>

      {/* ── PageGuide ── */}
      <PageGuide
        title="Entity Intelligence"
        subtitle="Track and classify accounts, influencers, and threat actors manually."
        steps={[
          {
            icon: <Plus className="h-3.5 w-3.5 text-primary" />,
            title: "Add an entity",
            description: "Manually add any account, domain, or source you want to monitor.",
          },
          {
            icon: <RefreshCw className="h-3.5 w-3.5 text-primary" />,
            title: "Enrich with AI",
            description: "AI analyzes the profile and suggests risk type, tags, and flags.",
          },
          {
            icon: <AlertTriangle className="h-3.5 w-3.5 text-primary" />,
            title: "Classify & act",
            description: "Assign severity, status, and action recommendations to each entity.",
          },
        ]}
        tip="Use watchlist presets when adding entities to quickly set monitoring intent and severity."
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total tracked",   value: totalCount,      icon: Shield,        color: "text-primary" },
          { label: "Critical",        value: criticalCount,   icon: AlertTriangle, color: "text-red-400" },
          { label: "Under review",    value: underReviewCount,icon: Clock,         color: "text-amber-400" },
          { label: "Added (7 days)",  value: recentCount,     icon: Plus,          color: "text-emerald-400" },
        ].map(stat => (
          <Card key={stat.label} className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <stat.icon className={`h-4.5 w-4.5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search name, handle, URL…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>

        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue placeholder="Risk type" />
          </SelectTrigger>
          <SelectContent>
            {RISK_FILTER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="severity">Severity</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Shield className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">No entities found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter !== "all" || severityFilter !== "all" || riskFilter !== "all"
                ? "Try adjusting your filters."
                : "Add your first entity to start tracking."}
            </p>
          </div>
          {!search && statusFilter === "all" && severityFilter === "all" && riskFilter === "all" && (
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Entity
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(e => (
            <EntityCard
              key={e.id}
              entity={e}
              onView={() => navigate(`/entities/${e.id}`)}
              onEnrich={() => handleEnrich(e)}
              enriching={enrichingId === e.id}
            />
          ))}
        </div>
      )}

      {/* ── Add dialog ── */}
      <AddEntityDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={fetchEntities}
      />
    </div>
  );
}
