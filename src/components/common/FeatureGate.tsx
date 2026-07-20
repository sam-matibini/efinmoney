import type { ReactNode } from "react";
import { isFeatureEnabled, type ProductFeatureKey } from "@/lib/productFeatures";

export type FeatureGateProps = {
  feature: ProductFeatureKey;
  children: ReactNode;
  /** @deprecated Disabled features are hidden; kept for call-site compatibility */
  comingSoon?: unknown;
  /** @deprecated Always hidden when disabled */
  hideWhenDisabled?: boolean;
};

/** Renders children only when the feature flag is on; otherwise renders nothing. */
const FeatureGate = ({ feature, children }: FeatureGateProps) => {
  if (isFeatureEnabled(feature)) return <>{children}</>;
  return null;
};

export default FeatureGate;
