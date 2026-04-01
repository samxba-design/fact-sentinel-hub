import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SharedPermissions {
  monitoring: boolean;
  intelligence: boolean;
  operations: boolean;
  assets: boolean;
}

interface SharedViewState {
  isSharedView: boolean;
  permissions: SharedPermissions;
  orgId: string | null;
  loading: boolean;
  error: string | null;
  token: string | null;
}

const defaultPermissions: SharedPermissions = {
  monitoring: false,
  intelligence: false,
  operations: false,
  assets: false,
};

const SharedViewContext = createContext<SharedViewState>({
  isSharedView: false,
  permissions: defaultPermissions,
  orgId: null,
  loading: true,
  error: null,
  token: null,
});

export const useSharedView = () => useContext(SharedViewContext);

// Map routes to permission groups
export const ROUTE_PERMISSION_MAP: Record<string, keyof SharedPermissions> = {
  "/": "monitoring",
  "/mentions": "monitoring",
  "/narratives": "monitoring",
  "/people": "intelligence",
  "/competitors": "intelligence",
  "/risk-console": "intelligence",
  "/incidents": "operations",
  "/escalations": "operations",
  "/respond": "operations",
  "/approved-facts": "assets",
  "/approved-templates": "assets",
  "/exports": "assets",
};

export function SharedViewProvider({ token, children }: { token: string; children: React.ReactNode }) {
  const [state, setState] = useState<SharedViewState>({
    isSharedView: true,
    permissions: defaultPermissions,
    orgId: null,
    loading: true,
    error: null,
    token,
  });

  useEffect(() => {
    async function validateToken() {
      try {
        const { data, error } = await supabase
          .rpc("get_shared_link_by_token", { _token: token })
          .single();

        if (error || !data) {
          setState(prev => ({ ...prev, loading: false, error: "This link is invalid or has been revoked." }));
          return;
        }

        setState(prev => ({
          ...prev,
          loading: false,
          orgId: data.org_id,
          permissions: data.permissions as unknown as SharedPermissions,
        }));
      } catch {
        setState(prev => ({ ...prev, loading: false, error: "Failed to validate link." }));
      }
    }

    validateToken();
  }, [token]);

  return (
    <SharedViewContext.Provider value={state}>
      {children}
    </SharedViewContext.Provider>
  );
}
