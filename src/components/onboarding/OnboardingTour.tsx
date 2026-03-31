/**
 * Interactive visual onboarding tour with spotlight overlay.
 * Shows automatically on first visit, re-triggerable via HelpButton or /guide.
 * Uses a spotlight + tooltip approach — highlights actual UI elements.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, ArrowRight, ArrowLeft, Shield, Scan, MessageSquareWarning,
  Brain, Zap, Target, BarChart3, CheckCircle2,
} from "lucide-react";

const TOUR_KEY = "factsent_tour_v2_completed";

interface TourStep {
  id: string;
  icon: any;
  color: string;
  title: string;
  description: string;
  action?: { label: string; route: string };
  tip?: string;
}

const STEPS: TourStep[] = [
  {
    id: "welcome",
    icon: Shield,
    color: "hsl(var(--primary))",
    title: "Welcome to Fact Sentinel",
    description: "Your AI-powered reputation intelligence platform. We monitor news, social media, and forums for mentions of your brand — detecting threats before they become crises.",
    tip: "This tour takes about 60 seconds.",
  },
  {
    id: "scan",
    icon: Scan,
    color: "hsl(142, 71%, 45%)",
    title: "Step 1 — Run a Scan",
    description: "Scans crawl Google News, Bing News, Reddit, HackerNews, and any connected social APIs for your brand keywords. Each mention is AI-analyzed for sentiment and severity.",
    action: { label: "Go to Scans →", route: "/scans" },
    tip: "Start with an auto-scan — it uses all your brand keywords automatically.",
  },
  {
    id: "mentions",
    icon: MessageSquareWarning,
    color: "hsl(38, 92%, 50%)",
    title: "Step 2 — Review Mentions",
    description: "Every detected mention appears here with AI sentiment (positive/negative/neutral/mixed), severity (low/medium/high/critical), and source. You can ignore, snooze, escalate, or respond to any mention.",
    action: { label: "View Mentions →", route: "/mentions" },
    tip: "Click any mention to see full detail including linked narratives.",
  },
  {
    id: "narratives",
    icon: Brain,
    color: "hsl(262, 83%, 58%)",
    title: "Step 3 — Understand Narratives",
    description: "The AI automatically clusters related mentions into narratives — the stories forming around your brand. Each narrative has a confidence score, status (active/watch), and is tracked over time.",
    action: { label: "View Narratives →", route: "/narratives" },
    tip: "The 'Narrative Now' widget on the dashboard gives you an instant summary.",
  },
  {
    id: "briefing",
    icon: BarChart3,
    color: "hsl(190, 90%, 50%)",
    title: "Step 4 — Briefing Mode",
    description: "One page that answers: what's the state of my brand's narrative right now? Shows risk gauge, active narratives, top threats, and sentiment trends — shareable as a PDF executive brief.",
    action: { label: "Open Briefing →", route: "/briefing" },
    tip: "Use Briefing Mode for daily stand-ups and leadership updates.",
  },
  {
    id: "respond",
    icon: Zap,
    color: "hsl(0, 84%, 60%)",
    title: "Step 5 — Respond with Confidence",
    description: "The response engine drafts replies using ONLY your Approved Facts library — no hallucination, no off-brand messaging. If facts are missing, it creates an escalation ticket automatically.",
    action: { label: "Try Respond →", route: "/respond" },
    tip: "Add approved facts first to unlock the full power of the response engine.",
  },
  {
    id: "competitors",
    icon: Target,
    color: "hsl(320, 70%, 55%)",
    title: "Bonus — Competitor Intelligence",
    description: "Track competitors separately from your brand. The Intel Feed shows what's happening with every tracked competitor in real time — narratives they own, threats they're facing, share of voice.",
    action: { label: "View Competitors →", route: "/competitors" },
    tip: "Competitor data never mixes with your brand metrics — completely separate.",
  },
  {
    id: "done",
    icon: CheckCircle2,
    color: "hsl(142, 71%, 45%)",
    title: "You're ready",
    description: "Start by running your first scan, then check the Narrative Now widget on your dashboard. The Getting Started checklist will guide you through the remaining setup steps.",
    action: { label: "Start monitoring →", route: "/scans" },
  },
];

interface Props {
  forceShow?: boolean;
  onClose?: () => void;
}

export default function OnboardingTour({ forceShow, onClose }: Props) {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (forceShow) { setShow(true); setStep(0); return; }
    const completed = localStorage.getItem(TOUR_KEY);
    if (!completed) {
      const t = setTimeout(() => setShow(true), 1200);
      return () => clearTimeout(t);
    }
  }, [forceShow]);

  const dismiss = useCallback(() => {
    setShow(false);
    localStorage.setItem(TOUR_KEY, "true");
    onClose?.();
  }, [onClose]);

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else dismiss();
  };
  const prev = () => setStep(s => Math.max(0, s - 1));

  if (!show) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50"
        onClick={dismiss}
      />

      {/* Tour card — centered */}
      <motion.div
        key={`step-${step}`}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: `${(step / STEPS.length) * 100}%` }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Header */}
          <div className="p-6 pb-4">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: current.color + "18" }}
                >
                  <Icon className="h-5 w-5" style={{ color: current.color }} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                    {step + 1} of {STEPS.length}
                  </p>
                  <h3 className="text-base font-bold text-foreground leading-tight mt-0.5">{current.title}</h3>
                </div>
              </div>
              <button
                onClick={dismiss}
                className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>

            {current.tip && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/15">
                <span className="text-primary text-sm shrink-0">💡</span>
                <p className="text-xs text-primary/80 leading-relaxed">{current.tip}</p>
              </div>
            )}
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5 pb-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all ${
                  i === step
                    ? "h-2 w-5 bg-primary"
                    : i < step
                    ? "h-1.5 w-1.5 bg-primary/40"
                    : "h-1.5 w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 p-4 pt-2 border-t border-border">
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={prev} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground">
                Skip tour
              </Button>
            </div>
            <div className="flex gap-2">
              {current.action && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate(current.action!.route); dismiss(); }}
                  className="gap-1.5"
                >
                  {current.action.label}
                </Button>
              )}
              <Button size="sm" onClick={next} className="gap-1.5">
                {step === STEPS.length - 1 ? "Done" : "Next"}
                {step < STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
