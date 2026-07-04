import { Outlet } from "react-router-dom";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import PageTransition from "@/components/ui/PageTransition";
import AdyenReturnHandler from "@/components/payments/AdyenReturnHandler";
import AliceWidget from "@/components/alice/AliceWidget";

/** Persistent shell — Header stays mounted while only page content swaps. */
const ClientShell = () => (
  <div className="min-h-screen bg-background pb-24 md:pb-8">
    <AdyenReturnHandler />
    <Header />
    <PageTransition>
      <Outlet />
    </PageTransition>
    <MobileNav />
    {import.meta.env.VITE_ALICE_ENABLED !== "false" && <AliceWidget context="user" />}
  </div>
);

export default ClientShell;
