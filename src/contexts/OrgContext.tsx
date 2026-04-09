import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface Org {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  plan: string;
  incident_mode: boolean;
  subscription_status: string;
  subscription_type: string | null;
  subscription_expires_at: string | null;
}

interface OrgContextType {
  orgs: Org[];
  currentOrg: Org | null;
  setCurrentOrg: (org: Org) => void;
  loading: boolean;
  refetchOrgs: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = useCallback(async () => {
    if (!user) {
      setOrgs([]);
      setCurrentOrg(null);
      setLoading(false);
      return;
    }

    const { data: memberships } = await supabase
      .from("org_memberships")
      .select("org_id, role, organizations(id, name, slug, domain, plan, incident_mode, subscription_status, subscription_type, subscription_expires_at)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null);

    if (memberships && memberships.length > 0) {
      const orgList = memberships
        .map((m: any) => m.organizations)
        .filter(Boolean) as Org[];
      setOrgs(orgList);
      
      const saved = localStorage.getItem("sentinel_current_org");
      const found = saved ? orgList.find(o => o.id === saved) : null;
      setCurrentOrg(found || orgList[0]);
    } else {
      setOrgs([]);
      setCurrentOrg(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  // Auto-refresh subscription status from Stripe
  // Use a ref to always access latest currentOrg without re-creating the callback
  const currentOrgRef = useRef(currentOrg);
  currentOrgRef.current = currentOrg;

  const refreshSubscription = useCallback(async () => {
    const org = currentOrgRef.current;
    if (!user || !org) return;
    // Skip subscription check for free orgs — no Stripe subscription to validate
    if (org.subscription_status === "free") return;
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error || data?.error) return;
      if (data?.subscribed !== undefined) {
        const newStatus = data.subscribed ? "active" : "free";
        const updates: any = { subscription_status: newStatus };
        if (data.subscription_type) updates.subscription_type = data.subscription_type;
        if (data.subscription_end) updates.subscription_expires_at = data.subscription_end;

        if (org.subscription_status !== newStatus) {
          const { error: updateError } = await supabase
            .from("organizations")
            .update(updates)
            .eq("id", org.id);
          if (updateError) {
            // Non-critical: subscription status sync failed silently
          }
          fetchOrgs();
        }
      }
    } catch {
      // silently fail — non-critical
    }
  }, [user, fetchOrgs]);

  // Check subscription on mount and every 60 seconds
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!currentOrg) return;
    refreshSubscription();
    intervalRef.current = setInterval(refreshSubscription, 300_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [currentOrg?.id, refreshSubscription]);

  const handleSetCurrentOrg = (org: Org) => {
    setCurrentOrg(org);
    localStorage.setItem("sentinel_current_org", org.id);
  };

  return (
    <OrgContext.Provider value={{ orgs, currentOrg, setCurrentOrg: handleSetCurrentOrg, loading, refetchOrgs: fetchOrgs }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (!context) throw new Error("useOrg must be used within OrgProvider");
  return context;
}
