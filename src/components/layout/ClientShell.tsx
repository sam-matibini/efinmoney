import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import PageTransition from "@/components/ui/PageTransition";
import PageSkeleton from "@/components/ui/PageSkeleton";
import EfinTagGuard from "@/components/auth/EfinTagGuard";
import { DeferredAliceWidget, ShellAdyenHandler } from "@/components/layout/DeferredShellWidgets";
import { LivePricingHydrator } from "@/hooks/useLivePricingWorkbook";

/** Persistent shell — Header stays mounted while only page content swaps. */
const ClientShell = () => (
  <EfinTagGuard>
    <div className="min-h-screen bg-background overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8">
      <ShellAdyenHandler />
      <LivePricingHydrator />
      <Header />
      <PageTransition>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </PageTransition>
      <MobileNav />
      <DeferredAliceWidget context="user" />
    </div>
  </EfinTagGuard>
);

export default ClientShell;
