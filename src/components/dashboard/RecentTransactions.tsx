import { motion } from "framer-motion";
import TransactionItem from "@/components/ui/TransactionItem";
import { ChevronRight } from "lucide-react";

const transactions = [
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
  {
    type: 'deposit' as const,
    status: 'pending' as const,
    amount: 5000.00,
    currency: 'USD',
    symbol: '$',
    date: 'Yesterday',
    description: 'Bank Deposit (ACH)',
  },
  {
    type: 'send' as const,
    status: 'completed' as const,
    amount: 150.00,
    currency: 'USD',
    symbol: '$',
    recipient: 'Grace Wanjiku',
    date: '2 days ago',
    description: 'Mobile Money to Uganda',
  },
];

const RecentTransactions = () => {
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
        {transactions.map((transaction, index) => (
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
