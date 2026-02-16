import React, { Suspense } from "react";
import { useParams, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { SharedViewProvider, useSharedView, ROUTE_PERMISSION_MAP } from "@/contexts/SharedViewContext";
import { Eye, EyeOff, Lock, BarChart3, Brain, Shield, FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ErrorBoundary from "@/components/ErrorBoundary";

// Lazy load pages
const DashboardPage = React.lazy(() => import("@/pages/DashboardPage"));
const MentionsPage = React.lazy(() => import("@/pages/MentionsPage"));
const MentionDetailPage = React.lazy(() => import("@/pages/MentionDetailPage"));
const NarrativesPage = React.lazy(() => import("@/pages/NarrativesPage"));
const NarrativeDetailPage = React.lazy(() => import("@/pages/NarrativeDetailPage"));
const PeoplePage = React.lazy(() => import("@/pages/PeoplePage"));
const PersonDetailPage = React.lazy(() => import("@/pages/PersonDetailPage"));
const RiskConsolePage = React.lazy(() => import("@/pages/RiskConsolePage"));
const IncidentsPage = React.lazy(() => import("@/pages/IncidentsPage"));
const IncidentDetailPage = React.lazy(() => import("@/pages/IncidentDetailPage"));
const RespondPage = React.lazy(() => import("@/pages/RespondPage"));
const ApprovedFactsPage = React.lazy(() => import("@/pages/ApprovedFactsPage"));
const ApprovedTemplatesPage = React.lazy(() => import("@/pages/ApprovedTemplatesPage"));
const EscalationsPage = React.lazy(() => import("@/pages/EscalationsPage"));
const ExportsPage = React.lazy(() => import("@/pages/ExportsPage"));
const CompetitorsPage = React.lazy(() => import("@/pages/CompetitorsPage"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function SharedViewBanner() {
  const { permissions } = useSharedView();
  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-primary">Shared View</span>
        <span className="text-[10px] text-muted-foreground">— Read-only access</span>
      </div>
      <div className="flex items-center gap-1.5">
        {permissions.monitoring && <Badge variant="outline" className="text-[8px] h-5 bg-sentinel-emerald/10 text-sentinel-emerald border-sentinel-emerald/30">Monitoring</Badge>}
        {permissions.intelligence && <Badge variant="outline" className="text-[8px] h-5 bg-sentinel-cyan/10 text-sentinel-cyan border-sentinel-cyan/30">Intelligence</Badge>}
        {permissions.operations && <Badge variant="outline" className="text-[8px] h-5 bg-sentinel-amber/10 text-sentinel-amber border-sentinel-amber/30">Operations</Badge>}
        {permissions.assets && <Badge variant="outline" className="text-[8px] h-5 bg-sentinel-purple/10 text-sentinel-purple border-sentinel-purple/30">Assets</Badge>}
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { path: "", label: "Dashboard", group: "monitoring" as const, icon: BarChart3 },
  { path: "mentions", label: "Mentions", group: "monitoring" as const },
  { path: "narratives", label: "Narratives", group: "monitoring" as const },
  { path: "people", label: "People", group: "intelligence" as const },
  { path: "competitors", label: "Competitors", group: "intelligence" as const },
  { path: "risk-console", label: "Risk", group: "intelligence" as const },
  { path: "incidents", label: "Incidents", group: "operations" as const },
  { path: "escalations", label: "Escalations", group: "operations" as const },
  { path: "respond", label: "Respond", group: "operations" as const },
  { path: "approved-facts", label: "Facts", group: "assets" as const },
  { path: "approved-templates", label: "Templates", group: "assets" as const },
  { path: "exports", label: "Reports", group: "assets" as const },
];

function SharedNav({ basePath }: { basePath: string }) {
  const { permissions } = useSharedView();
  const location = useLocation();

  const availableItems = NAV_ITEMS.filter(item => permissions[item.group]);

  return (
    <div className="border-b border-border bg-card/50 px-4 overflow-x-auto">
      <div className="flex items-center gap-1 py-1">
        {availableItems.map(item => {
          const fullPath = `${basePath}/${item.path}`;
          const isActive = location.pathname === fullPath || (item.path === "" && location.pathname === basePath);
          return (
            <Link
              key={item.path}
              to={fullPath}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-center">
      <Lock className="h-12 w-12 text-muted-foreground/30" />
      <h2 className="text-lg font-semibold text-card-foreground">Access Restricted</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        This section is not included in your shared view permissions. Contact the link creator to request access.
      </p>
    </div>
  );
}

function SharedViewContent({ basePath }: { basePath: string }) {
  const { permissions, loading, error } = useSharedView();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Validating access...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-destructive/60" />
          <h2 className="text-lg font-semibold text-card-foreground">Link Invalid</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link to="/" className="text-sm text-primary hover:underline mt-2">Go to homepage</Link>
        </div>
      </div>
    );
  }

  // Find the first available route for redirect
  const firstAvailable = NAV_ITEMS.find(item => permissions[item.group]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SharedViewBanner />
      <SharedNav basePath={basePath} />
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Monitoring */}
            <Route index element={permissions.monitoring ? <ErrorBoundary><DashboardPage /></ErrorBoundary> : firstAvailable ? <Navigate to={firstAvailable.path} replace /> : <AccessDenied />} />
            <Route path="mentions" element={permissions.monitoring ? <ErrorBoundary><MentionsPage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="mentions/:id" element={permissions.monitoring ? <ErrorBoundary><MentionDetailPage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="narratives" element={permissions.monitoring ? <ErrorBoundary><NarrativesPage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="narratives/:id" element={permissions.monitoring ? <ErrorBoundary><NarrativeDetailPage /></ErrorBoundary> : <AccessDenied />} />

            {/* Intelligence */}
            <Route path="people" element={permissions.intelligence ? <ErrorBoundary><PeoplePage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="people/:id" element={permissions.intelligence ? <ErrorBoundary><PersonDetailPage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="competitors" element={permissions.intelligence ? <ErrorBoundary><CompetitorsPage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="risk-console" element={permissions.intelligence ? <ErrorBoundary><RiskConsolePage /></ErrorBoundary> : <AccessDenied />} />

            {/* Operations */}
            <Route path="incidents" element={permissions.operations ? <ErrorBoundary><IncidentsPage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="incidents/:id" element={permissions.operations ? <ErrorBoundary><IncidentDetailPage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="escalations" element={permissions.operations ? <ErrorBoundary><EscalationsPage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="respond" element={permissions.operations ? <ErrorBoundary><RespondPage /></ErrorBoundary> : <AccessDenied />} />

            {/* Assets */}
            <Route path="approved-facts" element={permissions.assets ? <ErrorBoundary><ApprovedFactsPage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="approved-templates" element={permissions.assets ? <ErrorBoundary><ApprovedTemplatesPage /></ErrorBoundary> : <AccessDenied />} />
            <Route path="exports" element={permissions.assets ? <ErrorBoundary><ExportsPage /></ErrorBoundary> : <AccessDenied />} />

            <Route path="*" element={<AccessDenied />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default function SharedViewPage() {
  const { token } = useParams<{ token: string }>();

  if (!token) {
    return <Navigate to="/" replace />;
  }

  const basePath = `/shared/${token}`;

  return (
    <SharedViewProvider token={token}>
      <SharedViewContent basePath={basePath} />
    </SharedViewProvider>
  );
}
