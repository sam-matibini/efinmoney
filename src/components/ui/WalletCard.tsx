import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, MoreHorizontal } from "lucide-react";
import SendMoneyModal from "@/components/modals/SendMoneyModal";

interface WalletCardProps {
  currency: string;
  balance: number;
  symbol: string;
  flag: string;
  change?: number;
  isMain?: boolean;
}

const WalletCard = ({ currency, balance, symbol, flag, change = 0, isMain = false }: WalletCardProps) => {
  const formatBalance = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ duration: 0.3 }}
      className={`relative overflow-hidden rounded-2xl p-4 sm:p-6 ${
        isMain 
          ? 'gradient-primary shadow-glow min-h-[160px] sm:min-h-[180px]' 
          : 'glass shadow-card'
      }`}
    >
      {isMain && (
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-foreground/10 blur-3xl" />
          <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-foreground/10 blur-2xl" />
        </div>
      )}
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xl sm:text-2xl">{flag}</span>
            <span className={`font-display font-semibold text-sm sm:text-base ${isMain ? 'text-primary-foreground' : 'text-foreground'}`}>
              {currency}
            </span>
          </div>
          <button className={`p-1.5 sm:p-2 rounded-full transition-colors ${
            isMain 
              ? 'hover:bg-foreground/10' 
              : 'hover:bg-muted'
          }`}>
            <MoreHorizontal className={`w-4 h-4 sm:w-5 sm:h-5 ${isMain ? 'text-primary-foreground/70' : 'text-muted-foreground'}`} />
          </button>
        </div>

        <div className="mb-3 sm:mb-4">
          <p className={`text-xs sm:text-sm mb-1 ${isMain ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
            Available Balance
          </p>
          <h2 className={`text-2xl sm:text-3xl font-display font-bold tracking-tight ${
            isMain ? 'text-primary-foreground' : 'text-foreground'
          }`}>
            {symbol}{formatBalance(balance)}
          </h2>
          {change !== 0 && (
            <p className={`text-xs sm:text-sm mt-1 ${
              change > 0 
                ? 'text-primary' 
                : 'text-destructive'
            }`}>
              {change > 0 ? '+' : ''}{change.toFixed(2)}% today
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <SendMoneyModal>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                isMain 
                  ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Send
            </motion.button>
          </SendMoneyModal>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
              isMain 
                ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Receive
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

export default WalletCard;
