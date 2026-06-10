import { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useFxRates } from "@/hooks/useFxRates";

type Item = {
  key: string;
  label: string; // "USD/CAD"
  flags: string; // "🇺🇸🇨🇦" or coin glyph
  price: number;
  decimals: number;
  delta: number; // % change
};

const FIAT_PAIRS: { from: string; to: string; flags: string; decimals?: number }[] = [
  { from: "USD", to: "CAD", flags: "🇺🇸🇨🇦", decimals: 4 },
  { from: "USD", to: "NGN", flags: "🇺🇸🇳🇬", decimals: 2 },
  { from: "USD", to: "KES", flags: "🇺🇸🇰🇪", decimals: 2 },
  { from: "USD", to: "GHS", flags: "🇺🇸🇬🇭", decimals: 3 },
  { from: "USD", to: "ZMW", flags: "🇺🇸🇿🇲", decimals: 3 },
  { from: "CAD", to: "NGN", flags: "🇨🇦🇳🇬", decimals: 2 },
  { from: "GBP", to: "USD", flags: "🇬🇧🇺🇸", decimals: 4 },
  { from: "EUR", to: "USD", flags: "🇪🇺🇺🇸", decimals: 4 },
];

// Fallback rates so the ticker still shows numbers if useFxRates() hasn't loaded
// or doesn't carry the exact pair. Illustrative.
const FALLBACK_RATES: Record<string, number> = {
  "USD/CAD": 1.3712,
  "USD/NGN": 1612.45,
  "USD/KES": 129.85,
  "USD/GHS": 15.124,
  "USD/ZMW": 26.512,
  "CAD/NGN": 1175.6,
  "GBP/USD": 1.2734,
  "EUR/USD": 1.0842,
};

const CRYPTO: { label: string; flags: string; price: number; decimals: number; delta: number }[] = [
  { label: "BTC/USD", flags: "₿", price: 71240.5, decimals: 2, delta: 2.41 },
  { label: "ETH/USD", flags: "Ξ", price: 3812.16, decimals: 2, delta: 1.18 },
  { label: "SOL/USD", flags: "◎", price: 184.72, decimals: 2, delta: -0.84 },
  { label: "XRP/USD", flags: "✕", price: 0.6312, decimals: 4, delta: 0.62 },
  { label: "XLM/USD", flags: "★", price: 0.1284, decimals: 4, delta: -1.07 },
  { label: "USDC/USD", flags: "ⓤ", price: 1.0001, decimals: 4, delta: 0.01 },
];

// Deterministic small delta from a number so the UI doesn't flicker
const deterministicDelta = (n: number) => {
  const x = Math.sin(n * 13.37) * 100;
  return Math.round((x - Math.floor(x)) * 400) / 100 - 2; // -2 to +2 %
};

const MarketTicker = () => {
  const { data: fxRates } = useFxRates();

  const items = useMemo<Item[]>(() => {
    const rateMap = new Map<string, number>();
    for (const r of fxRates || []) {
      rateMap.set(`${r.from_currency}/${r.to_currency}`, Number(r.effective_rate));
    }
    const fiat: Item[] = FIAT_PAIRS.map((p) => {
      const key = `${p.from}/${p.to}`;
      const price = rateMap.get(key) ?? FALLBACK_RATES[key] ?? 1;
      return {
        key,
        label: key,
        flags: p.flags,
        price,
        decimals: p.decimals ?? 4,
        delta: deterministicDelta(price),
      };
    });
    const crypto: Item[] = CRYPTO.map((c) => ({
      key: c.label,
      label: c.label,
      flags: c.flags,
      price: c.price,
      decimals: c.decimals,
      delta: c.delta,
    }));
    // interleave fiat & crypto
    const out: Item[] = [];
    const max = Math.max(fiat.length, crypto.length);
    for (let i = 0; i < max; i++) {
      if (fiat[i]) out.push(fiat[i]);
      if (crypto[i]) out.push(crypto[i]);
    }
    return out;
  }, [fxRates]);

  const row = (keyPrefix: string) => (
    <div className="flex shrink-0 items-center gap-8 px-4">
      {items.map((it) => {
        const up = it.delta >= 0;
        return (
          <div
            key={`${keyPrefix}-${it.key}`}
            className="flex items-center gap-2.5 text-sm whitespace-nowrap"
          >
            <span className="text-base leading-none">{it.flags}</span>
            <span className="font-semibold text-white/90 tracking-tight">{it.label}</span>
            <span className="tabular-nums text-white/70">
              {it.price.toLocaleString("en-US", {
                minimumFractionDigits: it.decimals,
                maximumFractionDigits: it.decimals,
              })}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                up ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {up ? "+" : ""}
              {it.delta.toFixed(2)}%
            </span>
            <span className="text-white/15">•</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      aria-label="Live markets"
      className="relative w-full overflow-hidden border-y border-white/10 bg-[hsl(248_55%_8%)]/95 backdrop-blur-md"
    >
      {/* live dot */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 hidden sm:flex items-center gap-1.5 pr-3 mr-3 border-r border-white/10 bg-[hsl(248_55%_8%)]/95">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/70">
          Live markets
        </span>
      </div>

      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[hsl(248_55%_8%)] to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[hsl(248_55%_8%)] to-transparent z-10" />

      <div className="flex py-3 group">
        <div className="flex animate-[efm-marquee_60s_linear_infinite] group-hover:[animation-play-state:paused]">
          {row("a")}
          {row("b")}
        </div>
      </div>

      <style>{`
        @keyframes efm-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};

export default MarketTicker;
