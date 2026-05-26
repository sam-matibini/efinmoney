import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Shield, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useKyc } from "@/hooks/useKyc";
import { useProfile } from "@/hooks/useProfile";
import { useTransfers } from "@/hooks/useTransfers";
import { useFxRates } from "@/hooks/useFxRates";
import { useMemo } from "react";
import { buildUsdRateMap, convertToUsd } from "@/lib/fx";
import { nextTier, tierLabel, upgradeRoute, type Tier } from "@/lib/tierLimits";

const TierProgressCard = () => {
  const navigate = useNavigate();
  const { tier } = useKyc();
  const { data: profile } = useProfile();
  const { data: transfers } = useTransfers(200);
  const { data: fxRates } = useFxRates();

  // Only show for new-framework users; legacy users see KYCStatusCard if needed.
  if ((profile?.kyc_framework_version ?? 2) < 2) return null;
  if (!tier) return null;

  const current = tier.current_tier as Tier;
  const upgradeTo = nextTier(current);

  const { dailyUsed, monthlyUsed } = useMemo(() => {
    const now = new Date();
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const rateMap = buildUsdRateMap((fxRates ?? []) as any);
    let d = 0, m = 0;
    for (const t of transfers ?? []) {
      const ts = new Date(t.created_at).getTime();
      const usd = convertToUsd(Number(t.source_amount || 0), (t as any).source_currency || "USD", rateMap) ?? 0;
      if (ts >= startMonth) m += usd;
      if (ts >= startDay) d += usd;
    }
    return { dailyUsed: d, monthlyUsed: m };
  }, [transfers, fxRates]);

  const dailyPct = Math.min(100, (dailyUsed / Number(tier.daily_transaction_limit)) * 100);
  const monthlyPct = Math.min(100, (monthlyUsed / Number(tier.monthly_transaction_limit)) * 100);

  return (
    <Card className="p-5 space-y-4 mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground text-sm">Your tier</p>
              <Badge variant="secondary" className="text-[10px]">{tierLabel(current)}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Per-transaction: ${Number(tier.single_transaction_limit).toLocaleString()}
            </p>
          </div>
        </div>
        {upgradeTo && (
          <Button size="sm" variant="outline" onClick={() => navigate(upgradeRoute(current))}>
            Upgrade <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Today</span>
          <span className="font-medium text-foreground">
            ${dailyUsed.toLocaleString()} / ${Number(tier.daily_transaction_limit).toLocaleString()}
          </span>
        </div>
        <Progress value={dailyPct} className="h-1.5" />

        <div className="flex justify-between text-xs pt-1">
          <span className="text-muted-foreground">This month</span>
          <span className="font-medium text-foreground">
            ${monthlyUsed.toLocaleString()} / ${Number(tier.monthly_transaction_limit).toLocaleString()}
          </span>
        </div>
        <Progress value={monthlyPct} className="h-1.5" />
      </div>
    </Card>
  );
};

export default TierProgressCard;
