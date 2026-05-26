import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield } from "lucide-react";

interface Props {
  tier: "tier_1" | "tier_2" | "tier_3";
  daily?: number;
  monthly?: number;
  single?: number;
}

const LABELS: Record<Props["tier"], string> = {
  tier_1: "Tier 1 · Minimal",
  tier_2: "Tier 2 · Standard",
  tier_3: "Tier 3 · Enhanced",
};

const TierBadge = ({ tier, daily, monthly, single }: Props) => {
  const fmt = (n?: number) =>
    n != null ? `$${Number(n).toLocaleString()}` : "—";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="gap-1 cursor-help">
            <Shield className="w-3 h-3" />
            {LABELS[tier]}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-0.5">
            <div>Daily limit: {fmt(daily)}</div>
            <div>Monthly limit: {fmt(monthly)}</div>
            <div>Per transaction: {fmt(single)}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default TierBadge;
