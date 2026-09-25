import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/invokeEdgeFunction";
import InteracPayerForm, { emptyPayerForm, type PayerForm } from "@/components/payments/InteracPayerForm";
import { bankLink, type Lang } from "@/components/payments/checkoutStrings";
import { FINCRA_CAD_INTERAC_ALIAS } from "@/lib/fincraCad";

interface Props {
  walletId: string;
  amount: number;
  purpose?: "topup" | "transfer" | "merchant_collection";
  transferId?: string;
  lang?: Lang;
  onComplete?: () => void;
}

type Phase = "form" | "bank" | "done";

const PAYER_MEMORY_KEY = "efm-cad-payer";

function readRememberedPayer(): Partial<PayerForm> | null {
  try {
    const raw = localStorage.getItem(PAYER_MEMORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PayerForm>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * CAD pay-in: the sender copies the details and completes Interac in their bank.
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
  const [depositAlias, setDepositAlias] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [efmReference, setEfmReference] = useState<string | null>(null);
  const [interacReference, setInteracReference] = useState<string | null>(null);
  const [bankRefDraft, setBankRefDraft] = useState("");

  useEffect(() => {
    const saved = readRememberedPayer();
    if (!saved) return;
    setForm((prev) => {
      const next = { ...prev };
      (Object.keys(saved) as Array<keyof PayerForm>).forEach((key) => {
        const value = saved[key];
        if (typeof value === "string" && value.trim()) next[key] = value as never;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!form.bank && !form.email && !form.line1) return;
    try {
      localStorage.setItem(PAYER_MEMORY_KEY, JSON.stringify(form));
    } catch {
      /* private mode */
    }
  }, [form]);

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
      const { data, error: invokeErr } = await supabase.functions.invoke("fincra-cad-interac", {
        body: {
          action: "create",
          amount: Math.round(amount * 100) / 100,
          wallet_id: walletId,
          purpose,
          transfer_id: transferId || undefined,
          sender_name: `${form.firstName} ${form.lastName}`.trim(),
          sender_email: form.email.trim(),
          sender_phone: form.phone || undefined,
          sender_bank: form.bank || undefined,
          sender_account_type: form.accountType,
          sender_address_line1: form.line1 || undefined,
          sender_address_line2: form.line2 || undefined,
          sender_city: form.city || undefined,
          sender_region: form.region || undefined,
          sender_postal_code: form.postalCode || undefined,
          sender_country: "CA",
        },
      });
      if (invokeErr) throw new Error(await edgeFunctionErrorMessage(invokeErr));
      if (data?.error) throw new Error(String(data.error));
      const intent = (data?.intent ?? {}) as { id?: string; reference?: string; public_id?: string };
      const reference = String(intent.public_id || intent.reference || data?.reference || "");
      const url = typeof data?.hosted_url === "string" && data.hosted_url ? data.hosted_url : bankLink(form.bank);
      const alias = String(data?.alias || FINCRA_CAD_INTERAC_ALIAS);
      if (!reference) throw new Error(fr ? "Référence manquante." : "Missing payment reference.");
      setIntentId(intent.id || null);
      setEfmReference(reference);
      setDepositAlias(alias);
      setHostedUrl(url);
      setPhase("bank");
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        toast.message(
          fr
            ? "Copiez le montant, le message et le courriel, puis terminez le virement dans votre banque."
            : "Copy the amount, message, and email, then complete the transfer in your bank.",
        );
      } else {
        toast.message(fr ? "Choisissez votre banque pour ouvrir Interac." : "Choose your bank to open Interac.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start Interac";
      setError(message);
      toast.error(message);
    } finally {
      setStarting(false);
    }
  }, [amount, form, fr, purpose, transferId, walletId]);

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

  if (phase === "bank") {
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
        {hostedUrl && (
          <Button type="button" className="w-full" onClick={() => window.open(hostedUrl, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {fr ? "Ouvrir la banque" : "Open bank"}
          </Button>
        )}
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
    </div>
  );
}
