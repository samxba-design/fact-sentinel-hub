import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Zap, AlertTriangle, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import PageGuide from "@/components/PageGuide";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";

// Rough lat/lng to SVG coordinate mapping for a 800x400 equirectangular projection
const REGION_COORDS: Record<string, { x: number; y: number; label: string }> = {
  "us": { x: 180, y: 160, label: "United States" },
  "uk": { x: 380, y: 120, label: "United Kingdom" },
  "eu": { x: 400, y: 135, label: "Europe" },
  "india": { x: 530, y: 195, label: "India" },
  "china": { x: 580, y: 160, label: "China" },
  "japan": { x: 640, y: 155, label: "Japan" },
  "australia": { x: 630, y: 310, label: "Australia" },
  "brazil": { x: 260, y: 280, label: "Brazil" },
  "canada": { x: 190, y: 110, label: "Canada" },
  "africa": { x: 410, y: 240, label: "Africa" },
  "middle_east": { x: 460, y: 185, label: "Middle East" },
  "southeast_asia": { x: 590, y: 220, label: "SE Asia" },
  "russia": { x: 500, y: 100, label: "Russia" },
  "mexico": { x: 160, y: 200, label: "Mexico" },
  "south_america": { x: 240, y: 310, label: "South America" },
};

// Infer region from mention content/source heuristics
function inferRegion(mention: any): string {
  const text = ((mention.content || "") + " " + (mention.source || "") + " " + (mention.author_name || "")).toLowerCase();
  if (/india|mumbai|delhi|bangalore/i.test(text)) return "india";
  if (/china|beijing|shanghai/i.test(text)) return "china";
  if (/japan|tokyo/i.test(text)) return "japan";
  if (/australia|sydney|melbourne/i.test(text)) return "australia";
  if (/brazil|são paulo|rio/i.test(text)) return "brazil";
  if (/uk|london|britain|england/i.test(text)) return "uk";
  if (/germany|france|spain|italy|europe|berlin|paris/i.test(text)) return "eu";
  if (/canada|toronto|vancouver/i.test(text)) return "canada";
  if (/russia|moscow/i.test(text)) return "russia";
  if (/mexico|mexico city/i.test(text)) return "mexico";
  if (/dubai|saudi|iran|iraq|middle east/i.test(text)) return "middle_east";
  if (/nigeria|kenya|south africa|africa/i.test(text)) return "africa";
  if (/thailand|vietnam|philippines|indonesia|malaysia/i.test(text)) return "southeast_asia";
  if (/argentina|chile|colombia|peru/i.test(text)) return "south_america";
  // Default to US for English sources
  return "us";
}

interface RegionData {
  region: string;
  total: number;
  negative: number;
  critical: number;
  coords: { x: number; y: number; label: string };
}

export default function ThreatMapPage() {
  const { currentOrg } = useOrg();
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState<RegionData[]>([]);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [pulseKeys, setPulseKeys] = useState<number>(0);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    supabase
      .from("mentions")
      .select("content, source, author_name, sentiment_label, severity")
      .eq("org_id", currentOrg.id)
      .eq("mention_type", "brand")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        const items = data || [];
        const regionMap: Record<string, { total: number; negative: number; critical: number }> = {};

        items.forEach(m => {
          const r = inferRegion(m);
          if (!regionMap[r]) regionMap[r] = { total: 0, negative: 0, critical: 0 };
          regionMap[r].total++;
          if (m.sentiment_label === "negative") regionMap[r].negative++;
          if (m.severity === "critical") regionMap[r].critical++;
        });

        const result: RegionData[] = Object.entries(regionMap)
          .filter(([key]) => REGION_COORDS[key])
          .map(([key, val]) => ({
            region: key,
            ...val,
            coords: REGION_COORDS[key],
          }))
          .sort((a, b) => b.total - a.total);

        setRegions(result);
        setLoading(false);
      });
  }, [currentOrg]);

  // Pulse animation cycle
  useEffect(() => {
    const interval = setInterval(() => setPulseKeys(k => k + 1), 3000);
    return () => clearInterval(interval);
  }, []);

  const maxTotal = Math.max(...regions.map(r => r.total), 1);
  const totalThreats = regions.reduce((s, r) => s + r.critical, 0);
  const totalNegative = regions.reduce((s, r) => s + r.negative, 0);
  const topRegion = regions[0];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
      <PageGuide
        title="Threat Map — Geographic distribution"
        subtitle="See where brand mentions are coming from geographically. Competitor mentions excluded."
        steps={[
          { icon: <Globe className="h-4 w-4 text-primary" />, title: "Region hotspots", description: "Larger dots = more mentions from that region. Red tint = higher negative sentiment." },
          { icon: <AlertTriangle className="h-4 w-4 text-primary" />, title: "Regional risk", description: "Identify if a negative narrative is concentrated in a specific market or geography." },
        ]}
        tip="Region is inferred from mention content — exact geolocation is an approximation."
      />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Threat Geography</h1>
          <p className="text-sm text-muted-foreground mt-1">Geographic heatmap of mention origins and emerging threats</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Globe className="h-4 w-4" /> Regions Active
          </div>
          <div className="text-2xl font-bold text-card-foreground">{loading ? "—" : regions.length}</div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <AlertTriangle className="h-4 w-4 text-sentinel-red" /> Critical Threats
          </div>
          <div className="text-2xl font-bold text-sentinel-red">{loading ? "—" : totalThreats}</div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4 text-sentinel-amber" /> Negative Mentions
          </div>
          <div className="text-2xl font-bold text-sentinel-amber">{loading ? "—" : totalNegative}</div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Zap className="h-4 w-4 text-primary" /> Hotspot
          </div>
          <div className="text-lg font-bold text-card-foreground truncate">
            {loading ? "—" : topRegion?.coords.label || "None"}
          </div>
        </Card>
      </div>

      {/* Map */}
      <Card className="bg-card border-border p-6 overflow-hidden">
        {loading ? (
          <Skeleton className="w-full h-[400px] rounded-lg" />
        ) : (
          <div className="relative">
            <svg viewBox="0 0 800 400" className="w-full h-auto" style={{ minHeight: 300 }}>
              {/* Dark background */}
              <rect width="800" height="400" rx="8" fill="hsl(var(--card))" />

              {/* Grid lines */}
              {Array.from({ length: 9 }).map((_, i) => (
                <line key={`h${i}`} x1="0" y1={i * 50} x2="800" y2={i * 50} stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3" />
              ))}
              {Array.from({ length: 17 }).map((_, i) => (
                <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="400" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3" />
              ))}

              {/* Simplified continent outlines */}
              {/* North America */}
              <path d="M100,80 L220,70 L250,100 L240,150 L210,180 L180,210 L140,200 L120,170 L90,130 Z" 
                fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />
              {/* South America */}
              <path d="M200,220 L280,210 L300,250 L290,310 L260,340 L230,350 L210,320 L200,270 Z" 
                fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />
              {/* Europe */}
              <path d="M350,80 L430,70 L450,100 L440,150 L410,160 L370,150 L360,120 Z" 
                fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />
              {/* Africa */}
              <path d="M370,170 L440,170 L460,220 L450,280 L420,320 L390,310 L370,270 L360,220 Z" 
                fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />
              {/* Asia */}
              <path d="M450,70 L650,60 L680,100 L670,170 L620,200 L550,210 L500,190 L460,150 L450,100 Z" 
                fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />
              {/* Australia */}
              <path d="M590,270 L660,260 L680,290 L670,330 L630,340 L590,320 Z" 
                fill="hsl(var(--muted))" opacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.5" />

              {/* Threat dots */}
              {regions.map(r => {
                const size = Math.max(8, (r.total / maxTotal) * 40);
                const threatLevel = r.critical > 0 ? "critical" : r.negative > r.total * 0.3 ? "high" : "normal";
                const color = threatLevel === "critical" 
                  ? "hsl(var(--sentinel-red))" 
                  : threatLevel === "high" 
                    ? "hsl(var(--sentinel-amber))" 
                    : "hsl(var(--primary))";

                return (
                  <g key={r.region}
                    onMouseEnter={() => setHoveredRegion(r.region)}
                    onMouseLeave={() => setHoveredRegion(null)}
                    className="cursor-pointer"
                  >
                    {/* Pulse ring for critical threats */}
                    {threatLevel === "critical" && (
                      <motion.circle
                        key={`pulse-${r.region}-${pulseKeys}`}
                        cx={r.coords.x} cy={r.coords.y}
                        r={size * 0.5}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        initial={{ r: size * 0.5, opacity: 0.8 }}
                        animate={{ r: size * 1.5, opacity: 0 }}
                        transition={{ duration: 2, ease: "easeOut" }}
                      />
                    )}
                    {/* Glow */}
                    <circle cx={r.coords.x} cy={r.coords.y} r={size * 0.8} fill={color} opacity={0.15} />
                    {/* Main dot */}
                    <motion.circle
                      cx={r.coords.x} cy={r.coords.y} r={size * 0.4}
                      fill={color}
                      opacity={hoveredRegion === r.region ? 1 : 0.8}
                      whileHover={{ scale: 1.3 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    />
                    {/* Label */}
                    <text
                      x={r.coords.x} y={r.coords.y - size * 0.6 - 4}
                      textAnchor="middle"
                      className="text-[10px] fill-muted-foreground font-medium"
                      opacity={hoveredRegion === r.region ? 1 : 0.7}
                    >
                      {r.coords.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover tooltip */}
            <AnimatePresence>
              {hoveredRegion && (() => {
                const r = regions.find(r => r.region === hoveredRegion);
                if (!r) return null;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-4 right-4 bg-popover border border-border rounded-lg p-4 shadow-xl min-w-[200px]"
                  >
                    <h4 className="text-sm font-semibold text-popover-foreground">{r.coords.label}</h4>
                    <div className="mt-2 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Mentions</span>
                        <span className="font-mono text-popover-foreground">{r.total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Negative</span>
                        <span className="font-mono text-sentinel-amber">{r.negative}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Critical</span>
                        <span className="font-mono text-sentinel-red">{r.critical}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Threat Level</span>
                        <Badge variant="outline" className={`text-[9px] ${
                          r.critical > 0 ? "border-sentinel-red/30 text-sentinel-red" :
                          r.negative > r.total * 0.3 ? "border-sentinel-amber/30 text-sentinel-amber" :
                          "border-primary/30 text-primary"
                        }`}>
                          {r.critical > 0 ? "Critical" : r.negative > r.total * 0.3 ? "High" : "Normal"}
                        </Badge>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </div>
        )}
      </Card>

      {/* Region breakdown table */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4">Region Breakdown</h3>
        <div className="space-y-2">
          {regions.map(r => {
            const negPct = r.total > 0 ? Math.round((r.negative / r.total) * 100) : 0;
            return (
              <div key={r.region} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-32 text-sm text-card-foreground font-medium">{r.coords.label}</div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(r.total / maxTotal) * 100}%`,
                        background: r.critical > 0
                          ? "hsl(var(--sentinel-red))"
                          : negPct > 30
                            ? "hsl(var(--sentinel-amber))"
                            : "hsl(var(--primary))",
                      }}
                    />
                  </div>
                </div>
                <div className="text-xs font-mono text-card-foreground w-12 text-right">{r.total}</div>
                <Badge variant="outline" className={`text-[9px] w-16 justify-center ${
                  negPct > 50 ? "border-sentinel-red/30 text-sentinel-red" :
                  negPct > 25 ? "border-sentinel-amber/30 text-sentinel-amber" :
                  "border-sentinel-emerald/30 text-sentinel-emerald"
                }`}>
                  {negPct}% neg
                </Badge>
              </div>
            );
          })}
          {regions.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-4">No mention data to map. Run a scan first.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
