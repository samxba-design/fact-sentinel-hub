import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, ArrowRight, Rocket, Key, Scan, FileText, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";

interface Step {
  key: string;
  label: string;
  description: string;
  icon: any;
  link: string;
  done: boolean;
}

export default function GettingStartedChecklist() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;

    Promise.all([
      supabase.from("keywords").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
      supabase.from("org_api_keys").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
      supabase.from("scan_runs").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
      supabase.from("approved_facts").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
    ]).then(([kw, keys, scans, facts]) => {
      const s: Step[] = [
        {
          key: "keywords",
          label: "Add keywords",
          description: "Set up brand names, products, and risk terms to monitor",
          icon: Key,
          link: "/settings",
          done: (kw.count ?? 0) > 0,
        },
        {
          key: "connections",
          label: "Connect data sources",
          description: "Link X (Twitter) or Reddit API keys for social monitoring",
          icon: Settings,
          link: "/settings?tab=connections",
          done: (keys.count ?? 0) > 0,
        },
        {
          key: "scan",
          label: "Run your first scan",
          description: "Scan the web and social media for mentions of your brand",
          icon: Scan,
          link: "/scans",
          done: (scans.count ?? 0) > 0,
        },
        {
          key: "facts",
          label: "Add approved facts",
          description: "Add verified statements so the AI response engine can draft replies",
          icon: FileText,
          link: "/approved-facts",
          done: (facts.count ?? 0) > 0,
        },
      ];
      setSteps(s);
      setLoading(false);
    });
  }, [currentOrg]);

  if (loading || dismissed) return null;

  const completed = steps.filter(s => s.done).length;
  const allDone = completed === steps.length;

  if (allDone) return null;

  return (
    <Card className="bg-card border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Rocket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Get Started</h3>
            <p className="text-xs text-muted-foreground">Complete these steps to start monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">{completed}/{steps.length} done</Badge>
          <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
              step.done
                ? "bg-muted/20 border-border opacity-60"
                : "bg-muted/5 border-primary/20 hover:border-primary/40"
            }`}
            onClick={() => !step.done && navigate(step.link)}
          >
            {step.done ? (
              <CheckCircle2 className="h-5 w-5 text-sentinel-emerald shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
            <step.icon className={`h-4 w-4 shrink-0 ${step.done ? "text-muted-foreground" : "text-primary"}`} />
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${step.done ? "text-muted-foreground line-through" : "text-foreground font-medium"}`}>
                {step.label}
              </span>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
            {!step.done && <ArrowRight className="h-4 w-4 text-primary shrink-0" />}
          </div>
        ))}
      </div>
    </Card>
  );
}
