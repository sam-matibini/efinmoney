import { motion } from "framer-motion";
import { TrendingUp, Users, Globe, Shield } from "lucide-react";

const stats = [
  { 
    label: 'Total Balance', 
    value: '$26,892.82', 
    change: '+12.5%', 
    icon: TrendingUp,
    positive: true 
  },
  { 
    label: 'Recipients', 
    value: '24', 
    change: '+3 this month', 
    icon: Users,
    positive: true 
  },
  { 
    label: 'Countries', 
    value: '8', 
    change: 'Active corridors', 
    icon: Globe,
    positive: true 
  },
  { 
    label: 'KYC Status', 
    value: 'Verified', 
    change: 'Tier 3', 
    icon: Shield,
    positive: true 
  },
];

const StatsOverview = () => {
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
          <h3 className="text-2xl font-display font-bold text-foreground mb-1">
            {stat.value}
          </h3>
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
