import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { isFeatureEnabled, type ProductFeatureKey } from "@/lib/productFeatures";

type GatedPageProps = {
  feature: ProductFeatureKey;
  children: ReactNode;
  comingSoon?: unknown;
};

/** Full-page gate: disabled features redirect home (no "coming soon" UI). */
const GatedPage = ({ feature, children }: GatedPageProps) => {
  if (!isFeatureEnabled(feature)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export default GatedPage;
