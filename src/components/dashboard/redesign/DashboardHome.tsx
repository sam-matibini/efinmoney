import { useState } from "react";
import KycPromptBanner from "@/components/kyc/KycPromptBanner";
import BusinessPromptCard from "@/components/kyb/BusinessPromptCard";
import { SectionBoundary } from "@/components/common/SectionBoundary";
import BudgetModal from "@/components/dashboard/redesign/BudgetModal";
import DashboardStats from "@/components/dashboard/redesign/DashboardStats";
import KycTierCard from "@/components/dashboard/redesign/KycTierCard";
import ExchangeTicker from "@/components/dashboard/redesign/ExchangeTicker";
import MoneyInMotion from "@/components/dashboard/redesign/MoneyInMotion";
import QuickActionsGrid from "@/components/dashboard/redesign/QuickActionsGrid";
import RecentActivity from "@/components/dashboard/redesign/RecentActivity";
import WalletsPanel from "@/components/dashboard/redesign/WalletsPanel";
import { readMonthlyBudget, writeMonthlyBudget } from "@/components/dashboard/redesign/money";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { getGreeting } from "@/lib/greeting";

const DashboardHome = () => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const [budget, setBudget] = useState<number | null>(() => readMonthlyBudget());
  const [budgetOpen, setBudgetOpen] = useState(false);
  const displayName =
    profile?.full_name ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "") ||
    user?.email?.split("@")[0] ||
    "there";
  const firstName = displayName.split(" ")[0];
  const greeting = getGreeting(profile?.address_country || profile?.country_code).text;
  const today = new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="dashboard-home">
      <div className="dash-alerts">
        <SectionBoundary name="KycPromptBanner"><KycPromptBanner /></SectionBoundary>
        <SectionBoundary name="BusinessPromptCard"><BusinessPromptCard /></SectionBoundary>
      </div>

      <header className="dash-greeting">
        <div>
          <p className="dash-kicker">{greeting}</p>
          <h1>{firstName}</h1>
        </div>
        <p className="dash-date">{today}</p>
      </header>

      <DashboardStats budget={budget} onSetBudget={() => setBudgetOpen(true)} />
      <KycTierCard />

      <div className="motion-row">
        <QuickActionsGrid />
        <MoneyInMotion />
        <RecentActivity />
      </div>

      <div className="asset-row">
        <WalletsPanel />
        <ExchangeTicker />
      </div>

      <BudgetModal
        open={budgetOpen}
        initialValue={budget}
        onClose={() => setBudgetOpen(false)}
        onSave={(amount) => {
          writeMonthlyBudget(amount);
          setBudget(amount);
        }}
      />
    </div>
  );
};

export default DashboardHome;
