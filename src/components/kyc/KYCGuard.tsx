import { Navigate, useLocation } from "react-router-dom";
import { useKyc } from "@/hooks/useKyc";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useProfile } from "@/hooks/useProfile";
import { ReactNode } from "react";

const Spinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

/**
 * Gates protected app routes.
 *
 * v2 (3-tier framework, new users): Tier 1 is granted on signup and gives full
 *   app access. Verification is *optional* and only required to raise limits.
 *   We never bounce v2 users to /onboarding.
 *
 * v1 (legacy): keeps the original behavior — must be approved (or pass core
 *   Persona checks) to enter the app.
 */
const KYCGuard = ({ children }: { children: ReactNode }) => {
  const { kyc, isLoading, isVerified, hasPassedCoreChecks } = useKyc();
  const { roles, isLoading: rolesLoading } = useUserRoles();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const location = useLocation();

  if (isLoading || rolesLoading || profileLoading) return <Spinner />;

  // Staff roles bypass KYC entirely
  const isStaff = roles?.some((r) => ["admin", "finance", "compliance"].includes(r));
  if (isStaff) return <>{children}</>;

  // New 3-tier framework: never block app access at the route level.
  // Limit enforcement happens at action time via tierLimits helpers.
  if ((profile?.kyc_framework_version ?? 2) >= 2) return <>{children}</>;

  // ---- Legacy v1 flow ----
  if (!kyc) return <Navigate to="/onboarding/welcome" replace />;
  if (isVerified || hasPassedCoreChecks) return <>{children}</>;

  switch (kyc.verification_status) {
    case "not_started":
      return <Navigate to="/onboarding/identity" replace />;
    case "in_progress": {
      if (kyc.persona_inquiry_id) return <>{children}</>;
      const target = "/onboarding/identity";
      if (location.pathname === target) return <>{children}</>;
      return <Navigate to={target} replace />;
    }
    case "pending_review":
      return <Spinner />;
    case "rejected":
      return <Navigate to="/onboarding/rejected" replace />;
    case "expired":
      return <Navigate to="/onboarding/welcome" replace />;
    case "approved":
      return <>{children}</>;
    default:
      return <Navigate to="/onboarding/welcome" replace />;
  }
};

export default KYCGuard;
