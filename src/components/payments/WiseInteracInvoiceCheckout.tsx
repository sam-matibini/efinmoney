import { useMemo, useState } from "react";
import { Building2, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import InteracCheckout, { type InteracIntent } from "@/components/payments/InteracCheckout";
import PlaidInvoicePayIn from "@/components/payments/PlaidInvoicePayIn";
import { CHECKOUT_STRINGS, type Lang } from "@/components/payments/checkoutStrings";
import { productFeatures } from "@/lib/productFeatures";
import { LOOP_CAD_EFT, LOOP_CAD_INTERAC_ALIAS } from "@/lib/loopCad";
import { cn } from "@/lib/utils";

type PayMethod = "plaid" | "interac" | "eft";

interface Props {
  walletId: string;
  purpose?: "topup" | "transfer" | "merchant_collection";
  transferId?: string;
  amount: number;
  lineItem: string;
  invoiceId?: string | null;
  lang?: Lang;
  onComplete?: () => void;
  onIntentCreated?: (intent: InteracIntent) => void;
  className?: string;
}

function formatDueDate(d: Date, lang: Lang): string {
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();
}

/**
 * CAD invoice pay-in via Loop Bank:
 * 1) Plaid PAD (default when available)
 * 2) Interac Autodeposit to etx@efin.money (Loop)
 * 3) Bank EFT to Loop (institution / transit / account)
 */
export default function WiseInteracInvoiceCheckout({
  walletId,
  purpose = "transfer",
  transferId,
  amount,
  lineItem,
  invoiceId,
  lang = "en",
  onComplete,
  onIntentCreated,
  className,
}: Props) {
  const t = CHECKOUT_STRINGS[lang];
  const plaidOn = productFeatures.plaid;
  const defaultMethod: PayMethod = plaidOn ? "plaid" : "interac";
  const [phase, setPhase] = useState<"invoice" | "checkout">("invoice");
  const [method, setMethod] = useState<PayMethod>(defaultMethod);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(invoiceId ?? null);

  const amountLabel = useMemo(() => {
    const n = Number(amount);
    return `$${(Number.isFinite(n) ? n : 0).toFixed(2)} CAD`;
  }, [amount]);

  const dueLabel = useMemo(() => {
    const due = new Date();
    due.setHours(due.getHours() + 48);
    return formatDueDate(due, lang);
  }, [lang]);

  const tabs: Array<{ id: PayMethod; label: string; icon: React.ReactNode; show: boolean }> = [
    { id: "plaid", label: t.plaid, icon: <Building2 className="h-3.5 w-3.5" />, show: plaidOn },
    { id: "interac", label: t.interac, icon: <Send className="h-3.5 w-3.5" />, show: true },
    { id: "eft", label: t.eft, icon: <Building2 className="h-3.5 w-3.5" />, show: true },
  ];

  return (
    <div className={cn("mx-auto w-full max-w-md rounded-xl border bg-card px-5 py-8", className)}>
      <div className="space-y-1 text-center">
        <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground sm:text-4xl">
          {amountLabel}
        </p>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {lang === "fr" ? "Date d'échéance" : "Due Date"}: {dueLabel}
        </p>
        {activeInvoiceId && (
          <p className="break-all pt-2 text-[11px] text-muted-foreground/80">
            {lang === "fr" ? "N° de facture" : "Invoice ID"}: {activeInvoiceId}
          </p>
        )}
      </div>

      <div className="mt-8 flex items-start justify-between gap-3 border-y py-4">
        <div className="min-w-0 text-left">
          <p className="text-sm font-semibold text-foreground">{lineItem}</p>
          <p className="text-xs text-muted-foreground">Qty: 1</p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">{amountLabel}</p>
      </div>

      {phase === "invoice" ? (
        <div className="mt-8 space-y-5">
          <Button
            type="button"
            className="h-12 w-full text-base font-semibold"
            onClick={() => {
              setMethod(defaultMethod);
              setPhase("checkout");
            }}
          >
            {t.pay(amountLabel)}
            <Lock className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {plaidOn
              ? lang === "fr"
                ? "Par défaut : banque via Plaid. Sinon Interac / TEF vers Loop Bank."
                : "Default: bank via Plaid. Or Interac / EFT to Loop Bank."
              : lang === "fr"
                ? "Interac Autodeposit ou TEF vers Loop Bank."
                : "Interac Autodeposit or EFT to Loop Bank."}
          </p>
          <p className="text-center text-sm text-muted-foreground">
            {lang === "fr" ? "Merci de votre confiance" : "Thank you for your business"}
          </p>
          <p className="text-center text-[11px] text-muted-foreground">{t.poweredBy}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-1.5 rounded-lg border p-1">
            {tabs
              .filter((tab) => tab.show)
              .map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMethod(tab.id)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors",
                    method === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
          </div>

          {method === "plaid" && (
            <PlaidInvoicePayIn
              walletId={walletId}
              amount={amount}
              transferId={transferId}
              purpose={purpose}
              lang={lang}
              onComplete={onComplete}
            />
          )}

          {(method === "interac" || method === "eft") && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {method === "eft"
                  ? lang === "fr"
                    ? `TEF vers Loop Bank — Institution ${LOOP_CAD_EFT.bankNumber}, transit ${LOOP_CAD_EFT.transitNumber}, compte ${LOOP_CAD_EFT.accountNumber}. Incluez la référence dans le mémo.`
                    : `EFT to Loop Bank — Institution ${LOOP_CAD_EFT.bankNumber}, transit ${LOOP_CAD_EFT.transitNumber}, account ${LOOP_CAD_EFT.accountNumber}. Include the reference in the memo.`
                  : lang === "fr"
                    ? `Autodeposit Loop uniquement (${LOOP_CAD_INTERAC_ALIAS}). Copiez les détails et envoyez depuis votre app bancaire.`
                    : `Loop Autodeposit only (${LOOP_CAD_INTERAC_ALIAS}). Copy the details and send from your banking app.`}
              </p>
              {plaidOn && (
                <button
                  type="button"
                  className="text-xs font-medium text-primary underline"
                  onClick={() => setMethod("plaid")}
                >
                  {lang === "fr"
                    ? "Préférez Plaid pour éviter les blocages bancaires →"
                    : "Prefer Plaid to avoid bank blocks →"}
                </button>
              )}
              <InteracCheckout
                walletId={walletId}
                purpose={purpose}
                transferId={transferId}
                fixedAmount={amount}
                resumePending={false}
                lang={lang}
                onComplete={onComplete}
                onIntentCreated={(intent) => {
                  setActiveInvoiceId(intent.public_id || intent.reference || intent.id);
                  onIntentCreated?.(intent);
                }}
              />
            </div>
          )}

          <p className="pt-1 text-center text-[11px] text-muted-foreground">{t.poweredBy}</p>
        </div>
      )}
    </div>
  );
}
