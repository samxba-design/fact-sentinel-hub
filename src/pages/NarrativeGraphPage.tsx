import { useEffect, useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Network, Users, Globe, Maximize2, Minimize2, Share2, RefreshCw, ZoomIn, ZoomOut, Info } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

interface GraphNode {
  id: string;
  label: string;
  type: "narrative" | "person" | "source";
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

// Colour palette for each node type — dark-mode legible
const TYPE_CONFIG: Record<string, { fill: string; stroke: string; textFill: string; label: string }> = {
  narrative: { fill: "#3b82f6",  stroke: "#60a5fa", textFill: "#ffffff", label: "Narrative" },
  person:    { fill: "#8b5cf6",  stroke: "#a78bfa", textFill: "#ffffff", label: "Person"    },
  source:    { fill: "#06b6d4",  stroke: "#22d3ee", textFill: "#ffffff", label: "Source"    },
};

export default function NarrativeGraphPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const animRef        = useRef<number>(0);
  const nodesRef       = useRef<GraphNode[]>([]);
  const edgesRef       = useRef<GraphEdge[]>([]);
  const mouseRef       = useRef({ x: -999, y: -999 });
  const dragRef        = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 });
  const selectedRef    = useRef<GraphNode | null>(null);
  const hoveredRef     = useRef<GraphNode | null>(null);
  const pinnedRef      = useRef<Set<string>>(new Set());
  // Viewport pan/zoom
  const viewRef        = useRef({ tx: 0, ty: 0, scale: 1 });
  const panRef         = useRef<{ active: boolean; startX: number; startY: number; startTx: number; startTy: number }>({ active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 });
  const simStepsRef    = useRef(0);
  const SIM_MAX        = 300; // steps before damping to near-zero

  // Load graph data
  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    simStepsRef.current = 0;

    Promise.all([
      supabase.from("narratives").select("id, name, status, confidence").eq("org_id", currentOrg.id).limit(30),
      supabase.from("mention_narratives").select("mention_id, narrative_id"),
      supabase.from("mention_people").select("mention_id, person_id"),
      supabase.from("people").select("id, name").limit(50),
      supabase.from("mentions").select("id, source, author_name").eq("org_id", currentOrg.id).eq("mention_type", "brand").limit(200),
    ]).then(([narrativesRes, mnRes, mpRes, peopleRes, mentionsRes]) => {
      const narratives      = narrativesRes.data || [];
      const mentionNarratives = mnRes.data || [];
      const mentionPeople   = mpRes.data || [];
      const people          = peopleRes.data || [];
      const mentions        = mentionsRes.data || [];

      const W = 800, H = 520;
      const graphNodes: GraphNode[] = [];
      const graphEdges: GraphEdge[] = [];
      const nodeIds = new Set<string>();

      // Narrative nodes — positioned in a rough circle
      const angleStep = (2 * Math.PI) / Math.max(narratives.length, 1);
      narratives.forEach((n, i) => {
        const angle = i * angleStep;
        graphNodes.push({
          id: `n-${n.id}`, label: n.name, type: "narrative",
          size: 18 + Math.min((Number(n.confidence) || 50) * 0.12, 12),
          x: W / 2 + Math.cos(angle) * 160,
          y: H / 2 + Math.sin(angle) * 130,
          vx: 0, vy: 0,
        });
        nodeIds.add(`n-${n.id}`);
      });

      const mentionSourceMap: Record<string, string> = {};
      mentions.forEach(m => { mentionSourceMap[m.id] = m.source || "unknown"; });

      const narrativeMentionMap: Record<string, Set<string>> = {};
      const sourceNarrativeLinks: Record<string, Set<string>> = {};

      mentionNarratives.forEach(mn => {
        if (!narrativeMentionMap[mn.narrative_id]) narrativeMentionMap[mn.narrative_id] = new Set();
        narrativeMentionMap[mn.narrative_id].add(mn.mention_id);
        const src = mentionSourceMap[mn.mention_id];
        if (src) {
          if (!sourceNarrativeLinks[src]) sourceNarrativeLinks[src] = new Set();
          sourceNarrativeLinks[src].add(mn.narrative_id);
        }
      });

      const personMentionMap: Record<string, Set<string>> = {};
      mentionPeople.forEach(mp => {
        if (!personMentionMap[mp.person_id]) personMentionMap[mp.person_id] = new Set();
        personMentionMap[mp.person_id].add(mp.mention_id);
      });

      const peopleMap = new Map(people.map(p => [p.id, p.name]));
      const addedPeople = new Set<string>();

      Object.entries(personMentionMap).forEach(([personId, mentionIds]) => {
        Object.entries(narrativeMentionMap).forEach(([narrativeId, narMentionIds]) => {
          const overlap = [...mentionIds].filter(id => narMentionIds.has(id)).length;
          if (overlap > 0 && !addedPeople.has(personId)) {
            const name = peopleMap.get(personId) || "Unknown";
            graphNodes.push({
              id: `p-${personId}`, label: name, type: "person",
              size: 12 + Math.min(overlap * 2, 8),
              x: W / 2 + (Math.random() - 0.5) * 350,
              y: H / 2 + (Math.random() - 0.5) * 280,
              vx: 0, vy: 0,
            });
            nodeIds.add(`p-${personId}`);
            addedPeople.add(personId);
            graphEdges.push({ source: `p-${personId}`, target: `n-${narrativeId}`, weight: overlap });
          }
        });
      });

      // Top 8 source nodes
      Object.entries(sourceNarrativeLinks)
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 8)
        .forEach(([src, narrativeIds]) => {
          const srcId = `s-${src}`;
          graphNodes.push({
            id: srcId, label: src, type: "source",
            size: 10 + Math.min(narrativeIds.size * 3, 10),
            x: W / 2 + (Math.random() - 0.5) * 400,
            y: H / 2 + (Math.random() - 0.5) * 320,
            vx: 0, vy: 0,
          });
          nodeIds.add(srcId);
          narrativeIds.forEach(nid => {
            if (nodeIds.has(`n-${nid}`)) {
              graphEdges.push({ source: srcId, target: `n-${nid}`, weight: 1 });
            }
          });
        });

      // Narrative–narrative edges (shared mentions)
      const narIds = Object.keys(narrativeMentionMap);
      for (let i = 0; i < narIds.length; i++) {
        for (let j = i + 1; j < narIds.length; j++) {
          const shared = [...narrativeMentionMap[narIds[i]]].filter(id => narrativeMentionMap[narIds[j]]?.has(id)).length;
          if (shared > 0) {
            graphEdges.push({ source: `n-${narIds[i]}`, target: `n-${narIds[j]}`, weight: shared });
          }
        }
      }

      nodesRef.current = graphNodes;
      edgesRef.current = graphEdges;
      pinnedRef.current = new Set();
      setNodes(graphNodes);
      setEdges(graphEdges);
      setLoading(false);
    });
  }, [currentOrg]);

  // ─── Force simulation + render loop ───────────────────────────────────────
  useEffect(() => {
    if (nodes.length === 0) return;
    nodesRef.current = nodes.map(n => ({ ...n }));
    simStepsRef.current = 0;

    const BG_DARK  = "#0d1117";
    const GRID_COL = "rgba(255,255,255,0.03)";

    const simulate = () => {
      const ns  = nodesRef.current;
      const es  = edgesRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const W = canvas.clientWidth  || 800;
      const H = canvas.clientHeight || 520;
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width  = `${W}px`;
        canvas.style.height = `${H}px`;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const step = simStepsRef.current;
      const damping = step < SIM_MAX ? 0.85 : 0.99; // fast settle, then near-stop

      if (step < SIM_MAX + 50) {
        // Repulsion
        for (let i = 0; i < ns.length; i++) {
          if (pinnedRef.current.has(ns[i].id)) continue;
          for (let j = i + 1; j < ns.length; j++) {
            if (pinnedRef.current.has(ns[j].id)) continue;
            const dx = ns[j].x - ns[i].x;
            const dy = ns[j].y - ns[i].y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const str  = (ns[i].size + ns[j].size) * 20 / (dist * dist);
            const fx   = (dx / dist) * str;
            const fy   = (dy / dist) * str;
            ns[i].vx -= fx; ns[i].vy -= fy;
            ns[j].vx += fx; ns[j].vy += fy;
          }
        }

        // Attraction (edges)
        const nodeMap = new Map(ns.map(n => [n.id, n]));
        es.forEach(e => {
          const s = nodeMap.get(e.source);
          const t = nodeMap.get(e.target);
          if (!s || !t) return;
          const dx   = t.x - s.x;
          const dy   = t.y - s.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const rest = 120 + (s.size + t.size) * 2;
          const str  = (dist - rest) * 0.004 * e.weight;
          if (!pinnedRef.current.has(s.id)) { s.vx += (dx / dist) * str; s.vy += (dy / dist) * str; }
          if (!pinnedRef.current.has(t.id)) { t.vx -= (dx / dist) * str; t.vy -= (dy / dist) * str; }
        });

        // Center gravity
        ns.forEach(n => {
          if (pinnedRef.current.has(n.id)) return;
          n.vx += (W / 2 - n.x) * 0.0008;
          n.vy += (H / 2 - n.y) * 0.0008;
          n.vx *= damping;
          n.vy *= damping;
          n.x  += n.vx;
          n.y  += n.vy;
          n.x   = Math.max(n.size + 5, Math.min(W - n.size - 5, n.x));
          n.y   = Math.max(n.size + 5, Math.min(H - n.size - 5, n.y));
        });
        simStepsRef.current++;
      }

      // ── Draw ──────────────────────────────────────────────────────────
      const { tx, ty, scale } = viewRef.current;
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = BG_DARK;
      ctx.fillRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = GRID_COL;
      ctx.lineWidth = 1;
      const gridSize = 40 * scale;
      const offX = (tx % gridSize + gridSize) % gridSize;
      const offY = (ty % gridSize + gridSize) % gridSize;
      for (let gx = offX; gx < W; gx += gridSize) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = offY; gy < H; gy += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(scale, scale);

      const nodeMap = new Map(ns.map(n => [n.id, n]));
      const sel     = selectedRef.current;
      const connectedIds = sel
        ? new Set([sel.id, ...edgesRef.current.filter(e => e.source === sel.id || e.target === sel.id).flatMap(e => [e.source, e.target])])
        : null;

      // Edges
      edgesRef.current.forEach(e => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) return;
        const isConnected = !connectedIds || (connectedIds.has(e.source) && connectedIds.has(e.target));
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = isConnected
          ? `rgba(120,160,240,${0.15 + e.weight * 0.06})`
          : "rgba(100,120,160,0.04)";
        ctx.lineWidth = (0.5 + e.weight * 0.25) / scale;
        ctx.stroke();
      });

      // Nodes
      const mx = (mouseRef.current.x - tx) / scale;
      const my = (mouseRef.current.y - ty) / scale;
      let hovered: GraphNode | null = null;

      ns.forEach(n => {
        const cfg   = TYPE_CONFIG[n.type];
        const dist  = Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2);
        const isHov = dist < n.size + 4;
        const isSel = sel?.id === n.id;
        const dimmed = connectedIds && !connectedIds.has(n.id);
        if (isHov) hovered = n;

        ctx.globalAlpha = dimmed ? 0.15 : isSel ? 1 : 0.9;

        // Outer glow
        const glowR = n.size * (isSel ? 2.2 : isHov ? 1.8 : 1.4);
        const grad  = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
        grad.addColorStop(0, cfg.fill + (isSel ? "50" : "30"));
        grad.addColorStop(1, cfg.fill + "00");
        ctx.beginPath();
        ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Main circle fill
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size * (isSel || isHov ? 1.1 : 1), 0, Math.PI * 2);
        ctx.fillStyle = cfg.fill;
        ctx.fill();

        // Border ring
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size * (isSel || isHov ? 1.1 : 1), 0, Math.PI * 2);
        ctx.strokeStyle = isSel ? "#fff" : cfg.stroke;
        ctx.lineWidth   = (isSel ? 2.5 : isHov ? 1.5 : 1) / scale;
        ctx.stroke();

        ctx.globalAlpha = 1;

        // Label — always legible: white text, dark shadow
        const labelSize = Math.max(9, Math.min(12, n.size * 0.65)) / scale;
        ctx.font        = `${isSel || isHov ? 600 : 500} ${labelSize}px Inter,sans-serif`;
        ctx.textAlign   = "center";

        // Shadow for legibility on any background
        ctx.shadowColor   = "rgba(0,0,0,0.9)";
        ctx.shadowBlur    = 4 / scale;
        ctx.fillStyle     = dimmed ? "rgba(200,210,230,0.25)" : "#ffffff";
        ctx.fillText(
          n.label.length > 22 ? n.label.slice(0, 20) + "…" : n.label,
          n.x,
          n.y - n.size - 4 / scale,
        );
        ctx.shadowBlur = 0;
      });

      ctx.restore();

      // Update React hover state (throttled — only when changed)
      if (hovered !== hoveredRef.current) {
        hoveredRef.current = hovered;
        setHoveredNode(hovered);
      }

      animRef.current = requestAnimationFrame(simulate);
    };

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes]);

  // ─── Canvas event handlers ─────────────────────────────────────────────────
  const getCanvasXY = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const toWorld = (cx: number, cy: number) => {
    const { tx, ty, scale } = viewRef.current;
    return { x: (cx - tx) / scale, y: (cy - ty) / scale };
  };

  const hitNode = (cx: number, cy: number): GraphNode | null => {
    const { x: wx, y: wy } = toWorld(cx, cy);
    for (const n of nodesRef.current) {
      if (Math.sqrt((n.x - wx) ** 2 + (n.y - wy) ** 2) < n.size + 4) return n;
    }
    return null;
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasXY(e);
    mouseRef.current = { x, y };

    if (dragRef.current.nodeId) {
      const { x: wx, y: wy } = toWorld(x, y);
      const n = nodesRef.current.find(n => n.id === dragRef.current.nodeId);
      if (n) {
        n.x  = wx - dragRef.current.offsetX;
        n.y  = wy - dragRef.current.offsetY;
        n.vx = 0; n.vy = 0;
      }
    } else if (panRef.current.active) {
      const { startX, startY, startTx, startTy } = panRef.current;
      viewRef.current.tx = startTx + (x - startX);
      viewRef.current.ty = startTy + (y - startY);
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasXY(e);
    const hit = hitNode(x, y);
    if (hit) {
      const { x: wx, y: wy } = toWorld(x, y);
      dragRef.current = { nodeId: hit.id, offsetX: wx - hit.x, offsetY: wy - hit.y };
      pinnedRef.current.add(hit.id);
    } else {
      panRef.current = { active: true, startX: x, startY: y, startTx: viewRef.current.tx, startTy: viewRef.current.ty };
    }
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasXY(e);
    const wasDragging = dragRef.current.nodeId;
    const wasPanning  = panRef.current.active;

    dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 };
    panRef.current.active = false;

    // Click (no significant drag)
    if (!wasDragging && !wasPanning) {
      const hit = hitNode(x, y);
      if (hit) {
        const isSame = selectedRef.current?.id === hit.id;
        selectedRef.current = isSame ? null : hit;
        setSelectedNode(isSame ? null : hit);
      } else {
        selectedRef.current = null;
        setSelectedNode(null);
      }
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getCanvasXY(e as any);
    const delta     = e.deltaY > 0 ? 0.85 : 1.18;
    const { tx, ty, scale } = viewRef.current;
    const newScale  = Math.max(0.3, Math.min(4, scale * delta));
    // Zoom toward cursor
    viewRef.current.tx    = x - (x - tx) * (newScale / scale);
    viewRef.current.ty    = y - (y - ty) * (newScale / scale);
    viewRef.current.scale = newScale;
  }, []);

  const resetView = () => {
    viewRef.current = { tx: 0, ty: 0, scale: 1 };
  };

  const narrativeCount = nodes.filter(n => n.type === "narrative").length;
  const personCount    = nodes.filter(n => n.type === "person").length;
  const sourceCount    = nodes.filter(n => n.type === "source").length;

  const connEdges = selectedNode
    ? edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
    : [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageGuide
        title="Narrative Network — Relationship graph"
        subtitle="Visual map of how narratives, people, and sources connect through shared mentions."
        steps={[
          { icon: <Network className="h-4 w-4 text-primary" />, title: "Node types", description: "Blue = narratives, purple = people, cyan = sources. Larger = more connections." },
          { icon: <Share2 className="h-4 w-4 text-primary" />, title: "Interact", description: "Click a node to highlight its connections. Drag nodes to rearrange. Scroll to zoom. Drag background to pan." },
          { icon: <Info className="h-4 w-4 text-primary" />, title: "Connections", description: "Lines = shared mentions. Thicker lines = more overlap between nodes." },
        ]}
        tip="Needs scan data + narrative detection. The more you scan, the richer the graph becomes."
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Narrative Network</h1>
          <p className="text-sm text-muted-foreground mt-1">Force-directed graph — click nodes to explore, drag to rearrange, scroll to zoom</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetView}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reset View
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsFullscreen(!isFullscreen)}>
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Legend + counts */}
      <div className="flex flex-wrap items-center gap-5">
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border" style={{ background: cfg.fill, borderColor: cfg.stroke }} />
            <span className="text-xs text-muted-foreground">
              {cfg.label}s &nbsp;
              <span className="text-foreground font-medium">
                ({type === "narrative" ? narrativeCount : type === "person" ? personCount : sourceCount})
              </span>
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-8 h-px bg-blue-500/40" />
          <span>Connections <span className="text-foreground font-medium">({edges.length})</span></span>
        </div>
        {selectedNode && (
          <Badge variant="outline" className="ml-auto text-xs border-blue-500/30 text-blue-400">
            {selectedNode.label.slice(0, 30)} — {connEdges.length} connections
          </Badge>
        )}
      </div>

      <Card className={`border-border overflow-hidden relative ${isFullscreen ? "fixed inset-4 z-50 shadow-2xl" : ""}`} style={{ background: "#0d1117" }}>
        {loading ? (
          <Skeleton className="w-full h-[520px] rounded-none bg-[#1a2332]" />
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[520px] text-center">
            <Network className="h-14 w-14 text-blue-500/30 mb-4" />
            <h3 className="text-lg font-semibold text-white/80">No network data yet</h3>
            <p className="text-sm text-white/40 mt-1 max-w-xs">Run a scan and use AI narrative detection to build the graph.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
              onClick={() => navigate("/scans")}
            >
              Go to Scans
            </Button>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { panRef.current.active = false; dragRef.current.nodeId = null; mouseRef.current = { x: -999, y: -999 }; }}
              onWheel={handleWheel}
              style={{ width: "100%", height: isFullscreen ? "calc(100vh - 130px)" : 520, cursor: "crosshair", display: "block" }}
            />

            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-1">
              <button
                onClick={() => { viewRef.current.scale = Math.min(viewRef.current.scale * 1.3, 4); }}
                className="w-8 h-8 rounded bg-black/50 hover:bg-black/70 text-white/80 flex items-center justify-center text-sm transition-colors"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={() => { viewRef.current.scale = Math.max(viewRef.current.scale / 1.3, 0.3); }}
                className="w-8 h-8 rounded bg-black/50 hover:bg-black/70 text-white/80 flex items-center justify-center text-sm transition-colors"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
            </div>

            {/* Type badge legend inside canvas */}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
              {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: cfg.fill }} />
                  <span className="text-[10px] text-white/50">{cfg.label}</span>
                </div>
              ))}
            </div>

            {/* Selected node panel */}
            <AnimatePresence>
              {selectedNode && (
                <motion.div
                  key={selectedNode.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="absolute top-3 right-14 bg-popover/95 backdrop-blur-sm border border-border rounded-xl p-4 shadow-2xl w-64"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: TYPE_CONFIG[selectedNode.type].fill }} />
                      <div>
                        <p className="text-sm font-semibold text-popover-foreground leading-snug">{selectedNode.label}</p>
                        <Badge variant="outline" className="text-[9px] mt-0.5 capitalize">{selectedNode.type}</Badge>
                      </div>
                    </div>
                    <button
                      onClick={() => { selectedRef.current = null; setSelectedNode(null); }}
                      className="text-muted-foreground hover:text-foreground text-lg leading-none ml-1 flex-shrink-0"
                    >✕</button>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Connections</span>
                      <span className="text-foreground font-medium">{connEdges.length}</span>
                    </div>
                    {connEdges.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">Connected to</p>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {connEdges.slice(0, 8).map(e => {
                            const otherId = e.source === selectedNode.id ? e.target : e.source;
                            const other   = nodesRef.current.find(n => n.id === otherId);
                            if (!other) return null;
                            return (
                              <div
                                key={otherId}
                                onClick={() => { selectedRef.current = other; setSelectedNode(other); }}
                                className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted cursor-pointer"
                              >
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_CONFIG[other.type].fill }} />
                                <span className="text-xs text-foreground truncate">{other.label}</span>
                                <span className="ml-auto text-[9px] text-muted-foreground">×{e.weight}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {selectedNode.type === "narrative" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2 text-xs"
                        onClick={() => navigate("/narratives")}
                      >
                        View Narratives
                      </Button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hover tooltip when no node selected */}
            <AnimatePresence>
              {hoveredNode && !selectedNode && (
                <motion.div
                  key={hoveredNode.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-14 left-4 bg-popover/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg pointer-events-none"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_CONFIG[hoveredNode.type].fill }} />
                    <span className="text-sm font-medium text-popover-foreground">{hoveredNode.label}</span>
                    <Badge variant="outline" className="text-[9px] capitalize">{hoveredNode.type}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Click to explore · {edges.filter(e => e.source === hoveredNode.id || e.target === hoveredNode.id).length} connections
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </Card>

      {/* Insights panel below graph */}
      {nodes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Most Connected Narratives</h4>
            <div className="space-y-2">
              {nodes
                .filter(n => n.type === "narrative")
                .map(n => ({
                  node: n,
                  connections: edges.filter(e => e.source === n.id || e.target === n.id).length,
                }))
                .sort((a, b) => b.connections - a.connections)
                .slice(0, 5)
                .map(({ node, connections }) => (
                  <div
                    key={node.id}
                    onClick={() => { selectedRef.current = node; setSelectedNode(node); }}
                    className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_CONFIG.narrative.fill }} />
                    <span className="text-xs text-foreground flex-1 truncate">{node.label}</span>
                    <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400">{connections}</Badge>
                  </div>
                ))}
              {nodes.filter(n => n.type === "narrative").length === 0 && (
                <p className="text-xs text-muted-foreground">No narratives detected yet.</p>
              )}
            </div>
          </Card>

          <Card className="bg-card border-border p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Top People in Network</h4>
            <div className="space-y-2">
              {nodes
                .filter(n => n.type === "person")
                .map(n => ({
                  node: n,
                  connections: edges.filter(e => e.source === n.id || e.target === n.id).length,
                }))
                .sort((a, b) => b.connections - a.connections)
                .slice(0, 5)
                .map(({ node, connections }) => (
                  <div
                    key={node.id}
                    onClick={() => { selectedRef.current = node; setSelectedNode(node); }}
                    className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_CONFIG.person.fill }} />
                    <span className="text-xs text-foreground flex-1 truncate">{node.label}</span>
                    <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400">{connections}</Badge>
                  </div>
                ))}
              {nodes.filter(n => n.type === "person").length === 0 && (
                <p className="text-xs text-muted-foreground">No key people tracked yet. Add them via Key People.</p>
              )}
            </div>
          </Card>

          <Card className="bg-card border-border p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Top Sources</h4>
            <div className="space-y-2">
              {nodes
                .filter(n => n.type === "source")
                .map(n => ({
                  node: n,
                  connections: edges.filter(e => e.source === n.id || e.target === n.id).length,
                }))
                .sort((a, b) => b.connections - a.connections)
                .slice(0, 5)
                .map(({ node, connections }) => (
                  <div
                    key={node.id}
                    onClick={() => { selectedRef.current = node; setSelectedNode(node); }}
                    className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_CONFIG.source.fill }} />
                    <span className="text-xs text-foreground flex-1 truncate">{node.label}</span>
                    <Badge variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-400">{connections}</Badge>
                  </div>
                ))}
              {nodes.filter(n => n.type === "source").length === 0 && (
                <p className="text-xs text-muted-foreground">Source nodes appear once narratives are detected.</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
