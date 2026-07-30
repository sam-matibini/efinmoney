import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { isFeatureEnabled, type ProductFeatureKey } from "@/lib/productFeatures";
import ComingSoon from "@/components/common/ComingSoon";

type GatedPageProps = {
  feature: ProductFeatureKey;
  children: React.ReactNode;
  comingSoon?: boolean;
};

const GatedPage = ({ feature, children, comingSoon }: GatedPageProps) => {
  const disabled = !isFeatureEnabled(feature);

  useEffect(() => {
    if (disabled && !comingSoon) {
      toast.error("This feature is currently unavailable.");
    }
  }, [disabled, comingSoon]);

  if (!disabled) return <>{children}</>;
  if (comingSoon) return <ComingSoon />;
  return <Navigate to="/" replace />;
};

export default GatedPage;
