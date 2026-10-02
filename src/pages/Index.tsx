import { format } from "date-fns";
import KycPromptBanner from "@/components/kyc/KycPromptBanner";
import BusinessPromptCard from "@/components/kyb/BusinessPromptCard";
import KycStatusCard from "@/components/dashboard/KycStatusCard";
import StatsRow from "@/components/dashboard/StatsRow";
import QuickActions from "@/components/dashboard/QuickActions";
import MoneyInMotion from "@/components/dashboard/MoneyInMotion";
import RecentActivity from "@/components/dashboard/RecentActivity";
import WalletsPanel from "@/components/dashboard/WalletsPanel";
import ExchangeTicker from "@/components/dashboard/ExchangeTicker";
import AppPage from "@/components/layout/AppPage";
import { SectionBoundary } from "@/components/common/SectionBoundary";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { getGreeting } from "@/lib/greeting";

const Index = () => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const firstName =
    (profile?.full_name || user?.user_metadata?.full_name)?.split(" ")[0] || user?.email?.split("@")[0] || "there";
  const greeting = getGreeting(profile?.address_country || profile?.country_code).text;

  return (
    <AppPage width="wide">
      <div className="space-y-6">
        {/* Row 1: greeting + account status */}
        <header>
          <h1 className="text-[var(--font-size-xl)] font-bold text-white">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{format(new Date(), "EEEE, MMMM d")}</p>
        </header>
        <SectionBoundary name="KycStatusCard"><KycStatusCard /></SectionBoundary>
        <SectionBoundary name="KycPromptBanner"><KycPromptBanner /></SectionBoundary>

        {/* Row 2: stats */}
        <SectionBoundary name="StatsRow"><StatsRow /></SectionBoundary>

        {/* Row 3: 40 / 35 / 25 */}
        <div className="grid gap-4 lg:grid-cols-[40fr_35fr_25fr]">
          <SectionBoundary name="QuickActions"><QuickActions /></SectionBoundary>
          <SectionBoundary name="MoneyInMotion"><MoneyInMotion /></SectionBoundary>
          <SectionBoundary name="RecentActivity"><RecentActivity /></SectionBoundary>
        </div>

        {/* Row 4: 60 / 40 */}
        <div className="grid gap-4 lg:grid-cols-[60fr_40fr]">
          <SectionBoundary name="WalletsPanel"><WalletsPanel /></SectionBoundary>
          <SectionBoundary name="ExchangeTicker"><ExchangeTicker /></SectionBoundary>
        </div>

        <SectionBoundary name="BusinessPromptCard"><BusinessPromptCard /></SectionBoundary>
      </div>
    </AppPage>
  );
};

export default Index;
