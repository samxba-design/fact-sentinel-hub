import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Lightbulb, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface GuideStep {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface IntegrationLink {
  label: string;
  to: string;
  description: string;
}

interface PageGuideProps {
  title: string;
  subtitle: string;
  steps: GuideStep[];
  integrations?: IntegrationLink[];
  tip?: string;
  defaultOpen?: boolean;
}

export default function PageGuide({ title, subtitle, steps, integrations, tip, defaultOpen = false }: PageGuideProps) {
  const [open, setOpen] = useState(defaultOpen);
  const navigate = useNavigate();

  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Lightbulb className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
                <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  {step.icon}
                </div>
                <div>
                  <p className="text-xs font-semibold text-card-foreground">{step.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Integrations */}
          {integrations && integrations.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Connected Features</p>
              <div className="flex flex-wrap gap-2">
                {integrations.map((link, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); navigate(link.to); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border hover:border-primary/30 transition-colors text-xs text-card-foreground group"
                  >
                    {link.label}
                    <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tip */}
          {tip && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border">
              <Badge variant="secondary" className="text-[9px] shrink-0 mt-0.5">TIP</Badge>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{tip}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
