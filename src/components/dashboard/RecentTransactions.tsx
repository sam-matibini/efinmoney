import { motion } from "framer-motion";
import TransactionItem from "@/components/ui/TransactionItem";
import { ChevronRight } from "lucide-react";
import { useTransfers } from "@/hooks/useTransfers";
import { Skeleton } from "@/components/ui/skeleton";
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

  // Show mock data if no transfers yet
  const displayTransfers = transfers && transfers.length > 0 
    ? transfers.map(t => ({
        type: 'send' as const,
        status: t.status === 'completed' ? 'completed' as const : 
                t.status === 'failed' ? 'failed' as const : 'pending' as const,
        amount: Number(t.source_amount),
        currency: t.source_currency,
        symbol: t.source_currency === 'USD' ? '$' : t.source_currency === 'CAD' ? 'C$' : '',
        recipient: t.recipient_name,
        date: formatDistanceToNow(new Date(t.created_at), { addSuffix: true }),
        description: `${payoutMethodNames[t.payout_method || ''] || 'Transfer'} to ${t.recipient_country}`,
      }))
    : [
        {
          type: 'send' as const,
          status: 'completed' as const,
          amount: 500.00,
          currency: 'USD',
          symbol: '$',
          recipient: 'John Mwangi',
          date: 'Today, 2:34 PM',
          description: 'Mobile Money to Kenya',
        },
        {
          type: 'exchange' as const,
          status: 'completed' as const,
          amount: 1250.00,
          currency: 'CAD',
          symbol: 'C$',
          date: 'Today, 11:20 AM',
          description: 'USD → CAD Exchange',
        },
        {
          type: 'receive' as const,
          status: 'completed' as const,
          amount: 2400.00,
          currency: 'USD',
          symbol: '$',
          date: 'Yesterday',
          description: 'Received from Alice Smith',
        },
      ];

  return (
    <section className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Recent Transactions</h2>
        <button className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors">
          View All
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      
      <div className="space-y-1">
        {displayTransfers.map((transaction, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <TransactionItem {...transaction} />
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default RecentTransactions;
