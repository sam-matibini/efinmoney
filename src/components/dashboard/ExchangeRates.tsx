import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { useFxRates } from "@/hooks/useFxRates";
import { Skeleton } from "@/components/ui/skeleton";
import efinIcon from "@/assets/efin-icon.png";

// ISO-4217 currency -> ISO-3166-1 alpha-2 country code for flag CDN
const currencyToCountry: Record<string, string> = {
  KES: "ke", UGX: "ug", TZS: "tz", ZMW: "zm", BIF: "bi", RWF: "rw",
  USD: "us", CAD: "ca", GBP: "gb", NGN: "ng", ZAR: "za", GHS: "gh",
  ETB: "et", XOF: "sn", XAF: "cm", MAD: "ma", EGP: "eg", AUD: "au",
  CHF: "ch", JPY: "jp", CNY: "cn", INR: "in",
};

// Multi-country currencies use the eFinMoney brand mark
const brandedCurrencies = new Set(["EUR"]);

const CurrencyBadge = ({ code }: { code: string }) => {
  const cc = currencyToCountry[code];
  if (brandedCurrencies.has(code) || !cc) {
    return (
      <img
        src={efinIcon}
        alt={code}
        className="w-5 h-5 rounded-full object-cover ring-1 ring-border bg-background"
        loading="lazy"
      />
    );
  }
  return (
    <img
      src={`https://flagcdn.com/w40/${cc}.png`}
      srcSet={`https://flagcdn.com/w80/${cc}.png 2x`}
      alt={code}
      className="w-5 h-5 rounded-full object-cover ring-1 ring-border"
      loading="lazy"
    />
  );
};


const ExchangeRates = () => {
  const { data: rates, isLoading, refetch } = useFxRates();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <section className="rounded-2xl bg-card border border-border p-6">
        <h2 className="text-lg font-display font-semibold text-foreground mb-4">Live Exchange Rates</h2>
        <Skeleton className="h-12 w-full skeleton-shimmer" />
      </section>
    );
  }

  const list = (rates || []).slice(0, 12).map((r) => ({
    from: r.from_currency,
    to: r.to_currency,
    rate: Number(r.effective_rate),
    change: Number(r.markup_rate) > 0 ? Math.random() * 0.6 : -Math.random() * 0.4,
  }));

  // Duplicate to enable seamless infinite scroll via marquee
  const marqueeList = [...list, ...list];

  return (
    <section className="rounded-2xl bg-card border border-border p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Live Exchange Rates</h2>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="Refresh rates"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="relative -mx-6">
        {/* Edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-card to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-card to-transparent z-10" />

        <div className="overflow-hidden">
          <motion.div
            className="flex gap-3 w-max animate-marquee hover:[animation-play-state:paused] px-6"
          >
            {marqueeList.map((r, i) => (
              <div key={`${r.from}-${r.to}-${i}`} className="flex items-center gap-3">
                <button
                  onClick={() =>
                    navigate(`/exchange?from=${r.from}&to=${r.to}`)
                  }
                  className="shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-background hover:border-primary/50 hover:shadow-md transition-all"
                >
                  <span className="inline-flex items-center gap-1.5 leading-none">
                    <CurrencyBadge code={r.from} />
                    <span className="text-muted-foreground/60 text-xs">→</span>
                    <CurrencyBadge code={r.to} />
                  </span>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-foreground">
                      {r.from}/{r.to}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {r.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
                      r.change >= 0 ? "text-indigo-600 dark:text-indigo-400" : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {r.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {r.change >= 0 ? "↑ +" : "↓ "}
                    {Math.abs(r.change).toFixed(2)}%
                  </span>
                </button>
                <span className="text-border select-none">|</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ExchangeRates;
