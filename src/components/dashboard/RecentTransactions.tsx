import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import TransactionItem from "@/components/ui/TransactionItem";
import { ChevronRight, Inbox, Send } from "lucide-react";
import { useTransfers } from "@/hooks/useTransfers";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const payoutMethodNames: Record<string, string> = {
  mpesa: 'M-Pesa',
  mtn_mobile: 'MTN Mobile',
  bank_transfer: 'Bank Transfer',
  airtel_money: 'Airtel Money',
};

const RecentTransactions = () => {
  const { data: transfers, isLoading } = useTransfers(5);

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

  const hasTransfers = transfers && transfers.length > 0;

  return (
    <section className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Recent Transactions</h2>
        {hasTransfers && (
          <button className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors">
            View All
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {!hasTransfers ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="p-3 rounded-full bg-muted/50 mb-3">
            <Inbox className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">No transactions yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Your transfers will appear here once you start sending money.
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
          {transfers!.map((t, index) => {
            const item = {
              type: 'send' as const,
              status: (t.status === 'completed'
                ? 'completed'
                : t.status === 'failed'
                ? 'failed'
                : 'pending') as 'completed' | 'failed' | 'pending',
              amount: Number(t.source_amount),
              currency: t.source_currency,
              symbol: t.source_currency === 'USD' ? '$' : t.source_currency === 'CAD' ? 'C$' : '',
              recipient: t.recipient_name,
              date: formatDistanceToNow(new Date(t.created_at), { addSuffix: true }),
              description: `${payoutMethodNames[t.payout_method || ''] || 'Transfer'} to ${t.recipient_country}`,
            };
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <TransactionItem {...item} />
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default RecentTransactions;
