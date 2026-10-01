import { Link } from "react-router-dom";
import { ShieldCheck, Clock, AlertTriangle, ShieldQuestion, ChevronRight } from "lucide-react";
import { useKyc } from "@/hooks/useKyc";
import { useProfile } from "@/hooks/useProfile";
import { useBusinessAccount } from "@/hooks/useBusinessAccount";
import { tierLabel, type Tier } from "@/lib/tierLimits";
import { cn } from "@/lib/utils";

const KycStatusCard = () => {
  const { tier, kyc, isLoading } = useKyc();
  const { data: profile } = useProfile();
  const { isBusiness } = useBusinessAccount();

  if (isLoading || isBusiness) return null;

  const current = ((tier?.current_tier ?? profile?.kyc_tier ?? "tier_1") as string).replace("tier_0", "tier_1") as Tier;
  const level = Number(current.replace(/[^0-9]/g, "")) || 1;
  const profileVerified = profile?.kyc_status === "verified" || profile?.kyc_status === "approved";

  const status =
    kyc?.verification_status === "pending_review"
      ? { label: "Under review", Icon: Clock, tone: "text-amber-600 dark:text-amber-400 bg-amber-500/10" }
      : kyc?.verification_status === "rejected"
        ? { label: "Action needed", Icon: AlertTriangle, tone: "text-destructive bg-destructive/10" }
        : profileVerified && level >= 2
          ? { label: level >= 3 ? "Fully verified" : "Verified", Icon: ShieldCheck, tone: "text-primary bg-primary/10" }
          : { label: "Not verified", Icon: ShieldQuestion, tone: "text-muted-foreground bg-muted" };

  return (
    <Link
      to="/kyc"
      className="group mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-muted/40"
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", status.tone)}>
        <status.Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Personal KYC</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-foreground">
            Level {level} of 3 · {tierLabel(current)}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", status.tone)}>{status.label}</span>
        </div>
        <div className="mt-1.5 flex max-w-[180px] gap-1">
          {[1, 2, 3].map((n) => (
            <span key={n} className={cn("h-1 flex-1 rounded-full", n <= level ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
};

export default KycStatusCard;
