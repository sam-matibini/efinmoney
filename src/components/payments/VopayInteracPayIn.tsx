import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LOOP_CAD_EFT, LOOP_CAD_INTERAC_ALIAS } from "@/lib/loopCad";
import { edgeFunctionErrorMessage } from "@/lib/invokeEdgeFunction";
import type { Lang } from "@/components/payments/checkoutStrings";

interface Props {
  walletId: string;
  amount: number;
  transferId?: string;
  purpose?: "topup" | "transfer" | "merchant_collection";
  lang?: Lang;
  autoOpen?: boolean;
  onComplete?: () => void;
}

/**
 * Zum-style Interac Request Money via VoPay → settles to Loop Autodeposit.
 */
export default function VopayInteracPayIn({
  walletId,
  amount,
  transferId,
  purpose = "topup",
  lang = "en",
  autoOpen = true,
  onComplete,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const completedRef = useRef(false);

  const startRequest = useCallback(async () => {
    if (amount < 1) {
      toast.error(lang === "fr" ? "Montant minimum CAD 1,00" : "Minimum amount CAD 1.00");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("vopay-interac-request", {
        body: {
          wallet_id: walletId,
          amount_cad: Math.round(amount * 100) / 100,
          purpose,
          transfer_id: transferId || undefined,
          email: user?.email,
          recipient_name: user?.user_metadata?.full_name || undefined,
          language: lang,
        },
      });
      if (invokeErr) throw new Error(await edgeFunctionErrorMessage(invokeErr));
      if (data?.error) throw new Error(String(data.error));

      const ref = String(data?.reference || data?.intent?.reference || "");
      const url = typeof data?.hosted_url === "string" ? data.hosted_url : null;
      setReference(ref || null);
      setHostedUrl(url);

      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        toast.message(
          lang === "fr"
            ? "Approuvez la demande Interac dans votre banque."
            : "Approve the Interac Request Money in your bank.",
        );
      } else {
        toast.message(
          lang === "fr"
            ? "Demande Interac envoyée à votre courriel — ouvrez-la pour payer."
            : "Interac Request Money emailed to you — open it to pay.",
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start Interac Request Money";
      setError(msg);
      toast.error(msg);
    } finally {
      setStarting(false);
    }
  }, [amount, lang, purpose, transferId, user, walletId]);

  useEffect(() => {
    if (!autoOpen || started.current) return;
    started.current = true;
    void startRequest();
  }, [autoOpen, startRequest]);

  useEffect(() => {
    if (!reference || settled || completedRef.current) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from("fincra_cad_interac_intents")
        .select("status")
        .eq("reference", reference)
        .maybeSingle();
      if (cancelled || !data) return;
      if (["settled", "completed", "credited", "confirmed"].includes(String(data.status))) {
        completedRef.current = true;
        setSettled(true);
        void qc.invalidateQueries({ queryKey: ["wallets"] });
        toast.success(
          lang === "fr"
            ? purpose === "transfer"
              ? "Paiement reçu — transfert libéré"
              : "Paiement reçu — portefeuille crédité"
            : purpose === "transfer"
              ? "Payment received — transfer released"
              : "Payment received — wallet credited",
        );
        onComplete?.();
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 6000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [reference, settled, lang, purpose, onComplete, qc]);

  if (settled) {
    return (
      <div className="space-y-2 py-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
        <p className="font-medium">
          {lang === "fr"
            ? `CAD ${amount.toFixed(2)} — reçu`
            : `CAD ${amount.toFixed(2)} — received`}
        </p>
        {purpose === "transfer" && (
          <p className="text-sm text-muted-foreground">
            {lang === "fr" ? "Votre transfert est en route." : "Your transfer is on its way."}
          </p>
        )}
      </div>
    );
  }

  if (starting && !hostedUrl && !reference) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">
          {lang === "fr"
            ? "Création de la demande Interac…"
            : "Creating Interac Request Money…"}
        </p>
      </div>
    );
  }

  if (error && !reference) {
    return (
      <div className="space-y-4 py-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" className="w-full" onClick={() => void startRequest()}>
          {lang === "fr" ? "Réessayer" : "Try again"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        {lang === "fr"
          ? "En attente de l'approbation Interac Request Money dans votre banque."
          : "Waiting for you to approve Interac Request Money in your bank."}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {lang === "fr"
          ? `Après approbation, les fonds sont collectés puis déposés sur Loop Autodeposit (${LOOP_CAD_INTERAC_ALIAS}).`
          : `After you approve, funds are collected then deposited to Loop Autodeposit (${LOOP_CAD_INTERAC_ALIAS}).`}
      </p>
      <div className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{lang === "fr" ? "Montant" : "Amount"}</span>
          <span className="font-semibold tabular-nums">CAD {amount.toFixed(2)}</span>
        </div>
        {reference && (
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Ref</span>
            <span className="font-mono text-xs">{reference}</span>
          </div>
        )}
        <div className="border-t pt-2 text-xs text-muted-foreground space-y-0.5">
          <p>Loop Autodeposit: {LOOP_CAD_INTERAC_ALIAS}</p>
          <p>Institution: {LOOP_CAD_EFT.bankNumber}</p>
          <p>Transit: {LOOP_CAD_EFT.transitNumber}</p>
          <p>Account: {LOOP_CAD_EFT.accountNumber}</p>
        </div>
      </div>
      {hostedUrl && (
        <Button
          type="button"
          className="w-full"
          onClick={() => window.open(hostedUrl, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {lang === "fr" ? "Ouvrir le paiement Interac" : "Open Interac payment"}
        </Button>
      )}
      {reference && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={async () => {
            await navigator.clipboard.writeText(
              `CAD ${amount.toFixed(2)}\nRef: ${reference}\nLoop: ${LOOP_CAD_INTERAC_ALIAS}`,
            );
            toast.success(lang === "fr" ? "Copié" : "Copied");
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          {lang === "fr" ? "Copier la référence" : "Copy reference"}
        </Button>
      )}
    </div>
  );
}
