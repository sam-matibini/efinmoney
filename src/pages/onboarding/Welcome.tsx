import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import OnboardingShell from "@/components/kyc/OnboardingShell";
import { Lock, ShieldCheck, Globe2, ArrowRight, Clock } from "lucide-react";
import { toast } from "sonner";

const Welcome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const begin = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("kyc_verifications")
      .update({ verification_status: "in_progress", current_step: "identity" })
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      toast.error("Could not start verification. Please try again.");
      return;
    }
    navigate("/onboarding/identity");
  };

  return (
    <OnboardingShell
      title="Let's verify your identity"
      subtitle="We need to verify your identity to comply with global regulations and keep eFin Money secure for everyone."
    >
      <Card className="p-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Takes about 5 minutes</p>
          <p className="text-xs text-muted-foreground">Have your ID and a recent utility bill handy.</p>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-4">What you'll do</h3>
        <ol className="space-y-3 text-sm">
          {["Verify your identity", "Confirm your address", "Review and submit"].map((label, i) => (
            <li key={label} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-secondary text-xs font-semibold flex items-center justify-center text-foreground flex-shrink-0">
                {i + 1}
              </span>
              <span className="text-foreground">{label}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Lock, label: "Encrypted" },
          { icon: ShieldCheck, label: "Bank-grade" },
          { icon: Globe2, label: "Compliant" },
        ].map(({ icon: Icon, label }) => (
          <Card key={label} className="p-3 flex flex-col items-center gap-1.5 text-center">
            <Icon className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-foreground">{label}</span>
          </Card>
        ))}
      </div>

      <Button onClick={begin} disabled={busy} size="lg" className="w-full">
        {busy ? "Starting..." : "Begin Verification"}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </OnboardingShell>
  );
};

export default Welcome;
