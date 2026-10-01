import { Navigate, useSearchParams } from "react-router-dom";
import { useBusinessAccount } from "@/hooks/useBusinessAccount";
import LoadingSpinner from "@/components/LoadingSpinner";
import { skipBusinessKycRedirect } from "@/lib/kycStages";

/** Sends company accounts to KYB instead of personal KYC (Persona). */
const RedirectBusinessToKyb = () => {
  const { isBusiness, isLoading, resumePath } = useBusinessAccount();
  const [params] = useSearchParams();
  const allowPersonalUpgrade = skipBusinessKycRedirect(params.get("upgrade"));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner size={80} />
      </div>
    );
  }

  if (isBusiness && !allowPersonalUpgrade) return <Navigate to={resumePath} replace />;
  return null;
};

export default RedirectBusinessToKyb;
