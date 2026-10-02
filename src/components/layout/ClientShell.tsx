import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageTransition from "@/components/ui/PageTransition";
import PageSkeleton from "@/components/ui/PageSkeleton";
import EfinTagGuard from "@/components/auth/EfinTagGuard";
import { DeferredAliceWidget, ShellAdyenHandler } from "@/components/layout/DeferredShellWidgets";
import { LivePricingHydrator } from "@/hooks/useLivePricingWorkbook";

/** Persistent shell — sidebar stays mounted while only page content swaps. */
const ClientShell = () => (
  <EfinTagGuard>
    <DashboardLayout>
      <ShellAdyenHandler />
      <LivePricingHydrator />
      <PageTransition>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </PageTransition>
      <DeferredAliceWidget context="user" />
    </DashboardLayout>
  </EfinTagGuard>
);

export default ClientShell;
