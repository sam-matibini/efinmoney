import { useMemo, useState } from "react";
import { ArrowUpRight, Globe, Target, TrendingUp } from "lucide-react";
import StatsCard from "@/components/dashboard/StatsCard";
import SetBudgetModal from "@/components/dashboard/SetBudgetModal";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryFlag } from "@/components/ui/FlagImage";
import { useWallets } from "@/hooks/useWallets";
import { useFxRates } from "@/hooks/useFxRates";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useHideBalance } from "@/hooks/useHideBalance";
import { useMonthlyBudget } from "@/hooks/useMonthlyBudget";
import { buildUsdRateMap } from "@/lib/fx";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

/** Row 2: Total Portfolio, Sent This Month, Countries Reached, Monthly Budget. */
export default function StatsRow() {
  const { data: wallets, isLoading: walletsLoading } = useWallets();
  const { data: fxRates } = useFxRates();
  const stats = useDashboardStats();
  const [hidden] = useHideBalance();
  const { budget, saveBudget } = useMonthlyBudget();
  const [budgetOpen, setBudgetOpen] = useState(false);

  const rateMap = useMemo(
    () => buildUsdRateMap((fxRates ?? []) as Parameters<typeof buildUsdRateMap>[0]),
    [fxRates],
  );

  const totalUsd = useMemo(() => {
    let sum = 0;
    for (const w of wallets ?? []) {
      const r = rateMap.get(w.currency_code);
      if (r !== undefined) sum += Number(w.balance) * r;
    }
    return sum;
  }, [wallets, rateMap]);

  // Today's movement = money sent today (outflow), relative to the balance before it.
  const todayDelta = -stats.dailyUsed;
  const todayPct = totalUsd + stats.dailyUsed > 0 ? (todayDelta / (totalUsd + stats.dailyUsed)) * 100 : 0;

  const budgetCurrency = budget?.currency ?? "CAD";
  const budgetRate = rateMap.get(budgetCurrency);
  const spentInBudgetCcy = budgetRate ? stats.monthlyUsed / budgetRate : stats.monthlyUsed;
  const budgetPct = budget ? Math.min(100, (spentInBudgetCcy / budget.amount) * 100) : 0;

  const mask = (s: string) => (hidden ? "••••••" : s);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Portfolio"
          accent="var(--color-accent-gold)"
          icon={TrendingUp}
          value={walletsLoading ? <Skeleton className="h-8 w-28" /> : mask(usd(totalUsd))}
          subtitle={
            <span style={{ color: todayDelta < 0 ? "var(--color-danger)" : "var(--color-success)" }}>
              {todayDelta < 0 ? "−" : "+"}
              {mask(usd(Math.abs(todayDelta)))} ({todayPct.toFixed(2)}%) today
            </span>
          }
        />

        <StatsCard
          title="Sent This Month"
          accent="var(--color-accent-blue)"
          icon={ArrowUpRight}
          value={stats.isLoading ? <Skeleton className="h-8 w-24" /> : mask(usd(stats.sentMonthUsd))}
          subtitle={
            stats.sentMonthUsd > 0
              ? `${stats.inFlightCount} in flight · ${usd(stats.inFlightUsd)}`
              : "No outgoing transactions yet"
          }
        />

        <StatsCard
          title="Countries Reached"
          accent="var(--color-accent-emerald)"
          icon={Globe}
          value={stats.isLoading ? <Skeleton className="h-8 w-10" /> : stats.countryCount}
          subtitle={
            <div className="space-y-1.5">
              {stats.recentCountries.length > 0 && (
                <div className="flex flex-wrap gap-1" aria-label="Countries you've sent to">
                  {stats.recentCountries.slice(0, 5).map((cc) => (
                    <CountryFlag key={cc} country={cc} size="sm" />
                  ))}
                </div>
              )}
              <span style={{ color: stats.inFlightCount ? "var(--color-accent-gold)" : "var(--color-success)" }}>
                {stats.inFlightCount ? `${stats.inFlightCount} transfer(s) in progress` : "All settled · Up to date"}
              </span>
            </div>
          }
        />

        <StatsCard
          title="Monthly Budget"
          accent="var(--color-accent-purple)"
          icon={Target}
          value={budget ? mask(money(budget.amount, budgetCurrency)) : "Not Set"}
          subtitle={
            budget ? (
              <div className="space-y-1.5">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-valuenow={Math.round(budgetPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Budget used"
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${budgetPct}%`,
                      background: budgetPct >= 100 ? "var(--color-danger)" : "var(--color-accent-purple)",
                    }}
                  />
                </div>
                <span>
                  {mask(money(spentInBudgetCcy, budgetCurrency))} spent · {Math.round(budgetPct)}%
                </span>
              </div>
            ) : (
              "Track your monthly sending"
            )
          }
          action={
            <button
              type="button"
              onClick={() => setBudgetOpen(true)}
              className="rounded-[var(--radius-sm)] border border-[var(--color-accent-gold)] px-3 py-1 text-xs font-semibold text-[var(--color-accent-gold)] hover:bg-[rgba(245,166,35,0.12)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
            >
              {budget ? "Edit Budget" : "Set Budget"}
            </button>
          }
        />
      </div>

      <SetBudgetModal
        open={budgetOpen}
        onOpenChange={setBudgetOpen}
        initialAmount={budget?.amount}
        onSave={(amount) => saveBudget(amount, "CAD")}
      />
    </>
  );
}
