import { motion } from "framer-motion";
import { TrendingUp, Users, Globe, Shield } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useTransfers } from "@/hooks/useTransfers";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

const StatsOverview = () => {
  const { data: wallets, isLoading: walletsLoading } = useWallets();
  const { data: transfers } = useTransfers(100);

  // Calculate total balance in USD (simplified - would need FX conversion in production)
  const totalBalance = wallets?.reduce((sum, w) => {
    // Simple conversion for demo
    const usdValue = w.currency_code === 'USD' ? Number(w.balance) :
                     w.currency_code === 'CAD' ? Number(w.balance) * 0.74 :
                     Number(w.balance) * 0.01;
    return sum + usdValue;
  }, 0) || 0;

  // Count unique recipient countries
  const uniqueCountries = new Set(transfers?.map(t => t.recipient_country) || []).size;

  // Count unique recipients
  const uniqueRecipients = new Set(transfers?.map(t => t.recipient_name) || []).size;

  const stats = [
    { 
      label: 'Total Balance', 
      value: `$${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
      change: '+12.5%', 
      icon: TrendingUp,
      positive: true,
      loading: walletsLoading,
    },
    { 
      label: 'Recipients', 
      value: uniqueRecipients.toString(), 
      change: 'Saved contacts', 
      icon: Users,
      positive: true,
      loading: false,
    },
    { 
      label: 'Countries', 
      value: uniqueCountries > 0 ? uniqueCountries.toString() : '8', 
      change: 'Active corridors', 
      icon: Globe,
      positive: true,
      loading: false,
    },
    { 
      label: 'KYC Status', 
      value: 'Verified', 
      change: 'Tier 3', 
      icon: Shield,
      positive: true,
      loading: false,
    },
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="glass rounded-2xl p-5"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <stat.icon className="w-5 h-5 text-primary" />
            </div>
          </div>
          {stat.loading ? (
            <Skeleton className="h-8 w-24 mb-1" />
          ) : (
            <h3 className="text-2xl font-display font-bold text-foreground mb-1">
              {stat.value}
            </h3>
          )}
          <p className="text-sm text-muted-foreground">{stat.label}</p>
          <p className={`text-xs mt-1 ${stat.positive ? 'text-primary' : 'text-destructive'}`}>
            {stat.change}
          </p>
        </motion.div>
      ))}
    </section>
  );
};

export default StatsOverview;
