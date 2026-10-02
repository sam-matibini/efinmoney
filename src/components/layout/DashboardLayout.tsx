import type { ReactNode } from "react";
import Sidebar from "@/components/layout/Sidebar";
import BottomNav from "@/components/layout/BottomNav";
import AppUtilityBar from "@/components/layout/AppUtilityBar";
import { useForcedTheme } from "@/components/theme/ThemeProvider";

/**
 * App shell: fixed sidebar (220px desktop, 72px tablet, hidden on mobile) and a
 * scrollable content column offset by the sidebar width. No top navigation bar.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  useForcedTheme("dark");

  return (
    <div className="efin-app min-h-screen overflow-x-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Sidebar />
      <div className="min-w-0 md:ml-[var(--sidebar-width-collapsed)] lg:ml-[var(--sidebar-width)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8">
        <AppUtilityBar />
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
