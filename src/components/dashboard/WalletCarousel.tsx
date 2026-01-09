import { motion } from "framer-motion";
import WalletCard from "@/components/ui/WalletCard";
import { ChevronRight } from "lucide-react";

const wallets = [
  { currency: 'USD', balance: 12458.32, symbol: '$', flag: '🇺🇸', change: 2.4, isMain: true },
  { currency: 'CAD', balance: 8234.50, symbol: 'C$', flag: '🇨🇦', change: -0.8 },
  { currency: 'KES', balance: 156780.00, symbol: 'KSh', flag: '🇰🇪', change: 1.2 },
  { currency: 'USDT', balance: 5420.00, symbol: '₮', flag: '₿', change: 0.1 },
];

const WalletCarousel = () => {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">My Wallets</h2>
        <button className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors">
          View All
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {wallets.map((wallet, index) => (
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
