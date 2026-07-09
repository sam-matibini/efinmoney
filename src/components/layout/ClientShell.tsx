import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import PageTransition from "@/components/ui/PageTransition";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { DeferredAliceWidget, ShellAdyenHandler } from "@/components/layout/DeferredShellWidgets";

/** Persistent shell — Header stays mounted while only page content swaps. */
const ClientShell = () => (
  <div className="min-h-screen bg-background overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8">
    <ShellAdyenHandler />
    <Header />
    <PageTransition>
      <Suspense fallback={<PageSkeleton />}>
        <Outlet />
      </Suspense>
    </PageTransition>
    <MobileNav />
    <DeferredAliceWidget context="user" />
  </div>
);

export default ClientShell;
