import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import InteracPayerForm, { emptyPayerForm, type PayerForm } from "@/components/payments/InteracPayerForm";
import InteracStatusView from "@/components/payments/InteracStatusView";
import { CHECKOUT_STRINGS, type Lang } from "@/components/payments/checkoutStrings";

/** Supabase hides the response body on FunctionsHttpError — read the real reason out of it. */
async function edgeErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      const message = body?.error ?? body?.message;
      if (typeof message === "string" && message.trim()) return message;
    } catch {
      /* non-JSON body */
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}


export type InteracIntent = {
  id: string;
  public_id?: string | null;
  amount: number;
  currency_code: string;
  reference: string;
  status: string;
  expires_at?: string;
  claimed_sent_at?: string | null;
  hosted_url?: string | null;
  sender_name?: string | null;
  sender_email?: string | null;
  sender_phone?: string | null;
  sender_bank?: string | null;
};

interface Props {
  /** CAD wallet that receives the deposit. */
  walletId: string;
  /** `topup` credits the wallet only; `transfer` also releases the linked payout. */
  purpose?: "topup" | "transfer" | "merchant_collection";
  /** Transfer that should execute automatically once the deposit lands. */
  transferId?: string;
  /** Fixed amount (send flow). When omitted the user types the amount. */
  fixedAmount?: number;
  /** Prefill for the editable amount field. */
  initialAmount?: string;
  /** Resume the most recent open intent (top-up only). */
  resumePending?: boolean;
  /** Language for the checkout copy. */
  lang?: Lang;
  onComplete?: () => void;
  onIntentCreated?: (intent: InteracIntent) => void;
}

/** Terminal-success statuses (`completed` kept for intents created before the lifecycle change). */
const DONE = ["settled", "completed"];

const CA_PHONE_RE = /^\+?1?[2-9]\d{9}$/;

const payerSchema = z.object({
  amount: z.coerce.number().min(1, "Enter an amount of at least CAD 1.00"),
  firstName: z.string().trim().min(1, "Enter your first name").max(60),
  lastName: z.string().trim().min(1, "Enter your last name").max(60),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z
    .string()
    .trim()
    .refine((v) => !v || CA_PHONE_RE.test(v.replace(/[^\d+]/g, "")), "Enter a valid Canadian mobile number"),
  line1: z.string().trim().min(3, "Enter your address").max(200),
  city: z.string().trim().min(2, "Enter your city").max(100),
  region: z.string().trim().min(2, "Select your province"),
  postalCode: z.string().trim().min(3, "Enter your postal code").max(10),
});

/**
 * Automated Interac e-Transfer checkout: one payer form, one Pay button, then a
 * status view. Deposits are reconciled by `wise-webhook`, which credits the
 * wallet and (for `purpose: "transfer"`) releases the linked payout.
 */
export default function InteracCheckout({
  walletId,
  purpose = "topup",
  transferId,
  fixedAmount,
  initialAmount,
  resumePending = purpose === "topup",
  lang = "en",
  onComplete,
  onIntentCreated,
}: Props) {
  const t = CHECKOUT_STRINGS[lang];
  const amountLocked = typeof fixedAmount === "number" && fixedAmount > 0;
  const [amount, setAmount] = useState(amountLocked ? String(fixedAmount) : (initialAmount ?? ""));
  useEffect(() => {
    if (amountLocked) setAmount(String(fixedAmount));
    else if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [amountLocked, fixedAmount, initialAmount]);

  const [form, setForm] = useState<PayerForm>(emptyPayerForm);
  const [loading, setLoading] = useState(false);
  const [alias, setAlias] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [intent, setIntent] = useState<InteracIntent | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const amountLabel = `CAD ${(Number(amount) || 0).toFixed(2)}`;

  // Prefill the payer from the signed-in profile so the form is mostly done
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
        email: prev.email || (data.user!.email ?? ""),
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

  // Resolve the deposit alias (and any resumable open intent)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("fincra-cad-interac", {
          method: "GET",
        });
        if (cancelled) return;
        if (fnError) return; // transient/auth hiccup — keep the form usable
        const json = (data ?? {}) as Record<string, unknown>;
        setAlias((json.alias as string | null) ?? null);
        // Only block when the backend explicitly says there is no deposit alias.
        if (json.configured === false) setConfigured(false);
        if (resumePending) {
          const pending = Array.isArray(json.pending) ? (json.pending[0] as InteracIntent) : null;
          if (pending) setIntent(pending);
        }
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resumePending]);

  const pay = useCallback(async () => {
    const parsed = payerSchema.safeParse({ ...form, amount });
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Check your details";
      setError(message);
      toast.error(message);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("fincra-cad-interac", {
        body: {
          action: "create",
          amount: parsed.data.amount,
          wallet_id: walletId,
          purpose,
          transfer_id: transferId,
          sender_name: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
          sender_email: parsed.data.email,
          sender_phone: parsed.data.phone || undefined,
          sender_bank: form.bank || undefined,
          sender_account_type: form.accountType,
          sender_address_line1: parsed.data.line1,
          sender_address_line2: form.line2 || undefined,
          sender_city: parsed.data.city,
          sender_region: parsed.data.region,
          sender_postal_code: parsed.data.postalCode,
          sender_country: "CA",
        },
      });
      if (fnError) throw new Error(await edgeErrorMessage(fnError, "Could not start the payment"));
      if (data?.error) throw new Error(data.error);
      setAlias((prev) => data.alias ?? prev);
      const created = data.intent as InteracIntent;
      setIntent(created);
      onIntentCreated?.(created);

      // Automated hand-off: Wise-hosted page when available, else the bank app.
      const hosted = (data.hosted_url as string | null) || created.hosted_url || null;
      if (hosted) window.open(hosted, "_blank", "noopener,noreferrer");
      else {
        await navigator.clipboard
          .writeText(
            [
              `Amount: CAD ${Number(created.amount).toFixed(2)}`,
              data.alias ? `${t.sendTo}: ${data.alias}` : null,
              `${t.reference}: ${created.public_id || created.reference}`,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .catch(() => undefined);
        toast.success(t.detailsCopied);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start the payment";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [amount, form, walletId, purpose, transferId, onIntentCreated, t]);

  // Poll the active intent until it settles
  useEffect(() => {
    if (!intent || DONE.includes(intent.status)) return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts > 80) return;
      attempts += 1;
      try {
        const { data } = await supabase.functions.invoke(
          `fincra-cad-interac?intent_id=${encodeURIComponent(intent.id)}`,
          { method: "GET" },
        );
        const next = (data as { intent?: InteracIntent } | null)?.intent;

        if (next) {
          setIntent(next);
          if (DONE.includes(next.status)) {
            toast.success(
              purpose === "transfer"
                ? `CAD ${next.amount} received — sending your transfer now`
                : `CAD ${next.amount} credited to your wallet`,
            );
            onComplete?.();
            return;
          }
        }
      } catch {
        /* retry */
      }
      if (!cancelled) setTimeout(poll, 5000);
    };

    const timer = setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [intent?.id, intent?.status, onComplete, purpose]);

  if (!bootstrapped) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t.waiting}
      </div>
    );
  }

  if (intent) {
    return (
      <InteracStatusView
        intent={intent}
        alias={alias}
        lang={lang}
        purpose={purpose}
        done={DONE.includes(intent.status)}
      />
    );
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-destructive">
          {lang === "fr"
            ? "Le virement Interac n'est pas disponible pour le moment."
            : "Interac e-Transfer is temporarily unavailable."}
        </p>
        <p className="mt-1">
          {lang === "fr"
            ? "Veuillez utiliser le paiement par carte. Nous rétablissons ce mode de paiement sous peu."
            : "Please use card checkout instead — we're restoring this payment method shortly."}
        </p>
      </div>
    );
  }



  return (
    <InteracPayerForm
      lang={lang}
      value={form}
      onChange={setForm}
      amountLabel={amountLabel}
      amount={amountLocked ? undefined : amount}
      onAmountChange={amountLocked ? undefined : setAmount}
      submitting={loading}
      error={error}
      onSubmit={() => void pay()}
    />
  );
}
