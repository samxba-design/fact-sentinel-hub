import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Check, Shield, Zap, CreditCard, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const FREE_FEATURES = [
  "2 scans per month",
  "Up to 200 mentions",
  "Narrative & threat tracking",
  "Basic sentiment analysis",
  "1 user seat",
  "Community support",
];

const PLANS = [
  {
    id: "monthly",
    name: "Pro Monthly",
    price: "$99",
    period: "/month",
    description: "Full-power reputation intelligence",
    priceId: "price_1T1ObmB29RCAwSicAeV8uVVM",
    popular: true,
    features: [
      "Unlimited scans",
      "Unlimited mentions",
      "AI response drafting",
      "Narrative & threat tracking",
      "People intelligence",
      "Incident management",
      "Export to Google Sheets",
      "Priority support",
      "Up to 10 user seats",
    ],
    cta: "Get Started",
  },
  {
    id: "yearly",
    name: "Pro Yearly",
    price: "$950",
    period: "/year",
    badge: "Save 20%",
    description: "Best value for committed teams",
    priceId: "price_1T1ObnB29RCAwSiccq30KKyT",
    features: [
      "Everything in Pro Monthly",
      "Discounted annual rate",
      "Dedicated onboarding",
      "Custom integrations",
      "SLA guarantee",
      "Unlimited user seats",
    ],
    cta: "Get Started",
  },
];

export default function PricingPage() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const isActive = (currentOrg as any)?.subscription_status === "active";

  const handleSubscribe = async (plan: typeof PLANS[0]) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!currentOrg) {
      navigate("/onboarding");
      return;
    }
    if (!plan.priceId) return;

    setLoadingPlan(plan.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: plan.priceId, orgId: currentOrg.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Pricing</h1>
        </div>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Start free, no card required. Upgrade when you need the full arsenal.
        </p>
      </div>

      {/* Free tier */}
      <div className="max-w-3xl mx-auto">
        <Card className="p-6 border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-card-foreground">Free</h3>
                <Badge variant="secondary" className="text-[10px]">No card required</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Perfect for trying out SentiWatch on your brand</p>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-card-foreground">$0</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(user ? "/" : "/auth?mode=signup")}
                className="gap-1.5"
              >
                {user ? "You're on free" : "Start free"} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Paid Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={`relative p-6 space-y-5 ${
              plan.popular ? "border-primary ring-1 ring-primary/20" : "border-border"
            }`}
          >
            {plan.popular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Zap className="h-3 w-3 mr-1" /> Most Popular
              </Badge>
            )}
            {plan.badge && !plan.popular && (
              <Badge variant="secondary" className="absolute -top-3 left-1/2 -translate-x-1/2">
                {plan.badge}
              </Badge>
            )}

            <div>
              <h3 className="text-lg font-semibold text-card-foreground">{plan.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-card-foreground">{plan.price}</span>
              <span className="text-sm text-muted-foreground">{plan.period}</span>
            </div>

            <ul className="space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Button
              className="w-full"
              variant={plan.popular ? "default" : "outline"}
              disabled={isActive || loadingPlan !== null}
              onClick={() => handleSubscribe(plan)}
            >
              {loadingPlan === plan.id ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              {isActive ? "Already Subscribed" : plan.cta}
            </Button>
          </Card>
        ))}
      </div>

      {/* Enterprise / Contact */}
      <div className="text-center text-sm text-muted-foreground max-w-md mx-auto space-y-2">
        <p>
          Need a custom enterprise plan?{" "}
          <a href="/contact" className="text-primary underline underline-offset-4">
            Contact our sales team
          </a>{" "}
          for custom integrations, SLA guarantees, and unlimited seats.
        </p>
      </div>
    </div>
  );
}
