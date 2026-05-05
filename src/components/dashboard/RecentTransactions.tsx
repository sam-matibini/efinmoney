import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import TransactionItem from "@/components/ui/TransactionItem";
import { ChevronRight, Inbox, Send } from "lucide-react";
import { useTransfers } from "@/hooks/useTransfers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const payoutMethodNames: Record<string, string> = {
  mpesa: "M-Pesa",
  mtn_mobile: "MTN Mobile",
  bank_transfer: "Bank Transfer",
  airtel_money: "Airtel Money",
};

const currencySymbol = (code: string) =>
  code === "USD" ? "$" : code === "CAD" ? "C$" : code === "EUR" ? "€" : code === "GBP" ? "£" : "";

interface Item {
  key: string;
  type: "send" | "receive";
  status: "completed" | "failed" | "pending";
  amount: number;
  currency: string;
  symbol: string;
  recipient: string;
  date: string;
  description: string;
  createdAt: string;
}

const RecentTransactions = () => {
  const { user } = useAuth();
  const { data: transfers, isLoading: loadingTransfers } = useTransfers(5);

  const { data: deposits, isLoading: loadingDeposits } = useQuery({
    queryKey: ["ledger-deposits", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, created_at, credit_amount, currency_code, description, reference_type, wallet_id")
        .eq("reference_type", "stripe_deposit")
        .gt("credit_amount", 0)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) {
        console.error("Error fetching deposits:", error);
        return [];
      }
      return data ?? [];
    },
    enabled: !!user,
  });

  // FX swaps: fetch user's wallet ids first, then ledger entries that touch them
  const { data: fxSwaps, isLoading: loadingFx } = useQuery({
    queryKey: ["ledger-fx", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: wallets } = await supabase
        .from("wallets")
        .select("id")
        .eq("user_id", user.id);
      const ids = (wallets ?? []).map((w) => w.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, journal_id, created_at, debit_amount, credit_amount, currency_code, wallet_id")
        .eq("reference_type", "fx")
        .in("wallet_id", ids)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        console.error("Error fetching fx swaps:", error);
        return [];
      }
      // Group by journal_id, keep credit (received) leg
      const byJournal = new Map<string, any>();
      for (const e of data ?? []) {
        if (Number(e.credit_amount) > 0 && !byJournal.has(e.journal_id)) {
          byJournal.set(e.journal_id, e);
        }
      }
      return Array.from(byJournal.values()).slice(0, 5);
    },
    enabled: !!user,
  });

  const isLoading = loadingTransfers || loadingDeposits || loadingFx;

  if (isLoading) {
    return (
      <section className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-semibold text-foreground">Recent Transactions</h2>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  const transferItems: Item[] = (transfers ?? []).map((t) => ({
    key: `t-${t.id}`,
    type: "send",
    status: (t.status === "completed" ? "completed" : t.status === "failed" ? "failed" : "pending"),
    amount: Number(t.source_amount),
    currency: t.source_currency,
    symbol: currencySymbol(t.source_currency),
    recipient: t.recipient_name,
    date: formatDistanceToNow(new Date(t.created_at), { addSuffix: true }),
    description: `${payoutMethodNames[t.payout_method || ""] || "Transfer"} to ${t.recipient_country}`,
    createdAt: t.created_at,
  }));

  const depositItems: Item[] = (deposits ?? []).map((d) => ({
    key: `d-${d.id}`,
    type: "receive",
    status: "completed",
    amount: Number(d.credit_amount),
    currency: d.currency_code,
    symbol: currencySymbol(d.currency_code),
    recipient: "Card Deposit",
    date: formatDistanceToNow(new Date(d.created_at), { addSuffix: true }),
    description: "Top-up via Stripe",
    createdAt: d.created_at,
  }));

  const fxItems: Item[] = (fxSwaps ?? []).map((f: any) => ({
    key: `fx-${f.id}`,
    type: "receive",
    status: "completed",
    amount: Number(f.credit_amount),
    currency: f.currency_code,
    symbol: currencySymbol(f.currency_code),
    recipient: "Currency Exchange",
    date: formatDistanceToNow(new Date(f.created_at), { addSuffix: true }),
    description: `Swapped to ${f.currency_code}`,
    createdAt: f.created_at,
  }));

  const items = [...transferItems, ...depositItems, ...fxItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const hasItems = items.length > 0;

  return (
    <section className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Recent Transactions</h2>
        {hasItems && (
          <button className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors">
            View All
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {!hasItems ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="p-3 rounded-full bg-muted/50 mb-3">
            <Inbox className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">No transactions yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Your transfers and deposits will appear here.
          </p>
          <Button asChild size="sm">
            <Link to="/send">
              <Send className="w-4 h-4 mr-2" />
              Send Money
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item, index) => (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <TransactionItem
                type={item.type}
                status={item.status}
                amount={item.amount}
                currency={item.currency}
                symbol={item.symbol}
                recipient={item.recipient}
                date={item.date}
                description={item.description}
              />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
};

export default RecentTransactions;
