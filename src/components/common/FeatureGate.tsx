import type { ReactNode } from "react";
import { isFeatureEnabled, type ProductFeatureKey } from "@/lib/productFeatures";
import ComingSoon, { type ComingSoonProps } from "@/components/common/ComingSoon";

export type FeatureGateProps = {
  feature: ProductFeatureKey;
  children: ReactNode;
  comingSoon?: Partial<ComingSoonProps>;
  /** When true, render nothing instead of Coming Soon */
  hideWhenDisabled?: boolean;
};

const defaultCopy: Partial<Record<ProductFeatureKey, ComingSoonProps>> = {
  canadaDomestic: {
    title: "Canada transfers — coming soon",
    description: "Interac, EFT, and domestic CAD rails are on the roadmap. Nigeria and Ghana are live now.",
  },
  stripe: {
    title: "Card payments — coming soon",
    description: "We're simplifying card funding while we expand payment corridors.",
  },
  flutterwave: {
    title: "Coming soon",
    description: "This corridor will reopen when we expand beyond Nigeria and Ghana.",
  },
  crypto: {
    title: "Crypto — coming soon",
    description: "On-chain swaps and USDC wallets are in development.",
  },
  billPay: {
    title: "Bill pay — coming soon",
    description: "Airtime, utilities, and cable payments will return in a future release.",
  },
  paymentLinks: {
    title: "Payment links — coming soon",
    description: "Shareable payment requests are being redesigned.",
  },
  cards: {
    title: "Cards — coming soon",
    description: "Virtual cards and linked debit cards are not available yet.",
  },
  adyen: {
    title: "Card checkout — coming soon",
    description: "Embedded card payments are disabled while we focus on Nigeria and Ghana rails.",
  },
  otherAfricanCorridors: {
    title: "Corridor coming soon",
    description: "Kenya, Uganda, Tanzania, and more are on the roadmap. Nigeria and Ghana are live today.",
  },
};

const FeatureGate = ({ feature, children, comingSoon, hideWhenDisabled }: FeatureGateProps) => {
  if (isFeatureEnabled(feature)) return <>{children}</>;
  if (hideWhenDisabled) return null;
  return <ComingSoon {...defaultCopy[feature]} {...comingSoon} />;
};

export default FeatureGate;
