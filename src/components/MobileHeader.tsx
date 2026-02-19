import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useOrgRole } from "@/hooks/useOrgRole";
import {
  Shield, LayoutDashboard, Scan, MessageSquareWarning, Network,
  Users, AlertTriangle, Siren, MessageCircleReply, BookCheck,
  FileText, TicketCheck, Download, Settings, LogOut, Menu, X,
  ShieldCheck, CreditCard, BookOpen, Target, Contact, Link2
} from "lucide-react";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import LinkScannerDialog from "@/components/LinkScannerDialog";

type RequiredAccess = "all" | "write" | "edit" | "manage";

interface NavItem {
  to: string;
  icon: any;
  label: string;
  access?: RequiredAccess;
}

const navItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/scans", icon: Scan, label: "Scans", access: "edit" },
  { to: "/mentions", icon: MessageSquareWarning, label: "Mentions" },
  { to: "/narratives", icon: Network, label: "Narratives" },
  { to: "/people", icon: Users, label: "People" },
  { to: "/risk-console", icon: AlertTriangle, label: "Risk Console" },
  { to: "/incidents", icon: Siren, label: "Incidents" },
  { to: "/respond", icon: MessageCircleReply, label: "How To Respond" },
  { to: "/approved-facts", icon: BookCheck, label: "Approved Facts" },
  { to: "/approved-templates", icon: FileText, label: "Templates" },
  { to: "/escalations", icon: TicketCheck, label: "Escalations", access: "write" },
  { to: "/competitors", icon: Target, label: "Competitors", access: "edit" },
  { to: "/contacts", icon: Contact, label: "Contacts", access: "manage" },
  { to: "/exports", icon: Download, label: "Exports", access: "write" },
  { to: "/pricing", icon: CreditCard, label: "Pricing" },
  { to: "/guide", icon: BookOpen, label: "Getting Started" },
  { to: "/settings", icon: Settings, label: "Settings", access: "manage" },
];

export default function MobileHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { signOut, isSuperAdmin } = useAuth();
  const { isManager, canEdit, canWrite } = useOrgRole();
  const navigate = useNavigate();

  const hasAccess = (access?: RequiredAccess) => {
    if (!access || access === "all") return true;
    if (access === "manage") return isManager;
    if (access === "edit") return canEdit;
    if (access === "write") return canWrite;
    return true;
  };

  return (
    <>
      {/* Top bar - mobile only */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <button onClick={() => setMenuOpen(true)} className="p-1.5">
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground">SentiWatch</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <GlobalSearch />
          <ThemeSwitcher />
          <NotificationBell />
        </div>
      </header>

      {/* Overlay */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-[60]" onClick={() => setMenuOpen(false)}>
          <aside
            className="fixed left-0 top-0 h-full w-72 bg-card border-r border-border flex flex-col animate-in slide-in-from-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-bold">SentiWatch</span>
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {navItems.filter(item => hasAccess(item.access)).map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-accent/50"
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
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors border-t border-border mt-2 pt-3 ${
                      isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent/50"
                    }`
                  }
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  Admin Panel
                </NavLink>
              )}
            </nav>
            <div className="px-3 py-2 border-t border-border">
              <LinkScannerDialog
                trigger={
                  <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-accent/50 w-full transition-colors">
                    <Link2 className="h-4 w-4" />
                    Scan Link
                  </button>
                }
              />
            </div>
            <div className="p-3 border-t border-border">
              <button
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-accent/50 w-full transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
