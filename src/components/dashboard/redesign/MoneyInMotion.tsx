import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useFxRates } from "@/hooks/useFxRates";
import { useProfile } from "@/hooks/useProfile";
import { flagEmoji, formatMoney, toDisplayAmount } from "@/components/dashboard/redesign/money";

const MoneyInMotion = () => {
  const { inFlightCount, inFlightUsd, recentCountries, transfers } = useDashboardStats();
  const { data: profile } = useProfile();
  const { data: fxRates } = useFxRates();
  const display = (profile?.default_currency || "CAD").toUpperCase();
  const total = transfers?.length ?? 0;
  const settled = Math.max(0, total - inFlightCount);
  const percent = total === 0 ? 0 : Math.round((settled / total) * 100);
  const amount = toDisplayAmount(inFlightUsd, "USD", display, fxRates ?? []) ?? inFlightUsd;

  return (
    <section className="dash-panel" aria-label="Money in motion">
      <h2 className="panel-title">Money in Motion</h2>
      <div className="motion-body">
        <div
          className="ring"
          style={{
            background: `conic-gradient(var(--color-accent-emerald) ${percent}%, rgba(255,255,255,0.08) 0)`,
          }}
          role="img"
          aria-label={`${percent}% of recent transfers are settled`}
        >
          <div className="ring-hole">{percent}%</div>
        </div>
        <div className="motion-copy">
          <p className="motion-amount">{formatMoney(amount, display)}</p>
          <p className="motion-sub">
            {inFlightCount === 0 ? "Nothing is currently moving" : `${inFlightCount} transfer${inFlightCount === 1 ? "" : "s"} in flight`}
          </p>
          {recentCountries.length > 0 && (
            <p className="stat-flags" aria-label="Recent destination countries">
              {recentCountries.slice(0, 5).map((code) => (
                <span key={code} title={code}>{flagEmoji(code)}</span>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default MoneyInMotion;
