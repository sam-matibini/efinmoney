import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

const rates = [
  { from: 'USD', to: 'KES', rate: 153.45, change: 0.32, flag: '🇰🇪' },
  { from: 'USD', to: 'UGX', rate: 3742.50, change: -0.15, flag: '🇺🇬' },
  { from: 'USD', to: 'TZS', rate: 2505.00, change: 0.08, flag: '🇹🇿' },
  { from: 'CAD', to: 'USD', rate: 0.74, change: 0.21, flag: '🇺🇸' },
];

const ExchangeRates = () => {
  return (
    <section className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Live Rates</h2>
        <button className="p-2 rounded-lg hover:bg-muted transition-colors">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      
      <div className="space-y-4">
        {rates.map((rate, index) => (
          <motion.div
            key={`${rate.from}-${rate.to}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{rate.flag}</span>
              <div>
                <p className="font-medium text-foreground">
                  {rate.from} → {rate.to}
                </p>
                <p className="text-sm text-muted-foreground">
                  1 {rate.from} = {rate.rate.toLocaleString()} {rate.to}
                </p>
              </div>
            </div>
            <div className={`flex items-center gap-1 ${
              rate.change >= 0 ? 'text-primary' : 'text-destructive'
            }`}>
              {rate.change >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">
                {rate.change >= 0 ? '+' : ''}{rate.change}%
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full mt-4 py-3 rounded-xl gradient-primary text-primary-foreground font-medium shadow-glow"
      >
        Exchange Now
      </motion.button>
    </section>
  );
};

export default ExchangeRates;
