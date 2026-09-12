import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import CheckoutShell from "@/components/payments/CheckoutShell";
import CheckoutMethodGrid, { type CheckoutMethod } from "@/components/payments/CheckoutMethodGrid";
import InteracCheckout from "@/components/payments/InteracCheckout";
import LoopBillingPayPanel from "@/components/payments/LoopBillingPayPanel";
import type { InteracIntent } from "@/components/payments/InteracCheckout";
import { type Lang } from "@/components/payments/checkoutStrings";
import { loopBillingLinkConfigured } from "@/lib/loopCad";
import { productFeatures } from "@/lib/productFeatures";
import { FINCRA_CAD_INTERAC_ALIAS } from "@/lib/fincraCad";

interface Props {
  walletId: string;
  purpose?: "topup" | "transfer" | "merchant_collection";
  transferId?: string;
  amount: number;
  lineItem: string;
  invoiceId?: string | null;
  payeeName?: string | null;
  payerName?: string | null;
  comment?: string | null;
  lang?: Lang;
  onLangChange?: (lang: Lang) => void;
  /** Leave checkout entirely (change funding / restart transfer). */
  onExit?: () => void;
  onComplete?: () => void;
  onIntentCreated?: (intent: InteracIntent) => void;
  className?: string;
}

function formatInvoiceDate(d: Date, lang: Lang): string {
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Zum-style CAD invoice checkout:
 * left = invoice · right = Interac Autodeposit push and optional Loop Billing link.
 */
export default function WiseInteracInvoiceCheckout({
  walletId,
  purpose = "transfer",
  transferId,
  amount,
  lineItem,
  invoiceId,
  payeeName,
  payerName,
  comment,
  lang: langProp,
  onLangChange,
  onExit,
  onComplete,
  onIntentCreated,
  className,
}: Props) {
  const { user } = useAuth();
  const [langState, setLangState] = useState<Lang>("en");
  const lang = langProp ?? langState;
  const setLang = onLangChange ?? setLangState;

  const showLoopBilling = !productFeatures.fincraInterac && loopBillingLinkConfigured();
  const fincraOn = productFeatures.fincraInterac;
  const [method, setMethod] = useState<CheckoutMethod | null>(
    fincraOn || !loopBillingLinkConfigured() ? "interac" : null,
  );
  const interacTitle = fincraOn ? "Interac e-Transfer" : undefined;
  const interacDescription = fincraOn
    ? lang === "fr"
      ? `Virement Autodeposit vers ${FINCRA_CAD_INTERAC_ALIAS}`
      : `Send Interac Autodeposit to ${FINCRA_CAD_INTERAC_ALIAS}`
    : undefined;

  const amountLabel = useMemo(() => {
    const n = Number(amount);
    return `$${(Number.isFinite(n) ? n : 0).toFixed(2)} CAD`;
  }, [amount]);

  const invoiceDate = useMemo(() => formatInvoiceDate(new Date(), lang), [lang]);
  const resolvedInvoiceId = invoiceId || transferId || null;

  const resolvedPayee =
    payeeName ||
    (purpose === "topup"
      ? "eFinMoney"
      : lang === "fr"
        ? "Portefeuille eFinMoney"
        : "eFinMoney wallet");

  const resolvedPayer =
    payerName ||
    String(user?.user_metadata?.full_name || user?.email || (lang === "fr" ? "Vous" : "You"));

  const resolvedComment =
    comment ||
    (purpose === "transfer"
      ? lang === "fr"
        ? "Paiement de transfert"
        : "Transfer payment"
      : lang === "fr"
        ? "Rechargement de portefeuille"
        : "Wallet top-up");

  const handleBack = () => {
    if (method) {
      setMethod(null);
      return;
    }
    onExit?.();
  };

  return (
    <CheckoutShell
      className={className}
      lang={lang}
      onLangChange={setLang}
      onBack={method || onExit ? handleBack : undefined}
      showMethodTitle={method === null}
      summary={{
        brandName: "eFinMoney",
        payeeName: resolvedPayee,
        payerName: resolvedPayer,
        comment: resolvedComment,
        amountLabel,
        invoiceId: resolvedInvoiceId,
        invoiceDate,
        lineItem,
      }}
    >
      {amount < 1 ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          {lang === "fr"
            ? "Montant minimum : 1,00 CAD."
            : "Minimum amount: CAD 1.00."}
        </div>
      ) : method === null ? (
        <CheckoutMethodGrid
          interacAvailable
          loopBillingAvailable={showLoopBilling}
          cardAvailable={false}
          lang={lang}
          onChange={setMethod}
          interacTitle={interacTitle}
          interacDescription={interacDescription}
        />
      ) : method === "loop_billing" ? (
        <LoopBillingPayPanel
          amount={amount}
          reference={resolvedInvoiceId}
          lang={lang}
        />
      ) : (
        <InteracCheckout
          key={`${walletId}-${amount}-${transferId || "topup"}`}
          walletId={walletId}
          purpose={purpose}
          transferId={transferId}
          fixedAmount={amount}
          lang={lang}
          onComplete={onComplete}
          onIntentCreated={onIntentCreated}
        />
      )}
    </CheckoutShell>
  );
}
