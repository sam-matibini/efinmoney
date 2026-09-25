import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/invokeEdgeFunction";
import { bankLink, readRememberedBank, type Lang } from "@/components/payments/checkoutStrings";
import { FINCRA_CAD_INTERAC_ALIAS } from "@/lib/fincraCad";

interface Props {
  walletId: string;
  amount: number;
  purpose?: "topup" | "transfer" | "merchant_collection";
  transferId?: string;
  lang?: Lang;
  onComplete?: () => void;
}

type Phase = "bank" | "done";

/**
 * CAD pay-in details: amount, eFinMoney code, and e-Transfer email.
 * The bank opens only from the button on this screen.
 */
export default function ZumInteracCheckout({
  walletId,
  amount,
  purpose = "topup",
  transferId,
  lang = "en",
  onComplete,
}: Props) {
  const qc = useQueryClient();
  const fr = lang === "fr";
  const [phase, setPhase] = useState<Phase>("bank");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [depositAlias, setDepositAlias] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [efmReference, setEfmReference] = useState<string | null>(null);
  const [interacReference, setInteracReference] = useState<string | null>(null);
  const [bankRefDraft, setBankRefDraft] = useState("");

  const openBank = useCallback(() => {
    const url = hostedUrl || bankLink(readRememberedBank());
    if (!url) {
      const message = fr ? "Choisissez votre banque à l'étape précédente." : "Select your bank on the previous step.";
      setError(message);
      toast.error(message);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [fr, hostedUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStarting(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth.user;
        const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
        const fullName = String(meta.full_name ?? meta.name ?? "").trim();
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, phone_number")
          .eq("user_id", user?.id ?? "")
          .maybeSingle();
        if (cancelled) return;
        const p = (profile ?? {}) as { full_name?: string | null; phone_number?: string | null };
        const senderName = String(p.full_name || fullName || user?.email || "eFinMoney customer").trim();
        const senderEmail = String(user?.email || "").trim();
        const { data, error: invokeErr } = await supabase.functions.invoke("fincra-cad-interac", {
          body: {
            action: "create",
            amount: Math.round(amount * 100) / 100,
            wallet_id: walletId,
            purpose,
            transfer_id: transferId || undefined,
            sender_name: senderName,
            sender_email: senderEmail || undefined,
            sender_phone: p.phone_number || undefined,
            sender_bank: readRememberedBank() || undefined,
            sender_country: "CA",
          },
        });
        if (invokeErr) throw new Error(await edgeFunctionErrorMessage(invokeErr));
        if (data?.error) throw new Error(String(data.error));
        const intent = (data?.intent ?? {}) as { id?: string; reference?: string; public_id?: string };
        const reference = String(intent.public_id || intent.reference || data?.reference || "");
        const alias = String(data?.alias || FINCRA_CAD_INTERAC_ALIAS);
        if (!reference) throw new Error(fr ? "Référence manquante." : "Missing payment reference.");
        if (cancelled) return;
        setIntentId(intent.id || null);
        setEfmReference(reference);
        setDepositAlias(alias);
        const url = typeof data?.hosted_url === "string" && data.hosted_url ? data.hosted_url : bankLink(readRememberedBank());
        setHostedUrl(url);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Could not start Interac";
        setError(message);
        toast.error(message);
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [amount, fr, purpose, transferId, walletId]);

  useEffect(() => {
    if (phase !== "bank" || !efmReference) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from("fincra_cad_interac_intents")
        .select("status, reference, public_id, wise_transaction_id")
        .eq("reference", efmReference)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.wise_transaction_id) setInteracReference(String(data.wise_transaction_id));
      if (["settled", "completed", "credited", "confirmed"].includes(String(data.status))) {
        setPhase("done");
        void qc.invalidateQueries({ queryKey: ["wallets"] });
        toast.success(fr ? "Paiement reçu." : "Payment received.");
        onComplete?.();
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase, efmReference, fr, onComplete, qc]);

  if (phase === "done") {
    return (
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <p className="font-semibold">{fr ? "Paiement terminé" : "Payment complete"}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{fr ? "Date" : "Date"}</dt>
            <dd>{new Date().toLocaleDateString(fr ? "fr-CA" : "en-CA", { month: "short", day: "numeric", year: "numeric" })}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{fr ? "Référence Interac" : "Interac reference"}</dt>
            <dd className="font-mono">{interacReference || (fr ? "En attente de la banque" : "Waiting for the bank")}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">{fr ? "Message" : "Message"}</dt>
            <dd className="font-mono">{efmReference}</dd>
          </div>
        </dl>
      </div>
    );
  }

  const finishWithBankReference = async () => {
    const ref = bankRefDraft.trim();
    if (!intentId || !/^[A-Za-z0-9][A-Za-z0-9-]{3,31}$/.test(ref)) {
      const message = fr
        ? "Entrez la référence Interac de votre banque (par exemple C1AyEQZbS2vE)."
        : "Enter the Interac reference from your bank (for example C1AyEQZbS2vE).";
      setError(message);
      toast.error(message);
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("fincra-cad-interac", {
        body: {
          action: "complete",
          intent_id: intentId,
          interac_reference: ref,
          amount_transferred: Math.round(amount * 100) / 100,
          qty: 1,
        },
      });
      if (invokeErr) throw new Error(await edgeFunctionErrorMessage(invokeErr));
      if (data?.error) throw new Error(String(data.error));
      setInteracReference(ref);
      setPhase("done");
      void qc.invalidateQueries({ queryKey: ["wallets"] });
      toast.success(fr ? "Paiement reçu." : "Payment received.");
      onComplete?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not complete the payment";
      setError(message);
      toast.error(message);
    } finally {
      setStarting(false);
    }
  };

  if (phase === "bank" && efmReference) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <p>
            {fr
              ? "Copiez les détails du virement ci-dessous : montant, message/code et courriel de virement Interac, puis terminez le virement dans votre compte bancaire."
              : "Copy the transfer details below: amount, message/code, and e-Transfer email, and complete the transfer in your bank account."}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{fr ? "Montant" : "Amount"}</dt>
            <dd className="font-semibold">CAD {amount.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{fr ? "Message / code" : "Message / code"}</dt>
            <dd className="font-mono text-xs">{efmReference}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">{fr ? "Courriel de virement Interac" : "e-Transfer email"}</dt>
            <dd className="font-mono text-xs">{depositAlias}</dd>
          </div>
        </dl>
        <Button type="button" className="w-full" onClick={openBank} disabled={!efmReference}>
          <ExternalLink className="mr-2 h-4 w-4" />
          {fr ? "Ouvrir la banque" : "Open bank"}
        </Button>
        <Input
          value={bankRefDraft}
          onChange={(e) => setBankRefDraft(e.target.value)}
          placeholder={fr ? "Référence Interac" : "Interac reference"}
          autoComplete="off"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" className="w-full" disabled={starting} onClick={() => void finishWithBankReference()}>
          {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {fr ? "Terminer avec la référence Interac" : "Complete with Interac reference"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      {error || (fr ? "Préparation du virement…" : "Preparing the transfer…")}
    </div>
  );
}
