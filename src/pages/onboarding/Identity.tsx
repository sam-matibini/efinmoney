import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { useKyc } from "@/hooks/useKyc";
import PersonaVerification from "@/components/kyc/PersonaVerification";
import InteracVerification from "@/components/kyc/InteracVerification";
import ManualKycForm from "@/components/kyc/ManualKycForm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowLeft, Clock, Upload, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Logo, Wordmark } from "@/components/Logo";

const Identity = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { kyc, isVerified, hasPassedCoreChecks, refetch } = useKyc();
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const autoStartPersona = searchParams.get("autostart") === "persona";
  const [manualOpen, setManualOpen] = useState(searchParams.get("method") === "manual");

  const awaitingReview = kyc?.verification_status === "pending_review";
  const wasRejected = kyc?.verification_status === "rejected";

  // Completion can be signalled more than once (overlapping status polls, a
  // resumed popup). Finalize exactly once. Success is silent — the bell gets a
  // one-time "You're verified" notification from the DB trigger. Only failures
  // toast, pinned to a fixed id so a stray duplicate replaces instead of stacks.
  const finalizingRef = useRef(false);
  const FINALIZE_TOAST_ID = "kyc-finalize";

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

  const openManual = () => {
    setManualOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set("method", "manual");
    next.delete("autostart");
    setSearchParams(next, { replace: true });
  };

  const closeManual = () => {
    setManualOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete("method");
    setSearchParams(next, { replace: true });
  };

  const onPersonaComplete = async (info?: { inquiryId?: string; status?: string }) => {
    // Guard against duplicate completion signals — finalize just once.
    if (finalizingRef.current) return;
    finalizingRef.current = true;

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
      // Silent success — the "You're verified" bell notification (created by the
      // DB trigger on approval) is the only confirmation. No toast.
      navigate("/dashboard", { replace: true });
    } catch (e) {
      console.error("Auto-approve failed", e);
      finalizingRef.current = false; // allow a retry
      toast.error("Couldn't finalize verification. Please try again.", { id: FINALIZE_TOAST_ID });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg space-y-6">
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
            Choose how you'd like to verify. Persona and Interac are instant; document upload is reviewed by our
            compliance team.
          </p>
        </div>

        {wasRejected && !awaitingReview && (
          <Card className="p-4 border-destructive/30 bg-destructive/5">
            <p className="text-sm font-medium text-destructive">We couldn't approve your last submission</p>
            <p className="text-xs text-muted-foreground mt-1">
              {kyc?.id_rejection_reason || "Review the details and try again, or pick a different method."}
            </p>
          </Card>
        )}

        {awaitingReview ? (
          <Card className="p-6 space-y-3 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="font-semibold text-foreground">Waiting for compliance review</h2>
            <p className="text-sm text-muted-foreground">
              {kyc?.verification_provider === "manual"
                ? "Your documents are with our compliance team. We'll email you when the review is complete. Typical turnaround is 1–2 business days."
                : "We're reviewing your verification. We'll email you when there's a decision."}
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/kyc")}>
              View verification status
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
              Back to dashboard
            </Button>
          </Card>
        ) : manualOpen ? (
          <ManualKycForm onBack={closeManual} onSubmitted={() => refetch()} />
        ) : (
          <>
            <Card className="p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-sm">Verify with Persona</h3>
                  <p className="text-xs text-muted-foreground">
                    Global ID verification with passport, driver's licence or national ID. Usually instant.
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

            <Card className="p-5 space-y-3 border-primary/30">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Landmark className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-sm">
                    Verify with Interac
                    <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wide">
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

            <Card className="p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Upload className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-sm">Upload documents for manual review</h3>
                  <p className="text-xs text-muted-foreground">
                    Optional if Persona or Interac isn't available. A compliance officer reviews your ID and selfie
                    in 1–2 business days.
                  </p>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={openManual}>
                Continue with documents
              </Button>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default Identity;
