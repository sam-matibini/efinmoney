import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { format, isToday, isYesterday } from "date-fns";
import { ArrowUpRight, ArrowDownLeft, Inbox, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { StatementRow } from "@/hooks/useStatement";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateGroupLabel = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
};

const statusBadge = (s: string) => {
  if (s === "completed") return "bg-primary/15 text-primary border-primary/30";
  if (["failed", "reversed", "expired"].includes(s)) return "bg-destructive/15 text-destructive border-destructive/30";
  if (["processing", "funded", "initiated"].includes(s)) return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
};

interface Props {
  rows: StatementRow[];
  loading?: boolean;
  showBalance?: boolean;
}

export const StatementTable = ({ rows, loading, showBalance = true }: Props) => {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No transactions"
        description="Nothing has posted to this account during the selected period."
        size="sm"
      />
    );
  }


  // group by date
  const groups: Record<string, StatementRow[]> = {};
  for (const r of rows) {
    const k = dateGroupLabel(r.date);
    (groups[k] ||= []).push(r);
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className={`hidden lg:grid ${showBalance ? "grid-cols-[140px_1.5fr_110px_1fr_1fr_120px_120px_140px_40px]" : "grid-cols-[140px_1.5fr_110px_1fr_1fr_120px_120px_40px]"} gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted/40 border-b border-border`}>
        <div>Date</div>
        <div>Description</div>
        <div>Reference</div>
        <div>Sender / Payee</div>
        <div>Purpose</div>
        <div className="text-right">Money Out</div>
        <div className="text-right">Money In</div>
        {showBalance && <div className="text-right">Balance</div>}
        <div></div>
      </div>

      {Object.entries(groups).map(([label, rs]) => (
        <div key={label}>
          <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/20">
            {label}
          </div>
          <div className="divide-y divide-border/60">
            {rs.map((r, i) => {
              const isIn = r.moneyIn > 0;
              const isFailed = ["failed", "reversed", "expired"].includes(r.status);
              const linkTo = r.transferId ? `/transfers/${r.transferId}` : `/transactions/${r.journalId}`;
              const outClass = isFailed ? "text-muted-foreground line-through" : "text-rose-600 dark:text-rose-400";
              const inClass = isFailed ? "text-muted-foreground line-through" : "text-indigo-600 dark:text-indigo-400";

              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.01 }}
                >
                  <Link
                    to={linkTo}
                    className={`${showBalance ? "lg:grid-cols-[140px_1.5fr_110px_1fr_1fr_120px_120px_140px_40px]" : "lg:grid-cols-[140px_1.5fr_110px_1fr_1fr_120px_120px_40px]"} grid grid-cols-[1fr_auto] lg:gap-3 gap-2 px-4 py-3 hover:bg-muted/40 transition-colors items-center`}
                  >
                    {/* Date - mobile shows icon, desktop column */}
                    <div className="hidden lg:block text-[12px] text-muted-foreground tabular-nums">
                      <div>{format(new Date(r.date), "MMM d")}</div>
                      <div className="text-[10px]">{format(new Date(r.date), "h:mm a")}</div>
                    </div>

                    {/* Description (mobile: icon + text) */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isIn ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>
                        {isIn ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate text-sm">{r.description}</p>
                        <p className="text-[11px] text-muted-foreground truncate lg:hidden">
                          {format(new Date(r.date), "MMM d, h:mm a")} · {r.reference}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate hidden lg:block">{r.purpose}</p>
                      </div>
                    </div>

                    {/* Reference (lg) */}
                    <div className="hidden lg:block text-[11px] font-mono text-muted-foreground truncate">{r.reference}</div>

                    {/* Payee (lg) */}
                    <div className="hidden lg:block text-[12px] text-foreground truncate">{r.payee}</div>

                    {/* Purpose (lg) */}
                    <div className="hidden lg:block text-[12px] text-muted-foreground truncate">{r.purpose}</div>

                    {/* Mobile combined amount */}
                    <div className="lg:hidden text-right">
                      <p className={`text-sm font-display font-bold tabular-nums ${isIn ? inClass : outClass}`}>
                        {isIn ? "+" : "-"}{fmt(isIn ? r.moneyIn : r.moneyOut)} {r.currency}
                      </p>
                      {showBalance && (
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          Bal {fmt(r.balance)} {r.currency}
                        </p>
                      )}
                      <Badge variant="outline" className={`text-[9px] mt-0.5 ${statusBadge(r.status)}`}>{r.status}</Badge>
                    </div>

                    {/* Desktop debit/credit/balance */}
                    <div className="hidden lg:block text-right tabular-nums text-sm font-semibold">
                      {r.moneyOut > 0 ? <span className={outClass}>-{fmt(r.moneyOut)} {r.currency}</span> : <span className="text-muted-foreground/30">—</span>}
                    </div>
                    <div className="hidden lg:block text-right tabular-nums text-sm font-semibold">
                      {r.moneyIn > 0 ? <span className={inClass}>+{fmt(r.moneyIn)} {r.currency}</span> : <span className="text-muted-foreground/30">—</span>}
                    </div>
                    {showBalance && (
                      <div className="hidden lg:block text-right tabular-nums text-sm font-semibold text-foreground">
                        {fmt(r.balance)} {r.currency}
                      </div>
                    )}
                    <div className="hidden lg:flex justify-end text-muted-foreground">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
