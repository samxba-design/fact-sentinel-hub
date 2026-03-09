import { useEffect, useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Network, Users, MessageSquareWarning, Maximize2, Minimize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

interface GraphNode {
  id: string;
  label: string;
  type: "narrative" | "person" | "source";
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

const TYPE_COLORS: Record<string, string> = {
  narrative: "hsl(var(--primary))",
  person: "hsl(var(--sentinel-purple))",
  source: "hsl(var(--sentinel-cyan))",
};

export default function NarrativeGraphPage() {
  const { currentOrg } = useOrg();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    Promise.all([
      supabase.from("narratives").select("id, name, status, confidence").eq("org_id", currentOrg.id).limit(30),
      supabase.from("mention_narratives").select("mention_id, narrative_id"),
      supabase.from("mention_people").select("mention_id, person_id"),
      supabase.from("people").select("id, name").limit(50),
      supabase.from("mentions").select("id, source, author_name").eq("org_id", currentOrg.id).limit(200),
    ]).then(([narrativesRes, mnRes, mpRes, peopleRes, mentionsRes]) => {
      const narratives = narrativesRes.data || [];
      const mentionNarratives = mnRes.data || [];
      const mentionPeople = mpRes.data || [];
      const people = peopleRes.data || [];
      const mentions = mentionsRes.data || [];

      const graphNodes: GraphNode[] = [];
      const graphEdges: GraphEdge[] = [];
      const nodeIds = new Set<string>();

      // Add narrative nodes
      narratives.forEach(n => {
        graphNodes.push({
          id: `n-${n.id}`, label: n.name, type: "narrative",
          size: 20 + (Number(n.confidence) || 50) * 0.2,
          x: 400 + (Math.random() - 0.5) * 300,
          y: 250 + (Math.random() - 0.5) * 200,
          vx: 0, vy: 0,
          color: TYPE_COLORS.narrative,
        });
        nodeIds.add(`n-${n.id}`);
      });

      // Track source mentions per narrative for source nodes
      const sourceNarrativeLinks: Record<string, Set<string>> = {};
      const mentionSourceMap: Record<string, string> = {};
      mentions.forEach(m => { mentionSourceMap[m.id] = m.source || "unknown"; });

      // Connect people to narratives via shared mentions
      const narrativeMentionMap: Record<string, Set<string>> = {};
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

      // Add people connected to narratives
      const peopleMap = new Map(people.map(p => [p.id, p.name]));
      const addedPeople = new Set<string>();

      Object.entries(personMentionMap).forEach(([personId, mentionIds]) => {
        Object.entries(narrativeMentionMap).forEach(([narrativeId, narMentionIds]) => {
          const overlap = [...mentionIds].filter(id => narMentionIds.has(id)).length;
          if (overlap > 0 && !addedPeople.has(personId)) {
            const name = peopleMap.get(personId) || "Unknown";
            graphNodes.push({
              id: `p-${personId}`, label: name, type: "person",
              size: 12 + overlap * 3,
              x: 400 + (Math.random() - 0.5) * 400,
              y: 250 + (Math.random() - 0.5) * 300,
              vx: 0, vy: 0,
              color: TYPE_COLORS.person,
            });
            nodeIds.add(`p-${personId}`);
            addedPeople.add(personId);
            graphEdges.push({ source: `p-${personId}`, target: `n-${narrativeId}`, weight: overlap });
          }
        });
      });

      // Add top source nodes
      const topSources = Object.entries(sourceNarrativeLinks)
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 8);

      topSources.forEach(([src, narrativeIds]) => {
        const srcId = `s-${src}`;
        graphNodes.push({
          id: srcId, label: src, type: "source",
          size: 10 + narrativeIds.size * 4,
          x: 400 + (Math.random() - 0.5) * 400,
          y: 250 + (Math.random() - 0.5) * 300,
          vx: 0, vy: 0,
          color: TYPE_COLORS.source,
        });
        nodeIds.add(srcId);
        narrativeIds.forEach(nid => {
          if (nodeIds.has(`n-${nid}`)) {
            graphEdges.push({ source: srcId, target: `n-${nid}`, weight: 1 });
          }
        });
      });

      // Connect narratives that share mentions
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
      setNodes(graphNodes);
      setEdges(graphEdges);
      setLoading(false);
    });
  }, [currentOrg]);

  // Force simulation
  useEffect(() => {
    if (nodes.length === 0) return;
    nodesRef.current = [...nodes];

    const simulate = () => {
      const ns = nodesRef.current;
      const es = edgesRef.current;
      const W = 800, H = 500;

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x;
          const dy = ns[j].y - ns[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 800 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
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
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 120) * 0.005 * e.weight;
        s.vx += (dx / dist) * force;
        s.vy += (dy / dist) * force;
        t.vx -= (dx / dist) * force;
        t.vy -= (dy / dist) * force;
      });

      // Center gravity
      ns.forEach(n => {
        n.vx += (W / 2 - n.x) * 0.001;
        n.vy += (H / 2 - n.y) * 0.001;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(30, Math.min(W - 30, n.x));
        n.y = Math.max(30, Math.min(H - 30, n.y));
      });

      // Draw
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;

      ctx.clearRect(0, 0, W, H);

      // Edges
      es.forEach(e => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) return;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = `hsla(var(--border), ${0.2 + e.weight * 0.1})`;
        ctx.lineWidth = 0.5 + e.weight * 0.3;
        ctx.stroke();
      });

      // Nodes
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      let hovered: GraphNode | null = null;

      ns.forEach(n => {
        const dist = Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2);
        const isHovered = dist < n.size;
        if (isHovered) hovered = n;

        // Glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = n.color.replace(")", ", 0.08)").replace("hsl(", "hsla(");
        ctx.fill();

        // Node
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size * (isHovered ? 0.7 : 0.5), 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.globalAlpha = isHovered ? 1 : 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label
        ctx.font = `${isHovered ? "600" : "400"} ${isHovered ? 11 : 9}px Inter, sans-serif`;
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--foreground") ? 
          `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim()})` : "#fff";
        ctx.textAlign = "center";
        ctx.fillText(n.label.slice(0, 20), n.x, n.y - n.size * 0.6 - 4);
      });

      setHoveredNode(hovered);
      animRef.current = requestAnimationFrame(simulate);
    };

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes.length]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const narrativeCount = nodes.filter(n => n.type === "narrative").length;
  const personCount = nodes.filter(n => n.type === "person").length;
  const sourceCount = nodes.filter(n => n.type === "source").length;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Narrative Network</h1>
          <p className="text-sm text-muted-foreground mt-1">Interactive graph revealing connections between narratives, people, and sources</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: TYPE_COLORS.narrative }} />
          <span className="text-xs text-muted-foreground">Narratives ({narrativeCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: TYPE_COLORS.person }} />
          <span className="text-xs text-muted-foreground">People ({personCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: TYPE_COLORS.source }} />
          <span className="text-xs text-muted-foreground">Sources ({sourceCount})</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-8 h-px bg-border" />
          <span>Connections ({edges.length})</span>
        </div>
      </div>

      <Card className={`bg-card border-border overflow-hidden relative ${isFullscreen ? "fixed inset-4 z-50" : ""}`}>
        {loading ? (
          <Skeleton className="w-full h-[500px]" />
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Network className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold text-foreground">No network data yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Run AI narrative detection to build the graph.</p>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              className="w-full cursor-crosshair"
              style={{ height: isFullscreen ? "calc(100vh - 64px)" : 500 }}
            />
            <Button
              variant="ghost" size="sm"
              className="absolute top-3 right-3"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>

            {/* Hovered node details */}
            {hoveredNode && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-4 left-4 bg-popover border border-border rounded-lg p-3 shadow-xl"
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: hoveredNode.color }} />
                  <span className="text-sm font-medium text-popover-foreground">{hoveredNode.label}</span>
                  <Badge variant="outline" className="text-[9px] capitalize">{hoveredNode.type}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {edges.filter(e => e.source === hoveredNode.id || e.target === hoveredNode.id).length} connections
                </p>
              </motion.div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
