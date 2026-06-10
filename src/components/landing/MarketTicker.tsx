import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type FiatRow = { from: string; to: string; price: number; change24h: number };
type CryptoRow = { symbol: string; price: number; change24h: number };
type MarketResponse = { fiat: FiatRow[]; crypto: CryptoRow[]; fetched_at: string };

// ISO 4217 → ISO 3166-1 alpha-2 (lowercase) for flagcdn
const CURRENCY_TO_CC: Record<string, string> = {
  USD: "us", CAD: "ca", NGN: "ng", KES: "ke", GHS: "gh", ZMW: "zm",
  GBP: "gb", EUR: "eu", UGX: "ug", TZS: "tz", ZAR: "za", XOF: "sn",
  XAF: "cm", RWF: "rw", MWK: "mw", MZN: "mz", BIF: "bi",
};

const CRYPTO_GLYPH: Record<string, string> = {
  BTC: "₿", ETH: "Ξ", SOL: "◎", XRP: "✕", XLM: "★", USDC: "ⓤ",
};

const decimalsFor = (price: number) => {
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  return 6;
};

const decimalsForInverse = (inv: number) => {
  if (inv >= 100) return 2;
  if (inv >= 1) return 4;
  if (inv >= 0.01) return 6;
  return 8;
};

// Indicative spreads in basis points (1 bp = 0.01%). Used to derive bid/ask from mid.
const MAJOR_FIAT = new Set(["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF"]);
const getSpreadBps = (it: Item): number => {
  if (it.kind === "crypto") return 30;
  const isMajor = MAJOR_FIAT.has(it.from) && MAJOR_FIAT.has(it.to);
  return isMajor ? 10 : 40;
};


const Flag = ({ code, alt }: { code: string; alt: string }) => (
  <img
    src={`https://flagcdn.com/20x15/${code}.png`}
    srcSet={`https://flagcdn.com/40x30/${code}.png 2x`}
    width={20}
    height={15}
    alt={alt}
    loading="lazy"
    className="inline-block rounded-[2px] ring-1 ring-white/10"
  />
);

type Item =
  | { kind: "fiat"; key: string; from: string; to: string; price: number; delta: number }
  | { kind: "crypto"; key: string; symbol: string; price: number; delta: number };

const MarketTicker = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["market-rates"],
    queryFn: async (): Promise<MarketResponse> => {
      const { data, error } = await supabase.functions.invoke("market-rates");
      if (error) throw error;
      return data as MarketResponse;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const items = useMemo<Item[]>(() => {
    if (!data) return [];
    const fiat: Item[] = (data.fiat || []).map((f) => ({
      kind: "fiat",
      key: `${f.from}/${f.to}`,
      from: f.from,
      to: f.to,
      price: f.price,
      delta: f.change24h,
    }));
    const crypto: Item[] = (data.crypto || []).map((c) => ({
      kind: "crypto",
      key: c.symbol,
      symbol: c.symbol,
      price: c.price,
      delta: c.change24h,
    }));
    // interleave
    const out: Item[] = [];
    const max = Math.max(fiat.length, crypto.length);
    for (let i = 0; i < max; i++) {
      if (fiat[i]) out.push(fiat[i]);
      if (crypto[i]) out.push(crypto[i]);
    }
    return out;
  }, [data]);

  const row = (keyPrefix: string) => (
    <div className="flex shrink-0 items-center gap-8 px-4">
      {items.map((it) => {
        const up = it.delta >= 0;
        const dec = decimalsFor(it.price);
        const inverse = it.price > 0 ? 1 / it.price : 0;
        const invDec = decimalsForInverse(inverse);
        const inverseLabel =
          it.kind === "fiat" ? `${it.to}/${it.from}` : `USD/${it.symbol}`;
        return (
          <div
            key={`${keyPrefix}-${it.key}`}
            className="flex items-center gap-2.5 text-sm whitespace-nowrap"
          >
            {it.kind === "fiat" ? (
              <span className="inline-flex items-center gap-1">
                <Flag code={CURRENCY_TO_CC[it.from] ?? "un"} alt={it.from} />
                <Flag code={CURRENCY_TO_CC[it.to] ?? "un"} alt={it.to} />
              </span>
            ) : (
              <span className="text-base leading-none w-5 text-center text-amber-400">
                {CRYPTO_GLYPH[it.symbol] ?? "◆"}
              </span>
            )}
            <span className="font-semibold text-white/90 tracking-tight">
              {it.kind === "fiat" ? `${it.from}/${it.to}` : `${it.symbol}/USD`}
            </span>
            <span className="tabular-nums text-white/70">
              {it.price.toLocaleString("en-US", {
                minimumFractionDigits: dec,
                maximumFractionDigits: dec,
              })}
            </span>
            <span
              className="inline-flex items-center gap-1 text-xs tabular-nums text-white/45"
              title={`Inverse rate ${inverseLabel}`}
            >
              <span className="text-white/30">⇌</span>
              <span className="font-medium text-white/55">{inverseLabel}</span>
              <span>
                {inverse.toLocaleString("en-US", {
                  minimumFractionDigits: invDec,
                  maximumFractionDigits: invDec,
                })}
              </span>
            </span>
            {(() => {
              const spread = getSpreadBps(it) / 10000;
              const bid = it.price * (1 - spread / 2);
              const ask = it.price * (1 + spread / 2);
              return (
                <span
                  className="inline-flex items-center gap-1.5 text-sm tabular-nums rounded-full bg-white/[0.06] ring-1 ring-white/10 px-2 py-0.5"
                  title="Indicative bid / ask derived from live mid"
                >
                  <span className="text-sky-300 font-bold text-[10px] uppercase tracking-wider">Bid</span>
                  <span className="text-white/90 font-semibold">
                    {bid.toLocaleString("en-US", {
                      minimumFractionDigits: dec,
                      maximumFractionDigits: dec,
                    })}
                  </span>
                  <span className="text-white/25">/</span>
                  <span className="text-fuchsia-300 font-bold text-[10px] uppercase tracking-wider">Ask</span>
                  <span className="text-white/90 font-semibold">
                    {ask.toLocaleString("en-US", {
                      minimumFractionDigits: dec,
                      maximumFractionDigits: dec,
                    })}
                  </span>
                </span>
              );
            })()}

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
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 hidden sm:flex items-center gap-1.5 pr-3 mr-3 border-r border-white/10 bg-[hsl(248_55%_8%)]/95">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/70">
          Live markets
        </span>
        <span className="hidden md:inline text-[9px] uppercase tracking-[0.14em] text-white/35 ml-1">
          · Indicative
        </span>
        <span className="hidden lg:inline-flex items-center gap-1 ml-2 rounded-full bg-white/[0.06] ring-1 ring-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold">
          <span className="text-sky-300">Bid</span>
          <span className="text-white/30">/</span>
          <span className="text-fuchsia-300">Ask</span>
        </span>
      </div>




      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[hsl(248_55%_8%)] to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[hsl(248_55%_8%)] to-transparent z-10" />

      <div className="flex py-3 group min-h-[44px]">
        {items.length === 0 ? (
          <div className="px-6 text-xs text-white/60">
            {isLoading ? "Loading live markets…" : "Markets temporarily unavailable"}
          </div>
        ) : (
          <div className="flex animate-[efm-marquee_60s_linear_infinite] group-hover:[animation-play-state:paused]">
            {row("a")}
            {row("b")}
          </div>
        )}
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
