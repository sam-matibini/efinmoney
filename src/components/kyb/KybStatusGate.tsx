import { Navigate } from "react-router-dom";
import { useKyb } from "@/hooks/useKyb";
import { kybPageOverridePath, type KybWizardPage } from "@/lib/kybOnboarding";
import LoadingSpinner from "@/components/LoadingSpinner";

const KybStatusGate = ({ page }: { page: KybWizardPage }) => {
  const { business, isLoading } = useKyb();

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <LoadingSpinner size={64} />
      </div>
    );
  }

  const override = kybPageOverridePath(business, page);
  if (override) return <Navigate to={override} replace />;
  return null;
};

export default KybStatusGate;
