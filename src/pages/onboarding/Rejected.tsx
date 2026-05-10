import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import OnboardingShell from "@/components/kyc/OnboardingShell";
import { useAuth } from "@/hooks/useAuth";
import { useKyc } from "@/hooks/useKyc";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const Rejected = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { kyc, refetch } = useKyc();
  const [busy, setBusy] = useState(false);

  const idRejected = !!kyc?.id_rejection_reason;
  const addrRejected = !!kyc?.address_rejection_reason;

  const resubmit = async () => {
    if (!user) return;
    setBusy(true);
    const target = idRejected ? "identity" : "address";
    await supabase
      .from("kyc_verifications")
      .update({ verification_status: "in_progress", current_step: target })
      .eq("user_id", user.id);
    await refetch();
    setBusy(false);
    navigate(`/onboarding/${target}`);
  };

  return (
    <OnboardingShell title="We need a few corrections" subtitle="Your verification couldn't be completed. Please review the details below.">
      <Card className="p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-destructive" />
        </div>
        <div className="flex-1 space-y-3">
          {idRejected && (
            <div>
              <p className="text-sm font-medium text-foreground">Identity document</p>
              <p className="text-sm text-muted-foreground">{kyc?.id_rejection_reason}</p>
            </div>
          )}
          {addrRejected && (
            <div>
              <p className="text-sm font-medium text-foreground">Proof of address</p>
              <p className="text-sm text-muted-foreground">{kyc?.address_rejection_reason}</p>
            </div>
          )}
          {!idRejected && !addrRejected && (
            <p className="text-sm text-muted-foreground">
              Your submission was rejected. Please resubmit your documents.
            </p>
          )}
        </div>
      </Card>

      <Button size="lg" className="w-full" onClick={resubmit} disabled={busy}>
        <RefreshCw className="w-4 h-4 mr-2" />
        {busy ? "Reopening..." : "Resubmit Documents"}
      </Button>

      <a
        href="mailto:support@efinmoney.com"
        className="inline-flex items-center justify-center gap-2 text-sm text-primary hover:underline w-full"
      >
        <Mail className="w-4 h-4" /> Contact support
      </a>
    </OnboardingShell>
  );
};

export default Rejected;
