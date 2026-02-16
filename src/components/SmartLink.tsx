import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";

interface SmartLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
  icon?: boolean;
}

/**
 * Smart internal link component that navigates to the correct in-app route.
 * Supports deep-linking to settings tabs, filtered views, etc.
 */
export default function SmartLink({ to, children, className = "", icon = false }: SmartLinkProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigate(to); }}
      className={`inline-flex items-center gap-1 text-primary hover:underline cursor-pointer transition-colors ${className}`}
    >
      {children}
      {icon && <ExternalLink className="h-3 w-3" />}
    </button>
  );
}
