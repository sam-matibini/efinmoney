import { motion } from "framer-motion";
import WalletCard from "@/components/ui/WalletCard";
import { ChevronRight, Plus } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { Skeleton } from "@/components/ui/skeleton";

const WalletCarousel = () => {
  const { data: wallets, isLoading } = useWallets();

  if (isLoading) {
    return (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-semibold text-foreground">My Wallets</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[160px] sm:h-[180px] rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  const displayWallets = wallets && wallets.length > 0 
    ? wallets.map((w, index) => ({
        currency: w.currency_code,
        balance: Number(w.balance),
        symbol: w.symbol,
        flag: w.flag_emoji || '💰',
        change: 0,
        isMain: index === 0,
      }))
    : [
        { currency: 'USD', balance: 0, symbol: '$', flag: '🇺🇸', change: 0, isMain: true },
        { currency: 'CAD', balance: 0, symbol: 'C$', flag: '🇨🇦', change: 0, isMain: false },
      ];

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">My Wallets</h2>
        <button className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors">
          <Plus className="w-4 h-4" />
          Add Wallet
        </button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {displayWallets.map((wallet, index) => (
          <motion.div
            key={wallet.currency}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <WalletCard {...wallet} />
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default WalletCarousel;
