import { Navigate, useLocation } from "react-router-dom";
import { useKyc } from "@/hooks/useKyc";
import { ReactNode } from "react";

const Spinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

/**
 * Gates protected app routes behind successful KYC verification.
 * Allows access only when verification_status === 'approved'
 * AND user_risk_tiers.current_tier is tier_2 or higher.
 */
const KYCGuard = ({ children }: { children: ReactNode }) => {
  const { kyc, tier, isLoading, isVerified } = useKyc();
  const location = useLocation();

  if (isLoading) return <Spinner />;

  // No KYC record yet — start fresh
  if (!kyc) return <Navigate to="/onboarding/welcome" replace />;

  switch (kyc.verification_status) {
    case "not_started":
      return <Navigate to="/onboarding/welcome" replace />;
    case "in_progress": {
      const step =
        kyc.current_step === "completed" ? "review" : kyc.current_step || "identity";
      const target = `/onboarding/${step}`;
      if (location.pathname === target) return <>{children}</>;
      return <Navigate to={target} replace />;
    }
    case "pending_review":
      return <Navigate to="/onboarding/pending" replace />;
    case "rejected":
      return <Navigate to="/onboarding/rejected" replace />;
    case "expired":
      return <Navigate to="/onboarding/welcome" replace />;
    case "approved":
      if (isVerified) return <>{children}</>;
      // Approved but tier still tier_1 (edge case) — show pending
      return <Navigate to="/onboarding/pending" replace />;
    default:
      return <Navigate to="/onboarding/welcome" replace />;
  }
};

export default KYCGuard;
