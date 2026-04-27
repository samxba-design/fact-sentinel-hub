import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { useSubscriptionGate } from "@/hooks/useSubscriptionGate";
import UpgradeModal from "@/components/UpgradeModal";

interface UpgradeBannerProps {
  feature: string;
  className?: string;
}

export default function UpgradeBanner({ feature, className }: UpgradeBannerProps) {
  const { isPaid } = useSubscriptionGate();
  const [showModal, setShowModal] = useState(false);
  const demoMode = import.meta.env.VITE_DEMO_MODE === "true";

  if (isPaid || demoMode) return null;

  return (
    <>
      <div className={`flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5 ${className || ""}`}>
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm text-muted-foreground">
            <strong className="text-card-foreground">{feature}</strong> is a Pro feature.
          </span>
        </div>
        <Button size="sm" variant="default" onClick={() => setShowModal(true)}>
          Upgrade
        </Button>
      </div>
      <UpgradeModal open={showModal} onOpenChange={setShowModal} feature={feature} />
    </>
  );
}
