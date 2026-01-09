import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import StatsOverview from "@/components/dashboard/StatsOverview";
import WalletCarousel from "@/components/dashboard/WalletCarousel";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentTransactions from "@/components/dashboard/RecentTransactions";
import ExchangeRates from "@/components/dashboard/ExchangeRates";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user } = useAuth();
  
  // Get first name for greeting
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 
                   user?.email?.split('@')[0] || 
                   'there';

  // Determine greeting based on time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      
      <main className="container px-4 py-4 sm:py-6">
        {/* Hero Welcome */}
        <motion.section 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground mb-1 sm:mb-2">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Your money is working across multiple currencies
          </p>
        </motion.section>

        {/* Stats Overview */}
        <StatsOverview />

        {/* Wallet Carousel */}
        <WalletCarousel />

        {/* Quick Actions */}
        <QuickActions />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
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
