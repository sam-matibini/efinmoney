import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Inbox, Send, ChevronRight, Copy } from "lucide-react";
import { useTransfers } from "@/hooks/useTransfers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { flagForCountryName, flagForCurrency } from "@/lib/flags";
import { cleanIncomingTransactionLabel, getIncomingTransactionMeta, INCOMING_REFERENCE_TYPES } from "@/lib/incomingTransactions";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";

const payoutMethodNames: Record<string, string> = {
  mpesa: "M-Pesa",
  mtn_mobile: "MTN Mobile",
  bank_transfer: "Bank Transfer",
  airtel_money: "Airtel Money",
  interac: "Interac e-Transfer",
  eft: "Bank Transfer (EFT)",
};

const currencySymbol = (code: string) =>
  code === "USD" ? "$" : code === "CAD" ? "C$" : code === "EUR" ? "€" : code === "GBP" ? "£" : "";

type Kind = "send" | "receive" | "exchange";
type Direction = "debit" | "credit";

interface Item {
  key: string;
  transferId?: string;
  journalId?: string;
  kind: Kind;
  direction: Direction;
  status: "completed" | "failed" | "pending";
  amount: number;
  currency: string;
  symbol: string;
  recipient: string;
  date: string;
  description: string;
  createdAt: string;
}

const KIND_META: Record<Kind, { Icon: any; bg: string }> = {
  receive: { Icon: ArrowDownLeft, bg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  send:    { Icon: ArrowUpRight,  bg: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  exchange:{ Icon: RefreshCw,     bg: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
};

const STATUS_PILL: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-pulse",
  failed: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const dateGroupLabel = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
};

const fmtAmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RecentTransactions = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<"all" | "credit" | "debit">("all");
  const { data: transfers, isLoading: loadingTransfers } = useTransfers(10);

  const { data: deposits, isLoading: loadingDeposits } = useQuery({
    queryKey: ["ledger-incoming", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: wallets } = await supabase.from("wallets").select("id").eq("user_id", user.id);
      const ids = (wallets ?? []).map((w) => w.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, journal_id, created_at, credit_amount, currency_code, description, reference_type, reference_id")
        .in("wallet_id", ids)
        .in("reference_type", INCOMING_REFERENCE_TYPES)
        .gt("credit_amount", 0)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) return [];
      const seen = new Set<string>();
      const out: any[] = [];
      for (const entry of data ?? []) {
        if (seen.has(entry.journal_id)) continue;
        seen.add(entry.journal_id);
        out.push(entry);
      }
      return out.slice(0, 10);
    },
    enabled: !!user,
  });

  const { data: fxSwaps, isLoading: loadingFx } = useQuery({
    queryKey: ["ledger-fx", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: wallets } = await supabase.from("wallets").select("id").eq("user_id", user.id);
      const ids = (wallets ?? []).map((w) => w.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, journal_id, created_at, credit_amount, currency_code")
        .eq("reference_type", "fx")
        .in("wallet_id", ids)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return [];
      const byJournal = new Map<string, any>();
      for (const e of data ?? []) {
        if (Number(e.credit_amount) > 0 && !byJournal.has(e.journal_id)) byJournal.set(e.journal_id, e);
      }
      return Array.from(byJournal.values()).slice(0, 5);
    },
    enabled: !!user,
  });

  const isLoading = loadingTransfers || loadingDeposits || loadingFx;

  if (isLoading) {
    return (
      <section className="rounded-2xl bg-card border border-border p-6">
        <h2 className="text-lg font-display font-semibold text-foreground mb-4">Recent Transactions</h2>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl skeleton-shimmer" />
          ))}
        </div>
      </section>
    );
  }

  const transferItems: Item[] = (transfers ?? []).map((t) => ({
    key: `t-${t.id}`,
    transferId: t.id,
    kind: "send",
    direction: "debit",
    status: t.status === "completed" ? "completed" : t.status === "failed" ? "failed" : "pending",
    amount: Number(t.source_amount),
    currency: t.source_currency,
    symbol: currencySymbol(t.source_currency),
    recipient: `${flagForCountryName(t.recipient_country)} ${t.recipient_name}`,
    date: formatDistanceToNow(new Date(t.created_at), { addSuffix: true }),
    description: `${payoutMethodNames[t.payout_method || ""] || "Transfer"} · ${t.recipient_country}`,
    createdAt: t.created_at,
  }));

  const depositItems: Item[] = (deposits ?? []).map((d: any) => ({
    key: `d-${d.id}`,
    journalId: d.journal_id,
    kind: "receive",
    direction: "credit",
    status: "completed",
    amount: Number(d.credit_amount),
    currency: d.currency_code,
    symbol: currencySymbol(d.currency_code),
    recipient: `${flagForCurrency(d.currency_code)} ${cleanIncomingTransactionLabel(d.description, d.reference_type)}`,
    date: formatDistanceToNow(new Date(d.created_at), { addSuffix: true }),
    description: getIncomingTransactionMeta(d.reference_type),
    createdAt: d.created_at,
  }));

  const fxItems: Item[] = (fxSwaps ?? []).map((f: any) => ({
    key: `fx-${f.id}`,
    journalId: f.journal_id,
    kind: "exchange",
    direction: "credit",
    status: "completed",
    amount: Number(f.credit_amount),
    currency: f.currency_code,
    symbol: currencySymbol(f.currency_code),
    recipient: `${flagForCurrency(f.currency_code)} Currency Exchange`,
    date: formatDistanceToNow(new Date(f.created_at), { addSuffix: true }),
    description: `Swapped to ${f.currency_code}`,
    createdAt: f.created_at,
  }));

  const all = [...transferItems, ...depositItems, ...fxItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const filtered = tab === "all" ? all.slice(0, 8) : all.filter((i) => i.direction === tab).slice(0, 8);

  // Running totals grouped by currency (across visible completed items)
  const sumByCurrency = (items: Item[]) =>
    items.reduce<Record<string, number>>((acc, i) => {
      const c = (i.currency || "USD").toUpperCase();
      acc[c] = (acc[c] || 0) + i.amount;
      return acc;
    }, {});
  const totalsIn = sumByCurrency(filtered.filter((i) => i.direction === "credit" && i.status === "completed"));
  const totalsOut = sumByCurrency(filtered.filter((i) => i.direction === "debit" && i.status === "completed"));
  const renderTotals = (totals: Record<string, number>, sign: "+" | "-") => {
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return `${sign}${fmtAmt(0)}`;
    return entries.map(([c, v]) => `${sign}${currencySymbol(c)}${fmtAmt(v)}`).join("  ");
  };

  // Group by date
  const groups = filtered.reduce<Record<string, Item[]>>((acc, item) => {
    const k = dateGroupLabel(item.createdAt);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});

  const hasItems = filtered.length > 0;
  const total = all.length;

  return (
    <section className="rounded-2xl bg-card border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-display font-semibold text-foreground">Account Statement</h2>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-live-pulse" />
            Live
          </span>
        </div>
        {total > 0 && (
          <Link to="/transfers" className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
            View All <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* In / Out summary */}
      {total > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-xl border border-border bg-emerald-500/[0.04] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Money In</div>
            <div className="text-base font-display font-bold text-emerald-600 dark:text-emerald-400 tabular-nums break-words leading-tight">{renderTotals(totalsIn, "+")}</div>
          </div>
          <div className="rounded-xl border border-border bg-rose-500/[0.04] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Money Out</div>
            <div className="text-base font-display font-bold text-rose-600 dark:text-rose-400 tabular-nums break-words leading-tight">{renderTotals(totalsOut, "-")}</div>
          </div>
        </div>
      )}

      {total > 0 && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-3">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="credit">Received</TabsTrigger>
            <TabsTrigger value="debit">Sent</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {!hasItems ? (
        total === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-12 text-center">
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} className="p-4 rounded-full bg-primary/10 mb-4">
              <Inbox className="w-7 h-7 text-primary" />
            </motion.div>
            <p className="font-semibold text-foreground mb-1">No transactions yet</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">Your transfers, deposits and exchanges will appear here.</p>
            <Button asChild><Link to="/send"><Send className="w-4 h-4 mr-2" />Send your first transfer</Link></Button>
          </motion.div>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">No {tab === "credit" ? "incoming" : "outgoing"} transactions in this view.</div>
        )
      ) : (
        <>
          {/* Bank-statement header (desktop) */}
          <div className="hidden sm:grid grid-cols-[1fr_120px_120px_90px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border">
            <div>Description</div>
            <div className="text-right">Money Out</div>
            <div className="text-right">Money In</div>
            <div className="text-right">Status</div>
          </div>

          <div className="space-y-4 mt-1">
            {Object.entries(groups).map(([dateLabel, rows]) => (
              <div key={dateLabel}>
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30 rounded-md">
                  {dateLabel}
                </div>
                <div className="divide-y divide-border/60">
                  {rows.map((item, index) => {
                    const meta = KIND_META[item.kind];
                    const isFailed = item.status === "failed";
                    const isCredit = item.direction === "credit";
                    const amountColor = isFailed
                      ? "text-muted-foreground line-through decoration-rose-500/60"
                      : isCredit
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400";
                    const iconBg = isFailed ? "bg-muted text-muted-foreground" : meta.bg;

                    const inner = (
                      <div className="group/tx grid sm:grid-cols-[1fr_120px_120px_90px] grid-cols-[1fr_auto] gap-2 items-center px-3 py-3 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer">
                        {/* Description */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center relative ${iconBg}`}>
                            <meta.Icon className="w-4 h-4" />
                            {isFailed && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-bold ring-2 ring-card">!</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className={`font-semibold truncate text-sm ${isFailed ? "text-muted-foreground" : "text-foreground"}`}>{item.recipient}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{item.description} · {item.date}</p>
                          </div>
                        </div>

                        {/* Mobile: single amount on right */}
                        <div className="sm:hidden text-right">
                          <p className={`text-sm font-display font-bold tabular-nums ${amountColor}`}>
                            {isCredit ? "+" : "-"}{item.symbol}{fmtAmt(item.amount)}
                          </p>
                          <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold capitalize ${STATUS_PILL[item.status]}`}>
                            {item.status}
                          </span>
                        </div>

                        {/* Desktop: Debit column */}
                        <div className="hidden sm:block text-right tabular-nums text-sm font-semibold">
                          {!isCredit ? <span className={amountColor}>-{item.symbol}{fmtAmt(item.amount)}</span> : <span className="text-muted-foreground/40">—</span>}
                        </div>
                        {/* Desktop: Credit column */}
                        <div className="hidden sm:block text-right tabular-nums text-sm font-semibold">
                          {isCredit ? <span className={amountColor}>+{item.symbol}{fmtAmt(item.amount)}</span> : <span className="text-muted-foreground/40">—</span>}
                        </div>
                        {/* Desktop: Status */}
                        <div className="hidden sm:flex justify-end">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${STATUS_PILL[item.status]}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${item.status === "completed" ? "bg-emerald-500" : item.status === "failed" ? "bg-rose-500" : "bg-amber-500"}`} />
                            {item.status}
                          </span>
                        </div>
                      </div>
                    );

                    return (
                      <motion.div
                        key={item.key}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.04, duration: 0.3 }}
                      >
                        {item.transferId ? (
                          <Link to={`/transfers/${item.transferId}`} className="block">{inner}</Link>
                        ) : item.journalId ? (
                          <Link to={`/transactions/${item.journalId}`} className="block">{inner}</Link>
                        ) : inner}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {total > 8 && (
            <Link to="/transfers" className="block mt-3 text-center text-sm font-medium text-primary hover:underline">
              View all {total} transactions
            </Link>
          )}
        </>
      )}
    </section>
  );
};

export default RecentTransactions;
