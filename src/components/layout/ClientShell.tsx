import { Outlet } from "react-router-dom";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import PageTransition from "@/components/ui/PageTransition";

/** Persistent shell — Header stays mounted while only page content swaps. */
const ClientShell = () => (
  <div className="min-h-screen bg-background pb-24 md:pb-8">
    <Header />
    <PageTransition>
      <Outlet />
    </PageTransition>
    <MobileNav />
  </div>
);

export default ClientShell;
