import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import KycStatusDialog from "@/components/kyc/KycStatusDialog";
import { useKyc } from "@/hooks/useKyc";
import { useProfile } from "@/hooks/useProfile";
import { kycTierNumber } from "@/lib/kycStages";

const KycTierCard = () => {
  const [open, setOpen] = useState(false);
  const { tier } = useKyc();
  const { data: profile } = useProfile();
  const tierNumber = kycTierNumber(tier?.current_tier || profile?.kyc_tier);

  return (
    <>
      <button type="button" className="kyc-tier-card" aria-label="Open KYC status" onClick={() => setOpen(true)}>
        <span className="kyc-tier-copy">
          <span className="stat-label">KYC Tier</span>
          <span className="stat-value">Tier {tierNumber}</span>
          <span className="kyc-tier-track" aria-hidden>
            {[1, 2, 3].map((step) => (
              <span key={step} className={step <= tierNumber ? "is-on" : ""} />
            ))}
          </span>
          <span className="budget-cta">
            {tierNumber >= 3 ? "View KYC status" : `Upgrade to Tier ${tierNumber + 1} →`}
          </span>
        </span>
        <ShieldCheck size={20} color="var(--color-accent-gold)" aria-hidden />
      </button>
      <KycStatusDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

export default KycTierCard;
