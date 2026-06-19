import { memo, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Globe2, ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { useTransfers } from "@/hooks/useTransfers";
import { useFxRates } from "@/hooks/useFxRates";
import { buildUsdRateMap, convertToUsd } from "@/lib/fx";
import { normalizeCountryCode } from "@/lib/flags";
import CorridorGlobe from "@/components/dashboard/CorridorGlobe";

const fmtUsd = (n: number) =>
  n >= 1000
    ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PENDING = ["initiated", "funded", "processing"];

const WealthPulseBannerInner = () => {
  const reduceMotion = useReducedMotion();
  const { data: transfers } = useTransfers(500);
  const { data: fxRates } = useFxRates();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const rateMap = buildUsdRateMap((fxRates ?? []) as any);
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let sentMonthUsd = 0;
    const countries = new Set<string>();
    const recentCountries: string[] = [];
    let inFlightCount = 0;
    let inFlightUsd = 0;

    for (const t of transfers ?? []) {
      const ts = new Date(t.created_at).getTime();
      const usd = convertToUsd(Number(t.source_amount || 0), (t as any).source_currency || "USD", rateMap) ?? 0;
      if (ts >= startMonth) sentMonthUsd += usd;
      if (t.recipient_country) {
        const cc = normalizeCountryCode(t.recipient_country);
        if (cc) {
          countries.add(cc);
          if (recentCountries.length < 6 && !recentCountries.includes(cc)) {
            recentCountries.push(cc);
          }
        }
      }
      if (PENDING.includes(t.status)) {
        inFlightCount += 1;
        inFlightUsd += usd;
      }
    }
    return { sentMonthUsd, countryCount: countries.size, recentCountries, inFlightCount, inFlightUsd };
  }, [transfers, fxRates]);

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-[hsl(var(--accent-amber)/0.04)]" />

      <div className="relative grid items-center gap-4 p-5 sm:p-7 md:grid-cols-[1.15fr_minmax(220px,0.85fr)]">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Money in motion</p>

          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Sent this month</p>
            <p className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {fmtUsd(stats.sentMonthUsd)}
            </p>
          </div>

          <div className="mt-5 grid max-w-md grid-cols-2 gap-2.5">
            <KpiChip
              label="Countries reached"
              value={String(stats.countryCount)}
              icon={<Globe2 className="h-3.5 w-3.5" />}
              flags={stats.recentCountries}
              onClick={() => navigate("/transfers")}
            />
            <KpiChip
              label={stats.inFlightCount > 0 ? "In transit now" : "All settled"}
              value={stats.inFlightCount > 0 ? fmtUsd(stats.inFlightUsd) : "Up to date"}
              icon={
                stats.inFlightCount > 0 ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )
              }
              highlight={stats.inFlightCount > 0}
              onClick={() => navigate("/transfers")}
            />
          </div>
        </div>

        <div className="flex items-center justify-center md:justify-end">
          <CorridorGlobe countries={stats.recentCountries} />
        </div>
      </div>
    </motion.section>
  );
};

const KpiChip = ({
  label,
  value,
  icon,
  flags,
  highlight,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  flags?: string[];
  highlight?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`group flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-[transform,box-shadow,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 ${
      highlight
        ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
        : "border-border bg-background/50 hover:bg-background"
    }`}
  >
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {icon} <span className="truncate">{label}</span>
    </span>
    <span className="font-display text-lg font-bold leading-none text-foreground">{value}</span>
    {flags && flags.length > 0 ? (
      <span className="mt-1 flex items-center pl-0.5">
        {flags.slice(0, 4).map((cc, i) => (
          <span
            key={`${cc}-${i}`}
            className="relative -ml-1.5 first:ml-0"
            style={{ zIndex: 4 - i }}
          >
            <span className="block h-5 w-5 overflow-hidden rounded-full bg-gradient-to-br from-primary/25 to-card p-px shadow-sm ring-2 ring-card">
              <img
                src={`https://flagcdn.com/w40/${cc}.png`}
                srcSet={`https://flagcdn.com/w80/${cc}.png 2x`}
                alt={cc}
                loading="lazy"
                className="h-full w-full rounded-full object-cover"
              />
            </span>
          </span>
        ))}
      </span>
    ) : (
      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        View <ArrowUpRight className="h-3 w-3" />
      </span>
    )}
  </button>
);

const WealthPulseBanner = memo(WealthPulseBannerInner);
WealthPulseBanner.displayName = "WealthPulseBanner";

export default WealthPulseBanner;
