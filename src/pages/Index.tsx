import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import HeroBalance from "@/components/dashboard/HeroBalance";
import WalletCarousel from "@/components/dashboard/WalletCarousel";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentTransactions from "@/components/dashboard/RecentTransactions";
import ExchangeRates from "@/components/dashboard/ExchangeRates";
import MiniStats from "@/components/dashboard/MiniStats";
import ResumeOnboardingBanner from "@/components/kyc/ResumeOnboardingBanner";

const Index = () => {
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />

      <main className="container px-4 py-4 sm:py-6">
        <ResumeOnboardingBanner />
        <HeroBalance />
        <WalletCarousel />
        <QuickActions />
        <MiniStats />
        <RecentTransactions />
        <div className="mt-6">
          <ExchangeRates />
        </div>
      </main>

      <MobileNav />
    </div>
  );
};

export default Index;

