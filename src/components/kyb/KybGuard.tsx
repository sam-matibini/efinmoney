import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useKyb } from "@/hooks/useKyb";
import { useUserRoles } from "@/hooks/useUserRoles";
import LoadingSpinner from "@/components/LoadingSpinner";

const Spinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <LoadingSpinner size={120} />
  </div>
);

/**
 * Gates business-only features. Unlike KYCGuard (where individuals get app
 * access on signup and verification only raises limits), an SME cannot
 * transact at all until its KYB is approved — kyb_0 carries zero limits.
 */
const KybGuard = ({ children }: { children: ReactNode }) => {
  const { business, isLoading } = useKyb();
  const { roles, isLoading: rolesLoading } = useUserRoles();

  if (rolesLoading || isLoading) return <Spinner />;

  const isStaff = roles?.some((r) => ["admin", "finance", "compliance"].includes(r));
  if (isStaff) return <>{children}</>;

  if (!business) return <Navigate to="/onboarding/business/details" replace />;

  switch (business.kyb_status) {
    case "approved":
      return <>{children}</>;
    case "pending_review":
      return <Navigate to="/onboarding/business/submitted" replace />;
    case "rejected":
    case "suspended":
      return <Navigate to="/onboarding/business/rejected" replace />;
    default:
      return <Navigate to="/onboarding/business/details" replace />;
  }
};

export default KybGuard;
