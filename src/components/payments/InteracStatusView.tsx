import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, ShieldCheck } from "lucide-react";
import { CHECKOUT_STRINGS, type Lang } from "@/components/payments/checkoutStrings";
import type { InteracIntent } from "@/components/payments/InteracCheckout";
import { validateInteracConfirm } from "@/lib/interacConfirm";
import { LOOP_CAD_EFT, type LoopCadEft } from "@/lib/loopCad";
import { FINCRA_CAD_INTERAC_ALIAS } from "@/lib/fincraCad";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type InteracRailVariant = "flovide" | "loop" | "fincra";

interface Props {
  intent: InteracIntent;
  alias: string | null;
  eft?: LoopCadEft | null;
  lang: Lang;
  purpose: "topup" | "transfer" | "merchant_collection";
  done: boolean;
  variant?: InteracRailVariant;
  /** Cancel this request and return to the amount form. */
  onChangeAmount?: () => void;
  changingAmount?: boolean;
  /** Submit Interac confirmation (reference + matching amount + qty 1) and close checkout. */
  onCompletePayment?: (confirmation: {
    interacReference: string;
    amountTransferred: number;
    qty: number;
  }) => void;
  completing?: boolean;
  completeError?: string | null;
}

/**
 * Autodeposit wait screen: amount, alias, reference + auto-confirm messaging.
 */
export default function InteracStatusView({
  intent,
  alias,
  eft,
  lang,
  purpose,
  done,
  variant = "loop",
  onChangeAmount,
  changingAmount = false,
  onCompletePayment,
  completing = false,
  completeError = null,
}: Props) {
  const t = CHECKOUT_STRINGS[lang];
  const [bankRef, setBankRef] = useState("");
  const [amountTransferred, setAmountTransferred] = useState("");
  const [qty, setQty] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const reference = intent.public_id || intent.reference;
  const amountLabel = `CAD ${Number(intent.amount).toFixed(2)}`;
  const eftDetails = eft ?? LOOP_CAD_EFT;
  const isFlovide = variant === "flovide";
  const isFincra = variant === "fincra";
  const showEft = !isFlovide && !isFincra;
  const sendTo = alias || (isFincra ? FINCRA_CAD_INTERAC_ALIAS : isFlovide ? "efin@flovide.com" : null);
  const fr = lang === "fr";

  const detailsText = [
    `Amount: ${amountLabel}`,
    sendTo ? `Interac email: ${sendTo}` : null,
    `Payment code: ${reference}`,
    ...(showEft
      ? [
          "",
          "EFT / bank transfer:",
          `Institution: ${eftDetails.bankNumber}`,
          `Transit: ${eftDetails.transitNumber}`,
          `Account: ${eftDetails.accountNumber}`,
        ]
      : []),
  ]
    .filter((line) => line !== null)
    .join("\n");

  const copyText = async (value: string, ok: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(ok);
  };

  const copyDetails = async () => {
    await navigator.clipboard.writeText(detailsText);
    toast.success(fr ? "Détails copiés" : "Payment details copied");
  };

  if (done) {
    return (
      <div className="space-y-3 py-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <div className="space-y-1">
          <p className="text-lg font-semibold tracking-tight">
            {amountLabel} — {t.received}
          </p>
          <p className="text-sm text-muted-foreground">
            {purpose === "transfer"
              ? fr
                ? "Votre transfert est en cours d'envoi."
                : "Your transfer is being sent now."
              : fr
                ? "Votre portefeuille CAD est crédité."
                : "Your CAD wallet is credited."}
          </p>
        </div>
      </div>
    );
  }

  const steps = fr
    ? [
        `Ouvrez votre app bancaire et démarrez un Virement Interac.`,
        `Envoyez exactement ${amountLabel} à l'adresse Interac ci-dessous.`,
        `Collez le code de paiement dans le message. Autodeposit est activé — aucune question de sécurité.`,
        `Confirmez avec le numéro de référence Interac, le montant transféré (${amountLabel}) et la quantité 1, puis Terminer.`,
      ]
    : [
        `Open your banking app and start an Interac e-Transfer.`,
        `Send exactly ${amountLabel} to the Interac email below.`,
        `Paste the payment code in the message field. Autodeposit is on — no security question.`,
        `Confirm with the Interac reference, the amount transferred (${amountLabel}), and qty 1, then tap Complete.`,
      ];

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2.5">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-emerald-700" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-emerald-900">
            {fr ? "En attente de votre Virement Interac…" : "Waiting for your Interac e-Transfer…"}
          </p>
          <p className="text-[12px] leading-relaxed text-emerald-800/90">
            {fr
              ? "Après l'envoi, confirmez avec le numéro de référence, le montant transféré et la quantité 1, puis Terminer."
              : "After you send, confirm with the Interac reference, amount transferred, and qty 1, then tap Complete."}
          </p>
        </div>
      </div>

      <ol className="space-y-2 text-[13px] leading-snug text-muted-foreground">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
              {i + 1}
            </span>
            <span className="pt-0.5 text-foreground/90">{step}</span>
          </li>
        ))}
      </ol>

      <div className="w-full min-w-0 overflow-hidden rounded-lg border">
        <div className="space-y-1">
          <CopyRow
            label={t.amountDue}
            value={amountLabel}
            onCopy={() =>
              void copyText(
                Number(intent.amount).toFixed(2),
                fr ? "Montant copié" : "Amount copied",
              )
            }
          />
          {sendTo ? (
            <CopyRow
              label={t.sendTo}
              value={sendTo}
              emphasize
              onCopy={() =>
                void copyText(sendTo, fr ? "Adresse copiée" : "Send-to address copied")
              }
            />
          ) : null}
          <CopyRow
            label={t.reference}
            value={reference}
            emphasize
            onCopy={() =>
              void copyText(reference, fr ? "Référence copiée" : "Reference copied")
            }
          />
        </div>
        <div className="border-t p-3">
          <Button type="button" className="w-full" onClick={() => void copyDetails()}>
            <Copy className="mr-2 h-4 w-4" />
            {t.paymentDetails}
          </Button>
        </div>
      </div>

      {onCompletePayment && (
        <form
          className="space-y-3 rounded-lg border border-pay-bank/30 bg-pay-bank/5 p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            const result = validateInteracConfirm(
              {
                interacReference: bankRef,
                amountTransferredRaw: amountTransferred,
                qtyRaw: qty,
                checkoutAmount: Number(intent.amount),
              },
              lang,
            );
            if (!result.ok) {
              setConfirmError(result.error);
              toast.error(result.error);
              return;
            }
            setConfirmError(null);
            onCompletePayment({
              interacReference: result.interacReference,
              amountTransferred: result.amountTransferred,
              qty: result.qty,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="interac-bank-ref">{t.interacBankRef}</Label>
            <Input
              id="interac-bank-ref"
              value={bankRef}
              onChange={(e) => {
                setBankRef(e.target.value);
                setConfirmError(null);
              }}
              placeholder={t.interacBankRefPlaceholder}
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              disabled={completing}
              className="font-mono tracking-wide"
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t.interacBankRefHint}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem]">
            <div className="space-y-1.5">
              <Label htmlFor="interac-amount-transferred">{t.interacAmountTransferred}</Label>
              <Input
                id="interac-amount-transferred"
                inputMode="decimal"
                value={amountTransferred}
                onChange={(e) => {
                  setAmountTransferred(e.target.value);
                  setConfirmError(null);
                }}
                placeholder={t.interacAmountTransferredPlaceholder}
                autoComplete="off"
                disabled={completing}
                className="tabular-nums"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t.interacAmountTransferredHint(amountLabel)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interac-qty">{t.interacQty}</Label>
              <Input
                id="interac-qty"
                inputMode="numeric"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setConfirmError(null);
                }}
                placeholder="1"
                autoComplete="off"
                disabled={completing}
                className="tabular-nums"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t.interacQtyHint}</p>
            </div>
          </div>
          {(confirmError || completeError) ? (
            <p className="text-sm text-destructive">{confirmError || completeError}</p>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={completing || !bankRef.trim() || !amountTransferred.trim() || !qty.trim()}
          >
            {completing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t.interacComplete}
          </Button>
        </form>
      )}

      {showEft && (
        <div className="w-full min-w-0 space-y-2 rounded-lg border p-3 text-sm">
          <p className="text-xs font-medium text-foreground">{t.eftHint}</p>
          <Detail label={t.bankNumber} value={eftDetails.bankNumber} />
          <Detail label={t.transitNumber} value={eftDetails.transitNumber} />
          <Detail label={t.accountNumber} value={eftDetails.accountNumber} />
        </div>
      )}

      {onChangeAmount && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={changingAmount}
            onClick={() => onChangeAmount()}
          >
            {changingAmount ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {fr ? "Annuler et changer le montant" : "Cancel and change amount"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {fr
              ? "Cela annule cette demande. N'envoyez plus ce montant avec cette référence."
              : "This cancels this request. Don't send this amount with this reference."}
          </p>
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        {fr
          ? "Confirmez la référence, le montant et la quantité 1, puis Terminer"
          : "Confirm the reference, amount transferred, and qty 1, then Complete"}
      </p>
    </div>
  );
}

function CopyRow({
  label,
  value,
  emphasize,
  onCopy,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  onCopy: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b px-3.5 py-3 last:border-b-0",
        emphasize && "bg-muted/40",
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={cn(
            "break-words font-medium text-foreground [overflow-wrap:anywhere]",
            emphasize && "font-semibold",
          )}
        >
          {value}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onCopy}
        aria-label={`Copy ${label}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words font-medium text-foreground [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}
