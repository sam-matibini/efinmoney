import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { notifyOpsCollectFailure } from "@/lib/corridorRails";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import InteracPayerForm, { emptyPayerForm, type PayerForm } from "@/components/payments/InteracPayerForm";
import InteracStatusView from "@/components/payments/InteracStatusView";
import { CHECKOUT_STRINGS, type Lang } from "@/components/payments/checkoutStrings";
import { productFeatures } from "@/lib/productFeatures";

const FLOVIDE_FN = "flovide-cad-interac";
/** Loop Bank CAD Interac Autodeposit. */
const WISE_FN = "wise-cad-interac";
/** Fincra CAD Interac (@fincra.ca Autodeposit). */
const FINCRA_FN = "fincra-cad-interac";

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
  /** Flovide collection payer email */
  payer_email?: string | null;
  payer_name?: string | null;
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
  amount: z.coerce.number().min(2, "Enter an amount of at least CAD 2.00"),
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
 * CAD Interac checkout: prefer Fincra (@fincra.ca) when enabled, then Flovide, then Loop.
 * Deposits credit the wallet and (for `purpose: "transfer"`) release the linked payout.
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
  const [eft, setEft] = useState<{ bankNumber: string; transitNumber: string; accountNumber: string } | null>(null);
  const [configured, setConfigured] = useState(true);
  const [railFn, setRailFn] = useState(
    productFeatures.fincraInterac
      ? FINCRA_FN
      : (productFeatures.flovide || productFeatures.flovideInterac)
      ? FLOVIDE_FN
      : WISE_FN,
  );
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
        const tryFn = async (fn: string) => {
          const { data, error: fnError } = await supabase.functions.invoke(fn, { method: "GET" });
          if (fnError) return null;
          return (data ?? {}) as Record<string, unknown>;
        };

        let json: Record<string, unknown> | null = null;
        let fn = WISE_FN;

        // Prefer Fincra CAD Interac when the feature is on and an alias is configured.
        if (productFeatures.fincraInterac) {
          json = await tryFn(FINCRA_FN);
          if (json && json.configured !== false) fn = FINCRA_FN;
          else json = null;
        }
        if (!json && (productFeatures.flovide || productFeatures.flovideInterac)) {
          json = await tryFn(FLOVIDE_FN);
          if (json && json.configured !== false) fn = FLOVIDE_FN;
          else json = null;
        }
        if (!json) {
          json = await tryFn(WISE_FN);
          if (json && json.configured !== false) fn = WISE_FN;
          else if (productFeatures.fincraInterac) {
            // Surface Fincra's configured:false rather than silently looking configured.
            const fincra = await tryFn(FINCRA_FN);
            if (fincra) {
              json = fincra;
              fn = FINCRA_FN;
            }
          }
        }
        if (cancelled) return;
        if (!json) return;
        setRailFn(fn);
        setAlias((json.alias as string | null) ?? null);
        const eftJson = json.eft as { bankNumber?: string; transitNumber?: string; accountNumber?: string } | null;
        if (eftJson?.bankNumber && eftJson.transitNumber && eftJson.accountNumber) {
          setEft({
            bankNumber: String(eftJson.bankNumber),
            transitNumber: String(eftJson.transitNumber),
            accountNumber: String(eftJson.accountNumber),
          });
        }
        // Only block when the backend explicitly says there is no deposit alias.
        if (json.configured === false) setConfigured(false);
        else setConfigured(true);
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
      const payload = {
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
      };

      const invokeCreate = async (fn: string) => {
        const { data, error: fnError } = await supabase.functions.invoke(fn, { body: payload });
        if (fnError) throw new Error(await edgeErrorMessage(fnError, "Could not start the payment"));
        return data as Record<string, unknown>;
      };

      const fallbackOrder = [FINCRA_FN, FLOVIDE_FN, WISE_FN].filter(
        (fn, i, arr) => fn !== railFn && arr.indexOf(fn) === i,
      );

      let data: Record<string, unknown>;
      let usedFn = railFn;
      try {
        data = await invokeCreate(usedFn);
        if (data?.error) {
          for (const fn of fallbackOrder) {
            usedFn = fn;
            data = await invokeCreate(usedFn);
            if (!data?.error) break;
          }
        }
      } catch (first) {
        let recovered: Record<string, unknown> | null = null;
        for (const fn of fallbackOrder) {
          try {
            usedFn = fn;
            recovered = await invokeCreate(usedFn);
            if (!recovered?.error) break;
          } catch {
            recovered = null;
          }
        }
        if (!recovered || recovered.error) throw first;
        data = recovered;
      }
      if (data?.error) throw new Error(String(data.error));
      setRailFn(usedFn);
      setAlias((prev) => (data.alias as string | null) ?? prev);
      const eftJson = data.eft as { bankNumber?: string; transitNumber?: string; accountNumber?: string } | null | undefined;
      if (eftJson?.bankNumber && eftJson.transitNumber && eftJson.accountNumber) {
        setEft({
          bankNumber: String(eftJson.bankNumber),
          transitNumber: String(eftJson.transitNumber),
          accountNumber: String(eftJson.accountNumber),
        });
      }

      const created = data.intent as InteracIntent;

      if (usedFn === FLOVIDE_FN) {
        const next = {
          ...created,
          sender_email: created.sender_email || created.payer_email || parsed.data.email,
          payer_email: created.payer_email || parsed.data.email,
        };
        setIntent(next);
        onIntentCreated?.(next);
        const hosted = (data.hosted_url as string | null) || created.hosted_url || null;
        if (hosted) window.open(hosted, "_blank", "noopener,noreferrer");
        else {
          toast.success("Interac request sent", {
            description: Array.isArray(data.instructions)
              ? String((data.instructions as string[])[0])
              : `Approve the CAD ${Number(created.amount).toFixed(2)} request in your banking app.`,
          });
        }
      } else {
        // Interac funds Wise via Autodeposit — never open Quick Pay (self-pay blocked).
        const next = { ...created, hosted_url: null };
        setIntent(next);
        onIntentCreated?.(next);

        const aliasLine = (data.alias as string | null) || alias;
        await navigator.clipboard
          .writeText(
            [
              `Amount: CAD ${Number(created.amount).toFixed(2)}`,
              aliasLine ? `${t.sendTo}: ${aliasLine}` : null,
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
      void notifyOpsCollectFailure({
        rail: railFn,
        currency: "CAD",
        amount,
        wallet_id: walletId,
        error: message,
        stage: "create_intent",
      });
    } finally {
      setLoading(false);
    }
  }, [amount, form, walletId, purpose, transferId, onIntentCreated, t, railFn, alias]);

  // Poll the active intent until it settles
  useEffect(() => {
    if (!intent || DONE.includes(intent.status)) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled || attempts > 120) return;
      attempts += 1;
      try {
        let next: InteracIntent | null = null;
        if (railFn === FLOVIDE_FN) {
          const { data } = await supabase.functions.invoke(
            `${railFn}?intent_id=${encodeURIComponent(intent.id)}`,
            { method: "GET" },
          );
          next = (data as { intent?: InteracIntent } | null)?.intent ?? null;
        } else {
          const { data } = await supabase
            .from("fincra_cad_interac_intents")
            .select(
              "id, public_id, amount, currency_code, reference, status, expires_at, claimed_sent_at, hosted_url, sender_name, sender_email, sender_phone, sender_bank",
            )
            .eq("id", intent.id)
            .maybeSingle();
          next = data as InteracIntent | null;
        }

        if (next) {
          setIntent(next as InteracIntent);
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
      if (!cancelled) timer = setTimeout(poll, 4000);
    };

    timer = setTimeout(poll, 3000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [intent?.id, intent?.status, onComplete, purpose, railFn]);

  if (!bootstrapped) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t.waiting}
      </div>
    );
  }

  if (intent) {
    const isFlovide = railFn === FLOVIDE_FN;
    const isFincra = railFn === FINCRA_FN;
    return (
      <InteracStatusView
        intent={intent}
        alias={isFlovide ? null : alias}
        eft={isFlovide || isFincra ? null : eft}
        lang={lang}
        purpose={purpose}
        done={DONE.includes(intent.status)}
        variant={isFlovide ? "flovide" : isFincra ? "fincra" : "loop"}
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
