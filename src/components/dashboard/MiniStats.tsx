import { motion } from "framer-motion";
import { useMemo } from "react";
import { Send, Globe, PiggyBank, ShieldCheck } from "lucide-react";
import { useTransfers } from "@/hooks/useTransfers";
import { useProfile } from "@/hooks/useProfile";
import { useSavingsGoals } from "@/hooks/useSavingsGoals";
import { Link } from "react-router-dom";

const cardClass =
  "group relative overflow-hidden rounded-2xl bg-card border border-border p-4 transition-all hover:-translate-y-1 hover:shadow-lg";

const cardBg: Record<string, string> = {
  sent: "bg-gradient-to-br from-emerald-500/5 to-transparent",
  corridors: "bg-gradient-to-br from-blue-500/5 to-transparent",
  savings: "bg-gradient-to-br from-teal-500/5 to-transparent",
  kyc: "bg-gradient-to-br from-amber-500/10 to-transparent",
};

const MiniStats = () => {
  const { data: transfers } = useTransfers(500);
  const { data: profile } = useProfile();
  const { data: goals } = useSavingsGoals();

  const monthData = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const recent = (transfers || []).filter((t) => new Date(t.created_at).getTime() >= start);
    const total = recent.reduce((s, t) => s + Number(t.source_amount), 0);
    // Mini bars: per-week buckets (4 weeks)
    const bars = [0, 0, 0, 0];
    recent.forEach((t) => {
      const day = new Date(t.created_at).getDate();
      const idx = Math.min(3, Math.floor((day - 1) / 7));
      bars[idx] += Number(t.source_amount);
    });
    const max = Math.max(...bars, 1);
    return { total, bars: bars.map((b) => Math.max(8, (b / max) * 100)) };
  }, [transfers]);

  const corridors = useMemo(() => {
    const set = new Set<string>();
    (transfers || []).forEach((t) => t.recipient_country && set.add(t.recipient_country));
    return Array.from(set);
  }, [transfers]);

  const flagFor = (cc: string) => {
    const map: Record<string, string> = { KE: "🇰🇪", UG: "🇺🇬", TZ: "🇹🇿", ZM: "🇿🇲", BI: "🇧🇮", CA: "🇨🇦", US: "🇺🇸", GB: "🇬🇧", NG: "🇳🇬" };
    return map[cc] || "🌍";
  };

  const goalProgress = useMemo(() => {
    if (!goals || goals.length === 0) return { pct: 0, label: "No goal" };
    const g = goals[0];
    const pct = Math.min(100, (Number(g.current_amount) / Math.max(1, Number(g.target_amount))) * 100);
    return { pct, label: g.name || "Savings" };
  }, [goals]);

  const tier = profile?.kyc_tier?.replace(/[^0-9]/g, "") || "0";
  const tierNum = Number(tier);

  const stats = [
    {
      key: "sent",
      label: "Sent this month",
      content: (
        <>
          <p className="text-2xl font-display font-bold text-foreground">
            ${monthData.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
          <div className="flex items-end gap-1 h-8 mt-2">
            {monthData.bars.map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.4, ease: "easeOut" }}
                className="flex-1 rounded-sm bg-primary/70"
              />
            ))}
          </div>
        </>
      ),
      icon: Send,
      iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "corridors",
      label: "Active corridors",
      content: (
        <>
          <p className="text-2xl font-display font-bold text-foreground">{corridors.length}</p>
          <div className="flex items-center mt-2">
            {corridors.slice(0, 5).map((c, i) => (
              <span
                key={c}
                className="text-lg inline-flex items-center justify-center w-7 h-7 rounded-full bg-background border border-border shadow-sm"
                style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}
              >
                {flagFor(c)}
              </span>
            ))}
            {corridors.length === 0 && <span className="text-xs text-muted-foreground">None yet</span>}
          </div>
        </>
      ),
      icon: Globe,
      iconBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    },
    {
      key: "savings",
      label: goalProgress.label,
      content: (
        <>
          <p className="text-2xl font-display font-bold text-foreground">{goalProgress.pct.toFixed(0)}%</p>
          <div className="h-2 rounded-full bg-muted mt-3 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${goalProgress.pct}%` }}
              transition={{ delay: 0.4, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500"
            />
          </div>
        </>
      ),
      icon: PiggyBank,
      iconBg: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    },
    {
      key: "kyc",
      label: "KYC Tier",
      content: (
        <>
          <p className="text-2xl font-display font-bold text-foreground">Tier {tierNum}</p>
          {/* Tier progress dots */}
          <div className="flex items-center gap-1 mt-2">
            {[0, 1, 2, 3].map((t) => (
              <div
                key={t}
                className={`h-1.5 flex-1 rounded-full ${t <= tierNum ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          {tierNum < 3 ? (
            <Link
              to="/kyc"
              className="mt-3 inline-flex items-center justify-center w-full px-2 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold animate-glow-pulse hover:bg-primary/90 transition-colors"
            >
              Upgrade to Tier {tierNum + 1} →
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">Max tier reached</p>
          )}
        </>
      ),
      icon: ShieldCheck,
      iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
      {stats.map((s, i) => (
        <motion.div
          key={s.key}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.4 }}
          className={cardClass}
        >
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <div className={`p-1.5 rounded-lg ${s.iconBg}`}>
              <s.icon className="w-3.5 h-3.5" />
            </div>
          </div>
          {s.content}
        </motion.div>
      ))}
    </section>
  );
};

export default MiniStats;
