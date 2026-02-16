import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";

export type OrgRole = "owner" | "admin" | "analyst" | "approver" | "viewer" | null;

interface OrgRoleInfo {
  role: OrgRole;
  loading: boolean;
  /** owner or admin */
  isManager: boolean;
  /** owner, admin, or analyst */
  canEdit: boolean;
  /** owner, admin, analyst, or approver */
  canApprove: boolean;
  /** any role except viewer */
  canWrite: boolean;
  /** viewer only */
  isViewOnly: boolean;
}

const WRITE_ROLES: OrgRole[] = ["owner", "admin", "analyst", "approver"];
const EDIT_ROLES: OrgRole[] = ["owner", "admin", "analyst"];
const MANAGER_ROLES: OrgRole[] = ["owner", "admin"];

export function useOrgRole(): OrgRoleInfo {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [role, setRole] = useState<OrgRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !currentOrg) {
      setRole(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", currentOrg.id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setRole((data?.role as OrgRole) ?? null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [user?.id, currentOrg?.id]);

  return {
    role,
    loading,
    isManager: MANAGER_ROLES.includes(role),
    canEdit: EDIT_ROLES.includes(role),
    canApprove: WRITE_ROLES.includes(role),
    canWrite: WRITE_ROLES.includes(role),
    isViewOnly: role === "viewer",
  };
}
