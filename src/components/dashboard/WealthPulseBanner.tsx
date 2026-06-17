import { memo, useMemo, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Send, Plus, Globe2, ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useTransfers } from "@/hooks/useTransfers";
import { useFxRates } from "@/hooks/useFxRates";
import { buildUsdRateMap, convertToUsd } from "@/lib/fx";
import { flagForCurrency, normalizeCountryCode } from "@/lib/flags";

const WALLET_GRADIENT: Record<string, string> = {
  USD: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--brand-700)))",
  CAD: "linear-gradient(135deg, #0f766e, #134e4a)",
  NGN: "linear-gradient(135deg, hsl(var(--brand-700)), hsl(var(--brand-800)))",
  GBP: "linear-gradient(135deg, hsl(220 45% 45%), hsl(220 50% 32%))",
  EUR: "linear-gradient(135deg, hsl(var(--brand-500)), hsl(var(--brand-700)))",
  KES: "linear-gradient(135deg, #65a30d, #3f6212)",
};
const fallbackGradient = "linear-gradient(135deg, hsl(var(--muted-foreground)), hsl(var(--foreground) / 0.7))";

const fmtUsd = (n: number) =>
  n >= 1000
    ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PENDING = ["initiated", "funded", "processing"];

const WealthPulseBannerInner = () => {
  const reduceMotion = useReducedMotion();
  const { data: wallets } = useWallets();
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
        countries.add(t.recipient_country);
        const cc = normalizeCountryCode(t.recipient_country);
        if (cc && recentCountries.length < 5 && !recentCountries.includes(cc)) {
          recentCountries.push(cc);
        }
      }
      if (PENDING.includes(t.status)) { inFlightCount += 1; inFlightUsd += usd; }
    }
    return { sentMonthUsd, countryCount: countries.size, recentCountries, inFlightCount, inFlightUsd };
  }, [transfers, fxRates]);

  const list = wallets ?? [];
  const tokens = list.slice(0, 6);

  // Cursor parallax on the constellation
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [5, -5]), { stiffness: 140, damping: 16, bounce: 0.15 });
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-5, 5]), { stiffness: 140, damping: 16, bounce: 0.15 });
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => { px.set(0); py.set(0); };

  const R = 84;
  const n = Math.max(tokens.length, 1);

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-[hsl(var(--accent-amber)/0.04)]" />

      <div className="relative grid items-center gap-4 p-5 sm:p-7 md:grid-cols-[1.15fr_minmax(220px,0.85fr)]">
        {/* ── Left: real activity summary ── */}
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
                stats.inFlightCount > 0
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              }
              highlight={stats.inFlightCount > 0}
              onClick={() => navigate("/transfers")}
            />
          </div>
        </div>

        {/* ── Right: wallet constellation around a Send action ── */}
        <div className="flex items-center justify-center">
          <motion.div
            onMouseMove={reduceMotion ? undefined : onMove}
            onMouseLeave={onLeave}
            style={reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: 900 }}
            className="relative h-[220px] w-[220px]"
          >
            <div className="absolute left-1/2 top-1/2 h-[188px] w-[188px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70" />
            <div className="absolute left-1/2 top-1/2 h-[120px] w-[120px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/40" />

            {tokens.length > 0 && (
              <motion.div
                className="absolute inset-0"
                animate={{ rotate: 360 }}
                transition={{ duration: 90, ease: "linear", repeat: Infinity }}
              >
                {/* spokes */}
                {tokens.map((w, i) => {
                  const angle = (i / n) * 360;
                  return (
                    <div
                      key={`spoke-${w.wallet_id}`}
                      className="absolute left-1/2 top-1/2 h-px origin-left bg-gradient-to-r from-primary/40 to-transparent"
                      style={{ width: R, transform: `rotate(${angle}deg)` }}
                    />
                  );
                })}
                {/* wallet tokens */}
                {tokens.map((w, i) => {
                  const angle = (i / n) * 360;
                  const flag = flagForCurrency(w.currency_code) !== "🌍"
                    ? flagForCurrency(w.currency_code)
                    : (w.flag_emoji || "💰");
                  return (
                    <div
                      key={w.wallet_id}
                      className="absolute left-1/2 top-1/2"
                      style={{ transform: `rotate(${angle}deg) translate(${R}px) rotate(-${angle}deg)` }}
                    >
                      <motion.div
                        animate={{ rotate: -360 }}
                        transition={{ duration: 90, ease: "linear", repeat: Infinity }}
                        className="-translate-x-1/2 -translate-y-1/2"
                      >
                        <WalletToken
                          flag={flag}
                          code={w.currency_code}
                          balance={Number(w.balance)}
                          symbol={w.symbol}
                          gradient={WALLET_GRADIENT[w.currency_code] || fallbackGradient}
                          onClick={() => navigate(`/wallets/${w.wallet_id}/statement`)}
                        />
                      </motion.div>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* center: primary Send action */}
            <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
              {tokens.length > 0 ? (
                <Link
                  to="/send"
                  className="group flex h-[88px] w-[88px] flex-col items-center justify-center gap-1 rounded-full bg-primary text-primary-foreground shadow-md ring-1 ring-primary/20 transition-transform duration-150 ease-out hover:scale-[1.03] active:scale-[0.97] motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                >
                  <Send className="h-6 w-6 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  <span className="text-xs font-semibold">Send</span>
                </Link>
              ) : (
                <Link
                  to="/wallets"
                  className="flex h-[88px] w-[88px] flex-col items-center justify-center gap-1 rounded-full border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Plus className="h-6 w-6" />
                  <span className="px-2 text-center text-[10px] font-medium leading-tight">Add wallet</span>
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
};

const KpiChip = ({
  label, value, icon, flags, highlight, onClick,
}: {
  label: string; value: string; icon: React.ReactNode; flags?: string[]; highlight?: boolean; onClick: () => void;
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
      <span className="mt-0.5 flex items-center">
        {flags.slice(0, 4).map((cc, i) => (
          <img
            key={`${cc}-${i}`}
            src={`https://flagcdn.com/w40/${cc}.png`}
            alt={cc}
            loading="lazy"
            className="h-4 w-4 rounded-full object-cover ring-2 ring-card"
            style={{ marginLeft: i === 0 ? 0 : -6 }}
          />
        ))}
      </span>
    ) : (
      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        View <ArrowUpRight className="h-3 w-3" />
      </span>
    )}
  </button>
);

const WalletToken = ({
  flag, code, balance, symbol, gradient, onClick,
}: {
  flag: string; code: string; balance: number; symbol: string; gradient: string; onClick: () => void;
}) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex h-12 w-12 items-center justify-center rounded-full text-xl shadow-md ring-2 ring-card transition-transform duration-150 ease-out hover:scale-105 active:scale-[0.97] motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
      style={{ background: gradient }}
      aria-label={`${code} wallet`}
    >
      <span className="drop-shadow">{flag}</span>
      {hover && (
        <span className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-lg">
          {code} · {symbol}{balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )}
    </button>
  );
};

const WealthPulseBanner = memo(WealthPulseBannerInner);
WealthPulseBanner.displayName = "WealthPulseBanner";

export default WealthPulseBanner;
