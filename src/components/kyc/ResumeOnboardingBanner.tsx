import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { useKyc, type KycCurrentStep } from "@/hooks/useKyc";

const STEP_ROUTE: Record<KycCurrentStep, string> = {
  identity: "/onboarding/identity",
  address: "/onboarding/address",
  liveness: "/onboarding/review",
  completed: "/onboarding/review",
};

const STEP_LABEL: Record<KycCurrentStep, string> = {
  identity: "identity verification",
  address: "address verification",
  liveness: "review step",
  completed: "review step",
};

const ResumeOnboardingBanner = () => {
  const { kyc, isLoading } = useKyc();
  if (isLoading || !kyc) return null;

  const status = kyc.verification_status;
  // Only show while user is still mid-flow.
  if (status !== "in_progress") return null;

  const step = (kyc.current_step || "identity") as KycCurrentStep;
  const route = STEP_ROUTE[step] || "/onboarding/identity";
  const label = STEP_LABEL[step] || "verification";

  return (
    <Card className="mb-4 p-4 border-amber-500/30 bg-amber-500/5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
        <ShieldAlert className="w-5 h-5 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          Finish your account setup
        </p>
        <p className="text-xs text-muted-foreground">
          You paused at the {label}. Pick up where you left off — it only takes
          a couple of minutes.
        </p>
      </div>
      <Button asChild size="sm">
        <Link to={route}>
          Resume <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </Button>
    </Card>
  );
};

export default ResumeOnboardingBanner;
