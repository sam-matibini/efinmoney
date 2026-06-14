import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { useFxRates } from "@/hooks/useFxRates";

const FLAG: Record<string, string> = {
  USD: "🇺🇸", CAD: "🇨🇦", EUR: "🇪🇺", GBP: "🇬🇧", NGN: "🇳🇬", KES: "🇰🇪",
  GHS: "🇬🇭", ZAR: "🇿🇦", UGX: "🇺🇬", TZS: "🇹🇿", ZMW: "🇿🇲", XAF: "🌍", XOF: "🌍",
};

const PREFERRED = ["NGN", "KES", "GHS", "ZAR", "UGX", "TZS", "ZMW"];

/**
 * Live marquee of real FX rates pulled from the fx_rates table.
 */
const FxTicker = () => {
  const { data: rates } = useFxRates();

  const items = useMemo(() => {
    if (!rates?.length) return [];
    // Prefer sends from a major currency into African corridors.
    const picked = rates
      .filter((r) => ["USD", "CAD", "GBP", "EUR"].includes(r.from_currency) && PREFERRED.includes(r.to_currency))
      .slice(0, 14);
    const fallback = picked.length ? picked : rates.slice(0, 14);
    return fallback.map((r) => ({
      key: `${r.from_currency}-${r.to_currency}-${r.id}`,
      from: r.from_currency,
      to: r.to_currency,
      rate: Number(r.effective_rate || r.rate),
    }));
  }, [rates]);

  if (!items.length) return null;

  const loop = [...items, ...items];

  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-full border border-border/60 bg-card/60 px-3 py-2 backdrop-blur">
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        Live
      </span>
      <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <motion.div
          className="flex w-max items-center gap-6"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 32, ease: "linear", repeat: Infinity }}
        >
          {loop.map((it, i) => (
            <span key={`${it.key}-${i}`} className="flex shrink-0 items-center gap-1.5 text-xs">
              <span>{FLAG[it.from] || "💱"}</span>
              <span className="font-medium text-muted-foreground">{it.from}</span>
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <span>{FLAG[it.to] || "🌍"}</span>
              <span className="font-semibold text-foreground">
                {it.rate.toLocaleString("en-US", { maximumFractionDigits: it.rate > 100 ? 0 : 4 })}
              </span>
              <span className="text-muted-foreground">{it.to}</span>
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default FxTicker;
