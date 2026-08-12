import WiseInteracInvoiceCheckout from "@/components/payments/WiseInteracInvoiceCheckout";
import { productFeatures } from "@/lib/productFeatures";

interface Props {
  walletId: string;
  walletCurrency: string;
  initialAmount?: string;
  onComplete?: () => void;
  /** Leave Interac checkout (e.g. change top-up method). */
  onExit?: () => void;
}

/**
 * CAD collection — Zum-style invoice + Interac (auto-open bank login) → Loop Bank.
 */
export default function CadCollectionPanel({ walletId, walletCurrency, initialAmount, onComplete, onExit }: Props) {
  const isCad = walletCurrency.toUpperCase() === "CAD";
  const amount = Number(initialAmount) > 0 ? Number(initialAmount) : 0;

  if (!isCad || !productFeatures.plaid) {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        Bank pay-in requires Plaid for CAD. Contact support if this is unavailable.
      </div>
    );
  }

  return (
    <WiseInteracInvoiceCheckout
      walletId={walletId}
      purpose="topup"
      amount={amount}
      lineItem="eFinMoney CAD wallet top-up"
      payeeName="eFinMoney"
      comment="Thank you for your business"
      onComplete={onComplete}
      onExit={onExit}
    />
  );
}
