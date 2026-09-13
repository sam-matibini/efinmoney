import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import CheckoutShell from "@/components/payments/CheckoutShell";
import PlaidInvoicePayIn from "@/components/payments/PlaidInvoicePayIn";
import { type Lang } from "@/components/payments/checkoutStrings";

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
  /** Plaid `plaid_accounts.id` when the customer already linked a bank. */
  plaidAccountId?: string | null;
  fromBankLabel?: string | null;
  lang?: Lang;
  onLangChange?: (lang: Lang) => void;
  onExit?: () => void;
  onComplete?: () => void;
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
 * CAD bank / Plaid checkout: Loop EFT from the linked account.
 * Does not open Fincra Interac Autodeposit — that rail is Interac-only.
 */
export default function CadBankEftCheckout({
  walletId,
  purpose = "transfer",
  transferId,
  amount,
  lineItem,
  invoiceId,
  payeeName,
  payerName,
  comment,
  plaidAccountId,
  fromBankLabel,
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
        ? "Paiement de transfert — virement TEF"
        : "Transfer payment — bank EFT"
      : lang === "fr"
        ? "Rechargement de portefeuille — virement TEF"
        : "Wallet top-up — bank EFT");

  return (
    <CheckoutShell
      className={className}
      lang={lang}
      onLangChange={setLang}
      onBack={onExit}
      showMethodTitle={false}
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
      ) : (
        <PlaidInvoicePayIn
          walletId={walletId}
          purpose={purpose}
          transferId={transferId}
          amount={amount}
          lang={lang}
          rail="eft"
          existingAccountId={plaidAccountId || undefined}
          fromBankLabel={fromBankLabel || undefined}
          autoOpen={false}
          onComplete={onComplete}
        />
      )}
    </CheckoutShell>
  );
}
