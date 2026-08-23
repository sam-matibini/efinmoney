import { useState } from "react";
import InteracCheckout from "@/components/payments/InteracCheckout";
import WiseInteracInvoiceCheckout from "@/components/payments/WiseInteracInvoiceCheckout";
import CheckoutShell from "@/components/payments/CheckoutShell";
import { type Lang } from "@/components/payments/checkoutStrings";
import { productFeatures } from "@/lib/productFeatures";

interface Props {
  walletId: string;
  walletCurrency: string;
  initialAmount?: string;
  onComplete?: () => void;
  onExit?: () => void;
}

/**
 * CAD collection via Interac Autodeposit (Flovide / Fincra).
 * Skips the method picker when Interac is the only option.
 */
export default function CadCollectionPanel({ walletId, walletCurrency, initialAmount, onComplete, onExit }: Props) {
  const isCad = walletCurrency.toUpperCase() === "CAD";
  const amount = Number(initialAmount) > 0 ? Number(initialAmount) : 0;
  const interacOn =
    productFeatures.fincraInterac || productFeatures.flovide || productFeatures.flovideInterac;
  const plaidOn = productFeatures.plaid;

  const [lang, setLang] = useState<Lang>("en");

  if (!isCad) {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        CAD collection is only available for CAD wallets.
      </div>
    );
  }

  if (interacOn) {
    const amountLabel = amount > 0 ? `CAD ${amount.toFixed(2)}` : "CAD";

    return (
      <CheckoutShell
        lang={lang}
        onLangChange={setLang}
        onBack={onExit}
        showMethodTitle={false}
        summary={{
          brandName: "eFinMoney",
          payeeName: lang === "fr" ? "Rechargement portefeuille" : "Wallet top-up",
          amountLabel,
          description:
            lang === "fr"
              ? "Envoyez un Virement Interac Autodeposit — votre portefeuille CAD est crédité automatiquement."
              : "Send an Interac Autodeposit e-Transfer — your CAD wallet credits automatically.",
          lineItem: lang === "fr" ? "Rechargement CAD" : "CAD wallet top-up",
        }}
      >
        <InteracCheckout
          walletId={walletId}
          purpose="topup"
          initialAmount={initialAmount}
          lang={lang}
          onComplete={onComplete}
        />
      </CheckoutShell>
    );
  }

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
