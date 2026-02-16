import { Navigate } from "react-router-dom";
import { useOrgRole } from "@/hooks/useOrgRole";

interface RoleGateProps {
  children: React.ReactNode;
  /** Minimum access level required */
  require: "write" | "edit" | "manage";
  /** Where to redirect if access denied (default: /) */
  fallback?: string;
}

export default function RoleGate({ children, require, fallback = "/" }: RoleGateProps) {
  const { loading, canWrite, canEdit, isManager } = useOrgRole();

  if (loading) return null;

  const allowed =
    require === "manage" ? isManager :
    require === "edit" ? canEdit :
    require === "write" ? canWrite :
    false;

  if (!allowed) return <Navigate to={fallback} replace />;

  return <>{children}</>;
}
