import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useKyc } from "@/hooks/useKyc";
import { useNavigate } from "react-router-dom";
import { Clock, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { useBusinessAccount } from "@/hooks/useBusinessAccount";

const KYCStatusCard = () => {
  const { kyc, isLoading } = useKyc();
  const { isBusiness } = useBusinessAccount();
  const navigate = useNavigate();

  if (isBusiness) return null;
  if (isLoading || !kyc) return null;
  if (kyc.verification_status === "approved" || kyc.verification_status === "pending_review") return null;

  const cfg = (() => {
    switch (kyc.verification_status) {

      case "rejected":
        return {
          icon: AlertTriangle,
          color: "text-destructive",
          title: "Action needed",
          message: "We need a few corrections to your documents.",
          cta: "Review issues",
          to: "/onboarding/rejected",
        };
      case "in_progress":
        return {
          icon: ShieldCheck,
          color: "text-primary",
          title: "Continue verification",
          message: "Pick up where you left off.",
          cta: "Resume",
          to: `/onboarding/${kyc.current_step === "completed" ? "review" : kyc.current_step}`,
        };
      default:
        return {
          icon: CheckCircle2,
          color: "text-primary",
          title: "Verify your account",
          message: "Verify your identity to unlock the full eFin Money experience.",
          cta: "Start verification",
          to: "/onboarding/welcome",
        };
    }
  })();

  const Icon = cfg.icon;

  return (
    <Card className="p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
        <Icon className={`w-6 h-6 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-foreground">{cfg.title}</h3>
          <Badge variant="outline" className="capitalize">
            {kyc.verification_status.replace("_", " ")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{cfg.message}</p>
      </div>
      <Button onClick={() => navigate(cfg.to)} size="sm">
        {cfg.cta}
      </Button>
    </Card>
  );
};

export default KYCStatusCard;
