import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

interface GateOptions {
  feature?: string;
  redirect?: boolean;
}

export function useSubscriptionGate() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const isPaid = currentOrg?.subscription_status === "active";

  const checkAccess = useCallback((options?: GateOptions): boolean => {
    if (isPaid) return true;

    const featureName = options?.feature || "This feature";
    toast({
      title: "Upgrade Required",
      description: `${featureName} is available on the Pro plan. Upgrade to unlock full access.`,
    });

    if (options?.redirect) {
      navigate("/pricing");
    }

    return false;
  }, [isPaid, toast, navigate]);

  return { isPaid, checkAccess, showUpgradeModal, setShowUpgradeModal };
}
