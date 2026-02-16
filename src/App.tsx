import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OrgProvider, useOrg } from "@/contexts/OrgContext";
import AppLayout from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import OnboardingPage from "@/pages/OnboardingPage";
import DashboardPage from "@/pages/DashboardPage";
import ScansPage from "@/pages/ScansPage";
import MentionsPage from "@/pages/MentionsPage";
import MentionDetailPage from "@/pages/MentionDetailPage";
import NarrativesPage from "@/pages/NarrativesPage";
import NarrativeDetailPage from "@/pages/NarrativeDetailPage";
import PeoplePage from "@/pages/PeoplePage";
import PersonDetailPage from "@/pages/PersonDetailPage";
import RiskConsolePage from "@/pages/RiskConsolePage";
import IncidentsPage from "@/pages/IncidentsPage";
import IncidentDetailPage from "@/pages/IncidentDetailPage";
import RespondPage from "@/pages/RespondPage";
import ApprovedFactsPage from "@/pages/ApprovedFactsPage";
import ApprovedTemplatesPage from "@/pages/ApprovedTemplatesPage";
import EscalationsPage from "@/pages/EscalationsPage";
import ExportsPage from "@/pages/ExportsPage";
import SettingsPage from "@/pages/SettingsPage";
import AdminPage from "@/pages/AdminPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const { orgs, loading: orgLoading } = useOrg();

  if (authLoading || (user && orgLoading)) {
    return (
      <div className="dark min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  // Super admins can bypass onboarding to access admin panel
  if (orgs.length === 0 && !isSuperAdmin) {
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/scans" element={<ScansPage />} />
        <Route path="/mentions" element={<MentionsPage />} />
        <Route path="/mentions/:id" element={<MentionDetailPage />} />
        <Route path="/narratives" element={<NarrativesPage />} />
        <Route path="/narratives/:id" element={<NarrativeDetailPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/people/:id" element={<PersonDetailPage />} />
        <Route path="/risk-console" element={<RiskConsolePage />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/incidents/:id" element={<IncidentDetailPage />} />
        <Route path="/respond" element={<RespondPage />} />
        <Route path="/approved-facts" element={<ApprovedFactsPage />} />
        <Route path="/approved-templates" element={<ApprovedTemplatesPage />} />
        <Route path="/escalations" element={<EscalationsPage />} />
        <Route path="/exports" element={<ExportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OrgProvider>
            <AppRoutes />
          </OrgProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
