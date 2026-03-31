import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import MobileHeader from "@/components/MobileHeader";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import FloatingReportButton from "@/components/reports/FloatingReportButton";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import LinkScannerDialog from "@/components/LinkScannerDialog";
import HelpButton from "@/components/HelpButton";

export default function AppLayout() {
  useKeyboardShortcuts();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AppSidebar />
      </div>

      {/* Mobile header */}
      <MobileHeader />

      {/* Desktop top bar with search + notifications */}
      <div className="hidden lg:flex fixed top-0 left-64 right-0 h-14 bg-card/80 backdrop-blur-sm border-b border-border items-center justify-end px-6 z-40 gap-2">
        <GlobalSearch />
        <LinkScannerDialog />
        <ThemeSwitcher />
        <NotificationBell />
      </div>

      <main className="lg:ml-64 min-h-screen pt-14 pb-20 lg:pb-0">
        <div className="p-3 sm:p-5 lg:p-8 max-w-[1600px]">
          <Outlet />
        </div>
      </main>

      <FloatingReportButton />
      {/* Persistent help button — bottom-right, available on every page */}
      <HelpButton />
    </div>
  );
}
