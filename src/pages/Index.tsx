import KycPromptBanner from "@/components/kyc/KycPromptBanner";
import BusinessPromptCard from "@/components/kyb/BusinessPromptCard";
import WealthPulseBanner from "@/components/dashboard/WealthPulseBanner";
import HeroBalance from "@/components/dashboard/HeroBalance";
import WalletCarousel from "@/components/dashboard/WalletCarousel";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentTransactions from "@/components/dashboard/RecentTransactions";
import ExchangeRates from "@/components/dashboard/ExchangeRates";
import MiniStats from "@/components/dashboard/MiniStats";
import TierProgressCard from "@/components/dashboard/TierProgressCard";
import AppPage from "@/components/layout/AppPage";


const Index = () => {
  return (
    <AppPage width="wide" className="py-4 sm:py-6">

      <KycPromptBanner />
      <BusinessPromptCard />
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
    </AppPage>
  );
};

export default Index;
