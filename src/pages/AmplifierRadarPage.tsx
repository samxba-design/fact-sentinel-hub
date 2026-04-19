import { useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useAmplifierRadar, type AmplifierProfile } from "@/hooks/useAmplifierRadar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Radio, TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Days = 1 | 7 | 30;

const IMPACT_COLORS: Record<string, string> = {
  low:      "text-muted-foreground",
  medium:   "text-sentinel-amber",
  high:     "text-orange-500",
  critical: "text-sentinel-red",
};

function impactLevel(score: number) {
  if (score >= 80) return "critical";
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function formatFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function initials(handle: string) {
  return handle.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
}

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  journalist: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  influencer: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  regulator: "bg-red-500/10 text-red-400 border-red-500/30",
  competitor: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  anonymous: "bg-muted/20 text-muted-foreground border-border",
  unknown: "bg-muted/20 text-muted-foreground border-border",
};

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "bg-sky-500/10 text-sky-400", reddit: "bg-orange-500/10 text-orange-400",
  news: "bg-blue-500/10 text-blue-400", telegram: "bg-cyan-500/10 text-cyan-400",
  youtube: "bg-red-500/10 text-red-400",
};

function TrendBadge({ t }: { t: string }) {
  if (t === "rising") return <span className="flex items-center gap-0.5 text-sentinel-red text-xs"><TrendingUp className="h-3 w-3" />Rising</span>;
  if (t === "falling") return <span className="flex items-center gap-0.5 text-emerald-500 text-xs"><TrendingDown className="h-3 w-3" />Falling</span>;
  return <span className="flex items-center gap-0.5 text-muted-foreground text-xs"><Minus className="h-3 w-3" />Stable</span>;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function AmplifierRadarPage() {
  const { currentOrg } = useOrg();
  const [days, setDays] = useState<Days>(7);
  const [accountType, setAccountType] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [minFollowers, setMinFollowers] = useState(0);
  const [selected, setSelected] = useState<AmplifierProfile | null>(null);

  const { amplifiers, loading } = useAmplifierRadar(currentOrg?.id, days, { accountType, platform, minFollowers });
  const topAlert = amplifiers.find(a => a.impactScore >= 70);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Radio className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Amplifier Radar</h1>
          <p className="text-sm text-muted-foreground">Who is driving the narrative — ranked by reach × frequency.</p>
        </div>
      </div>

      {/* High-impact alert */}
      {topAlert && (
        <Card className="border-sentinel-red/40 bg-sentinel-red/5 p-3">
          <div className="flex items-center gap-2 text-sentinel-red text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>
              <strong>{topAlert.handle}</strong> is driving {topAlert.negativeMentionCount} negative mentions
              with ~{formatFollowers(topAlert.followerCount)} followers — impact score {topAlert.impactScore}.
            </span>
          </div>
        </Card>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Period</p>
          <div className="flex gap-1">
            {([1, 7, 30] as Days[]).map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${days === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                {d === 1 ? "24h" : `${d}d`}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Account type</p>
          <select value={accountType} onChange={e => setAccountType(e.target.value)}
            className="h-9 px-2 text-xs bg-card border border-border rounded-lg text-foreground focus:outline-none">
            {["all","journalist","influencer","regulator","competitor","anonymous","unknown"].map(t => (
              <option key={t} value={t}>{t === "all" ? "All types" : t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Platform</p>
          <select value={platform} onChange={e => setPlatform(e.target.value)}
            className="h-9 px-2 text-xs bg-card border border-border rounded-lg text-foreground focus:outline-none">
            {["all","twitter","reddit","news","telegram","youtube"].map(p => (
              <option key={p} value={p}>{p === "all" ? "All platforms" : p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1 w-44">
          <p className="text-xs text-muted-foreground">Min followers: {formatFollowers(minFollowers)}</p>
          <Slider min={0} max={100000} step={1000} value={[minFollowers]} onValueChange={([v]) => setMinFollowers(v)} />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : amplifiers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Radio className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No amplifiers found. Try adjusting the filters or time window.</p>
        </div>
      ) : (
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["#","Account","Platform","Followers","Mentions","Neg%","Impact","First seen",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {amplifiers.map((a, i) => {
                  const level = impactLevel(a.impactScore);
                  return (
                    <tr key={a.handle + a.platform} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => setSelected(a)}>
                      <td className="px-4 py-3 text-muted-foreground font-medium">
                        {i < 3 ? MEDALS[i] : <span className="text-xs">#{i + 1}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                            {initials(a.handle)}
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-xs">{a.handle}</p>
                            <Badge variant="outline" className={`text-[9px] mt-0.5 ${ACCOUNT_TYPE_COLORS[a.accountType] ?? ""}`}>
                              {a.accountType}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-[10px] ${PLATFORM_COLORS[a.platform] ?? ""}`}>{a.platform}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground font-mono">{formatFollowers(a.followerCount)}</td>
                      <td className="px-4 py-3 text-xs text-foreground">{a.mentionCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-sentinel-red rounded-full" style={{ width: `${a.negativePct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{a.negativePct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-lg font-bold ${IMPACT_COLORS[level]}`}>{a.impactScore}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.firstAppeared || Date.now()), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3">
                        <TrendBadge t={a.trend} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <SheetContent className="w-[480px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                    {initials(selected.handle)}
                  </div>
                  <div>
                    <SheetTitle>{selected.handle}</SheetTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatFollowers(selected.followerCount)} followers · {selected.platform} · {selected.accountType}</p>
                  </div>
                </div>
              </SheetHeader>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { l: "Impact Score", v: String(selected.impactScore) },
                  { l: "Mentions", v: String(selected.mentionCount) },
                  { l: "Neg %", v: `${selected.negativePct}%` },
                ].map(s => (
                  <Card key={s.l} className="bg-card border-border p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{s.v}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.l}</p>
                  </Card>
                ))}
              </div>

              {selected.sampleExcerpts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Recent mentions</p>
                  {selected.sampleExcerpts.map((ex, i) => (
                    <Card key={i} className="bg-muted/20 border-border p-3">
                      <p className="text-xs text-foreground leading-relaxed">…{ex}…</p>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
