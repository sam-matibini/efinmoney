import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { CHECKOUT_STRINGS, bankLink, type Lang } from "@/components/payments/checkoutStrings";
import type { InteracIntent } from "@/components/payments/InteracCheckout";

interface Props {
  intent: InteracIntent;
  alias: string | null;
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

/** Post-hand-off status view: automatic confirmation, details only on request. */
export default function InteracStatusView({ intent, alias, lang, purpose, done }: Props) {
  const t = CHECKOUT_STRINGS[lang];
  const [showDetails, setShowDetails] = useState(false);
  const reference = intent.public_id || intent.reference;
  const amountLabel = `CAD ${Number(intent.amount).toFixed(2)}`;
  const link = intent.hosted_url || bankLink(intent.sender_bank);

  const copyDetails = async () => {
    await navigator.clipboard.writeText(
      [`Amount: ${amountLabel}`, alias ? `${t.sendTo}: ${alias}` : null, `${t.reference}: ${reference}`]
        .filter(Boolean)
        .join("\n"),
    );
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
        <Loader2 className="h-4 w-4 animate-spin" />
        {waitingCopy(intent.status, purpose, lang)}
      </div>

      {link && (
        <Button type="button" variant="outline" className="w-full" asChild>
          <a href={link} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            {t.openBank}
          </a>
        </Button>
      )}

      {!showDetails ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setShowDetails(true)}
        >
          {t.stillNotSent}
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.amountDue}</span>
            <span className="font-semibold tabular-nums">{amountLabel}</span>
          </div>
          {alias && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t.sendTo}</span>
              <code className="break-all text-right">{alias}</code>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t.reference}</span>
            <code className="break-all text-right">{reference}</code>
          </div>
          <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => void copyDetails()}>
            <Copy className="mr-1 h-3.5 w-3.5" />
            {t.paymentDetails}
          </Button>
        </div>
      )}
    </div>
  );
}
