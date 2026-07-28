import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { currencySymbol } from "@/lib/currency";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type TotalsMap = Record<string, number>;

export interface StatementBalanceCardsProps {
  totalsIn: TotalsMap;
  totalsOut: TotalsMap;
  netByCurrency: TotalsMap;
  /** compact = smaller variant for the dashboard; full = larger for the /transfers page */
  variant?: "compact" | "full";
  className?: string;
}

interface CurrencyPill {
  code: string;
  amount: number;
}

const toPills = (totals: TotalsMap): CurrencyPill[] =>
  Object.entries(totals)
    .filter(([, v]) => Math.abs(v) > 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([code, amount]) => ({ code, amount }));

interface TileConfig {
  key: "in" | "out" | "net";
  label: string;
  Icon: typeof ArrowDownLeft;
  tone: "emerald" | "rose" | "primary";
  totals: TotalsMap;
  empty: string;
}

export function StatementBalanceCards({
  totalsIn,
  totalsOut,
  netByCurrency,
  variant = "full",
  className,
}: StatementBalanceCardsProps) {
  const tiles: TileConfig[] = [
    {
      key: "in",
      label: "Money In",
      Icon: ArrowDownLeft,
      tone: "emerald",
      totals: totalsIn,
      empty: "No money in yet",
    },
    {
      key: "out",
      label: "Money Out",
      Icon: ArrowUpRight,
      tone: "rose",
      totals: totalsOut,
      empty: "No money out yet",
    },
    {
      key: "net",
      label: "Net Balance",
      Icon: Wallet,
      tone: "primary",
      totals: netByCurrency,
      empty: "—",
    },
  ];

  const compact = variant === "compact";

  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4",
        compact && "gap-2.5",
        className,
      )}
    >
      {tiles.map((t, i) => (
        <BalanceTile
          key={t.key}
          tile={t}
          index={i}
          compact={compact}
        />
      ))}
    </div>
  );
}

function BalanceTile({
  tile,
  index,
  compact,
}: {
  tile: TileConfig;
  index: number;
  compact: boolean;
}) {
  const { Icon, tone, label, totals, empty, key } = tile;
  const pills = toPills(totals);
  const total = pills.reduce((acc, p) => acc + p.amount, 0);
  const hasValue = pills.length > 0;
  const positive = key === "in" || (key === "net" && total >= 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card",
        toneRing[tone],
        compact ? "p-3.5" : "p-4 sm:p-5",
      )}
    >
      {/* Soft gradient sheen */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 opacity-90 transition-opacity duration-300 group-hover:opacity-100",
          toneBg[tone],
        )}
      />
      {/* Decorative glow blob */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full blur-3xl opacity-60 group-hover:opacity-80 transition-opacity",
          toneGlow[tone],
        )}
      />

      <div className="relative">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                "shrink-0 flex items-center justify-center rounded-xl ring-1 ring-inset ring-white/10 shadow-sm transition-transform duration-300 group-hover:scale-105",
                compact ? "h-8 w-8" : "h-9 w-9",
                toneIcon[tone],
              )}
            >
              <Icon className={cn(compact ? "h-4 w-4" : "h-[18px] w-[18px]")} strokeWidth={2.25} />
            </div>
            <span
              className={cn(
                "font-semibold uppercase tracking-wider text-muted-foreground truncate",
                compact ? "text-[10px]" : "text-[11px]",
              )}
            >
              {label}
            </span>
          </div>
          {key !== "net" && hasValue && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                toneChip[tone],
              )}
            >
              {positive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
              {pills.length} {pills.length === 1 ? "cur" : "curs"}
            </span>
          )}
        </div>

        {/* Big value (sum of all currencies) */}
        {hasValue ? (
          <div
            className={cn(
              "font-display font-bold leading-[1.05] tracking-tight tabular-nums break-words",
              compact ? "text-xl" : "text-2xl sm:text-[28px]",
              toneValue[tone],
            )}
          >
            {key === "out" ? "-" : key === "in" ? "+" : ""}
            {primarySymbol(pills)}
            {fmt(Math.abs(primaryAmount(pills)))}
            <span className="ml-1.5 text-sm font-semibold text-muted-foreground align-baseline">
              {primaryCode(pills)}
            </span>
          </div>
        ) : (
          <div
            className={cn(
              "font-display font-semibold text-muted-foreground",
              compact ? "text-base" : "text-lg",
            )}
          >
            {empty}
          </div>
        )}

        {/* Currency pills */}
        {hasValue && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pills.map((p) => {
              const isPrimary = p === pills[0];
              return (
                <span
                  key={p.code}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-colors",
                    isPrimary ? tonePillPrimary[tone] : tonePillMuted[tone],
                    compact && "text-[10.5px] px-1.5 py-[3px]",
                  )}
                  title={`${p.code} ${fmt(p.amount)}`}
                >
                  <span className="text-[10px] font-bold opacity-80">{p.code}</span>
                  <span>
                    {key === "net" ? "" : key === "in" ? "+" : "−"}
                    {currencySymbol(p.code)}
                    {fmt(Math.abs(p.amount))}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function primaryAmount(pills: CurrencyPill[]) {
  return pills[0]?.amount ?? 0;
}
function primaryCode(pills: CurrencyPill[]) {
  return pills[0]?.code ?? "";
}
function primarySymbol(pills: CurrencyPill[]) {
  return currencySymbol(primaryCode(pills));
}

const toneRing: Record<TileConfig["tone"], string> = {
  emerald: "border-emerald-500/20 hover:border-emerald-500/35",
  rose: "border-rose-500/20 hover:border-rose-500/35",
  primary: "border-primary/25 hover:border-primary/40",
};

const toneBg: Record<TileConfig["tone"], string> = {
  emerald:
    "bg-[radial-gradient(120%_120%_at_0%_0%,hsl(150_75%_55%/0.10),transparent_55%),linear-gradient(180deg,hsl(150_70%_50%/0.04),transparent_70%)]",
  rose:
    "bg-[radial-gradient(120%_120%_at_0%_0%,hsl(350_80%_60%/0.10),transparent_55%),linear-gradient(180deg,hsl(350_75%_55%/0.04),transparent_70%)]",
  primary:
    "bg-[radial-gradient(120%_120%_at_0%_0%,hsl(244_75%_60%/0.14),transparent_55%),linear-gradient(180deg,hsl(244_70%_55%/0.05),transparent_70%)]",
};

const toneGlow: Record<TileConfig["tone"], string> = {
  emerald: "bg-emerald-400/30",
  rose: "bg-rose-400/30",
  primary: "bg-primary/30",
};

const toneIcon: Record<TileConfig["tone"], string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  primary: "bg-primary/15 text-primary",
};

const toneValue: Record<TileConfig["tone"], string> = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  rose: "text-rose-600 dark:text-rose-400",
  primary: "text-foreground",
};

const toneChip: Record<TileConfig["tone"], string> = {
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  primary: "bg-primary/10 text-primary",
};

const tonePillPrimary: Record<TileConfig["tone"], string> = {
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-500/20",
  primary: "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
};

const tonePillMuted: Record<TileConfig["tone"], string> = {
  emerald: "bg-emerald-500/5 text-emerald-700/80 dark:text-emerald-300/80",
  rose: "bg-rose-500/5 text-rose-700/80 dark:text-rose-300/80",
  primary: "bg-primary/5 text-primary/85",
};
