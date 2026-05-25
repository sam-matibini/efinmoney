import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useKyc } from "@/hooks/useKyc";
import PersonaVerification from "@/components/kyc/PersonaVerification";
import { Card } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Logo, Wordmark } from "@/components/Logo";

const Identity = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refetch } = useKyc();

  // Ensure a KYC row exists so subsequent updates from the webhook attach correctly
  useEffect(() => {
    if (!user) return;
    supabase
      .from("kyc_verifications")
      .upsert(
        { user_id: user.id, current_step: "identity", verification_status: "in_progress" },
        { onConflict: "user_id" }
      )
      .then(() => refetch());
  }, [user, refetch]);

  const onPersonaComplete = async () => {
    if (user) {
      await supabase
        .from("kyc_verifications")
        .upsert(
          { user_id: user.id, current_step: "completed", verification_status: "pending_review" },
          { onConflict: "user_id" }
        );
    }
    await refetch();
    toast.success("Verification submitted — welcome!");
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <Logo className="w-8 h-8" />
          <Wordmark className="font-black text-lg tracking-tight" />
        </div>
        <Card className="p-6 space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground">Verify your identity</h1>
            <p className="text-sm text-muted-foreground mt-1">
              We're opening a secure verification window. Follow the prompts to finish.
            </p>
          </div>
          {user && (
            <PersonaVerification
              userId={user.id}
              className="w-full"
              label="Open verification"
              autoStart
              onComplete={onPersonaComplete}
              onError={() => toast.error("Verification was interrupted. Tap to retry.")}
            />
          )}
        </Card>
      </div>
    </div>
  );
};

export default Identity;
