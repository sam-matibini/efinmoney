import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { useKyc } from "@/hooks/useKyc";
import PersonaVerification from "@/components/kyc/PersonaVerification";
import InteracVerification from "@/components/kyc/InteracVerification";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowLeft, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Logo, Wordmark } from "@/components/Logo";

const Identity = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { kyc, isVerified, hasPassedCoreChecks, refetch } = useKyc();
  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();
  const autoStartPersona = searchParams.get("autostart") === "persona";

  // Ensure a KYC row exists so subsequent webhook updates attach correctly
  useEffect(() => {
    if (!user) return;
    if (isVerified || hasPassedCoreChecks) return;
    if (kyc?.verification_status && kyc.verification_status !== "not_started") return;

    supabase
      .from("kyc_verifications")
      .upsert(
        { user_id: user.id, current_step: "identity", verification_status: "in_progress" },
        { onConflict: "user_id" }
      )
      .then(() => refetch());
  }, [user, kyc?.verification_status, isVerified, hasPassedCoreChecks, refetch]);

  useEffect(() => {
    if (isVerified || hasPassedCoreChecks) {
      navigate("/dashboard", { replace: true });
    }
  }, [isVerified, hasPassedCoreChecks, navigate]);

  const onPersonaComplete = async (info?: { inquiryId?: string; status?: string }) => {
    const toastId = toast.loading("Finalizing verification…");

    try {
      // Trust our own flow: as soon as Persona's SDK fires onComplete
      // (ID + Face captured), auto-approve in our system. No Persona
      // decision wait — the DB trigger upgrades the user to Tier 3 instantly.
      const { error } = await supabase.functions.invoke("persona-self-approve", {
        body: { inquiryId: info?.inquiryId },
      });
      if (error) throw error;

      if (user) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["kyc", user.id] }),
          queryClient.invalidateQueries({ queryKey: ["risk-tier", user.id] }),
        ]);
      }
      await refetch();
      toast.success("You're verified — welcome!", { id: toastId });
      navigate("/dashboard", { replace: true });
    } catch (e) {
      console.error("Auto-approve failed", e);
      toast.error("Couldn't finalize verification. Please try again.", { id: toastId });
    }
  };





  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => { await signOut(); navigate("/auth"); }}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to sign in
          </Button>
          <div className="flex items-center gap-2">
            <Logo className="w-7 h-7" />
            <Wordmark className="font-black text-base tracking-tight" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Verify your identity</h1>
          <p className="text-sm text-muted-foreground">
            Choose how you'd like to verify. Either method takes about 2 minutes.
          </p>
        </div>

        <Card className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground text-sm">Verify with Persona</h3>
              <p className="text-xs text-muted-foreground">
                Global ID verification with passport, driver's licence or national ID.
              </p>
            </div>
          </div>
          {user && (
            <PersonaVerification
              userId={user.id}
              className="w-full"
              label="Start with Persona"
              autoStart={autoStartPersona}
              onComplete={onPersonaComplete}
              onError={() => toast.error("Persona is temporarily unavailable.")}
            />
          )}
        </Card>

        <Card className="p-5 space-y-3 border-emerald-500/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground text-sm">
                Verify with Interac
                <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                  Canada
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Sign in with your Canadian bank to verify instantly.
              </p>
            </div>
          </div>
          <InteracVerification className="w-full" />
        </Card>
      </div>
    </div>
  );
};

export default Identity;
