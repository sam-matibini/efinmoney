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
import { SectionBoundary } from "@/components/common/SectionBoundary";
import { useDashboardReady } from "@/hooks/useDashboardReady";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";

const Index = () => {
  const ready = useDashboardReady();

  return (
    <>
      {!ready && <DashboardSkeleton />}
      <div className={ready ? "" : "hidden"}>
      <AppPage width="wide" className="py-4 sm:py-6">
      <SectionBoundary name="KycPromptBanner"><KycPromptBanner /></SectionBoundary>
      <SectionBoundary name="BusinessPromptCard"><BusinessPromptCard /></SectionBoundary>
      <SectionBoundary name="WealthPulseBanner"><WealthPulseBanner /></SectionBoundary>
      <SectionBoundary name="HeroBalance"><HeroBalance /></SectionBoundary>
      <SectionBoundary name="WalletCarousel"><WalletCarousel /></SectionBoundary>
      <SectionBoundary name="QuickActions"><QuickActions /></SectionBoundary>
      <SectionBoundary name="MiniStats"><MiniStats /></SectionBoundary>
      <SectionBoundary name="TierProgressCard"><TierProgressCard /></SectionBoundary>
      <SectionBoundary name="RecentTransactions"><RecentTransactions /></SectionBoundary>
      <SectionBoundary name="ExchangeRates"><div className="mt-6"><ExchangeRates /></div></SectionBoundary>
      </AppPage>
      </div>
    </>
  );
};

export default Index;
