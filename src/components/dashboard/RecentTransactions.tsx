import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Inbox, Send, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useStatement } from "@/hooks/useStatement";
import { StatementActions } from "@/components/statement/StatementActions";
import { StatementTable } from "@/components/statement/StatementTable";
import { currencySymbol } from "@/lib/currency";

const DASHBOARD_LIMIT = 8;

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RecentTransactions = () => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: rows = [], isLoading } = useStatement(null, 500);

  if (isLoading) {
    return (
      <section className="rounded-2xl bg-card border border-border p-6">
        <h2 className="text-lg font-display font-semibold text-foreground mb-4">Account Statement</h2>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  // Totals grouped by currency across all completed rows
  const sumByCurrency = (pick: (r: typeof rows[number]) => number) =>
    rows
      .filter((r) => r.status === "completed")
      .reduce<Record<string, number>>((acc, r) => {
        const v = pick(r);
        if (v > 0) acc[r.currency] = (acc[r.currency] || 0) + v;
        return acc;
      }, {});

  const totalsIn = sumByCurrency((r) => r.moneyIn);
  const totalsOut = sumByCurrency((r) => r.moneyOut);
  const netByCurrency: Record<string, number> = {};
  for (const c of new Set([...Object.keys(totalsIn), ...Object.keys(totalsOut)])) {
    netByCurrency[c] = (totalsIn[c] || 0) - (totalsOut[c] || 0);
  }
  const renderTotals = (totals: Record<string, number>, sign: "+" | "-" | "") => {
    const entries = Object.entries(totals).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (entries.length === 0) return `${sign}${fmt(0)}`;
    return entries.map(([c, v]) => `${sign}${currencySymbol(c) || ""}${fmt(Math.abs(v))} ${c}`).join("  ·  ");
  };

  const visible = rows.slice(0, DASHBOARD_LIMIT);
  const hasItems = rows.length > 0;

  return (
    <section className="rounded-2xl bg-card border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-display font-semibold text-foreground">Account Statement</h2>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-live-pulse" />
            Live
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasItems && (
            <StatementActions
              rows={rows}
              meta={{
                title: "Account Statement",
                accountHolder: profile?.full_name || user?.user_metadata?.full_name || user?.email || "Account holder",
                accountEmail: profile?.email || user?.email || "",
                accountNumber: profile?.account_number || undefined,
                efinTag: profile?.efin_tag || undefined,
              }}
              defaultEmail={user?.email || ""}
            />
          )}
          {hasItems && (
            <Link
              to="/transfers"
              className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
            >
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      {/* Balance Money In / Out / Net tiles */}
      {hasItems && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          <div className="rounded-xl border border-border bg-emerald-500/[0.04] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Total Money In</div>
            <div className="text-base font-display font-bold text-primary tabular-nums break-words leading-tight">
              {renderTotals(totalsIn, "+")}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-rose-500/[0.04] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Total Money Out</div>
            <div className="text-base font-display font-bold text-destructive tabular-nums break-words leading-tight">
              {renderTotals(totalsOut, "-")}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-primary/[0.06] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Net Balance</div>
            <div className="text-base font-display font-bold text-foreground tabular-nums break-words leading-tight">
              {renderTotals(netByCurrency, "")}
            </div>
          </div>
        </div>
      )}

      {!hasItems ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-12 text-center"
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="p-4 rounded-full bg-primary/10 mb-4"
          >
            <Inbox className="w-7 h-7 text-primary" />
          </motion.div>
          <p className="font-semibold text-foreground mb-1">No transactions yet</p>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Your transfers, deposits and exchanges will appear here.
          </p>
          <Button asChild>
            <Link to="/send">
              <Send className="w-4 h-4 mr-2" />
              Send your first transfer
            </Link>
          </Button>
        </motion.div>
      ) : (
        <>
          <StatementTable rows={visible} showBalance />
          {rows.length > DASHBOARD_LIMIT && (
            <Link
              to="/transfers"
              className="block mt-3 text-center text-sm font-medium text-primary hover:underline"
            >
              View all {rows.length} transactions
            </Link>
          )}
        </>
      )}
    </section>
  );
};

export default RecentTransactions;
