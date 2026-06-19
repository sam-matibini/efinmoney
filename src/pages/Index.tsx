import WealthPulseBanner from "@/components/dashboard/WealthPulseBanner";
import HeroBalance from "@/components/dashboard/HeroBalance";
import WalletCarousel from "@/components/dashboard/WalletCarousel";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentTransactions from "@/components/dashboard/RecentTransactions";
import ExchangeRates from "@/components/dashboard/ExchangeRates";
import MiniStats from "@/components/dashboard/MiniStats";
import TierProgressCard from "@/components/dashboard/TierProgressCard";


const Index = () => {
  return (
    <main className="container px-4 py-4 sm:py-6">

      <WealthPulseBanner />
      <HeroBalance />
      <WalletCarousel />
      <QuickActions />
      <MiniStats />
      <TierProgressCard />
      <RecentTransactions />
      <div className="mt-6">
        <ExchangeRates />
      </div>
    </main>
  );
};

export default Index;
