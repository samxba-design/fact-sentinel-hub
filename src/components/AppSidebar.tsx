import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import {
  Shield, LayoutDashboard, Scan, MessageSquareWarning, Network,
  Users, AlertTriangle, Siren, MessageCircleReply, BookCheck,
  FileText, TicketCheck, Download, Settings, LogOut,
  ChevronDown, Building2, ShieldCheck, CreditCard, Plus, BookOpen
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/scans", icon: Scan, label: "Scans" },
  { to: "/mentions", icon: MessageSquareWarning, label: "Mentions" },
  { to: "/narratives", icon: Network, label: "Narratives" },
  { to: "/people", icon: Users, label: "People" },
  { to: "/risk-console", icon: AlertTriangle, label: "Risk Console" },
  { to: "/incidents", icon: Siren, label: "Incidents" },
  { to: "/respond", icon: MessageCircleReply, label: "How To Respond" },
  { to: "/approved-facts", icon: BookCheck, label: "Approved Facts" },
  { to: "/approved-templates", icon: FileText, label: "Templates" },
  { to: "/escalations", icon: TicketCheck, label: "Escalations" },
  { to: "/exports", icon: Download, label: "Exports" },
  { to: "/pricing", icon: CreditCard, label: "Pricing" },
  { to: "/guide", icon: BookOpen, label: "Getting Started" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function AppSidebar() {
  const { signOut, isSuperAdmin } = useAuth();
  const { orgs, currentOrg, setCurrentOrg } = useOrg();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
        <div className="p-1.5 rounded-lg bg-sidebar-primary/10">
          <Shield className="h-5 w-5 text-sidebar-primary" />
        </div>
        <span className="text-lg font-bold text-sidebar-accent-foreground tracking-tight">Sentinel</span>
      </div>

      {/* Org Switcher */}
      {currentOrg && (
        <div className="px-3 py-3 border-b border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent hover:bg-sidebar-accent/80 transition-colors text-left">
              <Building2 className="h-4 w-4 text-sidebar-foreground shrink-0" />
              <span className="text-sm font-medium text-sidebar-accent-foreground truncate flex-1">
                {currentOrg.name}
              </span>
              <ChevronDown className="h-3 w-3 text-sidebar-foreground shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {orgs.map(org => (
                <DropdownMenuItem key={org.id} onClick={() => setCurrentOrg(org)}>
                  <Building2 className="h-4 w-4 mr-2" />
                  {org.name}
                  {org.id === currentOrg?.id && <span className="ml-auto text-[10px] text-primary">Active</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() => navigate("/onboarding?new=true")}
                className="border-t border-border mt-1 pt-2"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
        {isSuperAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mt-2 border-t border-sidebar-border pt-3 ${
                isActive
                  ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`
            }
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Admin Panel
          </NavLink>
        )}
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
