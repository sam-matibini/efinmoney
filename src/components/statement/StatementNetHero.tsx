import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, FileText, Sparkles, Wallet } from "lucide-react";
import { currencySymbol } from "@/lib/currency";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface StatementNetHeroProps {
  netByCurrency: Record<string, number>;
  totalsIn: Record<string, number>;
  totalsOut: Record<string, number>;
  totalCount: number;
}

export function StatementNetHero({
  netByCurrency,
  totalsIn,
  totalsOut,
  totalCount,
}: StatementNetHeroProps) {
  const netEntries = Object.entries(netByCurrency)
    .filter(([, v]) => Math.abs(v) > 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  const totalInSum = Object.values(totalsIn).reduce((a, b) => a + b, 0);
  const totalOutSum = Object.values(totalsOut).reduce((a, b) => a + b, 0);
  const netSum = totalInSum - totalOutSum;
  const positive = netSum >= 0;

  const primaryNet = netEntries[0];
  const primaryIn = Object.entries(totalsIn).sort((a, b) => b[1] - a[1])[0];
  const primaryOut = Object.entries(totalsOut).sort((a, b) => b[1] - a[1])[0];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl border border-white/10 text-white shadow-xl"
      style={{
        background:
          "linear-gradient(135deg, hsl(244 75% 22%) 0%, hsl(258 70% 32%) 50%, hsl(280 70% 38%) 100%)",
      }}
    >
      {/* Decorative layers */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(900px circle at 0% 0%, hsl(258 90% 60% / 0.45), transparent 55%), radial-gradient(700px circle at 100% 100%, hsl(195 90% 55% / 0.28), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full blur-3xl opacity-50"
        style={{ background: "hsl(195 90% 60% / 0.35)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-12 h-64 w-64 rounded-full blur-3xl opacity-50"
        style={{ background: "hsl(280 80% 60% / 0.35)" }}
      />

      <div className="relative p-6 sm:p-8">
        {/* Top row: label + status pill */}
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur">
              <Wallet className="h-[18px] w-[18px] text-white" strokeWidth={2.25} />
            </span>
            <div className="leading-tight">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/65 font-semibold">
                Net balance across wallets
              </p>
              <p className="text-xs text-white/55 mt-0.5">All currencies · Live</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/90 bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur rounded-full px-2.5 py-1">
            <Sparkles className="h-3 w-3" />
            {totalCount} transaction{totalCount === 1 ? "" : "s"} on record
          </span>
        </div>

        {/* Big primary balance */}
        {primaryNet ? (
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
                  positive
                    ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-inset ring-emerald-300/30"
                    : "bg-rose-400/15 text-rose-200 ring-1 ring-inset ring-rose-300/30"
                }`}
              >
                {positive ? "▲" : "▼"} {positive ? "Positive" : "Negative"} position
              </span>
              <span className="text-[11px] text-white/55 font-medium">as of today</span>
            </div>
            <h2 className="mt-2 font-display font-bold tracking-tight text-white text-4xl sm:text-5xl md:text-6xl leading-[1.05]">
              {primaryNet[1] < 0 ? "-" : ""}
              {currencySymbol(primaryNet[0])}
              {fmt(Math.abs(primaryNet[1]))}
              <span className="ml-2 text-xl sm:text-2xl font-semibold text-white/70 align-baseline">
                {primaryNet[0]}
              </span>
            </h2>
            {/* All-currency net pills */}
            {netEntries.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {netEntries.map(([code, amount]) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur px-2.5 py-1 text-xs font-semibold tabular-nums"
                  >
                    <span className="text-[10px] font-bold text-white/65">{code}</span>
                    <span className={amount < 0 ? "text-rose-100" : "text-emerald-100"}>
                      {amount < 0 ? "−" : "+"}
                      {currencySymbol(code)}
                      {fmt(Math.abs(amount))}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-2xl font-display font-semibold text-white/70">No balance yet</p>
        )}

        {/* Bottom row: In / Out summaries */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SummaryChip
            tone="emerald"
            icon={ArrowDownLeft}
            label="Money In"
            primary={primaryIn}
            fallback="No inflows"
          />
          <SummaryChip
            tone="rose"
            icon={ArrowUpRight}
            label="Money Out"
            primary={primaryOut}
            fallback="No outflows"
          />
        </div>

        {/* Tiny "transactions" meta */}
        <div className="mt-4 flex items-center gap-1.5 text-xs text-white/55">
          <FileText className="h-3.5 w-3.5" />
          Showing totals across the full statement, not the current filter.
        </div>
      </div>
    </motion.section>
  );
}

function SummaryChip({
  tone,
  icon: Icon,
  label,
  primary,
  fallback,
}: {
  tone: "emerald" | "rose";
  icon: typeof ArrowDownLeft;
  label: string;
  primary?: [string, number];
  fallback: string;
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-400/10 ring-emerald-300/20 text-emerald-100"
      : "bg-rose-400/10 ring-rose-300/20 text-rose-100";
  const iconClass =
    tone === "emerald"
      ? "bg-emerald-400/20 text-emerald-50"
      : "bg-rose-400/20 text-rose-50";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 ring-1 ring-inset backdrop-blur ${toneClass}`}
    >
      <span className={`inline-flex items-center justify-center h-9 w-9 rounded-xl ${iconClass}`}>
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] uppercase tracking-wider font-semibold text-white/65">{label}</p>
        {primary ? (
          <p className="font-display font-bold text-base sm:text-lg leading-tight tabular-nums truncate">
            {tone === "emerald" ? "+" : "−"}
            {currencySymbol(primary[0])}
            {fmt(Math.abs(primary[1]))}
            <span className="ml-1 text-xs font-semibold text-white/55">{primary[0]}</span>
          </p>
        ) : (
          <p className="font-display font-semibold text-base text-white/70">{fallback}</p>
        )}
      </div>
    </div>
  );
}
