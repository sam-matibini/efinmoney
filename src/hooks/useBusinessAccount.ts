import { useAuth } from "@/hooks/useAuth";
import { useKyb } from "@/hooks/useKyb";
import { isBusinessPrimaryAccount, kybResumePath } from "@/lib/kybOnboarding";

export function useBusinessAccount() {
  const { user } = useAuth();
  const { business, isLoading, isApproved, isPendingReview, isRejected } = useKyb();
  const isBusiness = isBusinessPrimaryAccount(user, business);

  return {
    isBusiness,
    business,
    isLoading,
    isApproved,
    isPendingReview,
    isRejected,
    resumePath: kybResumePath(business),
  };
}
