import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import CheckoutShell from "@/components/payments/CheckoutShell";
import CheckoutMethodGrid, { type CheckoutMethod } from "@/components/payments/CheckoutMethodGrid";
import VopayInteracPayIn from "@/components/payments/VopayInteracPayIn";
import type { InteracIntent } from "@/components/payments/InteracCheckout";
import { type Lang } from "@/components/payments/checkoutStrings";
import { productFeatures } from "@/lib/productFeatures";

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
 * left = invoice · right = Interac Request Money (VoPay) → Loop Autodeposit.
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
  className,
}: Props) {
  const { user } = useAuth();
  const [langState, setLangState] = useState<Lang>("en");
  const lang = langProp ?? langState;
  const setLang = onLangChange ?? setLangState;

  const [method, setMethod] = useState<CheckoutMethod | null>(null);

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
      {!productFeatures.plaid ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          {lang === "fr"
            ? "Le paiement Interac n'est pas disponible."
            : "Interac pay-in is not available."}
        </div>
      ) : amount < 1 ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          {lang === "fr"
            ? "Montant minimum : 1,00 CAD."
            : "Minimum amount: CAD 1.00."}
        </div>
      ) : method === null ? (
        <CheckoutMethodGrid
          interacAvailable
          plaidAvailable
          cardAvailable={false}
          lang={lang}
          onChange={(m) => setMethod(m === "plaid" ? "interac" : m)}
        />
      ) : (
        <VopayInteracPayIn
          key={`${walletId}-${amount}-${transferId || "topup"}`}
          walletId={walletId}
          amount={amount}
          transferId={transferId}
          purpose={purpose}
          lang={lang}
          autoOpen
          onComplete={onComplete}
        />
      )}
    </CheckoutShell>
  );
}
