import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBusinessAccount } from "@/hooks/useBusinessAccount";
import { useKyc } from "@/hooks/useKyc";
import { useProfile } from "@/hooks/useProfile";
import { buildKycStages, kycTierNumber, remainingKycStages, type KycStage } from "@/lib/kycStages";

type KycStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function KycStageRows({
  stages,
  onOpen,
}: {
  stages: KycStage[];
  onOpen: (stage: KycStage) => void;
}) {
  return (
    <ul className="space-y-2">
      {stages.map((stage) => (
        <li
          key={stage.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Tier {stage.tier} · {stage.title}
            </p>
            <p className="text-xs text-muted-foreground">{stage.description}</p>
          </div>
          {stage.status === "complete" ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" /> Done
            </span>
          ) : stage.status === "locked" || !stage.href ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Locked
            </span>
          ) : (
            <Button type="button" size="sm" className="shrink-0 gap-1" onClick={() => onOpen(stage)}>
              {stage.status === "pending" ? (
                <>
                  <Clock className="h-3.5 w-3.5" /> Review
                </>
              ) : (
                <>
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

const KycStatusDialog = ({ open, onOpenChange }: KycStatusDialogProps) => {
  const navigate = useNavigate();
  const { kyc, tier } = useKyc();
  const { data: profile } = useProfile();
  const { isBusiness } = useBusinessAccount();
  const tierNumber = kycTierNumber(tier?.current_tier || profile?.kyc_tier);
  const stages = buildKycStages(tierNumber, kyc as Parameters<typeof buildKycStages>[1]);
  const remaining = remainingKycStages(stages);
  const nextTier = Math.min(3, tierNumber + 1);

  const openStage = (stage: KycStage) => {
    if (!stage.href) return;
    onOpenChange(false);
    navigate(stage.href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>KYC status</DialogTitle>
          <DialogDescription>
            {tierNumber >= 3
              ? "Tier 3 is complete. There are no further verification stages."
              : `You are on Tier ${tierNumber}. Open the remaining stages to reach Tier ${nextTier}.`}
            {isBusiness ? " This is your personal KYC, separate from the business account." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-3 flex items-center gap-1" aria-hidden>
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={`h-1.5 flex-1 rounded-full ${step <= tierNumber ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            {remaining.length === 0 ? "All stages complete" : "Remaining stages"}
          </h3>
          <KycStageRows stages={remaining.length === 0 ? stages : remaining} onOpen={openStage} />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onOpenChange(false);
            navigate("/kyc");
          }}
        >
          View full KYC status
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default KycStatusDialog;
