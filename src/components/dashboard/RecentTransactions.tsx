import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Inbox, Send, ChevronRight } from "lucide-react";
import { useTransfers } from "@/hooks/useTransfers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { flagForCountryName, flagForCurrency } from "@/lib/flags";
import { formatDistanceToNow } from "date-fns";

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

interface Item {
  key: string;
  transferId?: string;
  kind: Kind;
  status: "completed" | "failed" | "pending";
  amount: number;
  currency: string;
  symbol: string;
  recipient: string;
  date: string;
  description: string;
  createdAt: string;
}

const KIND_META: Record<Kind, { Icon: any; bg: string; sign: string; amountColor: string }> = {
  receive: {
    Icon: ArrowDownLeft,
    bg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    sign: "+",
    amountColor: "text-emerald-600 dark:text-emerald-400",
  },
  send: {
    Icon: ArrowUpRight,
    bg: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    sign: "-",
    amountColor: "text-rose-600 dark:text-rose-400",
  },
  exchange: {
    Icon: RefreshCw,
    bg: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    sign: "↔ ",
    amountColor: "text-blue-600 dark:text-blue-400",
  },
};

const STATUS_PILL: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-pulse",
  failed: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const RecentTransactions = () => {
  const { user } = useAuth();
  const { data: transfers, isLoading: loadingTransfers } = useTransfers(5);

  const { data: deposits, isLoading: loadingDeposits } = useQuery({
    queryKey: ["ledger-deposits", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, created_at, credit_amount, currency_code, description, reference_type")
        .eq("reference_type", "stripe_deposit")
        .gt("credit_amount", 0)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) return [];
      return data ?? [];
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
    status: t.status === "completed" ? "completed" : t.status === "failed" ? "failed" : "pending",
    amount: Number(t.source_amount),
    currency: t.source_currency,
    symbol: currencySymbol(t.source_currency),
    recipient: `${flagForCountryName(t.recipient_country)} ${t.recipient_name}`,
    date: formatDistanceToNow(new Date(t.created_at), { addSuffix: true }),
    description: `${payoutMethodNames[t.payout_method || ""] || "Transfer"} · ${t.recipient_country}`,
    createdAt: t.created_at,
  }));

  const depositItems: Item[] = (deposits ?? []).map((d) => ({
    key: `d-${d.id}`,
    kind: "receive",
    status: "completed",
    amount: Number(d.credit_amount),
    currency: d.currency_code,
    symbol: currencySymbol(d.currency_code),
    recipient: `${flagForCurrency(d.currency_code)} Card Top-up`,
    date: formatDistanceToNow(new Date(d.created_at), { addSuffix: true }),
    description: "Funds added via Stripe",
    createdAt: d.created_at,
  }));

  const fxItems: Item[] = (fxSwaps ?? []).map((f: any) => ({
    key: `fx-${f.id}`,
    kind: "exchange",
    status: "completed",
    amount: Number(f.credit_amount),
    currency: f.currency_code,
    symbol: currencySymbol(f.currency_code),
    recipient: `${flagForCurrency(f.currency_code)} Currency Exchange`,
    date: formatDistanceToNow(new Date(f.created_at), { addSuffix: true }),
    description: `Swapped to ${f.currency_code}`,
    createdAt: f.created_at,
  }));

  const items = [...transferItems, ...depositItems, ...fxItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const total = transferItems.length + depositItems.length + fxItems.length;
  const hasItems = items.length > 0;

  return (
    <section className="rounded-2xl bg-card border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Recent Transactions</h2>
        {hasItems && (
          <Link
            to="/transfers"
            className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
          >
            View All <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

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
          <div className="space-y-1">
            {items.map((item, index) => {
              const meta = KIND_META[item.kind];
              const inner = (
                <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors cursor-pointer">
                  <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${meta.bg}`}>
                    <meta.Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{item.recipient}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.description} · {item.date}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-display font-semibold ${meta.amountColor}`}>
                      {meta.sign}
                      {item.symbol}
                      {item.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <span
                      className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                        STATUS_PILL[item.status]
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              );
              return (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  {item.transferId ? (
                    <Link to={`/transfers/${item.transferId}`} className="block">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </motion.div>
              );
            })}
          </div>
          {total > 5 && (
            <Link
              to="/transfers"
              className="block mt-3 text-center text-sm font-medium text-primary hover:underline"
            >
              View all {total} transactions
            </Link>
          )}
        </>
      )}
    </section>
  );
};

export default RecentTransactions;
