import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OrgProvider, useOrg } from "@/contexts/OrgContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppLayout from "@/components/AppLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import RoleGate from "@/components/RoleGate";

// Lazy-loaded pages for code splitting
const AuthPage = React.lazy(() => import("@/pages/AuthPage"));
const OnboardingPage = React.lazy(() => import("@/pages/OnboardingPage"));
const DashboardPage = React.lazy(() => import("@/pages/DashboardPage"));
const ScansPage = React.lazy(() => import("@/pages/ScansPage"));
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
const SettingsPage = React.lazy(() => import("@/pages/SettingsPage"));
const AdminPage = React.lazy(() => import("@/pages/AdminPage"));
const PricingPage = React.lazy(() => import("@/pages/PricingPage"));
const GuidePage = React.lazy(() => import("@/pages/GuidePage"));
const CompetitorsPage = React.lazy(() => import("@/pages/CompetitorsPage"));
const CompetitorProfilePage = React.lazy(() => import("@/pages/CompetitorProfilePage"));
const ContactsPage = React.lazy(() => import("@/pages/ContactsPage"));
const NotFound = React.lazy(() => import("@/pages/NotFound"));
const IndexPage = React.lazy(() => import("@/pages/Index"));
const ResetPasswordPage = React.lazy(() => import("@/pages/ResetPasswordPage"));
const ContactPage = React.lazy(() => import("@/pages/ContactPage"));
const FeaturesPage = React.lazy(() => import("@/pages/FeaturesPage"));
const AlertsPage = React.lazy(() => import("@/pages/AlertsPage"));
const SharedViewPage = React.lazy(() => import("@/pages/SharedViewPage"));
const PrivacyPolicyPage = React.lazy(() => import("@/pages/PrivacyPolicyPage"));
const WarRoomPage = React.lazy(() => import("@/pages/WarRoomPage"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function AppRoutes() {
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const { orgs, loading: orgLoading } = useOrg();

  if (authLoading || (user && orgLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<IndexPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/shared/:token/*" element={<SharedViewPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // Shared view route available for authenticated users too
  // (checked before org-gating so it's always accessible)

  // Super admins can bypass onboarding to access admin panel
  if (orgs.length === 0 && !isSuperAdmin) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // Super admin with no orgs — allow admin access but redirect root to admin
  if (orgs.length === 0 && isSuperAdmin) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<ErrorBoundary fallbackTitle="Dashboard failed to load"><DashboardPage /></ErrorBoundary>} />
          <Route path="/scans" element={<RoleGate require="edit"><ErrorBoundary><ScansPage /></ErrorBoundary></RoleGate>} />
          <Route path="/mentions" element={<ErrorBoundary><MentionsPage /></ErrorBoundary>} />
          <Route path="/mentions/:id" element={<ErrorBoundary><MentionDetailPage /></ErrorBoundary>} />
          <Route path="/narratives" element={<ErrorBoundary><NarrativesPage /></ErrorBoundary>} />
          <Route path="/narratives/:id" element={<ErrorBoundary><NarrativeDetailPage /></ErrorBoundary>} />
          <Route path="/people" element={<ErrorBoundary><PeoplePage /></ErrorBoundary>} />
          <Route path="/people/:id" element={<ErrorBoundary><PersonDetailPage /></ErrorBoundary>} />
          <Route path="/risk-console" element={<ErrorBoundary><RiskConsolePage /></ErrorBoundary>} />
          <Route path="/alerts" element={<ErrorBoundary><AlertsPage /></ErrorBoundary>} />
          <Route path="/incidents" element={<ErrorBoundary><IncidentsPage /></ErrorBoundary>} />
          <Route path="/incidents/:id" element={<ErrorBoundary><IncidentDetailPage /></ErrorBoundary>} />
          <Route path="/respond" element={<ErrorBoundary><RespondPage /></ErrorBoundary>} />
          <Route path="/approved-facts" element={<ErrorBoundary><ApprovedFactsPage /></ErrorBoundary>} />
          <Route path="/approved-templates" element={<ErrorBoundary><ApprovedTemplatesPage /></ErrorBoundary>} />
          <Route path="/escalations" element={<RoleGate require="write"><ErrorBoundary><EscalationsPage /></ErrorBoundary></RoleGate>} />
          <Route path="/competitors" element={<RoleGate require="edit"><ErrorBoundary><CompetitorsPage /></ErrorBoundary></RoleGate>} />
          <Route path="/competitors/:name" element={<RoleGate require="edit"><ErrorBoundary><CompetitorProfilePage /></ErrorBoundary></RoleGate>} />
          <Route path="/contacts" element={<RoleGate require="manage"><ErrorBoundary><ContactsPage /></ErrorBoundary></RoleGate>} />
          <Route path="/exports" element={<RoleGate require="write"><ErrorBoundary><ExportsPage /></ErrorBoundary></RoleGate>} />
          <Route path="/settings" element={<RoleGate require="manage"><ErrorBoundary><SettingsPage /></ErrorBoundary></RoleGate>} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/guide" element={<ErrorBoundary><GuidePage /></ErrorBoundary>} />
          <Route path="/admin" element={<ErrorBoundary><AdminPage /></ErrorBoundary>} />
        </Route>
        {/* Allow onboarding for creating additional orgs */}
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/shared/:token/*" element={<SharedViewPage />} />
        <Route path="/auth" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <OrgProvider>
              <ErrorBoundary fallbackTitle="Application error">
                <AppRoutes />
              </ErrorBoundary>
            </OrgProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
