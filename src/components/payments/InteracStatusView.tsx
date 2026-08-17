import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, Mail } from "lucide-react";
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
  /** Flovide = email money-request; Loop = Autodeposit/EFT; Fincra = @fincra.ca Autodeposit */
  variant?: InteracRailVariant;
}

function waitingCopy(
  status: string,
  purpose: string,
  lang: Lang,
  variant: InteracRailVariant,
): string {
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
    case "awaiting_payment":
    case "pending":
    case "processing":
    default:
      return variant === "flovide" ? t.flovideWaiting : variant === "fincra" ? t.fincraWaiting : t.waiting;
  }
}

/**
 * Interac status: Flovide (approve email request), Fincra Autodeposit, or Loop Bank.
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
  const payerEmail = (intent.payer_email || intent.sender_email || "").trim();
  const isFlovide = variant === "flovide";
  const isFincra = variant === "fincra";
  const showEft = !isFlovide && !isFincra;

  const loopDetailsText = [
    `Amount: ${amountLabel}`,
    alias ? `${t.sendTo}: ${alias}` : null,
    `${t.reference}: ${reference}`,
    "",
    ...(showEft
      ? [
          "EFT / bank transfer (Loop Bank):",
          `${t.bankNumber}: ${eftDetails.bankNumber}`,
          `${t.transitNumber}: ${eftDetails.transitNumber}`,
          `${t.accountNumber}: ${eftDetails.accountNumber}`,
        ]
      : []),
  ]
    .filter((line) => line !== null)
    .join("\n");

  const flovideDetailsText = [
    `Amount: ${amountLabel}`,
    payerEmail ? `${t.flovideRequestTo}: ${payerEmail}` : null,
    `${t.reference}: ${reference}`,
    t.flovideCopyHint,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const copyDetails = async () => {
    await navigator.clipboard.writeText(isFlovide ? flovideDetailsText : loopDetailsText);
    toast.success(isFlovide ? t.flovideDetailsCopied : t.detailsCopied);
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

  if (isFlovide) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          {waitingCopy(intent.status, purpose, lang, "flovide")}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">{t.flovidePushHint}</p>

        <div className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t.amountDue}</span>
            <span className="font-semibold tabular-nums">{amountLabel}</span>
          </div>
          {payerEmail && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t.flovideRequestTo}</span>
              <code className="break-all text-right font-medium">{payerEmail}</code>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t.reference}</span>
            <code className="break-all text-right font-medium">{reference}</code>
          </div>
          <p className="flex items-start gap-2 text-[11px] text-muted-foreground pt-1">
            <Mail className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {lang === "fr"
              ? "Cherchez le courriel Interac, puis approuvez dans votre app bancaire."
              : "Check your email for the Interac request, then approve it in your banking app."}
          </p>
        </div>

        <Button type="button" className="w-full" onClick={() => void copyDetails()}>
          <Copy className="mr-2 h-4 w-4" />
          {t.paymentDetails}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">{t.flovidePoweredBy}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        {waitingCopy(intent.status, purpose, lang, variant)}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {isFincra ? t.fincraPushHint : t.pushHint}
      </p>

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
          {isFincra
            ? lang === "fr"
              ? "Autodeposit activé — aucune question de sécurité. Mettez la référence dans le message."
              : "Autodeposit is on — no security question. Put the reference in the message field."
            : lang === "fr"
            ? "Autodeposit Loop activé — aucune question de sécurité. Mettez la référence dans le message."
            : "Loop Autodeposit is on — no security question. Put the reference in the message field."}
        </p>
      </div>

      {showEft && (
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
      )}

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
