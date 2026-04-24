import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Zap, AlertTriangle, TrendingUp, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import PageGuide from "@/components/PageGuide";
import InfoTooltip from "@/components/InfoTooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import {
  ComposableMap, Geographies, Geography, ZoomableGroup, Marker, Sphere, Graticule,
} from "react-simple-maps";

// World atlas from CDN — lightweight 110m resolution
const GEO_URL = "/world-atlas.json";

// Region definitions: lat/lng centroid for each tracked region
const REGION_COORDS: Record<string, { lat: number; lng: number; label: string }> = {
  us:             { lng: -97,   lat: 38,   label: "United States" },
  canada:         { lng: -95,   lat: 57,   label: "Canada" },
  mexico:         { lng: -102,  lat: 24,   label: "Mexico" },
  brazil:         { lng: -53,   lat: -10,  label: "Brazil" },
  south_america:  { lng: -64,   lat: -30,  label: "South America" },
  uk:             { lng: -2,    lat: 54,   label: "United Kingdom" },
  eu:             { lng: 10,    lat: 51,   label: "Europe" },
  russia:         { lng: 90,    lat: 61,   label: "Russia" },
  africa:         { lng: 22,    lat: 5,    label: "Africa" },
  middle_east:    { lng: 44,    lat: 29,   label: "Middle East" },
  india:          { lng: 78,    lat: 20,   label: "India" },
  china:          { lng: 104,   lat: 36,   label: "China" },
  japan:          { lng: 138,   lat: 37,   label: "Japan" },
  southeast_asia: { lng: 110,   lat: 5,    label: "SE Asia" },
  australia:      { lng: 133,   lat: -25,  label: "Australia" },
};

function inferRegion(mention: any): string | null {
  const text = (
    (mention.content || "") + " " +
    (mention.source || "") + " " +
    (mention.author_name || "")
  ).toLowerCase();
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
  return null; // Unknown/global — do not plot on map
}

interface RegionData {
  region: string;
  total: number;
  negative: number;
  critical: number;
  coords: { lat: number; lng: number; label: string };
}

export default function ThreatMapPage() {
  const { currentOrg } = useOrg();
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState<RegionData[]>([]);
  const [unknownCount, setUnknownCount] = useState(0);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [zoom, setZoom] = useState(1.4);
  const [center, setCenter] = useState<[number, number]>([10, 20]);
  const [mapError, setMapError] = useState(false);

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
        let unknownGlobal = 0;

        items.forEach(m => {
          const r = inferRegion(m);
          if (r === null) {
            unknownGlobal++;
            return; // skip null — unknown/global, don't plot on map
          }
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
        setUnknownCount(unknownGlobal);
        setLoading(false);
      });
  }, [currentOrg]);

  const maxTotal = Math.max(...regions.map(r => r.total), 1);
  const totalThreats = regions.reduce((s, r) => s + r.critical, 0);
  const totalNegative = regions.reduce((s, r) => s + r.negative, 0);
  const topRegion = regions[0];

  const getThreatLevel = (r: RegionData) =>
    r.critical > 0 ? "critical" : r.negative > r.total * 0.3 ? "high" : "normal";

  const getColor = (level: string) =>
    level === "critical" ? "#ef4444" : level === "high" ? "#f59e0b" : "#3b82f6";

  const hoveredData = hoveredRegion ? regions.find(r => r.region === hoveredRegion) : null;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageGuide
        title="Threat Map — Geographic distribution"
        subtitle="Real-world map showing where brand mentions originate. Larger, brighter dots = more activity."
        steps={[
          { icon: <Globe className="h-4 w-4 text-primary" />, title: "Hotspot dots", description: "Size = volume. Red = critical threats. Orange = high negativity. Blue = normal activity." },
          { icon: <AlertTriangle className="h-4 w-4 text-primary" />, title: "Pan & zoom", description: "Use the +/− buttons or scroll to zoom. Click and drag to pan the map." },
        ]}
        tip="Region is inferred from mention text and source — geolocation is approximate."
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Threat Geography
            <InfoTooltip text="Geographic data is estimated from mention text — exact locations may not be accurate." />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Geographic heatmap of mention origins and emerging threats</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setZoom(1.4); setCenter([10, 20]); }}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reset View
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Globe className="h-4 w-4" /> Regions Active
          </div>
          <div className="text-2xl font-bold text-card-foreground">{loading ? "—" : regions.length}</div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <AlertTriangle className="h-4 w-4 text-red-500" /> Critical Threats
          </div>
          <div className="text-2xl font-bold text-red-500">{loading ? "—" : totalThreats}</div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4 text-amber-500" /> Negative Mentions
          </div>
          <div className="text-2xl font-bold text-amber-500">{loading ? "—" : totalNegative}</div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Zap className="h-4 w-4 text-primary" /> Top Hotspot
          </div>
          <div className="text-lg font-bold text-card-foreground truncate">
            {loading ? "—" : topRegion?.coords.label || "None yet"}
          </div>
        </Card>
        <Card className="bg-card border-border p-4 md:col-span-4 lg:col-span-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Globe className="h-4 w-4 text-muted-foreground" /> Unknown / Global
          </div>
          <div className="text-2xl font-bold text-muted-foreground">{loading ? "—" : unknownCount}</div>
        </Card>
      </div>

      {/* Map */}
      <Card className="bg-[#0d1117] border-border overflow-hidden relative">
        {loading ? (
          <Skeleton className="w-full h-[500px] rounded-none" />
        ) : mapError ? (
          <div className="flex flex-col items-center justify-center h-[500px] text-center space-y-3">
            <Globe className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Map data unavailable — check your connection</p>
            <p className="text-xs text-muted-foreground">Could not load world map data. The map pins will still appear once data loads.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Zoom controls */}
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7 bg-black/40 hover:bg-black/60 text-white" onClick={() => setZoom(z => Math.min(z * 1.5, 8))}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 bg-black/40 hover:bg-black/60 text-white" onClick={() => setZoom(z => Math.max(z / 1.5, 1))}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Legend */}
            <div className="absolute bottom-3 left-3 z-10 bg-black/50 backdrop-blur-sm rounded-lg p-2.5 flex flex-col gap-1.5">
              {[["critical", "#ef4444", "Critical"], ["high", "#f59e0b", "High Risk"], ["normal", "#3b82f6", "Normal"]].map(([, color, label]) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color as string }} />
                  <span className="text-[10px] text-white/70">{label}</span>
                </div>
              ))}
            </div>

            <ComposableMap
              projection="geoNaturalEarth1"
              style={{ width: "100%", height: "500px" }}
            >
              <ZoomableGroup center={center} zoom={zoom} onMoveEnd={({ coordinates, zoom: z }) => { setCenter(coordinates as [number,number]); setZoom(z); }}>
                {/* Ocean background */}
                <Sphere id="ocean" fill="#111827" stroke="#1f2937" strokeWidth={0.5} />
                {/* Graticule (lat/lng grid) */}
                <Graticule stroke="#1f2937" strokeWidth={0.3} />

                {/* Countries */}
                <Geographies geography={GEO_URL} onError={() => setMapError(true)}>
                  {({ geographies }) =>
                    geographies.map(geo => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill="#1e2d3d"
                        stroke="#263548"
                        strokeWidth={0.4}
                        style={{
                          default: { outline: "none" },
                          hover: { fill: "#243447", outline: "none" },
                          pressed: { outline: "none" },
                        }}
                      />
                    ))
                  }
                </Geographies>

                {/* Region threat markers */}
                {regions.map(r => {
                  const level = getThreatLevel(r);
                  const color = getColor(level);
                  const radius = Math.max(4, (r.total / maxTotal) * 22);
                  const isHovered = hoveredRegion === r.region;
                  const isSelected = selectedRegion?.region === r.region;

                  return (
                    <Marker
                      key={r.region}
                      coordinates={[r.coords.lng, r.coords.lat]}
                      onMouseEnter={() => setHoveredRegion(r.region)}
                      onMouseLeave={() => setHoveredRegion(null)}
                      onClick={() => setSelectedRegion(prev => prev?.region === r.region ? null : r)}
                    >
                      {/* Outer pulse for critical */}
                      {level === "critical" && (
                        <motion.circle
                          r={radius * 1.8}
                          fill="none"
                          stroke={color}
                          strokeWidth={1}
                          initial={{ r: radius, opacity: 0.8 }}
                          animate={{ r: radius * 2.5, opacity: 0 }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        />
                      )}
                      {/* Glow halo */}
                      <circle
                        r={radius * 1.6}
                        fill={color}
                        fillOpacity={isHovered || isSelected ? 0.25 : 0.1}
                      />
                      {/* Main dot */}
                      <motion.circle
                        r={radius * (isHovered || isSelected ? 0.85 : 0.65)}
                        fill={color}
                        fillOpacity={isHovered || isSelected ? 1 : 0.85}
                        animate={{ scale: isSelected ? 1.2 : 1 }}
                        style={{ cursor: "pointer" }}
                      />
                      {/* Count label inside dot if big enough */}
                      {radius > 10 && (
                        <text
                          textAnchor="middle"
                          dy="0.35em"
                          style={{
                            fontSize: Math.max(6, radius * 0.5),
                            fill: "#fff",
                            fontWeight: 700,
                            pointerEvents: "none",
                          }}
                        >
                          {r.total}
                        </text>
                      )}
                      {/* Region label */}
                      <text
                        textAnchor="middle"
                        dy={-(radius + 5)}
                        style={{
                          fontSize: isHovered || isSelected ? 9 : 7.5,
                          fill: isHovered || isSelected ? "#fff" : "rgba(255,255,255,0.55)",
                          fontWeight: isHovered || isSelected ? 600 : 400,
                          pointerEvents: "none",
                          textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                        }}
                      >
                        {r.coords.label}
                      </text>
                    </Marker>
                  );
                })}
              </ZoomableGroup>
            </ComposableMap>

            {/* Hover tooltip */}
            <AnimatePresence>
              {hoveredData && (
                <motion.div
                  key={hoveredData.region}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-4 left-4 bg-popover/95 backdrop-blur-sm border border-border rounded-lg p-3.5 shadow-xl pointer-events-none min-w-[180px]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: getColor(getThreatLevel(hoveredData)) }} />
                    <span className="text-sm font-semibold text-popover-foreground">{hoveredData.coords.label}</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Mentions</span>
                      <span className="font-mono font-medium text-popover-foreground">{hoveredData.total}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Negative</span>
                      <span className="font-mono text-amber-400">{hoveredData.negative}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Critical</span>
                      <span className="font-mono text-red-400">{hoveredData.critical}</span>
                    </div>
                    <div className="flex justify-between gap-4 pt-1 border-t border-border">
                      <span className="text-muted-foreground">Threat</span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${hoveredData.critical > 0 ? "border-red-500/30 text-red-400" : hoveredData.negative > hoveredData.total * 0.3 ? "border-amber-500/30 text-amber-400" : "border-blue-500/30 text-blue-400"}`}
                      >
                        {getThreatLevel(hoveredData).charAt(0).toUpperCase() + getThreatLevel(hoveredData).slice(1)}
                      </Badge>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </Card>

      {/* Selected region detail */}
      <AnimatePresence>
        {selectedRegion && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            <Card className="bg-card border-border p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: getColor(getThreatLevel(selectedRegion)) }} />
                  <div>
                    <h3 className="text-base font-semibold text-card-foreground">{selectedRegion.coords.label}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedRegion.total} mentions · {selectedRegion.negative} negative · {selectedRegion.critical} critical
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs ${selectedRegion.critical > 0 ? "border-red-500/30 text-red-400 bg-red-500/5" : selectedRegion.negative > selectedRegion.total * 0.3 ? "border-amber-500/30 text-amber-400 bg-amber-500/5" : "border-blue-500/30 text-blue-400 bg-blue-500/5"}`}
                  >
                    {getThreatLevel(selectedRegion).charAt(0).toUpperCase() + getThreatLevel(selectedRegion).slice(1)} Threat
                  </Badge>
                </div>
                <button onClick={() => setSelectedRegion(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-card-foreground">{selectedRegion.total}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Total Mentions</div>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-amber-500">
                    {selectedRegion.total > 0 ? Math.round((selectedRegion.negative / selectedRegion.total) * 100) : 0}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Negative Rate</div>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-red-500">{selectedRegion.critical}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Critical</div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Region breakdown table */}
      {regions.length > 0 && (
        <Card className="bg-card border-border p-5">
          <h3 className="text-sm font-semibold text-card-foreground mb-4">All Active Regions</h3>
          <div className="space-y-2">
            {regions.map(r => {
              const negPct = r.total > 0 ? Math.round((r.negative / r.total) * 100) : 0;
              const level = getThreatLevel(r);
              const color = getColor(level);
              return (
                <div
                  key={r.region}
                  onClick={() => setSelectedRegion(prev => prev?.region === r.region ? null : r)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${selectedRegion?.region === r.region ? "bg-muted" : "hover:bg-muted/50"}`}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <div className="w-36 text-sm text-card-foreground font-medium">{r.coords.label}</div>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(r.total / maxTotal) * 100}%`, background: color }}
                    />
                  </div>
                  <span className="text-xs font-mono text-card-foreground w-10 text-right">{r.total}</span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] w-16 justify-center ${negPct > 50 ? "border-red-500/30 text-red-400" : negPct > 25 ? "border-amber-500/30 text-amber-400" : "border-green-500/30 text-green-400"}`}
                  >
                    {negPct}% neg
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!loading && regions.length === 0 && (
        <Card className="bg-card border-border p-10 text-center">
          <Globe className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground">No geographic data yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
            Run your first scan to start mapping where brand mentions are coming from.
          </p>
        </Card>
      )}
    </div>
  );
}
