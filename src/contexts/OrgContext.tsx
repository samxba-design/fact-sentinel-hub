import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  incident_mode: boolean;
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

  const fetchOrgs = async () => {
    if (!user) {
      setOrgs([]);
      setCurrentOrg(null);
      setLoading(false);
      return;
    }

    const { data: memberships } = await supabase
      .from("org_memberships")
      .select("org_id, role, organizations(*)")
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
  };

  useEffect(() => {
    fetchOrgs();
  }, [user]);

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
