import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useFxRates } from "@/hooks/useFxRates";

type Tick = {
  pair: string;
  base: number;
  value: number;
  direction: "up" | "down" | "flat";
};

const SAMPLE: Tick[] = [
  { pair: "CAD/USD", base: 0.7362, value: 0.7362, direction: "flat" },
  { pair: "USD/NGN", base: 1498.25, value: 1498.25, direction: "flat" },
  { pair: "CAD/UGX", base: 2684.1, value: 2684.1, direction: "flat" },
  { pair: "USD/KES", base: 129.42, value: 129.42, direction: "flat" },
];

function formatRate(value: number) {
  return value < 20 ? value.toFixed(6) : value.toFixed(4);
}

const ExchangeTicker = () => {
  const { data: rates, isLoading } = useFxRates();
  const live = useMemo<Tick[]>(() => {
    const rows = (rates ?? []).filter((rate) => Number(rate.rate) > 0 || Number(rate.effective_rate) > 0);
    const preferred = rows.filter((rate) => rate.from_currency === "CAD" || rate.from_currency === "USD");
    const source = (preferred.length ? preferred : rows).slice(0, 6);
    return source.map((rate) => {
      const base = Number(rate.rate) > 0 ? Number(rate.rate) : Number(rate.effective_rate);
      return { pair: `${rate.from_currency}/${rate.to_currency}`, base, value: base, direction: "flat" as const };
    });
  }, [rates]);

  const usingSample = !isLoading && live.length === 0;
  const [ticks, setTicks] = useState<Tick[]>(SAMPLE);

  useEffect(() => {
    setTicks(live.length ? live : SAMPLE);
  }, [live]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTicks((current) =>
        current.map((rate) => {
          const next = rate.base + (Math.random() - 0.5) * 0.0004;
          const direction = next > rate.value ? "up" : next < rate.value ? "down" : "flat";
          return { ...rate, value: next, direction };
        }),
      );
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="dash-panel" aria-label="Live exchange rates">
      <div className="panel-head">
        <h2 className="panel-title">Live Exchange Rates</h2>
      </div>
      {usingSample && <p className="panel-empty">Sample quotes — live desk rates are unavailable.</p>}
      <div className="rate-list">
        {(isLoading ? [] : ticks).map((rate) => (
          <div key={rate.pair} className="rate-row">
            <p className="rate-pair">{rate.pair}</p>
            <span className={`rate-value rate-${rate.direction}`}>
              {rate.direction === "up" && <ArrowUp size={16} aria-hidden />}
              {rate.direction === "down" && <ArrowDown size={16} aria-hidden />}
              <span>{formatRate(rate.value)}</span>
            </span>
          </div>
        ))}
        {isLoading && <p className="panel-empty">Loading rates…</p>}
      </div>
    </section>
  );
};

export default ExchangeTicker;
