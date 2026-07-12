import type { ReactNode } from "react";
import FeatureGate from "@/components/common/FeatureGate";
import type { ComingSoonProps } from "@/components/common/ComingSoon";
import type { ProductFeatureKey } from "@/lib/productFeatures";

type GatedPageProps = {
  feature: ProductFeatureKey;
  children: ReactNode;
  comingSoon?: Partial<ComingSoonProps>;
};

/** Full-page feature gate for routed screens */
const GatedPage = ({ feature, children, comingSoon }: GatedPageProps) => (
  <main className="container px-4 py-6 max-w-2xl mx-auto">
    <FeatureGate feature={feature} comingSoon={comingSoon}>
      {children}
    </FeatureGate>
  </main>
);

export default GatedPage;
