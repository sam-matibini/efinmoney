import { useState } from "react";
import WiseInteracInvoiceCheckout from "@/components/payments/WiseInteracInvoiceCheckout";
import InteracCheckout from "@/components/payments/InteracCheckout";
import CheckoutMethodGrid, { type CheckoutMethod } from "@/components/payments/CheckoutMethodGrid";
import CheckoutShell from "@/components/payments/CheckoutShell";
import { type Lang } from "@/components/payments/checkoutStrings";
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
 * CAD collection — prefer Fincra Interac when enabled; Flovide / Loop as fallbacks.
 * Wise is offered as a separate top-level Top Up category (not nested here).
 */
export default function CadCollectionPanel({ walletId, walletCurrency, initialAmount, onComplete, onExit }: Props) {
  const isCad = walletCurrency.toUpperCase() === "CAD";
  const amount = Number(initialAmount) > 0 ? Number(initialAmount) : 0;
  const interacOn =
    productFeatures.fincraInterac || productFeatures.flovide || productFeatures.flovideInterac;
  const plaidOn = productFeatures.plaid;

  const [method, setMethod] = useState<CheckoutMethod | null>(null);
  const [lang, setLang] = useState<Lang>("en");

  if (!isCad) {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        CAD collection is only available for CAD wallets.
      </div>
    );
  }

  if (interacOn) {
    const amountLabel = `CAD ${amount.toFixed(2)}`;
    const interacTitle = "Interac";
    const interacDescription = lang === "fr"
      ? "Virement Interac Autodeposit — min. 2,00 $"
      : "Interac Autodeposit e-Transfer — min. CAD 2.00";

    return (
      <CheckoutShell
        lang={lang}
        onLangChange={setLang}
        onBack={method ? () => setMethod(null) : onExit}
        summary={{
          brandName: "eFinMoney",
          payeeName: "eFinMoney wallet top-up",
          amountLabel,
          description: "Funds are credited to your CAD wallet automatically once the deposit arrives.",
          lineItem: `CAD wallet top-up (${walletCurrency.toUpperCase()})`,
        }}
      >
        {method === null ? (
          <CheckoutMethodGrid
            onChange={setMethod}
            interacAvailable={interacOn}
            cardAvailable={false}
            wiseAvailable={false}
            eftAvailable={false}
            interacTitle={interacTitle}
            interacDescription={interacDescription}
            lang={lang}
          />
        ) : (
          <InteracCheckout
            walletId={walletId}
            purpose="topup"
            initialAmount={initialAmount}
            lang={lang}
            onComplete={onComplete}
          />
        )}
      </CheckoutShell>
    );
  }

  // Plaid → Loop Zum-style invoice checkout
  if (plaidOn) {
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

  return (
    <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
      Bank pay-in requires Interac or Plaid for CAD. Contact support if this is unavailable.
    </div>
  );
}
