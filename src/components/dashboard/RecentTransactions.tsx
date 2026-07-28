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
import { StatementBalanceCards } from "@/components/statement/StatementBalanceCards";

const DASHBOARD_LIMIT = 8;

const DASHBOARD_STATEMENT_LIMIT = 100;

const RecentTransactions = () => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: rows = [], isLoading } = useStatement(null, DASHBOARD_STATEMENT_LIMIT);

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

  const visible = rows.slice(0, DASHBOARD_LIMIT);
  const hasItems = rows.length > 0;

  return (
    <section className="rounded-2xl bg-card border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-display font-semibold text-foreground">Account Statement</h2>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-live-pulse" />
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
        <div className="mb-4">
          <StatementBalanceCards
            totalsIn={totalsIn}
            totalsOut={totalsOut}
            netByCurrency={netByCurrency}
            variant="compact"
          />
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
