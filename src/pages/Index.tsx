import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import StatsOverview from "@/components/dashboard/StatsOverview";
import WalletCarousel from "@/components/dashboard/WalletCarousel";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentTransactions from "@/components/dashboard/RecentTransactions";
import ExchangeRates from "@/components/dashboard/ExchangeRates";

const Index = () => {
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      
      <main className="container px-4 py-6">
        {/* Hero Welcome */}
        <motion.section 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2">
            Good afternoon, Alex 👋
          </h1>
          <p className="text-muted-foreground">
            Your money is working across 8 countries
          </p>
        </motion.section>

        {/* Stats Overview */}
        <StatsOverview />

        {/* Wallet Carousel */}
        <WalletCarousel />

        {/* Quick Actions */}
        <QuickActions />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RecentTransactions />
          </div>
          <div>
            <ExchangeRates />
          </div>
        </div>
      </main>

      <MobileNav />
    </div>
  );
};

export default Index;
