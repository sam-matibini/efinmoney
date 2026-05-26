import { forwardRef } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, RefreshCw, Wallet } from "lucide-react";

export type TransactionType = 'send' | 'receive' | 'exchange' | 'deposit';
export type TransactionStatus = 'completed' | 'pending' | 'failed';

interface TransactionItemProps {
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  symbol: string;
  recipient?: string;
  date: string;
  description?: string;
}

const TransactionItem = forwardRef<HTMLDivElement, TransactionItemProps>(({ 
  type, 
  status, 
  amount, 
  currency, 
  symbol, 
  recipient, 
  date,
  description 
}, ref) => {
  const getIcon = () => {
    switch (type) {
      case 'send':
        return <ArrowUpRight className="w-5 h-5" />;
      case 'receive':
        return <ArrowDownLeft className="w-5 h-5" />;
      case 'exchange':
        return <RefreshCw className="w-5 h-5" />;
      case 'deposit':
        return <Wallet className="w-5 h-5" />;
    }
  };

  const getIconBg = () => {
    switch (type) {
      case 'send':
        return 'bg-accent/20 text-accent';
      case 'receive':
        return 'bg-primary/20 text-primary';
      case 'exchange':
        return 'bg-teal-500/20 text-teal-400';
      case 'deposit':
        return 'bg-primary/20 text-primary';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'text-primary';
      case 'pending':
        return 'text-yellow-400';
      case 'failed':
        return 'text-destructive';
    }
  };

  const getAmountPrefix = () => {
    return type === 'send' ? '-' : '+';
  };

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ backgroundColor: 'hsl(var(--muted) / 0.3)' }}
      className="flex items-center justify-between p-4 rounded-xl cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${getIconBg()}`}>
          {getIcon()}
        </div>
        <div>
          <p className="font-medium text-foreground">
            {description || (recipient ? `To ${recipient}` : type.charAt(0).toUpperCase() + type.slice(1))}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{date}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span className={getStatusColor()}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-display font-semibold ${
          type === 'send' ? 'text-foreground' : 'text-primary'
        }`}>
          {getAmountPrefix()}{symbol}{formatAmount(amount)}
        </p>
        <p className="text-sm text-muted-foreground">{currency}</p>
      </div>
    </motion.div>
  );
});

TransactionItem.displayName = 'TransactionItem';

export default TransactionItem;
