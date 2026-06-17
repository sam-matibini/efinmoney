import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import { Send, Globe, PiggyBank, ShieldCheck } from "lucide-react";
import { useTransfers } from "@/hooks/useTransfers";
import { useProfile } from "@/hooks/useProfile";
import { useSavingsGoals } from "@/hooks/useSavingsGoals";
import { Link } from "react-router-dom";

const cardClass =
  "group relative overflow-hidden rounded-2xl bg-card border border-border p-4 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:shadow-lg";

const cardBg: Record<string, string> = {
  sent: "bg-gradient-to-br from-primary/[0.06] to-transparent",
  corridors: "bg-gradient-to-br from-primary/[0.06] to-transparent",
  savings: "bg-gradient-to-br from-[hsl(var(--accent-amber)/0.08)] to-transparent",
  kyc: "bg-gradient-to-br from-[hsl(var(--accent-amber)/0.10)] to-transparent",
};

const MiniStats = () => {
  const { data: transfers } = useTransfers(500);
  const { data: profile } = useProfile();
  const { data: goals } = useSavingsGoals();

  const monthData = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const recent = (transfers || []).filter((t) => new Date(t.created_at).getTime() >= start);

    // Group totals by source currency
    const byCurrency: Record<string, number> = {};
    recent.forEach((t) => {
      const c = (t.source_currency || "USD").toUpperCase();
      byCurrency[c] = (byCurrency[c] || 0) + Number(t.source_amount);
    });
    const sorted = Object.entries(byCurrency).sort((a, b) => b[1] - a[1]);
    const primary = sorted[0] || ["USD", 0];
    const others = sorted.slice(1);

    // Bars: per-day buckets for the primary currency only
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const bars = new Array(daysInMonth).fill(0);
    recent
      .filter((t) => (t.source_currency || "USD").toUpperCase() === primary[0])
      .forEach((t) => {
        const day = new Date(t.created_at).getDate();
        bars[day - 1] += Number(t.source_amount);
      });
    const max = Math.max(...bars, 1);
    return {
      currency: primary[0] as string,
      total: primary[1] as number,
      others,
      bars: bars.map((b) => (b > 0 ? Math.max(15, (b / max) * 100) : 6)),
    };
  }, [transfers]);

  const formatMoney = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    }
  };

  const corridors = useMemo(() => {
    const set = new Set<string>();
    (transfers || []).forEach((t) => t.recipient_country && set.add(t.recipient_country));
    return Array.from(set);
  }, [transfers]);

  const FlagFor = ({ cc }: { cc: string }) => {
    const code = cc?.toLowerCase();
    if (!code || code.length !== 2) {
      return <Globe className="w-3.5 h-3.5 text-muted-foreground" aria-label="Global" />;
    }
    return (
      <img
        src={`https://flagcdn.com/w40/${code}.png`}
        srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
        alt={cc}
        className="w-full h-full object-cover rounded-full"
        loading="lazy"
      />
    );
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
            {formatMoney(monthData.total, monthData.currency)}
          </p>
          {monthData.others.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              + {monthData.others.map(([c, v]) => formatMoney(v, c)).join(" · ")}
            </p>
          )}
          <div className="flex items-end gap-[2px] h-8 mt-2">
            {monthData.bars.map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ delay: 0.3 + i * 0.01, duration: 0.4, ease: "easeOut" }}
                className="flex-1 rounded-[1px] bg-primary/60"
              />
            ))}
          </div>
        </>
      ),
      icon: Send,
      iconBg: "bg-primary/15 text-primary",
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
                className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-background border border-border shadow-sm overflow-hidden"
                style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}
              >
                <FlagFor cc={c} />
              </span>
            ))}
            {corridors.length === 0 && <span className="text-xs text-muted-foreground">None yet</span>}
          </div>
        </>
      ),
      icon: Globe,
      iconBg: "bg-primary/15 text-primary",
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
              className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--accent-amber))] to-[hsl(var(--accent-amber-glow))]"
            />
          </div>
        </>
      ),
      icon: PiggyBank,
      iconBg: "bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(36_92%_42%)] dark:text-[hsl(var(--accent-amber))]",
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
        <StatCard key={s.key} index={i} className={`${cardClass} ${cardBg[s.key] || ""}`}>
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <div
              className={`relative p-2.5 rounded-xl ${s.iconBg} ring-1 ring-inset ring-white/10 shadow-sm transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:group-hover:scale-100`}
            >
              <s.icon className="w-5 h-5" strokeWidth={2.25} />
            </div>
          </div>
          {s.content}
        </StatCard>
      ))}
    </section>
  );
};

const StatCard = ({ index, className, children }: { index: number; className: string; children: React.ReactNode }) => {
  const reduceMotion = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const [hovering, setHovering] = useState(false);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [4, -4]), { stiffness: 160, damping: 16, bounce: 0.15 });
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-4, 4]), { stiffness: 160, damping: 16, bounce: 0.15 });
  const spotX = useTransform(px, (v) => `${(v + 0.5) * 100}%`);
  const spotY = useTransform(py, (v) => `${(v + 0.5) * 100}%`);
  const spotlight = useMotionTemplate`radial-gradient(220px circle at ${spotX} ${spotY}, hsl(var(--primary) / 0.14), transparent 65%)`;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => { px.set(0); py.set(0); setHovering(false); };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : index * 0.06, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      onMouseMove={reduceMotion ? undefined : onMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={onLeave}
      style={reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: 900 }}
      className={`${className} active:scale-[0.98] motion-reduce:active:scale-100`}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{ background: spotlight, opacity: hovering ? 1 : 0 }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
};

export default MiniStats;
