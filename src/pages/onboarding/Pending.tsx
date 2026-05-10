import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import OnboardingShell from "@/components/kyc/OnboardingShell";
import { useAuth } from "@/hooks/useAuth";
import { useKyc } from "@/hooks/useKyc";
import { Clock, CheckCircle2, Mail } from "lucide-react";

const Pending = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { kyc, refetch } = useKyc();

  useEffect(() => {
    // Fast polling fallback
    const t = setInterval(refetch, 3000);
    return () => clearInterval(t);
  }, [refetch]);

  // Realtime subscription: react instantly when admin approves/rejects
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`kyc-status-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "kyc_verifications", filter: `user_id=eq.${user.id}` },
        () => refetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refetch]);

  useEffect(() => {
    if (kyc?.verification_status === "approved") navigate("/onboarding/approved", { replace: true });
    if (kyc?.verification_status === "rejected") navigate("/onboarding/rejected", { replace: true });
  }, [kyc, navigate]);

  const steps = [
    { label: "Document verification" },
    { label: "Address verification" },
    { label: "Account activation" },
  ];

  const personaBanner = (() => {
    if (!kyc) return null;
    if (kyc.persona_decision === "approved") {
      return { tone: "success" as const, text: "Auto-verified by Persona ✓ Awaiting final review" };
    }
    if (kyc.persona_decision === "declined") {
      return { tone: "error" as const, text: kyc.persona_decision_reason || "Automated verification was declined." };
    }
    if (kyc.persona_decision === "needs_review") {
      return { tone: "warn" as const, text: "Manual review in progress" };
    }
    return null;
  })();

  return (
    <OnboardingShell title="We're reviewing your documents" subtitle="This usually takes less than 24 hours. We'll email you when it's done.">
      {personaBanner && (
        <Card
          className={
            personaBanner.tone === "success"
              ? "p-4 border-green-500/30 bg-green-500/5 text-sm"
              : personaBanner.tone === "error"
              ? "p-4 border-red-500/30 bg-red-500/5 text-sm"
              : "p-4 border-amber-500/30 bg-amber-500/5 text-sm"
          }
        >
          {personaBanner.text}
        </Card>
      )}
      <Card className="p-8 flex flex-col items-center text-center">
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4"
        >
          <Clock className="w-9 h-9 text-primary" />
        </motion.div>
        <h2 className="font-semibold text-foreground">Under review</h2>
        <p className="text-sm text-muted-foreground mt-1">Hang tight — we're verifying your information.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold text-foreground text-sm">What happens next</h3>
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-3 text-sm">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span className="text-foreground">{s.label}</span>
          </div>
        ))}
      </Card>

      <Card className="p-4 flex items-center gap-3">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm text-foreground">
          We'll send updates to <span className="font-medium">{user?.email}</span>
        </p>
      </Card>

      <Button variant="outline" className="w-full" onClick={async () => { await signOut(); navigate("/auth"); }}>
        Sign out
      </Button>
    </OnboardingShell>
  );
};

export default Pending;
