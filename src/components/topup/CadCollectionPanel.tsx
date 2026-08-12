import { useState } from "react";
import InteracCheckout from "@/components/payments/InteracCheckout";
import WiseInteracInvoiceCheckout from "@/components/payments/WiseInteracInvoiceCheckout";
import PlaidInvoicePayIn from "@/components/payments/PlaidInvoicePayIn";
import SquareTopUpCard from "@/components/payments/SquareTopUpCard";
import { productFeatures } from "@/lib/productFeatures";
import { LOOP_CAD_EFT, LOOP_CAD_INTERAC_ALIAS } from "@/lib/loopCad";

import CheckoutMethodGrid, { type CheckoutMethod } from "@/components/payments/CheckoutMethodGrid";
import CheckoutShell from "@/components/payments/CheckoutShell";
import { type Lang } from "@/components/payments/checkoutStrings";

interface Props {
  walletId: string;
  walletCurrency: string;
  initialAmount?: string;
  onComplete?: () => void;
}

/**
 * Hosted CAD collection checkout via Loop Bank (Interac Autodeposit + EFT).
 */
export default function CadCollectionPanel({ walletId, walletCurrency, initialAmount, onComplete }: Props) {
  const [method, setMethod] = useState<CheckoutMethod | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const isCad = walletCurrency.toUpperCase() === "CAD";
  const cardAvailable = productFeatures.square
    && ["USD", "CAD", "EUR", "GBP"].includes(walletCurrency.toUpperCase());

  const amount = Number(initialAmount) > 0 ? Number(initialAmount) : 0;
  const amountLabel = `CAD ${amount.toFixed(2)}`;
  const plaidAvailable = isCad && productFeatures.plaid;

  return (
    <CheckoutShell
      lang={lang}
      onLangChange={setLang}
      onBack={method ? () => setMethod(null) : undefined}
      summary={{
        payeeName: "eFinMoney wallet top-up",
        amountLabel,
        description: "Funds are credited to your CAD wallet once we match your Loop Bank deposit.",
        lineItem: `CAD wallet top-up${walletCurrency ? ` (${walletCurrency.toUpperCase()})` : ""}`,
      }}
    >
      {method === null ? (
        <CheckoutMethodGrid
          amountLabel={amount > 0 ? amountLabel : undefined}
          value={plaidAvailable ? "plaid" : cardAvailable ? "card" : "interac"}
          onChange={setMethod}
          interacAvailable={isCad}
          eftAvailable={isCad}
          cardAvailable={cardAvailable}
          plaidAvailable={plaidAvailable}
          wiseAvailable={false}
          lang={lang}
        />
      ) : method === "plaid" ? (
        amount > 0 ? (
          <PlaidInvoicePayIn
            walletId={walletId}
            amount={amount}
            purpose="topup"
            lang={lang}
            onComplete={onComplete}
          />
        ) : (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            Enter an amount first, then link your bank with Plaid.
          </div>
        )
      ) : method === "card" ? (
        <SquareTopUpCard
          walletId={walletId}
          walletCurrency={walletCurrency}
          initialAmount={initialAmount}
          embedded
          onComplete={onComplete}
        />
      ) : method === "interac" || method === "eft" ? (
        amount > 0 ? (
          <WiseInteracInvoiceCheckout
            walletId={walletId}
            purpose="topup"
            amount={amount}
            lineItem="eFinMoney CAD wallet top-up"
            lang={lang}
            onComplete={onComplete}
          />
        ) : method === "eft" ? (
          <div className="space-y-3 rounded-lg border p-4 text-sm">
            <p className="font-medium">Loop Bank EFT deposit</p>
            <p className="text-muted-foreground text-xs">
              Enter an amount above, then continue — or send CAD EFT to:
            </p>
            <ul className="space-y-1 font-mono text-xs">
              <li>Institution: {LOOP_CAD_EFT.bankNumber}</li>
              <li>Transit: {LOOP_CAD_EFT.transitNumber}</li>
              <li>Account: {LOOP_CAD_EFT.accountNumber}</li>
              <li>Interac Autodeposit: {LOOP_CAD_INTERAC_ALIAS}</li>
            </ul>
          </div>
        ) : (
          <InteracCheckout
            walletId={walletId}
            purpose="topup"
            initialAmount={initialAmount}
            lang={lang}
            onComplete={onComplete}
          />
        )
      ) : (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          This payment method is not available for CAD. Use Interac, EFT, or Plaid.
        </div>
      )}
    </CheckoutShell>
  );
}
