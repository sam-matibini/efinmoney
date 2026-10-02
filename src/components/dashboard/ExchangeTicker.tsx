import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useFxRates } from "@/hooks/useFxRates";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyFlag } from "@/components/ui/FlagImage";

const TICK_MS = 3000;
const MAX_JITTER = 0.0002;
const MAX_PAIRS = 6;
const PREFERRED_BASES = ["CAD", "USD"];

type Pair = { key: string; from: string; to: string; base: number };
type Tick = { offset: number; dir: "up" | "down" | null };

const panelCls = "rounded-[var(--radius-lg)] bg-[var(--color-bg-sidebar)] p-5 h-full";

/**
 * Live Exchange Rates: real rates from fx_rates, with an indicative ±0.0002 tick every 3s.
 * The tick never drifts more than ±0.0002 from the real rate and resets when the real rate changes.
 */
export default function ExchangeTicker() {
  const { data: rates, isLoading, refetch, isFetching } = useFxRates();

  const pairs = useMemo<Pair[]>(() => {
    const list = (rates ?? [])
      .map((r) => ({
        key: `${r.from_currency}-${r.to_currency}`,
        from: r.from_currency,
        to: r.to_currency,
        base: Number(r.rate) > 0 ? Number(r.rate) : Number(r.effective_rate),
      }))
      .filter((p) => p.base > 0 && p.from !== p.to);
    const rank = (p: Pair) => {
      const i = PREFERRED_BASES.indexOf(p.from);
      return i === -1 ? PREFERRED_BASES.length : i;
    };
    return list.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_PAIRS);
  }, [rates]);

  const baseSignature = pairs.map((p) => `${p.key}:${p.base}`).join("|");
  const [ticks, setTicks] = useState<Record<string, Tick>>({});

  useEffect(() => {
    setTicks({});
  }, [baseSignature]);

  useEffect(() => {
    if (pairs.length === 0) return;
    const id = window.setInterval(() => {
      setTicks((prev) => {
        const next: Record<string, Tick> = {};
        for (const p of pairs) {
          const old = prev[p.key]?.offset ?? 0;
          const delta = (Math.random() - 0.5) * 2 * MAX_JITTER;
          const offset = Math.max(-MAX_JITTER, Math.min(MAX_JITTER, old + delta));
          next[p.key] = { offset, dir: offset === old ? prev[p.key]?.dir ?? null : offset > old ? "up" : "down" };
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSignature]);

  return (
    <section aria-labelledby="fx-ticker-title" className={panelCls}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 id="fx-ticker-title" className="text-[var(--font-size-lg)] font-semibold text-white">
            Live Exchange Rates
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">Indicative · updates every 3s</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          aria-label="Refresh exchange rates"
          className="rounded-[var(--radius-sm)] p-2 text-[var(--color-text-muted)] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : pairs.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">Rates are unavailable right now.</p>
      ) : (
        <ul className="space-y-2" aria-live="off">
          {pairs.map((p) => {
            const t = ticks[p.key];
            const value = p.base + (t?.offset ?? 0);
            const color =
              t?.dir === "up" ? "var(--color-success)" : t?.dir === "down" ? "var(--color-danger)" : "var(--color-text-primary)";
            return (
              <li key={p.key}>
                <Link
                  to={`/exchange?from=${p.from}&to=${p.to}`}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-card)] px-4 py-3 transition-colors hover:bg-[var(--color-bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex -space-x-1.5">
                      <CurrencyFlag code={p.from} size="sm" />
                      <CurrencyFlag code={p.to} size="sm" />
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {p.from}/{p.to}
                    </span>
                  </span>
                  <span
                    className="flex items-center gap-1 text-sm font-semibold tabular-nums"
                    style={{ color, transition: "color 0.3s" }}
                  >
                    {t?.dir === "up" && <span aria-label="up">▲</span>}
                    {t?.dir === "down" && <span aria-label="down">▼</span>}
                    {value.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
