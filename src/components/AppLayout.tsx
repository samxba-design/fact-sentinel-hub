import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import MobileHeader from "@/components/MobileHeader";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import FloatingReportButton from "@/components/reports/FloatingReportButton";

export default function AppLayout() {
  useKeyboardShortcuts();

  return (
    <div className="dark min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AppSidebar />
      </div>

      {/* Mobile header */}
      <MobileHeader />

      {/* Desktop top bar with search + notifications */}
      <div className="hidden lg:flex fixed top-0 left-64 right-0 h-14 bg-card/80 backdrop-blur-sm border-b border-border items-center justify-end px-6 z-40 gap-2">
        <GlobalSearch />
        <NotificationBell />
      </div>

      <main className="lg:ml-64 min-h-screen pt-14">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px]">
          <Outlet />
        </div>
      </main>

      <FloatingReportButton />
    </div>
  );
}
