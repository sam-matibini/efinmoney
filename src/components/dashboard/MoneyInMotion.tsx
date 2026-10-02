import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryFlag } from "@/components/ui/FlagImage";
import { normalizeCountryCode } from "@/lib/flags";

const IN_FLIGHT = ["initiated", "funded", "processing", "pending_liquidity", "pending_ops"];
const FAILED = ["failed", "cancelled", "reversed", "refunded"];

const SEGMENTS = [
  { key: "completed", label: "Delivered", color: "var(--color-accent-emerald)" },
  { key: "inFlight", label: "In motion", color: "var(--color-accent-gold)" },
  { key: "failed", label: "Failed", color: "var(--color-danger)" },
] as const;

const R = 42;
const C = 2 * Math.PI * R;

/** Row 3 middle: this month's transfers by state as a ring, plus top destination corridors. */
export default function MoneyInMotion() {
  const { transfers, isLoading } = useDashboardStats();

  const { counts, total, corridors } = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const c = { completed: 0, inFlight: 0, failed: 0 };
    const byCountry = new Map<string, number>();
    for (const t of transfers ?? []) {
      if (new Date(t.created_at).getTime() < start.getTime()) continue;
      if (IN_FLIGHT.includes(t.status)) c.inFlight += 1;
      else if (FAILED.includes(t.status)) c.failed += 1;
      else c.completed += 1;
      const cc = t.recipient_country ? normalizeCountryCode(t.recipient_country) : null;
      if (cc) byCountry.set(cc, (byCountry.get(cc) ?? 0) + 1);
    }
    return {
      counts: c,
      total: c.completed + c.inFlight + c.failed,
      corridors: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    };
  }, [transfers]);

  let acc = 0;

  return (
    <section aria-labelledby="money-motion-title" className="rounded-[var(--radius-lg)] bg-[var(--color-bg-sidebar)] p-5 h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="money-motion-title" className="text-[var(--font-size-lg)] font-semibold text-[var(--color-text-primary)]">
          Money in Motion
        </h2>
        <span className="text-xs text-[var(--color-text-muted)]">This month</span>
      </div>

      {isLoading ? (
        <Skeleton className="mx-auto h-40 w-40 rounded-full" />
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
          <div className="relative h-36 w-36 shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${total} transfers this month`}>
              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-track)" strokeWidth="10" />
              {total > 0 &&
                SEGMENTS.map((s) => {
                  const len = (counts[s.key] / total) * C;
                  const el = (
                    <circle
                      key={s.key}
                      cx="50"
                      cy="50"
                      r={R}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="10"
                      strokeDasharray={`${len} ${C - len}`}
                      strokeDashoffset={-acc}
                      style={{ transition: "stroke-dasharray 0.6s ease" }}
                    />
                  );
                  acc += len;
                  return len > 0 ? el : null;
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-[var(--color-text-primary)] tabular-nums">{total}</span>
              <span className="text-[11px] text-[var(--color-text-muted)]">transfers</span>
            </div>
          </div>

          <div className="w-full space-y-3">
            <ul className="space-y-1.5">
              {SEGMENTS.map((s) => (
                <li key={s.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-[var(--color-text-label)]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                    {s.label}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--color-text-primary)]">{counts[s.key]}</span>
                </li>
              ))}
            </ul>

            {corridors.length > 0 ? (
              <div className="border-t border-[var(--color-border)] pt-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Top destinations
                </p>
                <div className="flex flex-wrap gap-2">
                  {corridors.map(([cc, n]) => (
                    <span
                      key={cc}
                      className="flex items-center gap-1.5 rounded-full bg-[var(--color-bg-card)] px-2.5 py-1 text-xs text-[var(--color-text-primary)]"
                    >
                      <CountryFlag country={cc} size="sm" />
                      {cc} · {n}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                to="/send"
                className="block border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-accent-gold)] hover:underline"
              >
                Send your first transfer this month →
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
