import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useOrgRole } from "@/hooks/useOrgRole";
import {
  Shield, LayoutDashboard, Scan, MessageSquareWarning, Network,
  Users, AlertTriangle, Siren, MessageCircleReply, BookCheck,
  FileText, TicketCheck, Download, Settings, LogOut,
  ChevronDown, ChevronRight, Building2, ShieldCheck, CreditCard, Plus, BookOpen,
  Target, Contact, Bell, Link2, Radio, Globe, Share2, Brain, Newspaper,
  Zap, Eye, EyeOff,
} from "lucide-react";
import LinkScannerDialog from "@/components/LinkScannerDialog";
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

interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
  defaultOpen?: boolean;
  focusMode?: boolean; // show in focus mode
}

// ── Core items always visible in Focus Mode ─────────────────────────
const FOCUS_ITEMS: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/scans", icon: Scan, label: "Run Scan", access: "edit" },
  { to: "/mentions", icon: MessageSquareWarning, label: "Mentions" },
  { to: "/narratives", icon: Network, label: "Narratives" },
  { to: "/briefing", icon: Brain, label: "Briefing", badge: "Now" },
  { to: "/respond", icon: MessageCircleReply, label: "Respond" },
];

// ── Full nav grouped ────────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Monitor",
    icon: Eye,
    defaultOpen: true,
    focusMode: true,
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/scans", icon: Scan, label: "Scans", access: "edit" },
      { to: "/mentions", icon: MessageSquareWarning, label: "Mentions" },
      { to: "/alerts", icon: Bell, label: "Alerts" },
    ],
  },
  {
    label: "Analyze",
    icon: Brain,
    defaultOpen: true,
    focusMode: true,
    items: [
      { to: "/narratives", icon: Network, label: "Narratives" },
      { to: "/briefing", icon: Brain, label: "Briefing", badge: "Now" },
      { to: "/risk-console", icon: AlertTriangle, label: "Risk Console" },
      { to: "/people", icon: Users, label: "Key People" },
      { to: "/threat-map", icon: Globe, label: "Threat Map" },
      { to: "/narrative-graph", icon: Share2, label: "Network Graph" },
    ],
  },
  {
    label: "Respond",
    icon: Zap,
    defaultOpen: false,
    items: [
      { to: "/respond", icon: MessageCircleReply, label: "How To Respond" },
      { to: "/incidents", icon: Siren, label: "Incidents" },
      { to: "/war-room", icon: Radio, label: "War Room" },
      { to: "/escalations", icon: TicketCheck, label: "Escalations", access: "write" },
      { to: "/approved-facts", icon: BookCheck, label: "Approved Facts" },
      { to: "/approved-templates", icon: FileText, label: "Templates" },
    ],
  },
  {
    label: "Intelligence",
    icon: Target,
    defaultOpen: false,
    items: [
      { to: "/competitors", icon: Target, label: "Competitors", access: "edit" },
      { to: "/competitors/intel-feed", icon: Newspaper, label: "Intel Feed", access: "edit" },
      { to: "/contacts", icon: Contact, label: "Contacts", access: "manage" },
    ],
  },
  {
    label: "Account",
    icon: Settings,
    defaultOpen: false,
    items: [
      { to: "/exports", icon: Download, label: "Exports", access: "write" },
      { to: "/pricing", icon: CreditCard, label: "Pricing" },
      { to: "/guide", icon: BookOpen, label: "Getting Started" },
      { to: "/settings", icon: Settings, label: "Settings", access: "manage" },
    ],
  },
];

const FOCUS_STORAGE_KEY = "sentiwatch_focus_mode";

function loadFocusMode(): boolean {
  try { return localStorage.getItem(FOCUS_STORAGE_KEY) === "true"; } catch { return false; }
}

export default function AppSidebar() {
  const { signOut, isSuperAdmin } = useAuth();
  const { orgs, currentOrg, setCurrentOrg } = useOrg();
  const { isManager, canEdit, canWrite } = useOrgRole();
  const navigate = useNavigate();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map(g => [g.label, g.defaultOpen ?? false]))
  );
  const [focusMode, setFocusMode] = useState(loadFocusMode);

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));

  const toggleFocus = () => {
    const next = !focusMode;
    setFocusMode(next);
    try { localStorage.setItem(FOCUS_STORAGE_KEY, String(next)); } catch {}
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
              <Building2 className="h-3.5 w-3.5 text-sidebar-foreground shrink-0" />
              <span className="text-xs font-medium text-sidebar-accent-foreground truncate flex-1">
                {currentOrg.name}
              </span>
              <ChevronDown className="h-3 w-3 text-sidebar-foreground shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {orgs.map(org => (
                <DropdownMenuItem key={org.id} onClick={() => setCurrentOrg(org)}>
                  <Building2 className="h-4 w-4 mr-2" />
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

      {/* ── Focus Mode Toggle ── */}
      <div className="px-3 py-2 border-b border-sidebar-border">
        <button
          onClick={toggleFocus}
          className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            focusMode
              ? "bg-primary/10 text-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
        >
          {focusMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {focusMode ? "Focus Mode — show all" : "Switch to Focus Mode"}
          {focusMode && (
            <Badge className="ml-auto text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-0">On</Badge>
          )}
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {focusMode ? (
          /* Focus Mode: flat list of core items only */
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold text-sidebar-foreground/50 uppercase tracking-widest px-3 mb-2">
              Core Features
            </p>
            {FOCUS_ITEMS.filter(i => hasAccess(i.access)).map(item => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className={navLinkClass}>
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-0">{item.badge}</Badge>
                )}
              </NavLink>
            ))}
            <div className="border-t border-sidebar-border my-2" />
            <NavLink to="/settings" className={navLinkClass}>
              <Settings className="h-4 w-4 shrink-0" /> Settings
            </NavLink>
          </div>
        ) : (
          /* Full Mode: grouped sections */
          <div className="space-y-1">
            {NAV_GROUPS.map(group => {
              const visibleItems = group.items.filter(i => hasAccess(i.access));
              if (visibleItems.length === 0) return null;
              const isOpen = openGroups[group.label] ?? group.defaultOpen;

              return (
                <div key={group.label}>
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors uppercase tracking-wider"
                  >
                    <group.icon className="h-3.5 w-3.5" />
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronRight
                      className={`h-3 w-3 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="space-y-0.5 mt-0.5 mb-1">
                      {visibleItems.map(item => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === "/"}
                          className={({ isActive }) =>
                            `flex items-center gap-3 pl-8 pr-3 py-2 rounded-lg text-sm transition-colors ${
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
              );
            })}

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
          </div>
        )}
      </nav>

      {/* ── Quick Tools ── */}
      <div className="px-3 py-2 border-t border-sidebar-border">
        <LinkScannerDialog
          trigger={
            <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full transition-colors">
              <Link2 className="h-4 w-4" /> Scan a Link
            </button>
          }
        />
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
