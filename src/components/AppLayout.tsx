import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export default function AppLayout() {
  useKeyboardShortcuts();

  return (
    <div className="dark min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 min-h-screen">
        <div className="p-6 lg:p-8 max-w-[1600px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
