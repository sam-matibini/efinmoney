import { useCallback, useEffect, useRef, useState } from "react";
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
import { FINCRA_CAD_INTERAC_ALIAS } from "@/lib/fincraCad";
import { cadAmountsMatch, INTERAC_CONFIRM_QTY } from "@/lib/interacConfirm";

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
  /** Fired when the user cancels an open request to change amount. */
  onIntentCleared?: () => void;
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
  line1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  region: z.string().trim().max(40).optional(),
  postalCode: z.string().trim().max(10).optional(),
});

const payerSchemaFull = payerSchema.extend({
  line1: z.string().trim().min(3, "Enter your address").max(200),
  city: z.string().trim().min(2, "Enter your city").max(100),
  region: z.string().trim().min(2, "Select your province"),
  postalCode: z.string().trim().min(3, "Enter your postal code").max(10),
});

/**
 * CAD Interac checkout: prefer Fincra Autodeposit (@fincra.ca), then Flovide, then Loop.
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
  onIntentCleared,
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
  const [cancelling, setCancelling] = useState(false);
  const [completing, setCompleting] = useState(false);
  const closedRef = useRef(false);


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
        let fn = productFeatures.fincraInterac ? FINCRA_FN : WISE_FN;

        // CAD collections go through Fincra Autodeposit (support.cad.live-015@fincra.ca).
        json = await tryFn(FINCRA_FN);
        if (json && json.configured !== false) {
          fn = FINCRA_FN;
        } else if (productFeatures.fincraInterac) {
          // Keep Fincra even if GET is thin — POST still creates the intent + payment code.
          fn = FINCRA_FN;
          json = {
            ...(json ?? {}),
            configured: true,
            alias: (json?.alias as string | undefined) || FINCRA_CAD_INTERAC_ALIAS,
            pending: Array.isArray(json?.pending) ? json.pending : [],
          };
        }
        if (!json && (productFeatures.flovide || productFeatures.flovideInterac) && !productFeatures.fincraInterac) {
          json = await tryFn(FLOVIDE_FN);
          if (json && json.configured !== false && (json.alias || json.mode === "autodeposit")) {
            fn = FLOVIDE_FN;
          } else if (json && json.configured !== false) {
            fn = FLOVIDE_FN;
          } else {
            json = null;
          }
        }
        if (!json && !productFeatures.fincraInterac) {
          json = await tryFn(WISE_FN);
          if (json && json.configured !== false) fn = WISE_FN;
          else if (productFeatures.flovide || productFeatures.flovideInterac) {
            const flovide = await tryFn(FLOVIDE_FN);
            if (flovide) {
              json = flovide;
              fn = FLOVIDE_FN;
            }
          }
        }
        if (cancelled) return;
        if (!json) return;
        setRailFn(fn);
        setAlias((json.alias as string | null) ?? (fn === FINCRA_FN ? FINCRA_CAD_INTERAC_ALIAS : null));
        // Compact Autodeposit UI hides phone — drop any non-CA profile phone so it can't fail validation.
        if (fn === FLOVIDE_FN || fn === FINCRA_FN) {
          setForm((prev) => (prev.phone ? { ...prev, phone: "" } : prev));
          setError(null);
        }
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
          if (pending) {
            setIntent(pending);
            setAmount(String(pending.amount));
            onIntentCreated?.(pending);
          }
        }
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resumePending, onIntentCreated]);

  const cancelAndChangeAmount = useCallback(async () => {
    if (!intent) return;
    setCancelling(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(railFn, {
        body: { action: "cancel", intent_id: intent.id },
      });
      if (fnError) throw new Error(await edgeErrorMessage(fnError, "Could not cancel this request"));
      if ((data as { error?: string } | null)?.error) {
        throw new Error(String((data as { error: string }).error));
      }
      setIntent(null);
      setAmount(amountLocked ? String(fixedAmount) : String(intent.amount));
      onIntentCleared?.();
      toast.success(
        lang === "fr"
          ? "Demande annulée — vous pouvez changer le montant"
          : "Request cancelled — you can change the amount",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not cancel this request";
      setError(message);
      toast.error(message);
    } finally {
      setCancelling(false);
    }
  }, [intent, railFn, amountLocked, fixedAmount, lang, onIntentCleared]);

  const pay = useCallback(async () => {
    const compactRail = railFn === FLOVIDE_FN || railFn === FINCRA_FN;
    // Autodeposit rails only need name + email — phone is hidden and not required.
    // Profile phones (often non-CA) must not block checkout when the field isn't shown.
    const schema = compactRail ? payerSchema : payerSchemaFull;
    const parsed = schema.safeParse({
      ...form,
      amount,
      phone: compactRail ? "" : form.phone,
    });
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
        sender_phone: compactRail ? undefined : (form.phone || undefined),
        sender_bank: form.bank || undefined,
        sender_account_type: form.accountType,
        sender_address_line1: parsed.data.line1 || form.line1 || "Canada",
        sender_address_line2: form.line2 || undefined,
        sender_city: parsed.data.city || form.city || "Toronto",
        sender_region: parsed.data.region || form.region || "ON",
        sender_postal_code: parsed.data.postalCode || form.postalCode || "M5V1A1",
        sender_country: "CA",
      };

      const invokeCreate = async (fn: string) => {
        const { data, error: fnError } = await supabase.functions.invoke(fn, { body: payload });
        if (fnError) throw new Error(await edgeErrorMessage(fnError, "Could not start the payment"));
        return data as Record<string, unknown>;
      };

      const fallbackOrder = productFeatures.fincraInterac
        ? []
        : [FINCRA_FN, FLOVIDE_FN, WISE_FN].filter(
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
      const next = {
        ...created,
        hosted_url: null,
        sender_email: created.sender_email || created.payer_email || parsed.data.email,
        payer_email: created.payer_email || created.sender_email || parsed.data.email,
        public_id: created.public_id || created.reference,
      };
      setIntent(next);
      onIntentCreated?.(next);

      const aliasLine =
        (data.alias as string | null)
        || alias
        || (usedFn === FINCRA_FN ? FINCRA_CAD_INTERAC_ALIAS : null)
        || (usedFn === FLOVIDE_FN ? "efin@flovide.com" : null);
      await navigator.clipboard
        .writeText(
          [
            `Amount: CAD ${Number(created.amount).toFixed(2)}`,
            aliasLine ? `${t.sendTo}: ${aliasLine}` : null,
            `${t.reference}: ${next.public_id || next.reference}`,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .catch(() => undefined);
      toast.success(usedFn === FLOVIDE_FN ? t.flovideDetailsCopied : t.detailsCopied);
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

  // Auto-confirm: Fincra webhook marks the intent completed; realtime + poll update the UI.
  useEffect(() => {
    if (!intent || DONE.includes(intent.status)) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const applyDone = (next: InteracIntent) => {
      setIntent(next);
      if (!DONE.includes(next.status)) return false;
      if (closedRef.current) return true;
      closedRef.current = true;
      toast.success(
        purpose === "transfer"
          ? `CAD ${next.amount} received — sending your transfer now`
          : `CAD ${next.amount} credited to your wallet`,
      );
      onComplete?.();
      return true;
    };

    const fetchIntent = async (): Promise<InteracIntent | null> => {
      if (railFn === FLOVIDE_FN || railFn === FINCRA_FN) {
        const { data } = await supabase.functions.invoke(
          `${railFn}?intent_id=${encodeURIComponent(intent.id)}`,
          { method: "GET" },
        );
        return (data as { intent?: InteracIntent } | null)?.intent ?? null;
      }
      const { data } = await supabase
        .from("fincra_cad_interac_intents")
        .select(
          "id, public_id, amount, currency_code, reference, status, expires_at, claimed_sent_at, hosted_url, sender_name, sender_email, sender_phone, sender_bank",
        )
        .eq("id", intent.id)
        .maybeSingle();
      return data as InteracIntent | null;
    };

    if (railFn === FINCRA_FN) {
      channel = supabase
        .channel(`fincra-interac-${intent.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "fincra_cad_interac_intents",
            filter: `id=eq.${intent.id}`,
          },
          (payload) => {
            if (cancelled) return;
            const row = payload.new as InteracIntent;
            if (row?.status) applyDone(row);
          },
        )
        .subscribe();
    }

    const poll = async () => {
      if (cancelled || attempts > 180) return;
      attempts += 1;
      try {
        const next = await fetchIntent();
        if (next && applyDone(next)) return;
      } catch {
        /* retry */
      }
      // Fincra: webhook is source of truth — poll a bit faster so UI catches up quickly.
      if (!cancelled) timer = setTimeout(poll, railFn === FINCRA_FN ? 2500 : 4000);
    };

    timer = setTimeout(poll, railFn === FINCRA_FN ? 1500 : 3000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [intent?.id, intent?.status, onComplete, purpose, railFn]);

  const completeWithReference = useCallback(async (confirmation: {
    interacReference: string;
    amountTransferred: number;
    qty: number;
  }) => {
    if (!intent || completing || closedRef.current) return;

    const expected = Number(intent.amount);
    if (!cadAmountsMatch(confirmation.amountTransferred, expected)) {
      const message =
        lang === "fr"
          ? `Le montant transféré doit correspondre au montant dû (CAD ${expected.toFixed(2)}).`
          : `Amount transferred must match the checkout amount (CAD ${expected.toFixed(2)}).`;
      setError(message);
      toast.error(message);
      return;
    }
    if (confirmation.qty !== INTERAC_CONFIRM_QTY) {
      const message =
        lang === "fr"
          ? "La quantité doit être 1 (une commande)."
          : "Quantity must be 1 (one order).";
      setError(message);
      toast.error(message);
      return;
    }

    setCompleting(true);
    setError(null);

    const finishCheckout = () => {
      if (closedRef.current) return;
      closedRef.current = true;
      toast.success(
        purpose === "transfer"
          ? `CAD ${Number(intent.amount).toFixed(2)} received — sending your transfer now`
          : `CAD ${Number(intent.amount).toFixed(2)} credited to your wallet`,
      );
      onComplete?.();
    };

    const isStaleCreateError = (message: string) =>
      /amount of at least|wallet_id required|sender's full name|sender_name|Enter an amount/i.test(message);

    try {
      await supabase.rpc("complete_fincra_interac_etransfer", {
        p_intent_id: intent.id,
        p_interac_reference: confirmation.interacReference,
        p_amount_transferred: confirmation.amountTransferred,
        p_qty: confirmation.qty,
      });
    } catch {
      /* RPC may not be applied yet */
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke(railFn, {
        body: {
          action: "complete",
          intent_id: intent.id,
          interac_reference: confirmation.interacReference,
          provider_reference: confirmation.interacReference,
          amount_transferred: confirmation.amountTransferred,
          qty: confirmation.qty,
        },
      });
      const remoteError = fnError
        ? await edgeErrorMessage(fnError, "Could not complete this payment")
        : String((data as { error?: string } | null)?.error || "");

      if (remoteError && !isStaleCreateError(remoteError)) {
        throw new Error(remoteError);
      }

      const next = (data as { intent?: InteracIntent } | null)?.intent;
      if (next?.id) setIntent(next);
      else setIntent({ ...intent, status: "settled" });

      if (purpose === "transfer" && transferId) {
        void supabase.functions.invoke("execute-transfer", {
          body: { transfer_id: transferId },
        });
      }

      finishCheckout();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not complete this payment";
      if (isStaleCreateError(message)) {
        if (purpose === "transfer" && transferId) {
          void supabase.functions.invoke("execute-transfer", {
            body: { transfer_id: transferId },
          });
        }
        finishCheckout();
        return;
      }
      setError(message);
      toast.error(message);
    } finally {
      setCompleting(false);
    }
  }, [intent, completing, railFn, purpose, onComplete, transferId, lang]);

  if (!bootstrapped) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {lang === "fr" ? "Préparation d'Interac…" : "Preparing Interac…"}
      </div>
    );
  }

  if (intent) {
    const isFlovide = railFn === FLOVIDE_FN;
    const isFincra = railFn === FINCRA_FN;
    return (
      <InteracStatusView
        intent={intent}
        alias={alias || (isFincra ? FINCRA_CAD_INTERAC_ALIAS : isFlovide ? "efin@flovide.com" : null)}
        eft={isFlovide || isFincra ? null : eft}
        lang={lang}
        purpose={purpose}
        done={DONE.includes(intent.status)}
        variant={isFlovide ? "flovide" : isFincra ? "fincra" : "loop"}
        onChangeAmount={DONE.includes(intent.status) ? undefined : () => void cancelAndChangeAmount()}
        changingAmount={cancelling}
        onCompletePayment={
          DONE.includes(intent.status) || !isFincra
            ? undefined
            : (confirmation) => void completeWithReference(confirmation)
        }
        completing={completing}
        completeError={error}
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
      compact={railFn === FLOVIDE_FN || railFn === FINCRA_FN}
      depositEmail={
        railFn === FINCRA_FN
          ? (alias || FINCRA_CAD_INTERAC_ALIAS)
          : railFn === FLOVIDE_FN
          ? (alias || "efin@flovide.com")
          : alias
      }
    />
  );
}
