import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useStatement } from "@/hooks/useStatement";
import { useHideBalance } from "@/hooks/useHideBalance";

const LIMIT = 6;

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Row 3 right: compact feed of the latest ledger movements. */
export default function RecentActivity() {
  const { data: rows = [], isLoading } = useStatement(null, LIMIT);
  const [hidden] = useHideBalance();

  return (
    <section aria-labelledby="recent-activity-title" className="rounded-[var(--radius-lg)] bg-[var(--color-bg-sidebar)] p-5 h-full">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id="recent-activity-title" className="text-[var(--font-size-lg)] font-semibold text-white">
          Recent Activity
        </h2>
        {rows.length > 0 && (
          <Link
            to="/transfers"
            className="flex items-center gap-0.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs font-medium text-[var(--color-accent-gold)] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
          >
            View all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Inbox className="h-6 w-6 text-[var(--color-text-muted)]" aria-hidden />
          <p className="text-sm text-[var(--color-text-muted)]">No activity yet</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, LIMIT).map((r) => {
            const incoming = r.moneyIn > 0;
            const amount = incoming ? r.moneyIn : r.moneyOut;
            const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
            const color = incoming ? "var(--color-success)" : "var(--color-text-primary)";
            const to = r.transferId ? `/transfers/${r.transferId}` : "/transfers";
            return (
              <li key={r.id}>
                <Link
                  to={to}
                  className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: incoming ? "rgba(34,197,94,0.12)" : "rgba(56,189,248,0.12)" }}
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color: incoming ? "var(--color-success)" : "var(--color-accent-blue)" }}
                      aria-hidden
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{r.payee || r.description}</span>
                    <span className="block text-[11px] text-[var(--color-text-muted)]">
                      {format(new Date(r.date), "MMM d")}
                      {r.status !== "completed" && ` · ${r.status.replace(/_/g, " ")}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm font-semibold tabular-nums" style={{ color }}>
                    {hidden ? "•••" : `${incoming ? "+" : "−"}${fmt(amount)}`}
                    <span className="block text-[10px] font-normal text-[var(--color-text-muted)]">{r.currency}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
