import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import PageGuide from "@/components/PageGuide";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Network, Loader2, X, Shield, MessageSquare, ExternalLink, Search,
  RefreshCw, Maximize2, Minimize2, ZoomIn, ZoomOut,
} from "lucide-react";

interface GraphNode {
  id: string;
  label: string;
  type: "narrative" | "person" | "source" | "entity";
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

const TYPE_CONFIG: Record<string, { fill: string; size: number }> = {
  narrative: { fill: "#3b82f6", size: 8 },
  person: { fill: "#8b5cf6", size: 6 },
  source: { fill: "#06b6d4", size: 5 },
  entity: { fill: "#f97316", size: 6 },
};

const PHYSICS = {
  chargeStrength: -120,   // weaker repulsion — was -300, caused explosion
  linkDistance: 120,
  dampingFactor: 0.05,
  dt: 0.016,
  velocityDecay: 0.85,    // more damping so nodes settle faster
  centerStrength: 0.03,   // center gravity — pulls nodes back to canvas center
  maxVelocity: 8,         // velocity cap — prevents runaway acceleration
};

const MAX_SOURCE_NODES = 15; // cap source nodes to prevent O(n²) explosion

export default function NarrativeGraphPage() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { toast } = useToast();

  // Core state
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Filter & view state
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sentimentView, setSentimentView] = useState(false);
  const [mentionsForNode, setMentionsForNode] = useState<any[]>([]);
  const [loadingNodeData, setLoadingNodeData] = useState(false);

  // Refs for performance
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const selectedRef = useRef<GraphNode | null>(null);
  const viewRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const animationFrameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // Filter refs (for perf)
  const hiddenTypesRef = useRef<Set<string>>(new Set());
  const searchQueryRef = useRef("");
  const sentimentViewRef = useRef(false);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  // Data refs
  const narrativeDataRef = useRef<Map<string, any>>(new Map());
  const peopleDataRef = useRef<Map<string, any>>(new Map());
  const entityDataRef = useRef<Map<string, any>>(new Map());
  const sentimentMapRef = useRef<
    Map<string, { positive: number; negative: number; neutral: number; dominant: string }>
  >(new Map());
  const personNarrativesRef = useRef<Map<string, string[]>>(new Map());
  const sourceNarrativesRef = useRef<Map<string, string[]>>(new Map());
  const entityNarrativesRef = useRef<Map<string, string[]>>(new Map());

  // Sync refs when state changes
  useEffect(() => {
    hiddenTypesRef.current = hiddenTypes;
  }, [hiddenTypes]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    sentimentViewRef.current = sentimentView;
  }, [sentimentView]);

  // Load data from Supabase
  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);

    Promise.all([
      supabase.from("narratives").select("id, name, description, status, confidence").eq("org_id", currentOrg.id).limit(50),
      supabase.from("people").select("id, name, handle, platform, follower_count").eq("org_id", currentOrg.id).limit(50),
      supabase.from("mentions").select("id, source, author_name, sentiment_label, posted_at").eq("org_id", currentOrg.id).limit(200),
      supabase.from("mention_narratives").select("mention_id, narrative_id").eq("org_id", currentOrg.id).limit(500),
      supabase.from("mention_people").select("mention_id, person_id").eq("org_id", currentOrg.id).limit(500),
      supabase.from("entity_records").select("id, display_name, handle, platform, risk_type").eq("org_id", currentOrg.id).limit(20),
    ])
      .then(
        ([
          { data: narrativesRes },
          { data: peopleRes },
          { data: mentionsRes },
          { data: mentionNarrativesRes },
          { data: mentionPeopleRes },
          { data: entitiesRes },
        ]) => {
          const narratives = narrativesRes || [];
          const people = peopleRes || [];
          const mentions = mentionsRes || [];
          const mentionNarratives = mentionNarrativesRes || [];
          const mentionPeople = mentionPeopleRes || [];
          const entities = entitiesRes || [];

          // Build narrative data ref
          narratives.forEach((n: any) => {
            narrativeDataRef.current.set(n.id, {
              id: n.id,
              name: n.name,
              description: n.description,
              status: n.status,
              confidence: n.confidence,
            });
          });

          // Build people data ref
          people.forEach((p: any) => {
            peopleDataRef.current.set(p.id, {
              id: p.id,
              name: p.name,
              handle: p.handle,
              platform: p.platform,
              follower_count: p.follower_count,
            });
          });

          // Build entity data ref
          entities.forEach((e: any) => {
            entityDataRef.current.set(e.id, {
              id: e.id,
              display_name: e.display_name,
              handle: e.handle,
              platform: e.platform,
              risk_type: e.risk_type,
            });
          });

          // Build graph nodes
          const nodeMap = new Map<string, GraphNode>();
          const sources = new Set<string>();

          // Add narrative nodes
          narratives.forEach((n: any) => {
            const node: GraphNode = {
              id: `n-${n.id}`,
              label: n.name,
              type: "narrative",
              x: Math.random() * 600 - 300,
              y: Math.random() * 600 - 300,
              vx: 0,
              vy: 0,
            };
            nodeMap.set(node.id, node);
          });

          // Add person nodes and build person->narratives map
          people.forEach((p: any) => {
            const node: GraphNode = {
              id: `p-${p.id}`,
              label: p.handle || p.name,
              type: "person",
              x: Math.random() * 600 - 300,
              y: Math.random() * 600 - 300,
              vx: 0,
              vy: 0,
            };
            nodeMap.set(node.id, node);
            const narrativeIds = mentionPeople
              .filter((mp: any) => mp.person_id === p.id)
              .map((mp: any) =>
                mentionNarratives.find((mn: any) => mn.mention_id === mp.mention_id)?.narrative_id
              )
              .filter(Boolean);
            personNarrativesRef.current.set(p.id, narrativeIds);
          });

          // Add entity nodes and build entity->narratives map
          entities.forEach((e: any) => {
            const node: GraphNode = {
              id: `e-${e.id}`,
              label: e.display_name || e.handle,
              type: "entity",
              x: Math.random() * 600 - 300,
              y: Math.random() * 600 - 300,
              vx: 0,
              vy: 0,
            };
            nodeMap.set(node.id, node);

            // Find mentions where source/author contains entity handle
            const entityHandle = (e.handle || "").toLowerCase();
            const entityName = (e.display_name || "").toLowerCase();
            const narrativeIds = mentions
              .filter(
                (m: any) =>
                  (m.source || "").toLowerCase().includes(entityHandle) ||
                  (m.source || "").toLowerCase().includes(entityName) ||
                  (m.author_name || "").toLowerCase().includes(entityHandle) ||
                  (m.author_name || "").toLowerCase().includes(entityName)
              )
              .map((m: any) =>
                mentionNarratives.find((mn: any) => mn.mention_id === m.id)?.narrative_id
              )
              .filter(Boolean);
            entityNarrativesRef.current.set(e.id, narrativeIds);
          });

          // Collect unique sources and build source->narratives map
          // Score each source by number of unique narratives it covers, then cap to MAX_SOURCE_NODES
          const sourceNarrativeCounts = new Map<string, Set<string>>();
          mentions.forEach((m: any) => {
            if (!m.source) return;
            sources.add(m.source);
            if (!sourceNarrativeCounts.has(m.source)) sourceNarrativeCounts.set(m.source, new Set());
            const nid = mentionNarratives.find((mn: any) => mn.mention_id === m.id)?.narrative_id;
            if (nid) sourceNarrativeCounts.get(m.source)!.add(nid);
          });
          // Sort sources by narrative coverage, keep top MAX_SOURCE_NODES
          const topSources = Array.from(sources)
            .sort((a, b) => (sourceNarrativeCounts.get(b)?.size || 0) - (sourceNarrativeCounts.get(a)?.size || 0))
            .slice(0, MAX_SOURCE_NODES);

          topSources.forEach((source: string) => {
            const node: GraphNode = {
              id: `s-${source}`,
              label: source,
              type: "source",
              x: Math.random() * 600 - 300,
              y: Math.random() * 600 - 300,
              vx: 0,
              vy: 0,
            };
            nodeMap.set(node.id, node);

            const narrativeIds = mentions
              .filter((m: any) => m.source === source)
              .map((m: any) =>
                mentionNarratives.find((mn: any) => mn.mention_id === m.id)?.narrative_id
              )
              .filter(Boolean);
            sourceNarrativesRef.current.set(source, narrativeIds);
          });

          // Build sentiment map
          const sentimentMap = new Map<
            string,
            { positive: number; negative: number; neutral: number; dominant: string }
          >();
          narratives.forEach((n: any) => {
            const relatedMentions = mentions.filter((m: any) =>
              mentionNarratives.find(
                (mn: any) => mn.mention_id === m.id && mn.narrative_id === n.id
              )
            );
            const counts = {
              positive: relatedMentions.filter((m: any) => m.sentiment_label === "positive")
                .length,
              negative: relatedMentions.filter((m: any) => m.sentiment_label === "negative")
                .length,
              neutral: relatedMentions.filter((m: any) => m.sentiment_label === "neutral")
                .length,
            };
            const total = counts.positive + counts.negative + counts.neutral;
            const dominant =
              total === 0
                ? "neutral"
                : counts.positive >= counts.negative && counts.positive >= counts.neutral
                  ? "positive"
                  : counts.negative >= counts.neutral
                    ? "negative"
                    : "neutral";
            sentimentMap.set(n.id, { ...counts, dominant });
          });
          sentimentMapRef.current = sentimentMap;

          // Build edges
          const edgeSet = new Set<string>();

          // Narrative -> Person edges
          mentionPeople.forEach((mp: any) => {
            const narrativeId = mentionNarratives.find(
              (mn: any) => mn.mention_id === mp.mention_id
            )?.narrative_id;
            if (narrativeId) {
              edgeSet.add(`n-${narrativeId}|p-${mp.person_id}`);
            }
          });

          // Narrative -> Source edges
          mentionNarratives.forEach((mn: any) => {
            const mention = mentions.find((m: any) => m.id === mn.mention_id);
            if (mention?.source) {
              edgeSet.add(`n-${mn.narrative_id}|s-${mention.source}`);
            }
          });

          // Narrative -> Entity edges
          entities.forEach((e: any) => {
            const narrativeIds = entityNarrativesRef.current.get(e.id) || [];
            narrativeIds.forEach((nid: string) => {
              edgeSet.add(`n-${nid}|e-${e.id}`);
            });
          });

          const edgeList: GraphEdge[] = Array.from(edgeSet).map((edge) => {
            const [source, target] = edge.split("|");
            return { source, target };
          });

          // Set state
          const nodeList = Array.from(nodeMap.values());
          setNodes(nodeList);
          setEdges(edgeList);
          nodesRef.current = nodeList;
          edgesRef.current = edgeList;
          setLoading(false);
        }
      )
      .catch((err) => {
        console.error("Error loading graph data:", err);
        setLoading(false);
      });
  }, [currentOrg]);

  // Load mention data for selected narrative node
  useEffect(() => {
    if (!selectedNode || selectedNode.type !== "narrative") {
      setMentionsForNode([]);
      return;
    }
    const rawId = selectedNode.id.replace("n-", "");
    setLoadingNodeData(true);

    supabase
      .from("mention_narratives")
      .select("mention_id")
      .eq("narrative_id", rawId)
      .limit(20)
      .then(async ({ data: mnData }) => {
        if (!mnData?.length) {
          setMentionsForNode([]);
          setLoadingNodeData(false);
          return;
        }
        const ids = mnData.map((m: any) => m.mention_id);
        const { data } = await supabase
          .from("mentions")
          .select("id, source, content, sentiment_label, posted_at, created_at")
          .in("id", ids)
          .order("created_at", { ascending: false })
          .limit(5);
        setMentionsForNode(data || []);
        setLoadingNodeData(false);
      });
  }, [selectedNode]);

  // Keyboard shortcut to close panel
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        selectedRef.current = null;
        setSelectedNode(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Physics simulation
  const updatePhysics = useCallback(() => {
    const ns = nodesRef.current;
    const es = edgesRef.current;

    // Apply forces
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const dx = ns[j].x - ns[i].x;
        const dy = ns[j].y - ns[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const force =
          (PHYSICS.chargeStrength * TYPE_CONFIG[ns[i].type].size * TYPE_CONFIG[ns[j].type].size) /
          (dist * dist);
        const fx = (force * dx) / dist;
        const fy = (force * dy) / dist;
        ns[i].vx -= fx;
        ns[i].vy -= fy;
        ns[j].vx += fx;
        ns[j].vy += fy;
      }
    }

    // Apply link forces
    es.forEach((e) => {
      const source = ns.find((n) => n.id === e.source);
      const target = ns.find((n) => n.id === e.target);
      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const force = (dist - PHYSICS.linkDistance) / dist;
      const fx = force * dx * 0.1;
      const fy = force * dy * 0.1;

      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    });

    const canvas = canvasRef.current;
    ns.forEach((n) => {
      if (isDraggingRef.current && selectedRef.current?.id === n.id) return;

      // Center gravity — pulls nodes back toward world origin (0,0 = canvas center)
      n.vx += -n.x * PHYSICS.centerStrength;
      n.vy += -n.y * PHYSICS.centerStrength;

      // Velocity damping
      n.vx *= PHYSICS.velocityDecay;
      n.vy *= PHYSICS.velocityDecay;

      // Velocity cap — prevents runaway acceleration
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > PHYSICS.maxVelocity) {
        n.vx = (n.vx / speed) * PHYSICS.maxVelocity;
        n.vy = (n.vy / speed) * PHYSICS.maxVelocity;
      }

      n.x += n.vx;
      n.y += n.vy;
    });
  }, []);

  // Canvas rendering
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const view = viewRef.current;

    // Clear
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, w, h);

    // Compute matching IDs for search highlight
    const ns = nodesRef.current;
    const matchingIds = searchQueryRef.current
      ? new Set(
          ns.flatMap((n) => {
            if (hiddenTypesRef.current.has(n.type)) return [];
            if (
              !n.label
                .toLowerCase()
                .includes(searchQueryRef.current.toLowerCase())
            )
              return [];
            const connected = edgesRef.current
              .filter((e) => e.source === n.id || e.target === n.id)
              .flatMap((e) => [e.source, e.target]);
            return [n.id, ...connected];
          })
        )
      : null;

    // Draw edges
    edgesRef.current.forEach((e) => {
      const source = ns.find((n) => n.id === e.source);
      const target = ns.find((n) => n.id === e.target);
      if (!source || !target) return;
      if (hiddenTypesRef.current.has(source.type) || hiddenTypesRef.current.has(target.type))
        return;

      const x1 = (source.x - view.tx) * view.scale + w / 2;
      const y1 = (source.y - view.ty) * view.scale + h / 2;
      const x2 = (target.x - view.tx) * view.scale + w / 2;
      const y2 = (target.y - view.ty) * view.scale + h / 2;

      const dimmed =
        (matchingIds && !matchingIds.has(source.id)) ||
        (matchingIds && !matchingIds.has(target.id));

      ctx.strokeStyle = dimmed ? "rgba(75, 85, 99, 0.2)" : "rgba(75, 85, 99, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    // Draw nodes
    ns.forEach((n) => {
      if (hiddenTypesRef.current.has(n.type)) return;

      const x = (n.x - view.tx) * view.scale + w / 2;
      const y = (n.y - view.ty) * view.scale + h / 2;
      const dimmed = matchingIds && !matchingIds.has(n.id);

      let fill = TYPE_CONFIG[n.type].fill;

      // Sentiment coloring for narratives
      if (sentimentViewRef.current && n.type === "narrative") {
        const rawId = n.id.replace("n-", "");
        const sent = sentimentMapRef.current.get(rawId);
        if (sent) {
          fill =
            sent.dominant === "positive"
              ? "#22c55e"
              : sent.dominant === "negative"
                ? "#ef4444"
                : "#f59e0b";
        }
      }

      const size = TYPE_CONFIG[n.type].size;
      ctx.fillStyle = fill;
      ctx.globalAlpha = dimmed ? 0.3 : selectedRef.current?.id === n.id ? 1 : 0.8;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Highlight selected node
      if (selectedRef.current?.id === n.id) {
        ctx.strokeStyle = fill;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }, []);

  // Animation loop
  useEffect(() => {
    let rafId = 0;
    const loop = () => {
      updatePhysics();
      render();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    animationFrameRef.current = rafId;
    return () => cancelAnimationFrame(rafId);
  }, [updatePhysics, render]);

  // Mouse handlers
  const hitNode = useCallback(
    (px: number, py: number): GraphNode | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const w = canvas.width;
      const h = canvas.height;
      const view = viewRef.current;

      for (const n of nodesRef.current) {
        if (hiddenTypesRef.current.has(n.type)) continue;
        const x = (n.x - view.tx) * view.scale + w / 2;
        const y = (n.y - view.ty) * view.scale + h / 2;
        const size = TYPE_CONFIG[n.type].size;
        const dx = px - x;
        const dy = py - y;
        if (Math.sqrt(dx * dx + dy * dy) < size + 5) return n;
      }
      return null;
    },
    []
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = hitNode(x, y);
    if (hit && e.button === 0) {
      isDraggingRef.current = true;
      dragStartRef.current = { x, y };
      selectedRef.current = hit;
    } else if (e.button === 2) {
      isPanningRef.current = true;
      panStartRef.current = { x, y };
    }
  }, [hitNode]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDraggingRef.current && selectedRef.current) {
      selectedRef.current.x += (x - dragStartRef.current.x) / viewRef.current.scale;
      selectedRef.current.y += (y - dragStartRef.current.y) / viewRef.current.scale;
      // Zero velocity so node doesn't fly off when released
      selectedRef.current.vx = 0;
      selectedRef.current.vy = 0;
      dragStartRef.current = { x, y };
    } else if (isPanningRef.current) {
      const dx = x - panStartRef.current.x;
      const dy = y - panStartRef.current.y;
      viewRef.current.tx -= dx / viewRef.current.scale;
      viewRef.current.ty -= dy / viewRef.current.scale;
      panStartRef.current = { x, y };
    } else {
      canvas.style.cursor = hitNode(x, y) ? "pointer" : "grab";
    }
  }, [hitNode]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const wasDragging = isDraggingRef.current;
    const wasPanning = isPanningRef.current;

    isDraggingRef.current = false;
    isPanningRef.current = false;

    if (!wasDragging && !wasPanning) {
      const hit = hitNode(x, y);
      if (hit) {
        const now = Date.now();
        const last = lastClickRef.current;
        if (last && last.id === hit.id && now - last.time < 300) {
          // Double click — navigate
          const rawId = hit.id.replace(/^[npse]-/, "");
          if (hit.type === "narrative") navigate("/narratives");
          else if (hit.type === "person") navigate("/people");
          else if (hit.type === "entity") navigate("/entities/" + rawId);
          lastClickRef.current = null;
        } else {
          lastClickRef.current = { id: hit.id, time: now };
          const isSame = selectedRef.current?.id === hit.id;
          selectedRef.current = isSame ? null : hit;
          setSelectedNode(isSame ? null : hit);
        }
      } else {
        selectedRef.current = null;
        setSelectedNode(null);
      }
    }
    canvas.style.cursor = "grab";
  }, [hitNode, navigate]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    viewRef.current.scale = Math.max(0.3, Math.min(3, viewRef.current.scale * zoomFactor));
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  }, []);

  // Insight cards data
  const mostConnected = useMemo(() => {
    const counts: Record<string, number> = {};
    edges.forEach((e) => {
      if (e.source.startsWith("n-")) counts[e.source] = (counts[e.source] || 0) + 1;
      if (e.target.startsWith("n-")) counts[e.target] = (counts[e.target] || 0) + 1;
    });
    return nodes
      .filter((n) => n.type === "narrative")
      .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))
      .slice(0, 5);
  }, [nodes, edges]);

  const keySources = useMemo(() => {
    const counts: Record<string, number> = {};
    edges.forEach((e) => {
      if (e.source.startsWith("s-")) counts[e.source] = (counts[e.source] || 0) + 1;
      if (e.target.startsWith("s-")) counts[e.target] = (counts[e.target] || 0) + 1;
    });
    return nodes
      .filter((n) => n.type === "source")
      .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))
      .slice(0, 5);
  }, [nodes, edges]);

  const networkStats = useMemo(() => {
    const narrativeNodes = nodes.filter((n) => n.type === "narrative");
    const counts: Record<string, number> = {};
    edges.forEach((e) => {
      counts[e.source] = (counts[e.source] || 0) + 1;
      counts[e.target] = (counts[e.target] || 0) + 1;
    });
    const sorted = narrativeNodes.sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    return {
      totalNodes: nodes.length,
      totalConnections: edges.length,
      mostCentral: sorted[0]?.label || "—",
      mostIsolated: sorted[sorted.length - 1]?.label || "—",
    };
  }, [nodes, edges]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-up">
        <PageGuide
          title="Narrative Force Graph — Network visualization"
          subtitle="Interactive graph showing how narratives, people, sources, and entities connect."
          steps={[
            {
              icon: <Network className="h-4 w-4 text-primary" />,
              title: "Click nodes",
              description: "Select any node to see details and related connections.",
            },
            {
              icon: <Search className="h-4 w-4 text-primary" />,
              title: "Search & filter",
              description: "Filter by node type or search by name.",
            },
          ]}
          tip="Double-click any node to jump to its detail page."
        />
        <Card className="p-10 text-center">
          <Loader2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3 animate-spin" />
          <h3 className="text-lg font-semibold text-foreground">Loading graph...</h3>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up pb-6">
      <PageGuide
        title="Narrative Force Graph — Network visualization"
        subtitle="Interactive graph showing how narratives, people, sources, and entities connect."
        steps={[
          {
            icon: <Network className="h-4 w-4 text-primary" />,
            title: "Click nodes",
            description: "Select any node to see details and related connections.",
          },
          {
            icon: <Search className="h-4 w-4 text-primary" />,
            title: "Search & filter",
            description: "Filter by node type or search by name.",
          },
        ]}
        tip="Double-click any node to jump to its detail page."
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Network Graph</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {nodes.length} nodes · {edges.length} connections
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {[
          { type: "narrative", color: "#3b82f6", label: "Narratives" },
          { type: "person", color: "#8b5cf6", label: "People" },
          { type: "source", color: "#06b6d4", label: "Sources" },
          { type: "entity", color: "#f97316", label: "Entities" },
        ].map((t) => {
          const hidden = hiddenTypes.has(t.type);
          return (
            <button
              key={t.type}
              onClick={() => {
                setHiddenTypes((prev) => {
                  const next = new Set(prev);
                  if (next.has(t.type)) next.delete(t.type);
                  else next.add(t.type);
                  return next;
                });
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                hidden
                  ? "opacity-40 border-border bg-muted/20"
                  : "border-border bg-muted/60 hover:bg-muted"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: hidden ? "#4b5563" : t.color }}
              />
              {t.label}
              <span className="text-muted-foreground">
                ({nodes.filter((n) => n.type === t.type).length})
              </span>
            </button>
          );
        })}

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="pl-8 h-8 text-xs bg-muted border-border"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Sentiment view toggle */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-muted/40">
          <span className="text-xs text-muted-foreground">Sentiment colors</span>
          <Switch
            checked={sentimentView}
            onCheckedChange={setSentimentView}
            className="scale-75"
          />
        </div>

        {/* Reset */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSearchQuery("");
            setHiddenTypes(new Set());
            setSentimentView(false);
            viewRef.current = { tx: 0, ty: 0, scale: 1 };
          }}
          className="h-8 text-xs gap-1.5"
        >
          <RefreshCw className="h-3 w-3" /> Reset
        </Button>

        {/* Fullscreen */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="h-8 text-xs"
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Main graph + detail panel */}
      <div
        className={`flex gap-3 ${isFullscreen ? "fixed inset-4 z-50" : ""}`}
        style={{ height: isFullscreen ? "calc(100vh - 130px)" : 560 }}
      >
        <Card
          className="flex-1 relative overflow-hidden"
          style={{ background: "#0d1117" }}
        >
          <canvas
            ref={canvasRef}
            width={1200}
            height={560}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          />

          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 bg-black/40 hover:bg-black/60 text-white"
              onClick={() => {
                viewRef.current.scale = Math.min(3, viewRef.current.scale * 1.2);
              }}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 bg-black/40 hover:bg-black/60 text-white"
              onClick={() => {
                viewRef.current.scale = Math.max(0.3, viewRef.current.scale / 1.2);
              }}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-10 bg-black/50 backdrop-blur-sm rounded-lg p-2.5 flex flex-col gap-1.5">
            {[
              ["narrative", "#3b82f6", "Narrative"],
              ["person", "#8b5cf6", "Person"],
              ["source", "#06b6d4", "Source"],
              ["entity", "#f97316", "Entity"],
            ].map(([, color, label]) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: color as string }}
                />
                <span className="text-[10px] text-white/70">{label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              key={selectedNode.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="w-80 flex-shrink-0 bg-card border border-border rounded-xl overflow-y-auto"
              style={{ height: "100%" }}
            >
              {selectedNode.type === "narrative" && (
                <NarrativePanelContent
                  node={selectedNode}
                  onClose={() => setSelectedNode(null)}
                  onSelectNode={setSelectedNode}
                  mentionsData={mentionsForNode}
                  loading={loadingNodeData}
                  navigate={navigate}
                  toast={toast}
                />
              )}
              {selectedNode.type === "person" && (
                <PersonPanelContent
                  node={selectedNode}
                  onClose={() => setSelectedNode(null)}
                  onSelectNode={setSelectedNode}
                  navigate={navigate}
                />
              )}
              {selectedNode.type === "source" && (
                <SourcePanelContent
                  node={selectedNode}
                  onClose={() => setSelectedNode(null)}
                  onSelectNode={setSelectedNode}
                  navigate={navigate}
                  toast={toast}
                  currentOrg={currentOrg}
                />
              )}
              {selectedNode.type === "entity" && (
                <EntityPanelContent
                  node={selectedNode}
                  onClose={() => setSelectedNode(null)}
                  onSelectNode={setSelectedNode}
                  navigate={navigate}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Most Connected */}
        <Card className="bg-card border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Most Connected</h3>
          <div className="space-y-2">
            {mostConnected.map((n) => {
              const count = edges.filter(
                (e) => e.source === n.id || e.target === n.id
              ).length;
              return (
                <button
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className="w-full text-left flex items-center justify-between p-2 rounded-lg bg-muted/40 hover:bg-muted transition-colors text-xs"
                >
                  <span className="truncate text-foreground font-medium">{n.label}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {count}
                  </Badge>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Key Sources */}
        <Card className="bg-card border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Key Sources</h3>
          <div className="space-y-2">
            {keySources.map((n) => {
              const count = edges.filter(
                (e) => e.source === n.id || e.target === n.id
              ).length;
              return (
                <button
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className="w-full text-left flex items-center justify-between p-2 rounded-lg bg-muted/40 hover:bg-muted transition-colors text-xs"
                >
                  <span className="truncate text-foreground font-medium">{n.label}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {count}
                  </Badge>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Network Stats */}
        <Card className="bg-card border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Network Stats</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Total Nodes</span>
              <span className="font-mono font-medium text-foreground">
                {networkStats.totalNodes}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Connections</span>
              <span className="font-mono font-medium text-foreground">
                {networkStats.totalConnections}
              </span>
            </div>
            <div className="pt-2 border-t border-border/50">
              <p className="text-muted-foreground mb-1">Most Central</p>
              <p className="font-medium text-foreground truncate text-[11px]">
                {networkStats.mostCentral}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Most Isolated</p>
              <p className="font-medium text-foreground truncate text-[11px]">
                {networkStats.mostIsolated}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Panel content components
function NarrativePanelContent({
  node,
  onClose,
  onSelectNode,
  mentionsData,
  loading,
  navigate,
  toast,
}: {
  node: GraphNode;
  onClose: () => void;
  onSelectNode: (n: GraphNode) => void;
  mentionsData: any[];
  loading: boolean;
  navigate: any;
  toast: any;
}) {
  const rawId = node.id.replace("n-", "");
  const nd = narrativeDataRef.current.get(rawId);
  const sent = sentimentMapRef.current.get(rawId);
  const connEdges = edgesRef.current.filter(
    (e) => e.source === node.id || e.target === node.id
  );
  const connPeople = connEdges
    .map((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      return nodesRef.current.find((n) => n.id === otherId && n.type === "person");
    })
    .filter(Boolean);
  const connSources = connEdges
    .map((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      return nodesRef.current.find((n) => n.id === otherId && n.type === "source");
    })
    .filter(Boolean);

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className="text-xs text-blue-400 border-blue-400/30"
          >
            Narrative
          </Badge>
          {nd?.status && (
            <Badge variant="outline" className="text-xs capitalize">
              {nd.status}
            </Badge>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <h3 className="text-sm font-semibold text-foreground leading-snug">
        {node.label}
      </h3>

      <div className="flex gap-3 text-xs text-muted-foreground">
        {nd?.confidence && (
          <span className="text-foreground font-medium">
            {Math.round(Number(nd.confidence) * 100)}% confidence
          </span>
        )}
        <span>{connEdges.length} connections</span>
      </div>

      {sent && sent.positive + sent.negative + sent.neutral > 0 && (() => {
        const total = sent.positive + sent.negative + sent.neutral;
        return (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Sentiment
            </p>
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              <div
                className="bg-emerald-500"
                style={{ width: `${(sent.positive / total) * 100}%` }}
              />
              <div
                className="bg-red-500"
                style={{ width: `${(sent.negative / total) * 100}%` }}
              />
              <div
                className="bg-muted-foreground/30"
                style={{ width: `${(sent.neutral / total) * 100}%` }}
              />
            </div>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span className="text-emerald-400">{sent.positive} pos</span>
              <span className="text-red-400">{sent.negative} neg</span>
              <span>{sent.neutral} neu</span>
            </div>
          </div>
        );
      })()}

      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
          Recent Mentions
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
          </div>
        ) : mentionsData.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No mentions linked yet.</p>
        ) : (
          <div className="space-y-2">
            {mentionsData.map((m: any) => (
              <div
                key={m.id}
                className="p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-primary font-medium truncate max-w-[120px]">
                    {m.source || "unknown"}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {formatDistanceToNow(
                      new Date(m.posted_at || m.created_at),
                      { addSuffix: true }
                    )}
                  </span>
                </div>
                <p className="text-muted-foreground leading-snug line-clamp-2">
                  {(m.content || "").slice(0, 80)}
                  {(m.content || "").length > 80 ? "…" : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {connPeople.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
            People
          </p>
          <div className="flex flex-wrap gap-1.5">
            {connPeople.slice(0, 6).map((p: any) => (
              <button
                key={p!.id}
                onClick={() => onSelectNode(p!)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors"
              >
                {p!.label.slice(0, 20)}
              </button>
            ))}
          </div>
        </div>
      )}

      {connSources.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
            Sources
          </p>
          <div className="flex flex-wrap gap-1.5">
            {connSources.slice(0, 6).map((s: any) => (
              <button
                key={s!.id}
                onClick={() => onSelectNode(s!)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
              >
                {s!.label.slice(0, 20)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 pt-2">
        <Button
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => navigate("/narratives")}
        >
          <ExternalLink className="h-3.5 w-3.5" /> View Narrative
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 text-xs"
          onClick={() =>
            navigate("/respond", { state: { prefillText: node.label } })
          }
        >
          <MessageSquare className="h-3.5 w-3.5" /> Draft Response
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 text-xs"
          onClick={() => navigate("/incidents")}
        >
          Create Incident
        </Button>
      </div>
    </div>
  );
}

function PersonPanelContent({
  node,
  onClose,
  onSelectNode,
  navigate,
}: {
  node: GraphNode;
  onClose: () => void;
  onSelectNode: (n: GraphNode) => void;
  navigate: any;
}) {
  const rawId = node.id.replace("p-", "");
  const pd = peopleDataRef.current.get(rawId);
  const narrativeIds = personNarrativesRef.current.get(rawId) || [];
  const relatedNarrativeNodes = narrativeIds
    .map((nid: string) => nodesRef.current.find((n) => n.id === `n-${nid}`))
    .filter(Boolean);

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <Badge
          variant="outline"
          className="text-xs text-purple-400 border-purple-400/30"
        >
          Person
        </Badge>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{node.label}</h3>
        {pd?.follower_count && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {pd.follower_count.toLocaleString()} followers
          </p>
        )}
      </div>
      {relatedNarrativeNodes.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
            Appears in Narratives
          </p>
          <div className="space-y-1.5">
            {relatedNarrativeNodes.map((n: any) => (
              <button
                key={n!.id}
                onClick={() => onSelectNode(n!)}
                className="w-full text-left flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted transition-colors text-xs"
              >
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="truncate text-foreground">{n!.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <Button
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={() => navigate("/people")}
      >
        <ExternalLink className="h-3.5 w-3.5" /> View Person Profile
      </Button>
    </div>
  );
}

function SourcePanelContent({
  node,
  onClose,
  onSelectNode,
  navigate,
  toast,
  currentOrg,
}: {
  node: GraphNode;
  onClose: () => void;
  onSelectNode: (n: GraphNode) => void;
  navigate: any;
  toast: any;
  currentOrg: any;
}) {
  const sourceLabel = node.label;
  const narrativeIds = sourceNarrativesRef.current.get(sourceLabel) || [];
  const relatedNarrativeNodes = narrativeIds
    .map((nid: string) => nodesRef.current.find((n) => n.id === `n-${nid}`))
    .filter(Boolean);

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <Badge
          variant="outline"
          className="text-xs text-cyan-400 border-cyan-400/30"
        >
          Source
        </Badge>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <h3 className="text-sm font-semibold text-foreground break-all">
        {sourceLabel}
      </h3>
      {relatedNarrativeNodes.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
            Covers Narratives
          </p>
          <div className="space-y-1.5">
            {relatedNarrativeNodes.map((n: any) => (
              <button
                key={n!.id}
                onClick={() => onSelectNode(n!)}
                className="w-full text-left flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted transition-colors text-xs"
              >
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="truncate text-foreground">{n!.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2 pt-2">
        <Button
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() =>
            navigate(`/mentions?source=${encodeURIComponent(sourceLabel)}`)
          }
        >
          <ExternalLink className="h-3.5 w-3.5" /> View Mentions from Source
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 text-xs text-red-400 border-red-400/30 hover:bg-red-400/10"
          onClick={async () => {
            if (!currentOrg) return;
            const { error } = await (supabase as any)
              .from("ignored_sources")
              .insert({ org_id: currentOrg.id, domain: sourceLabel });
            if (!error)
              toast({
                title: "Source blocked",
                description: `${sourceLabel} will be ignored in future scans.`,
              });
            else
              toast({
                title: "Already blocked or error",
                variant: "destructive",
              });
          }}
        >
          Block This Source
        </Button>
      </div>
    </div>
  );
}

function EntityPanelContent({
  node,
  onClose,
  onSelectNode,
  navigate,
}: {
  node: GraphNode;
  onClose: () => void;
  onSelectNode: (n: GraphNode) => void;
  navigate: any;
}) {
  const rawId = node.id.replace("e-", "");
  const ed = entityDataRef.current.get(rawId);
  const narrativeIds = entityNarrativesRef.current.get(rawId) || [];
  const relatedNarrativeNodes = narrativeIds
    .map((nid: string) => nodesRef.current.find((n) => n.id === `n-${nid}`))
    .filter(Boolean);

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs text-orange-400 border-orange-400/30"
          >
            Entity
          </Badge>
          {ed?.risk_type && ed.risk_type !== "none" && (
            <Badge
              variant="outline"
              className="text-xs text-red-400 border-red-400/20 capitalize"
            >
              {ed.risk_type.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{node.label}</h3>
        {ed?.platform && (
          <Badge variant="outline" className="text-[10px] mt-1 capitalize">
            {ed.platform}
          </Badge>
        )}
      </div>
      {relatedNarrativeNodes.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
            Connected Narratives
          </p>
          <div className="space-y-1.5">
            {relatedNarrativeNodes.map((n: any) => (
              <button
                key={n!.id}
                onClick={() => onSelectNode(n!)}
                className="w-full text-left flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted transition-colors text-xs"
              >
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="truncate text-foreground">{n!.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <Button
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={() => navigate("/entities/" + rawId)}
      >
        <Shield className="h-3.5 w-3.5" /> View Entity Record
      </Button>
    </div>
  );
}
