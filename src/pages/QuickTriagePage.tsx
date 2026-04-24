/**
 * Quick Triage — Inbox Zero for brand threats.
 * Keyboard-driven: A=keep/approve  I=ignore  R=respond  S=snooze  ←/→ navigate
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, EyeOff, MessageCircleReply, Clock, ChevronLeft, ChevronRight,
  Zap, ExternalLink, Keyboard, Info, AlertTriangle, TrendingDown, CheckCheck,
  Loader2, RefreshCw, Flag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import PageGuide from "@/components/PageGuide";

interface TriageMention {
  id: string;
  content: string | null;
  source: string;
  author_name: string | null;
  author_handle: string | null;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
  url: string | null;
  flags: any;
  status: string | null;
}

const SENTIMENT_COLORS: Record<string, string> = {
  negative: "text-red-400",
  positive: "text-emerald-400",
  neutral: "text-muted-foreground",
  mixed: "text-amber-400",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "border-red-500/40 text-red-400 bg-red-500/10",
  high:     "border-amber-500/40 text-amber-400 bg-amber-500/10",
  medium:   "border-blue-500/40 text-blue-400 bg-blue-500/10",
  low:      "border-muted-foreground/30 text-muted-foreground",
};

function cleanContent(text: string | null): string {
  if (!text) return "";
  return text.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").trim();
}

export default function QuickTriagePage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mentions, setMentions] = useState<TriageMention[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);
  const [triaged, setTriaged] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    setDone(false);
    setIdx(0);
    setTriaged(0);

    // Load unreviewed brand mentions ordered by severity then recency
    const { data } = await supabase
      .from("mentions")
      .select("id, content, source, author_name, author_handle, sentiment_label, severity, posted_at, url, flags, status")
      .eq("org_id", currentOrg.id)
      .eq("mention_type", "brand")
      .not("status", "in", '("ignored","snoozed","resolved","reviewed")')
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    const items = data || [];
    setMentions(items);
    setTotal(items.length);
    setLoading(false);
    if (items.length === 0) setDone(true);
  }, [currentOrg]);

  useEffect(() => { load(); }, [load]);

  const current = mentions[idx] || null;
  const progress = total > 0 ? Math.round((triaged / total) * 100) : 0;

  const doAction = useCallback(async (action: "reviewed" | "ignored" | "snoozed" | "resolved") => {
    if (!current || actioning) return;
    setActioning(true);

    await supabase.from("mentions").update({ status: action }).eq("id", current.id);

    setActioning(false);
    setTriaged(t => t + 1);

    if (idx + 1 >= mentions.length) {
      setDone(true);
    } else {
      setIdx(i => i + 1);
    }
  }, [current, actioning, idx, mentions.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (done || !current) return;
      if (e.key === "a" || e.key === "k") doAction("reviewed");
      else if (e.key === "i" || e.key === "d") doAction("ignored");
      else if (e.key === "s") doAction("snoozed");
      else if (e.key === "v") doAction("resolved");
      else if (e.key === "r") navigate("/respond", { state: { prefillText: current.content || "", sourceMentionId: current.id } });
      else if (e.key === "ArrowRight" || e.key === "n") { if (idx < mentions.length - 1) setIdx(i => i + 1); }
      else if (e.key === "ArrowLeft" || e.key === "p") { if (idx > 0) setIdx(i => i - 1); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [done, current, doAction, navigate, idx, mentions.length]);

  return (
    <div className="space-y-6 animate-fade-up max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> Quick Triage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fast-action review — keep, ignore, snooze, or respond. Keyboard-driven.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Reload
        </Button>
      </div>

      <PageGuide
        title="Quick Triage — Inbox Zero for brand threats"
        subtitle="Work through unreviewed mentions quickly using keyboard shortcuts"
        steps={[
          { icon: <Keyboard className="h-4 w-4 text-primary" />, title: "Keyboard shortcuts", description: "A = keep/mark reviewed · I = ignore · S = snooze · V = resolved · R = respond · ←/→ navigate" },
          { icon: <Info className="h-4 w-4 text-primary" />, title: "What gets shown", description: "Unreviewed brand mentions, ordered by severity then recency. Up to 50 at a time." },
        ]}
        tip="Triage every morning to keep your inbox clean. Ignored mentions won't show on your dashboard."
      />

      {/* Progress bar */}
      {total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{triaged} triaged · {Math.max(total - triaged, 0)} remaining</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Card area */}
      {loading ? (
        <Skeleton className="h-72 w-full rounded-2xl" />
      ) : done ? (
        <Card className="bg-card border-border p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <CheckCheck className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">All clear!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {triaged > 0 ? `You triaged ${triaged} mention${triaged !== 1 ? "s" : ""}.` : "No unreviewed mentions to triage right now."}
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="outline" onClick={() => navigate("/mentions")}>
              View All Mentions
            </Button>
            <Button onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Check Again
            </Button>
          </div>
        </Card>
      ) : current ? (
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <Card ref={cardRef} className="bg-card border-border p-6 space-y-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs font-medium">
                      {current.source}
                    </Badge>
                    {current.severity && (
                      <Badge variant="outline" className={`text-[10px] capitalize ${SEVERITY_COLORS[current.severity]}`}>
                        {current.severity === "critical" && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                        {current.severity}
                      </Badge>
                    )}
                    {current.sentiment_label && (
                      <span className={`text-xs font-medium ${SENTIMENT_COLORS[current.sentiment_label]} flex items-center gap-0.5`}>
                        {current.sentiment_label === "negative" && <TrendingDown className="h-3 w-3" />}
                        {current.sentiment_label}
                      </span>
                    )}
                    {(current.flags as any)?.misinformation && (
                      <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400 bg-red-500/5">
                        <Flag className="h-2.5 w-2.5 mr-0.5" /> Misinformation
                      </Badge>
                    )}
                    {(current.flags as any)?.coordinated && (
                      <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 bg-purple-500/5">
                        Coordinated
                      </Badge>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground block">
                      {idx + 1} / {mentions.length}
                    </span>
                    {current.posted_at && (
                      <span className="text-[10px] text-muted-foreground block">
                        {formatDistanceToNow(new Date(current.posted_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Author */}
                {(current.author_name || current.author_handle) && (
                  <div className="text-xs text-muted-foreground">
                    By <span className="font-medium text-foreground">{current.author_name || current.author_handle}</span>
                  </div>
                )}

                {/* Content */}
                <div className="text-base text-card-foreground leading-relaxed bg-muted/30 rounded-xl p-4 border border-border/50 min-h-[80px]">
                  {cleanContent(current.content) || <span className="italic text-muted-foreground">No content preview available</span>}
                </div>

                {/* Source link */}
                {current.url && (
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> View original source
                  </a>
                )}
              </Card>
            </motion.div>
          </AnimatePresence>

          {/* Action buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Button
              onClick={() => doAction("reviewed")}
              disabled={actioning}
              className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 gap-2"
              variant="ghost"
            >
              {actioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span>Keep <kbd className="text-[9px] opacity-50 font-mono ml-1">[A]</kbd></span>
            </Button>
            <Button
              onClick={() => doAction("ignored")}
              disabled={actioning}
              variant="ghost"
              className="bg-muted/50 hover:bg-muted border border-border gap-2"
            >
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              <span>Ignore <kbd className="text-[9px] opacity-50 font-mono ml-1">[I]</kbd></span>
            </Button>
            <Button
              onClick={() => doAction("snoozed")}
              disabled={actioning}
              variant="ghost"
              className="bg-muted/50 hover:bg-muted border border-border gap-2"
            >
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Snooze <kbd className="text-[9px] opacity-50 font-mono ml-1">[S]</kbd></span>
            </Button>
            <Button
              onClick={() => navigate("/respond", { state: { prefillText: current.content || "", sourceMentionId: current.id } })}
              disabled={actioning}
              variant="ghost"
              className="bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary gap-2"
            >
              <MessageCircleReply className="h-4 w-4" />
              <span>Respond <kbd className="text-[9px] opacity-50 font-mono ml-1">[R]</kbd></span>
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} className="gap-1.5 text-muted-foreground">
              <ChevronLeft className="h-4 w-4" /> Prev <kbd className="text-[9px] opacity-40 font-mono">[←]</kbd>
            </Button>
            <div className="flex gap-1.5">
              {mentions.slice(Math.max(0, idx - 2), idx + 3).map((m, i) => {
                const absIdx = Math.max(0, idx - 2) + i;
                return (
                  <button
                    key={m.id}
                    onClick={() => setIdx(absIdx)}
                    className={`w-2 h-2 rounded-full transition-all ${absIdx === idx ? "bg-primary scale-125" : "bg-muted hover:bg-muted-foreground/40"}`}
                  />
                );
              })}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setIdx(i => Math.min(mentions.length - 1, i + 1))} disabled={idx === mentions.length - 1} className="gap-1.5 text-muted-foreground">
              Next <kbd className="text-[9px] opacity-40 font-mono">[→]</kbd> <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Keyboard hint */}
          <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
            {[["A","Keep"],["I","Ignore"],["R","Respond"],["S","Snooze"],["←","Prev"],["→","Next"]].map(([key, label]) => (
              <span key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-xs">{key}</kbd>
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
