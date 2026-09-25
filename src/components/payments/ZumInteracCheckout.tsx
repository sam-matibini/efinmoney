import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/invokeEdgeFunction";
import InteracPayerForm, { emptyPayerForm, type PayerForm } from "@/components/payments/InteracPayerForm";
import InteracCheckout from "@/components/payments/InteracCheckout";
import type { Lang } from "@/components/payments/checkoutStrings";

interface Props {
  walletId: string;
  amount: number;
  purpose?: "topup" | "transfer" | "merchant_collection";
  transferId?: string;
  lang?: Lang;
  onComplete?: () => void;
}

type Phase = "form" | "bank" | "done" | "autodeposit";

/**
 * Zum-style CAD pay-in: the sender approves Interac in their bank.
 * Autodeposit stays available if the bank link cannot be opened.
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
  const [form, setForm] = useState<PayerForm>(emptyPayerForm);
  const [phase, setPhase] = useState<Phase>("form");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [efmReference, setEfmReference] = useState<string | null>(null);
  const [interacReference, setInteracReference] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = String(meta.full_name ?? meta.name ?? "").trim();
      const [first, ...rest] = fullName.split(/\s+/);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone_number, street_address, city, state_province, postal_code")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (cancelled) return;
      const p = (profile ?? {}) as Record<string, string | null>;
      const [pFirst, ...pRest] = String(p.full_name || "").trim().split(/\s+/);
      setForm((prev) => ({
        ...prev,
        firstName: prev.firstName || pFirst || first || "",
        lastName: prev.lastName || pRest.join(" ") || rest.join(" ") || "",
        email: prev.email || data.user?.email || "",
        phone: prev.phone || p.phone_number || "",
        line1: prev.line1 || p.street_address || "",
        city: prev.city || p.city || "",
        region: prev.region || p.state_province || "",
        postalCode: prev.postalCode || p.postal_code || "",
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startBankPay = useCallback(async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.includes("@")) {
      const message = fr ? "Entrez votre nom et un courriel valide." : "Enter your name and a valid email.";
      setError(message);
      toast.error(message);
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
          email: form.email.trim(),
          recipient_name: `${form.firstName} ${form.lastName}`.trim(),
          phone: form.phone || undefined,
          language: lang,
        },
      });
      if (invokeErr) throw new Error(await edgeFunctionErrorMessage(invokeErr));
      if (data?.error) throw new Error(String(data.error));
      const reference = String(data?.reference || data?.intent?.reference || "");
      const url = typeof data?.hosted_url === "string" ? data.hosted_url : null;
      if (!reference) throw new Error(fr ? "Référence manquante." : "Missing payment reference.");
      setEfmReference(reference);
      setHostedUrl(url);
      setPhase("bank");
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        toast.message(fr ? "Approuvez le paiement dans votre banque." : "Approve the payment in your bank.");
      } else {
        toast.message(
          fr
            ? "Ouvrez la demande Interac envoyée à votre courriel."
            : "Open the Interac request sent to your email.",
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start Interac";
      setError(message);
      toast.error(message);
    } finally {
      setStarting(false);
    }
  }, [amount, form, fr, lang, purpose, transferId, walletId]);

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

  if (phase === "autodeposit") {
    return (
      <InteracCheckout
        walletId={walletId}
        purpose={purpose}
        transferId={transferId}
        fixedAmount={amount}
        lang={lang}
        onComplete={onComplete}
      />
    );
  }

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

  if (phase === "bank") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          {fr
            ? "Ouvrez votre banque et approuvez la demande Interac. Nous enregistrons les deux références quand c'est payé."
            : "Open your bank and approve the Interac request. We save both references when it is paid."}
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{fr ? "Montant" : "Amount"}</dt>
            <dd className="font-semibold">CAD {amount.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">eFinMoney</dt>
            <dd className="font-mono text-xs">{efmReference}</dd>
          </div>
        </dl>
        {hostedUrl && (
          <Button type="button" className="w-full" onClick={() => window.open(hostedUrl, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {fr ? "Ouvrir Interac" : "Open Interac"}
          </Button>
        )}
        <Button type="button" variant="ghost" className="w-full" onClick={() => setPhase("autodeposit")}>
          {fr ? "Envoyer un Autodeposit à la place" : "Send Autodeposit instead"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <InteracPayerForm
        lang={lang}
        value={form}
        onChange={setForm}
        amountLabel={`CAD ${amount.toFixed(2)}`}
        submitting={starting}
        error={error}
        onSubmit={() => void startBankPay()}
      />
      <Button type="button" variant="ghost" className="w-full" onClick={() => setPhase("autodeposit")}>
        {fr ? "Envoyer un Autodeposit à la place" : "Send Autodeposit instead"}
      </Button>
    </div>
  );
}
