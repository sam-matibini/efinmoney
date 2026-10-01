import { Globe, Target, TrendingUp, ArrowUpRight } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useFxRates } from "@/hooks/useFxRates";
import { useProfile } from "@/hooks/useProfile";
import { useWallets } from "@/hooks/useWallets";
import { flagEmoji, formatMoney, toDisplayAmount } from "@/components/dashboard/redesign/money";

type DashboardStatsProps = {
  budget: number | null;
  onSetBudget: () => void;
};

const DashboardStats = ({ budget, onSetBudget }: DashboardStatsProps) => {
  const { data: wallets } = useWallets();
  const { data: profile } = useProfile();
  const { data: fxRates } = useFxRates();
  const { sentMonthUsd, countryCount, recentCountries, inFlightCount, transfers } = useDashboardStats();
  const display = (profile?.default_currency || "CAD").toUpperCase();
  const rates = fxRates ?? [];

  const portfolio = useMemo(() => {
    let total = 0;
    for (const wallet of wallets ?? []) {
      const converted = toDisplayAmount(Number(wallet.balance) || 0, wallet.currency_code, display, rates);
      if (converted !== null) total += converted;
    }
    return total;
  }, [wallets, display, rates]);

  const todayDelta = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    let delta = 0;
    for (const transfer of transfers ?? []) {
      if (new Date(transfer.created_at) < start) continue;
      const converted = toDisplayAmount(
        Number(transfer.source_amount) || 0,
        transfer.source_currency || display,
        display,
        rates,
      );
      if (converted !== null) delta -= converted;
    }
    return delta;
  }, [transfers, display, rates]);

  const sentMonth = toDisplayAmount(sentMonthUsd, "USD", display, rates) ?? sentMonthUsd;
  const todayPct = portfolio > 0 ? (todayDelta / portfolio) * 100 : 0;
  const todayDown = todayDelta < 0;
  const flags = recentCountries.slice(0, 5);

  return (
    <section className="stats-row" aria-label="Account summary">
      <article className="stat-card" style={{ "--card-accent": "var(--color-accent-gold)" } as CSSProperties}>
        <div className="stat-card-head">
          <p className="stat-label">Total Portfolio</p>
          <TrendingUp className="stat-icon" size={20} aria-hidden />
        </div>
        <p className="stat-value">{formatMoney(portfolio, display)}</p>
        <p className={`stat-note ${todayDelta < 0 ? "negative" : todayDelta > 0 ? "positive" : ""}`}>
          {todayDelta === 0
            ? "No change today"
            : `${todayDelta < 0 ? "↓" : "↑"} ${formatMoney(todayDelta, display)} (${todayPct.toFixed(2)}%) today`}
        </p>
      </article>

      <article className="stat-card" style={{ "--card-accent": "var(--color-accent-blue)" } as CSSProperties}>
        <div className="stat-card-head">
          <p className="stat-label">Sent This Month</p>
          <ArrowUpRight size={20} color="var(--color-accent-blue)" aria-hidden />
        </div>
        <p className="stat-value">{formatMoney(sentMonth, display)}</p>
        <p className="stat-note">{sentMonth > 0 ? "Outgoing transfers this month" : "No outgoing transactions yet"}</p>
      </article>

      <article className="stat-card" style={{ "--card-accent": "var(--color-accent-emerald)" } as CSSProperties}>
        <div className="stat-card-head">
          <p className="stat-label">Countries Reached</p>
          <Globe size={20} color="var(--color-accent-emerald)" aria-hidden />
        </div>
        <p className="stat-value">{countryCount}</p>
        {flags.length > 0 && (
          <div className="stat-flags" aria-hidden>
            {flags.map((code) => (
              <span key={code} title={code}>{flagEmoji(code)}</span>
            ))}
          </div>
        )}
        <p className={`stat-note ${inFlightCount === 0 ? "positive" : ""}`}>
          {countryCount === 0
            ? "No corridors yet"
            : inFlightCount === 0
              ? "All settled – Up to date"
              : `${inFlightCount} in progress`}
        </p>
      </article>

      <article className="stat-card" style={{ "--card-accent": "var(--color-accent-purple)" } as CSSProperties}>
        <div className="stat-card-head">
          <p className="stat-label">Monthly Budget</p>
          <Target size={20} color="var(--color-accent-purple)" aria-hidden />
        </div>
        <p className="stat-value">{budget === null ? "Not Set" : formatMoney(budget, "CAD")}</p>
        <button type="button" className="budget-cta" onClick={onSetBudget}>
          {budget === null ? "Set Budget" : "Edit Budget"}
        </button>
      </article>
    </section>
  );
};

export default DashboardStats;
