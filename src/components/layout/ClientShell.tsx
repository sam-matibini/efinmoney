import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import AppSidebar from "@/components/layout/AppSidebar";
import MobileNav from "@/components/layout/MobileNav";
import PageTransition from "@/components/ui/PageTransition";
import PageSkeleton from "@/components/ui/PageSkeleton";
import EfinTagGuard from "@/components/auth/EfinTagGuard";
import { DeferredAliceWidget, ShellAdyenHandler } from "@/components/layout/DeferredShellWidgets";
import { LivePricingHydrator } from "@/hooks/useLivePricingWorkbook";
import { EfmToastProvider } from "@/components/dashboard/redesign/ToastProvider";

/** Persistent shell — sidebar stays mounted while only page content swaps. */
const ClientShell = () => (
  <EfinTagGuard>
    <EfmToastProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <ShellAdyenHandler />
        <LivePricingHydrator />
        <AppSidebar />
        <main id="main-content" className="main-content" tabIndex={-1}>
          <PageTransition>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </PageTransition>
        </main>
        <MobileNav />
        <DeferredAliceWidget context="user" />
      </div>
    </EfmToastProvider>
  </EfinTagGuard>
);

export default ClientShell;
