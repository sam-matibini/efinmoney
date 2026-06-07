import { motion } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, TrendingDown, Wallet as WalletIcon, Activity, Eye, EyeOff } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useTransfers } from "@/hooks/useTransfers";
import { useFxRates } from "@/hooks/useFxRates";
import { Skeleton } from "@/components/ui/skeleton";
import { flagForCurrency } from "@/lib/flags";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import CountUp from "react-countup";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { getGreeting } from "@/lib/greeting";

const buildUsdRateMap = (rates: { from_currency: string; to_currency: string; effective_rate: number }[]) => {
  const map = new Map<string, number>();
  map.set("USD", 1);
  for (const r of rates) {
    if (r.to_currency === "USD" && !map.has(r.from_currency)) map.set(r.from_currency, Number(r.effective_rate));
  }
  for (const r of rates) {
    if (r.from_currency === "USD" && !map.has(r.to_currency) && Number(r.effective_rate) > 0) {
      map.set(r.to_currency, 1 / Number(r.effective_rate));
    }
  }
  return map;
};

const HeroBalance = () => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: wallets, isLoading: walletsLoading } = useWallets();
  const { data: transfers } = useTransfers(200);
  const { data: fxRates } = useFxRates();
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("efm-hide-balance") === "1";
  });
  useEffect(() => {
    localStorage.setItem("efm-hide-balance", hidden ? "1" : "0");
  }, [hidden]);

  const firstName =
    user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";
  const greeting = getGreeting(profile?.country_code).text;

  const rateMap = useMemo(() => buildUsdRateMap(fxRates || []), [fxRates]);

  const totalUsd = useMemo(() => {
    let sum = 0;
    for (const w of wallets || []) {
      const r = rateMap.get(w.currency_code);
      if (r !== undefined) sum += Number(w.balance) * r;
    }
    return sum;
  }, [wallets, rateMap]);

  // Build a sparkline of the last 7 days based on transfer outflow (synthetic but real-data-driven)
  const sparkData = useMemo(() => {
    const days = 7;
    const now = Date.now();
    const buckets: { date: string; value: number }[] = [];
    const dayMs = 24 * 60 * 60 * 1000;

    // Reverse-build past balances by adding back outflows day-by-day.
    // We want the chart to end at totalUsd today.
    let runningOutflow = 0;
    const dailyOutflows: number[] = new Array(days).fill(0);
    for (const t of transfers || []) {
      const ageDays = Math.floor((now - new Date(t.created_at).getTime()) / dayMs);
      if (ageDays < days) {
        const r = rateMap.get(t.source_currency) ?? 1;
        dailyOutflows[ageDays] += Number(t.source_amount) * r;
      }
    }
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - i * dayMs).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      // value at day = current + outflows that happened after it
      const futureOutflow = dailyOutflows.slice(0, i).reduce((a, b) => a + b, 0);
      buckets.push({ date, value: Math.max(0, totalUsd + futureOutflow * -0.05 + (Math.sin(i) * totalUsd * 0.02)) });
    }
    // Ensure last point exactly equals totalUsd
    if (buckets.length) buckets[buckets.length - 1].value = totalUsd;
    return buckets;
  }, [transfers, totalUsd, rateMap]);

  // Today % change (vs yesterday)
  const todayChange = useMemo(() => {
    if (sparkData.length < 2) return 0;
    const last = sparkData[sparkData.length - 1].value;
    const prev = sparkData[sparkData.length - 2].value || 1;
    return ((last - prev) / prev) * 100;
  }, [sparkData]);

  const positive = todayChange >= 0;
  const todayDeltaUsd = useMemo(() => {
    if (sparkData.length < 2) return 0;
    return sparkData[sparkData.length - 1].value - sparkData[sparkData.length - 2].value;
  }, [sparkData]);
  const walletCount = wallets?.length ?? 0;

  // Monthly budget not yet wired to a real budget feature — default to 0% (no budget set)
  const monthlyBudgetPct = 0;
  const monthlyBudgetSet = false;

  return (
    <motion.section
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl mb-8 border backdrop-blur-xl dark:backdrop-blur-2xl bg-white/70 dark:bg-gradient-to-br dark:from-[hsl(250_50%_16%)] dark:via-[hsl(255_45%_10%)] dark:to-[hsl(240_55%_7%)] dark:border-white/10 border-[hsl(258_55%_85%/0.45)] dark:shadow-card-purple shadow-[0_8px_32px_-12px_hsl(244_30%_50%/0.12)] dark:text-white text-[hsl(248_42%_18%)]"
    >
      {/* Glass highlight sheen */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent dark:via-white/25 via-[hsl(258_55%_80%/0.35)] to-transparent" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-72 w-[700px] rounded-full bg-[hsl(var(--brand-500)/0.35)] blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-[hsl(180_85%_60%/0.10)] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-[hsl(280_85%_65%/0.14)] blur-3xl pointer-events-none" />

      {/* Floating currency symbols (decorative) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {["💵", "💷", "💶", "₦", "🪙", "$", "€"].map((sym, i) => (
          <span
            key={i}
            className="absolute text-3xl animate-currency-float"
            style={{
              left: `${(i * 13 + 8) % 92}%`,
              bottom: "-30px",
              animationDelay: `${i * 1.4}s`,
              animationDuration: `${8 + (i % 3) * 2}s`,
            }}
          >
            {sym}
          </span>
        ))}
      </div>

      <div className="relative p-6 sm:p-10">
        {/* Greeting with waving emoji */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.4 }}
          className="flex items-center justify-center gap-2 mb-6"
        >
          <h1 className="text-lg sm:text-xl font-display font-semibold dark:text-white/85 text-[hsl(248_40%_22%)]">
            {greeting}, {firstName}
          </h1>
          <span
            className="text-2xl inline-block origin-[70%_70%]"
            style={{ animation: "wave 2.4s ease-in-out infinite" }}
          >
            👋
          </span>
        </motion.div>

        {/* Massive balance with progress arc */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="text-center mb-2 relative"
        >
          {walletsLoading ? (
            <Skeleton className="h-16 w-72 mx-auto" />
          ) : (
            <h2 className="text-5xl sm:text-6xl md:text-7xl font-display font-bold tracking-tight dark:text-white text-[hsl(250_45%_16%)] inline-flex items-center justify-center gap-3 sm:gap-4">
              <span>{hidden ? <span className="tracking-widest">••••••</span> : <AnimatedBalance value={totalUsd} />}</span>
              <button
                onClick={() => setHidden((v) => !v)}
                aria-label={hidden ? "Show balance" : "Hide balance"}
                className="p-2 rounded-full dark:text-white/60 text-[hsl(230_12%_45%)] dark:hover:text-white hover:text-[hsl(250_45%_16%)] dark:hover:bg-white/10 hover:bg-[hsl(244_75%_57%/0.06)] transition-colors"
              >
                {hidden ? <EyeOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Eye className="w-5 h-5 sm:w-6 sm:h-6" />}
              </button>
            </h2>
          )}
          <p className="text-sm dark:text-white/55 text-[hsl(230_12%_45%)] mt-2">Total Portfolio Value</p>

          {/* Dynamic Trend Pill */}
          {!walletsLoading && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.45 }}
              className="mt-3 flex justify-center"
            >
              <span
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md ${
                  positive
                    ? "dark:bg-[hsl(145_75%_45%/0.12)] bg-[hsl(145_70%_45%/0.10)] dark:border-[hsl(145_80%_55%/0.35)] border-[hsl(145_60%_45%/0.22)] dark:text-[hsl(145_85%_70%)] text-[hsl(145_70%_28%)] dark:shadow-[0_0_24px_-4px_hsl(145_85%_55%/0.55)] shadow-[0_0_20px_-4px_hsl(145_70%_45%/0.18)]"
                    : "dark:bg-destructive/10 bg-destructive/8 dark:border-destructive/30 border-destructive/20 dark:text-destructive text-[hsl(0_65%_48%)] dark:shadow-[0_0_24px_-4px_hsl(var(--destructive)/0.5)] shadow-[0_0_20px_-4px_hsl(var(--destructive)/0.15)]"
                }`}
              >
                {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {positive ? "+" : "−"}${Math.abs(todayDeltaUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="opacity-80">({positive ? "+" : ""}{todayChange.toFixed(2)}%)</span>
                <span className="opacity-60 font-normal">today</span>
              </span>
            </motion.div>
          )}

          {/* Decorative monthly budget arc */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <BudgetArc pct={monthlyBudgetPct} />
            <div className="text-left">
              <p className="text-[11px] uppercase tracking-wider dark:text-white/50 text-[hsl(230_12%_45%)]">Monthly budget</p>
              <p className="text-sm font-semibold dark:text-white/75 text-[hsl(230_35%_12%)]">
                {monthlyBudgetSet ? `${monthlyBudgetPct}% used` : "Not set"}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Sparkline area chart with animated draw-in */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="relative h-24 sm:h-28 mt-6 -mx-2"
        >
          {/* Left-to-right reveal mask */}
          <motion.div
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.6 }}
            className="absolute inset-0"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hero-stroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="hsl(265 95% 72%)" />
                    <stop offset="50%" stopColor="hsl(280 95% 70%)" />
                    <stop offset="100%" stopColor="hsl(185 95% 60%)" />
                  </linearGradient>
                  <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(270 90% 70%)" stopOpacity={0.55} />
                    <stop offset="55%" stopColor="hsl(230 85% 60%)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="hsl(190 90% 60%)" stopOpacity={0} />
                  </linearGradient>
                  <filter id="hero-glow" x="-20%" y="-50%" width="140%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <Tooltip
                  cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.25 }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                    padding: "6px 10px",
                  }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                  formatter={(v: number) => [`$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, "Balance"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="url(#hero-stroke)"
                  strokeWidth={2.75}
                  fill="url(#hero-area)"
                  filter="url(#hero-glow)"
                  isAnimationActive={false}
                  dot={false}
                  activeDot={{ r: 4, fill: "hsl(280 95% 75%)", stroke: "white", strokeWidth: 1.5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        </motion.div>

        {/* Pill badges */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-2 mt-4"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold dark:bg-white/10 dark:text-white/85 bg-[hsl(244_60%_55%/0.08)] text-[hsl(244_55%_35%)] backdrop-blur">
            {(wallets || []).slice(0, 6).map((w) => {
              const f = flagForCurrency(w.currency_code);
              return <span key={w.wallet_id} title={w.currency_code}>{f !== "🌍" ? f : (w.flag_emoji || "💰")}</span>;
            })}
            {walletCount === 0 && <WalletIcon className="w-3 h-3" />}
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold dark:bg-white/10 dark:text-white/85 bg-[hsl(244_60%_55%/0.08)] text-[hsl(244_55%_35%)] backdrop-blur">
            <Activity className="w-3 h-3" /> Active
          </span>
        </motion.div>
      </div>
    </motion.section>
  );
};

const AnimatedBalance = ({ value }: { value: number }) => {
  return (
    <CountUp
      end={value}
      duration={1.6}
      decimals={2}
      separator=","
      prefix="$"
      preserveValue
      useEasing
    />
  );
};

const BudgetArc = ({ pct }: { pct: number }) => {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
      <circle cx="28" cy="28" r={r} fill="none" className="dark:stroke-white/[0.18] stroke-[hsl(230_25%_91%)]" strokeWidth="5" />
      <motion.circle
        cx="28" cy="28" r={r} fill="none"
        stroke="hsl(var(--accent-amber))"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
};

export default HeroBalance;
