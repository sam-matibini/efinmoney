import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOOP_BILLING_PAYMENT_LINK, LOOP_CAD_INTERAC_ALIAS } from "@/lib/loopCad";
import type { Lang } from "@/components/payments/checkoutStrings";

interface Props {
  amount: number;
  reference?: string | null;
  lang?: Lang;
}

/**
 * Opens a Loop Billing payment link from the Loop dashboard.
 * EFT/ACH pull (~4 business days) into Loop — not Interac Autodeposit.
 */
export default function LoopBillingPayPanel({
  amount,
  reference,
  lang = "en",
}: Props) {
  const url = LOOP_BILLING_PAYMENT_LINK;
  const fr = lang === "fr";

  if (!url) {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        {fr
          ? "Ajoutez VITE_LOOP_BILLING_PAYMENT_LINK (lien Loop Billing depuis le tableau de bord Loop)."
          : "Set VITE_LOOP_BILLING_PAYMENT_LINK to your Loop Billing URL from the Loop dashboard."}
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
        {fr
          ? "Ouvrez le lien Loop Billing pour autoriser un virement TEF. Les fonds arrivent dans Loop en environ 4 jours ouvrables (pas Interac Autodeposit)."
          : "Open the Loop Billing link to authorize an EFT bank debit. Funds arrive in Loop in about 4 business days (not Interac Autodeposit)."}
      </div>

      <div className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{fr ? "Montant" : "Amount"}</span>
          <span className="font-semibold tabular-nums">CAD {amount.toFixed(2)}</span>
        </div>
        {reference && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{fr ? "Réf. eFinMoney" : "eFinMoney ref"}</span>
            <span className="font-mono text-xs">{reference}</span>
          </div>
        )}
        <p className="border-t pt-2 text-xs text-muted-foreground">
          {fr
            ? `Incluez la référence dans le commentaire Loop si possible. Autodeposit Interac reste : ${LOOP_CAD_INTERAC_ALIAS}.`
            : `Include the reference in the Loop memo if prompted. Interac Autodeposit remains: ${LOOP_CAD_INTERAC_ALIAS}.`}
        </p>
      </div>

      <Button
        type="button"
        className="w-full"
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      >
        <ExternalLink className="mr-2 h-4 w-4" />
        {fr ? "Ouvrir le lien Loop Billing" : "Open Loop Billing link"}
      </Button>

      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {fr
          ? "Après paiement, le solde se met à jour quand Loop / le rapprochement confirment le dépôt."
          : "After you pay, your balance updates when Loop / reconciliation confirms the deposit."}
      </p>
    </div>
  );
}
