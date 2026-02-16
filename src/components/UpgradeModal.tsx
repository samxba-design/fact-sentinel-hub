import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Loader2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";

const PLANS = [
  {
    id: "monthly",
    name: "Pro Monthly",
    price: "$99",
    period: "/month",
    priceId: "price_1T1ObmB29RCAwSicAeV8uVVM",
    features: ["Unlimited scans", "AI response drafting", "Narrative tracking", "Export to Google Sheets", "Priority support"],
  },
  {
    id: "yearly",
    name: "Pro Yearly",
    price: "$950",
    period: "/year",
    priceId: "price_1T1ObnB29RCAwSiccq30KKyT",
    badge: "Save 20%",
    features: ["Everything in Monthly", "Discounted annual rate", "Dedicated onboarding", "Custom integrations"],
  },
];

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
}

export default function UpgradeModal({ open, onOpenChange, feature }: UpgradeModalProps) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleCheckout = async (plan: typeof PLANS[0]) => {
    if (!currentOrg) return;
    setLoadingPlan(plan.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: plan.priceId, orgId: currentOrg.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Upgrade to Pro
          </DialogTitle>
          <DialogDescription>
            {feature ? `${feature} requires a Pro plan.` : "Unlock the full power of SentiWatch."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className="relative rounded-xl border border-border bg-card p-5 space-y-4"
            >
              {plan.badge && (
                <Badge className="absolute -top-2.5 right-3 text-[10px]">{plan.badge}</Badge>
              )}
              <div>
                <div className="text-lg font-bold text-card-foreground">{plan.price}<span className="text-sm font-normal text-muted-foreground">{plan.period}</span></div>
                <div className="text-sm font-medium text-card-foreground mt-1">{plan.name}</div>
              </div>
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                size="sm"
                onClick={() => handleCheckout(plan)}
                disabled={loadingPlan !== null}
              >
                {loadingPlan === plan.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Subscribe
              </Button>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-2">
          Need a custom plan? Contact us or{" "}
          <a href="/settings?tab=subscription" className="underline text-primary" onClick={() => onOpenChange(false)}>
            request manual approval
          </a>.
        </p>
      </DialogContent>
    </Dialog>
  );
}
