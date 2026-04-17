import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useOrgRole } from "@/hooks/useOrgRole";
import {
  Shield, LayoutDashboard, Scan, AlertTriangle, Network,
  Users, Siren, MessageCircleReply, BookCheck,
  FileText, TicketCheck, Download, Settings, LogOut,
  ChevronDown, ChevronRight, Building2, ShieldCheck, CreditCard, Plus, BookOpen,
  Target, Contact, Bell, Radio, Globe, Share2, Brain, Newspaper,
  Zap, EyeOff, Link2, Eye, ClipboardList,
} from "lucide-react";
import LinkScannerDialog from "@/components/LinkScannerDialog";
import CompanyLogo from "@/components/CompanyLogo";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

type Access = "all" | "write" | "edit" | "manage";

interface NavItem {
  to: string;
  icon: any;
  label: string;
  access?: Access;
  badge?: string;
}

// ── Primary nav — always visible ────────────────────────────────────
const PRIMARY_NAV: NavItem[] = [
  { to: "/",          icon: LayoutDashboard,   label: "Dashboard" },
  { to: "/mentions",  icon: AlertTriangle,     label: "Threats" },
  { to: "/narratives",icon: Network,           label: "Narratives" },
  { to: "/scans",     icon: Scan,              label: "Scans",    access: "edit" },
  { to: "/alerts",    icon: Bell,              label: "Alerts" },
  { to: "/respond",   icon: MessageCircleReply,label: "Respond" },
  { to: "/briefing",  icon: Brain,             label: "Briefing" },
];

// ── Advanced — collapsible ───────────────────────────────────────────
const ADVANCED_NAV: NavItem[] = [
  { to: "/triage",          icon: Zap,          label: "Quick Triage" },
  { to: "/risk-console",    icon: AlertTriangle, label: "Risk Console" },
  { to: "/people",          icon: Users,         label: "Key People" },
  { to: "/competitors",     icon: Target,        label: "Competitors",        access: "edit" },
  { to: "/incidents",       icon: Siren,         label: "Incidents" },
  { to: "/war-room",        icon: Radio,         label: "War Room" },
  { to: "/noise-filters",   icon: EyeOff,        label: "Noise Filters",      access: "edit" },
  { to: "/entities",        icon: Shield,        label: "Entity Intelligence" },
  { to: "/threat-map",      icon: Globe,         label: "Threat Map" },
  { to: "/narrative-graph", icon: Share2,        label: "Narrative Graph" },
  { to: "/approved-templates", icon: FileText,   label: "Templates" },
  { to: "/approved-facts",  icon: BookCheck,     label: "Approved Facts" },
  { to: "/escalations",     icon: TicketCheck,   label: "Escalations",        access: "write" },
  { to: "/contacts",        icon: Contact,       label: "Contacts",           access: "manage" },
  { to: "/exports",         icon: Download,      label: "Exports",            access: "write" },
  { to: "/audit-log",       icon: ClipboardList, label: "Audit Log",          access: "manage" },
];

// ── Account ──────────────────────────────────────────────────────────
const ACCOUNT_NAV: NavItem[] = [
  { to: "/settings", icon: Settings, label: "Settings", access: "manage" },
  { to: "/guide",    icon: BookOpen, label: "Getting Started" },
  { to: "/pricing",  icon: CreditCard, label: "Pricing" },
];

const ADV_STORAGE_KEY = "sentiwatch_advanced_nav_open";

function loadAdvOpen(): boolean {
  try { return localStorage.getItem(ADV_STORAGE_KEY) === "true"; } catch { return false; }
}

export default function AppSidebar() {
  const { signOut, isSuperAdmin } = useAuth();
  const { orgs, currentOrg, setCurrentOrg } = useOrg();
  const { isManager, canEdit, canWrite } = useOrgRole();
  const navigate = useNavigate();

  const [advOpen, setAdvOpen] = useState(loadAdvOpen);

  const toggleAdv = () => {
    const next = !advOpen;
    setAdvOpen(next);
    try { localStorage.setItem(ADV_STORAGE_KEY, String(next)); } catch {}
  };

  const hasAccess = (access?: Access) => {
    if (!access || access === "all") return true;
    if (access === "manage") return isManager;
    if (access === "edit") return canEdit;
    if (access === "write") return canWrite;
    return true;
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive
        ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    }`;

  const smallLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs transition-colors ${
      isActive
        ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    }`;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50">
      {/* ── Logo ── */}
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        <div className="p-1.5 rounded-lg bg-sidebar-primary/10">
          <Shield className="h-5 w-5 text-sidebar-primary" />
        </div>
        <span className="text-base font-bold text-sidebar-accent-foreground tracking-tight">SentiWatch</span>
      </div>

      {/* ── Org Switcher ── */}
      {currentOrg && (
        <div className="px-3 py-2 border-b border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent hover:bg-sidebar-accent/80 transition-colors text-left">
              <CompanyLogo
                domain={currentOrg.domain || currentOrg.name}
                name={currentOrg.name}
                size={16}
                rounded="rounded-sm"
                className="shrink-0"
              />
              <span className="text-xs font-medium text-sidebar-accent-foreground truncate flex-1">
                {currentOrg.name}
              </span>
              <ChevronDown className="h-3 w-3 text-sidebar-foreground shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {orgs.map(org => (
                <DropdownMenuItem key={org.id} onClick={() => setCurrentOrg(org)}>
                  <CompanyLogo
                    domain={org.domain || org.name}
                    name={org.name}
                    size={16}
                    rounded="rounded-sm"
                    className="mr-2 shrink-0"
                  />
                  {org.name}
                  {org.id === currentOrg?.id && (
                    <span className="ml-auto text-[10px] text-primary">Active</span>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() => navigate("/onboarding?new=true")}
                className="border-t border-border mt-1 pt-2"
              >
                <Plus className="h-4 w-4 mr-2" /> New Organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {/* Primary nav */}
        {PRIMARY_NAV.filter(i => hasAccess(i.access)).map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={navLinkClass}>
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-0">{item.badge}</Badge>
            )}
          </NavLink>
        ))}

        {/* Advanced section */}
        <div className="pt-1">
          <button
            onClick={toggleAdv}
            className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors uppercase tracking-wider"
          >
            {advOpen
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />
            }
            <span className="flex-1 text-left">Advanced</span>
          </button>

          {advOpen && (
            <div className="space-y-0.5 mt-0.5">
              {ADVANCED_NAV.filter(i => hasAccess(i.access)).map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={false}
                  className={({ isActive }) =>
                    `flex items-center gap-3 pl-7 pr-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`
                  }
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-0 h-4">
                      {item.badge}
                    </Badge>
                  )}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {isSuperAdmin && (
          <div className="border-t border-sidebar-border pt-2 mt-2">
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`
              }
            >
              <ShieldCheck className="h-4 w-4 shrink-0" /> Admin Panel
            </NavLink>
          </div>
        )}
      </nav>

      {/* ── Scan a Link ── */}
      <div className="px-3 py-2 border-t border-sidebar-border">
        <LinkScannerDialog
          trigger={
            <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full transition-colors">
              <Link2 className="h-4 w-4" /> Scan a Link
            </button>
          }
        />
      </div>

      {/* ── Account ── */}
      <div className="px-3 py-2 border-t border-sidebar-border space-y-0.5">
        {ACCOUNT_NAV.filter(i => hasAccess(i.access)).map(item => (
          <NavLink key={item.to} to={item.to} className={smallLinkClass}>
            <item.icon className="h-3.5 w-3.5 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>

      {/* ── Sign out ── */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full transition-colors"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </aside>
  );
}
