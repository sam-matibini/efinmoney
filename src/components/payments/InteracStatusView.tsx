import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { CHECKOUT_STRINGS, type Lang } from "@/components/payments/checkoutStrings";
import type { InteracIntent } from "@/components/payments/InteracCheckout";
import { LOOP_CAD_EFT, type LoopCadEft } from "@/lib/loopCad";

export type InteracRailVariant = "flovide" | "loop" | "fincra";

interface Props {
  intent: InteracIntent;
  alias: string | null;
  eft?: LoopCadEft | null;
  lang: Lang;
  purpose: "topup" | "transfer" | "merchant_collection";
  done: boolean;
  variant?: InteracRailVariant;
}

/**
 * Compact Autodeposit instructions: amount, alias, reference.
 */
export default function InteracStatusView({
  intent,
  alias,
  eft,
  lang,
  purpose,
  done,
  variant = "loop",
}: Props) {
  const t = CHECKOUT_STRINGS[lang];
  const reference = intent.public_id || intent.reference;
  const amountLabel = `CAD ${Number(intent.amount).toFixed(2)}`;
  const eftDetails = eft ?? LOOP_CAD_EFT;
  const isFlovide = variant === "flovide";
  const isFincra = variant === "fincra";
  const showEft = !isFlovide && !isFincra;
  const sendTo = alias || (isFlovide ? "efin@flovide.com" : null);

  const tip =
    lang === "fr"
      ? "Mettez la référence dans le message Interac. Pas de question de sécurité."
      : "Put the reference in the Interac message. No security question.";

  const detailsText = [
    `Amount: ${amountLabel}`,
    sendTo ? `Send to: ${sendTo}` : null,
    `Reference: ${reference}`,
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

  const copyDetails = async () => {
    await navigator.clipboard.writeText(detailsText);
    toast.success(lang === "fr" ? "Détails copiés" : "Payment details copied");
  };

  if (done) {
    return (
      <div className="space-y-2 py-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
        <p className="font-medium">
          {amountLabel} — {t.received}
        </p>
        {purpose === "transfer" && (
          <p className="text-sm text-muted-foreground">
            {lang === "fr" ? "Votre transfert est en route." : "Your transfer is on its way."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span>
          {lang === "fr"
            ? "En attente de votre Virement Interac…"
            : "Waiting for your Interac e-Transfer…"}
        </span>
      </div>

      <div className="w-full min-w-0 space-y-3 rounded-lg border p-4 text-sm">
        <Detail label={t.amountDue} value={amountLabel} />
        {sendTo ? <Detail label={t.sendTo} value={sendTo} /> : null}
        <Detail label={t.reference} value={reference} />
        <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">{tip}</p>
      </div>

      {showEft && (
        <div className="w-full min-w-0 space-y-2 rounded-lg border p-3 text-sm">
          <p className="text-xs font-medium text-foreground">{t.eftHint}</p>
          <Detail label={t.bankNumber} value={eftDetails.bankNumber} />
          <Detail label={t.transitNumber} value={eftDetails.transitNumber} />
          <Detail label={t.accountNumber} value={eftDetails.accountNumber} />
        </div>
      )}

      <Button type="button" className="w-full" onClick={() => void copyDetails()}>
        <Copy className="mr-2 h-4 w-4" />
        {t.paymentDetails}
      </Button>
    </div>
  );
}

/** Stacked label/value so long references never collapse the column. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words font-medium text-foreground [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}
