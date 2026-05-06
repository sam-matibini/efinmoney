import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Users, Globe, Shield, AlertTriangle } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useTransfers } from "@/hooks/useTransfers";
import { useProfile } from "@/hooks/useProfile";
import { useFxRates } from "@/hooks/useFxRates";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Build a lookup of latest from→USD rates
const buildUsdRateMap = (rates: { from_currency: string; to_currency: string; effective_rate: number }[]) => {
  const map = new Map<string, number>();
  map.set('USD', 1);
  for (const r of rates) {
    if (r.to_currency === 'USD' && !map.has(r.from_currency)) {
      map.set(r.from_currency, Number(r.effective_rate));
    }
  }
  // Derive inverse rates if only USD->X exists
  for (const r of rates) {
    if (r.from_currency === 'USD' && !map.has(r.to_currency) && Number(r.effective_rate) > 0) {
      map.set(r.to_currency, 1 / Number(r.effective_rate));
    }
  }
  return map;
};

const convertToUsd = (
  amount: number,
  currency: string,
  rateMap: Map<string, number>
): number | null => {
  const r = rateMap.get(currency);
  if (r === undefined) return null;
  return amount * r;
};

const formatKycTier = (tier: string) => {
  // tier_0 → Tier 0
  const n = tier?.replace(/[^0-9]/g, '');
  return n ? `Tier ${n}` : tier || '—';
};

const formatKycStatus = (status: string) => {
  if (!status) return 'Unverified';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const StatsOverview = () => {
  const { data: wallets, isLoading: walletsLoading } = useWallets();
  const { data: transfers, isLoading: transfersLoading } = useTransfers(500);
  const { data: profile, isLoading: profileLoading } = useProfile();

  // Current total balance in USD
  const totalBalance = wallets?.reduce(
    (sum, w) => sum + toUsd(Number(w.balance), w.currency_code),
    0
  ) || 0;

  // Estimate balance 30 days ago using transfer history.
  // current = past + net_credits - net_debits → past = current - (credits - debits)
  // We only have outbound transfers in this hook, so approximate:
  // past ≈ current + sum(outbound transfers in last 30d in USD)
  let growthLabel = 'N/A';
  let growthPositive = true;
  if (transfers && transfers.length > 0 && totalBalance > 0) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = transfers.filter(t => new Date(t.created_at).getTime() >= cutoff);
    if (recent.length > 0) {
      const outflowUsd = recent.reduce(
        (s, t) => s + toUsd(Number(t.source_amount), t.source_currency),
        0
      );
      const past = totalBalance + outflowUsd;
      if (past > 0) {
        const pct = ((totalBalance - past) / past) * 100;
        growthPositive = pct >= 0;
        growthLabel = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% (30d)`;
      }
    }
  }

  // Distinct countries from real transfers
  const uniqueCountries = new Set(
    (transfers || []).map(t => t.recipient_country).filter(Boolean)
  ).size;

  // Distinct recipients
  const uniqueRecipients = new Set(
    (transfers || []).map(t => t.recipient_name).filter(Boolean)
  ).size;

  const kycStatus = profile?.kyc_status || '';
  const kycTier = profile?.kyc_tier || '';
  const isVerified = kycStatus === 'verified' || kycStatus === 'approved';

  const stats = [
    {
      label: 'Total Balance',
      value: `$${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: growthLabel,
      icon: growthPositive ? TrendingUp : TrendingDown,
      positive: growthPositive,
      loading: walletsLoading || transfersLoading,
    },
    {
      label: 'Recipients',
      value: uniqueRecipients.toString(),
      change: uniqueRecipients === 0 ? 'No saved contacts' : 'Saved contacts',
      icon: Users,
      positive: true,
      loading: transfersLoading,
    },
    {
      label: 'Countries',
      value: uniqueCountries.toString(),
      change: uniqueCountries === 0 ? 'No corridors yet' : 'Active corridors',
      icon: Globe,
      positive: true,
      loading: transfersLoading,
    },
    {
      label: 'KYC Status',
      value: profile ? (isVerified ? 'Verified' : formatKycStatus(kycStatus) || 'Unverified') : 'Unverified',
      change: profile && kycTier ? formatKycTier(kycTier) : '—',
      icon: Shield,
      positive: isVerified,
      loading: profileLoading,
    },
  ];

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="glass rounded-2xl p-4 sm:p-5"
        >
          <div className="flex items-start justify-between mb-2 sm:mb-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
              <stat.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
          </div>
          {stat.loading ? (
            <Skeleton className="h-7 sm:h-8 w-20 sm:w-24 mb-1" />
          ) : (
            <h3 className="text-lg sm:text-2xl font-display font-bold text-foreground mb-1 truncate">
              {stat.value}
            </h3>
          )}
          <p className="text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
          <p className={`text-xs mt-1 ${stat.positive ? 'text-primary' : 'text-destructive'}`}>
            {stat.change}
          </p>
        </motion.div>
      ))}
    </section>
  );
};

export default StatsOverview;
