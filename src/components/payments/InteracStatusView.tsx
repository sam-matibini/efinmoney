import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { CHECKOUT_STRINGS, type Lang } from "@/components/payments/checkoutStrings";
import type { InteracIntent } from "@/components/payments/InteracCheckout";
import { LOOP_CAD_EFT, type LoopCadEft } from "@/lib/loopCad";

interface Props {
  intent: InteracIntent;
  alias: string | null;
  eft?: LoopCadEft | null;
  lang: Lang;
  purpose: "topup" | "transfer" | "merchant_collection";
  done: boolean;
}

function waitingCopy(status: string, purpose: string, lang: Lang): string {
  const t = CHECKOUT_STRINGS[lang];
  switch (status) {
    case "received":
    case "matched":
      return lang === "fr"
        ? "Dépôt reçu — vérification en cours."
        : "Deposit received — confirming it now.";
    case "confirmed":
      return purpose === "transfer"
        ? lang === "fr"
          ? "Paiement confirmé — votre transfert est libéré."
          : "Payment confirmed — releasing your transfer."
        : lang === "fr"
          ? "Paiement confirmé — votre portefeuille est crédité."
          : "Payment confirmed — crediting your wallet.";
    case "unmatched":
      return lang === "fr"
        ? "Nous avons reçu un dépôt à allouer manuellement. Notre équipe s'en occupe."
        : "We received a deposit we couldn't match automatically. Our team is allocating it.";
    default:
      return t.waiting;
  }
}

/**
 * Loop Bank Interac Autodeposit + EFT status — copy details only.
 */
export default function InteracStatusView({ intent, alias, eft, lang, purpose, done }: Props) {
  const t = CHECKOUT_STRINGS[lang];
  const reference = intent.public_id || intent.reference;
  const amountLabel = `CAD ${Number(intent.amount).toFixed(2)}`;
  const eftDetails = eft ?? LOOP_CAD_EFT;

  const detailsText = [
    `Amount: ${amountLabel}`,
    alias ? `${t.sendTo}: ${alias}` : null,
    `${t.reference}: ${reference}`,
    "",
    "EFT / bank transfer (Loop Bank):",
    `${t.bankNumber}: ${eftDetails.bankNumber}`,
    `${t.transitNumber}: ${eftDetails.transitNumber}`,
    `${t.accountNumber}: ${eftDetails.accountNumber}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const copyDetails = async () => {
    await navigator.clipboard.writeText(detailsText);
    toast.success(t.detailsCopied);
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
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        {waitingCopy(intent.status, purpose, lang)}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{t.pushHint}</p>

      <div className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t.amountDue}</span>
          <span className="font-semibold tabular-nums">{amountLabel}</span>
        </div>
        {alias && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t.sendTo}</span>
            <code className="break-all text-right font-medium">{alias}</code>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t.reference}</span>
          <code className="break-all text-right font-medium">{reference}</code>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {lang === "fr"
            ? "Autodeposit Loop activé — aucune question de sécurité. Mettez la référence dans le message."
            : "Loop Autodeposit is on — no security question. Put the reference in the message field."}
        </p>
      </div>

      <div className="space-y-2 rounded-lg border p-3 text-sm">
        <p className="text-xs font-medium text-foreground">{t.eftHint}</p>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t.bankNumber}</span>
          <code className="font-medium">{eftDetails.bankNumber}</code>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t.transitNumber}</span>
          <code className="font-medium">{eftDetails.transitNumber}</code>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{t.accountNumber}</span>
          <code className="font-medium">{eftDetails.accountNumber}</code>
        </div>
      </div>

      <Button type="button" className="w-full" onClick={() => void copyDetails()}>
        <Copy className="mr-2 h-4 w-4" />
        {t.paymentDetails}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        {lang === "fr"
          ? "Ouvrez votre app bancaire vous-même — nous n'ouvrons pas les pages de connexion."
          : "Open your banking app yourself — we do not open bank login pages."}
      </p>
    </div>
  );
}
