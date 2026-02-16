import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, ArrowRight, Scan, MessageSquareWarning, Shield, MessageCircleReply, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const TOUR_KEY = "sentiwatch_tour_completed";

const steps = [
  {
    icon: Sparkles,
    title: "Welcome to SentiWatch!",
    description: "Your AI-powered reputation monitoring command center. Let's walk through the key features.",
  },
  {
    icon: Scan,
    title: "Run Scans",
    description: "Go to Scans → New Scan to search across Twitter, Reddit, news, and more. Scans extract mentions and analyze sentiment automatically.",
  },
  {
    icon: MessageSquareWarning,
    title: "Monitor Mentions",
    description: "All detected mentions appear with severity, sentiment, and flags. You can ignore, snooze, resolve, or escalate any mention.",
  },
  {
    icon: Shield,
    title: "Risk Console & Narratives",
    description: "The Risk Console tracks emergencies and spikes. Narratives group related mentions to show how stories propagate across platforms.",
  },
  {
    icon: MessageCircleReply,
    title: "AI Response Drafting",
    description: "Use 'How to Respond' to draft approved responses. The engine only uses your Approved Facts library — no hallucinations, no off-script messaging.",
  },
];

export default function OnboardingTour() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_KEY);
    if (!completed) {
      // Delay slightly so dashboard loads first
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(TOUR_KEY, "true");
  };

  const next = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  };

  if (!show) return null;

  const current = steps[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-6 right-6 z-50 w-96"
      >
        <Card className="bg-card border-primary/20 p-5 shadow-xl space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">{current.title}</h3>
                <Badge variant="outline" className="text-[9px] mt-0.5">
                  {step + 1} / {steps.length}
                </Badge>
              </div>
            </div>
            <button onClick={dismiss} className="text-muted-foreground hover:text-foreground p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{current.description}</p>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-6 rounded-full transition-colors ${
                    i === step ? "bg-primary" : i < step ? "bg-primary/30" : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <Button size="sm" onClick={next} className="gap-1.5">
              {step < steps.length - 1 ? (
                <>Next <ArrowRight className="h-3 w-3" /></>
              ) : (
                "Get Started"
              )}
            </Button>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
