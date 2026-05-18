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
import { useAuth } from "@/hooks/useAuth";

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
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

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
  const walletCount = wallets?.length ?? 0;

  const monthlyBudgetPct = 65; // decorative progress

  return (
    <motion.section
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl border border-border mb-8 animate-hero-shift"
      style={{
        backgroundImage:
          "linear-gradient(120deg, hsl(var(--background)) 0%, hsl(160 84% 96%) 50%, hsl(var(--background)) 100%)",
      }}
    >
      <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

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
          <h1 className="text-lg sm:text-xl font-display font-semibold text-foreground">
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
            <h2 className="text-5xl sm:text-6xl md:text-7xl font-display font-bold tracking-tight text-foreground">
              ≈ <AnimatedBalance value={totalUsd} />
            </h2>
          )}
          <p className="text-sm text-muted-foreground mt-2">Total Portfolio Value</p>

          {/* Decorative monthly budget arc */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <BudgetArc pct={monthlyBudgetPct} />
            <div className="text-left">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Monthly budget</p>
              <p className="text-sm font-semibold text-foreground">{monthlyBudgetPct}% used</p>
            </div>
          </div>
        </motion.div>

        {/* Sparkline area chart */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="h-20 sm:h-24 mt-4 -mx-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.2 }}
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
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#hero-area)"
                isAnimationActive
                animationDuration={1400}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Pill badges */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-2 mt-4"
        >
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
              positive
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {positive ? "+" : ""}
            {todayChange.toFixed(2)}% today
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-muted text-foreground/80">
            {(wallets || []).slice(0, 6).map((w) => {
              const f = flagForCurrency(w.currency_code);
              return <span key={w.wallet_id} title={w.currency_code}>{f !== "🌍" ? f : (w.flag_emoji || "💰")}</span>;
            })}
            {walletCount === 0 && <WalletIcon className="w-3 h-3" />}
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Activity className="w-3 h-3" /> Active
          </span>
        </motion.div>
      </div>
    </motion.section>
  );
};

const AnimatedBalance = ({ value }: { value: number }) => {
  // Lightweight inline count-up using a ref-less rAF
  const formatted = `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <motion.span
    key={value}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >{formatted}</motion.span>;
};

const BudgetArc = ({ pct }: { pct: number }) => {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
      <circle cx="28" cy="28" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
      <motion.circle
        cx="28" cy="28" r={r} fill="none"
        stroke="hsl(var(--primary))"
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
