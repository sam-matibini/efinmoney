import { Navigate } from "react-router-dom";
import { useBusinessAccount } from "@/hooks/useBusinessAccount";
import LoadingSpinner from "@/components/LoadingSpinner";

/** Sends company accounts to KYB instead of personal KYC (Persona / Interac). */
const RedirectBusinessToKyb = () => {
  const { isBusiness, isLoading, resumePath } = useBusinessAccount();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner size={80} />
      </div>
    );
  }

  if (isBusiness) return <Navigate to={resumePath} replace />;
  return null;
};

export default RedirectBusinessToKyb;
