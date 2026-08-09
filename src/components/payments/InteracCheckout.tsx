import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export type InteracIntent = {
  id: string;
  public_id?: string | null;
  amount: number;
  currency_code: string;
  reference: string;
  status: string;
  expires_at?: string;
  claimed_sent_at?: string | null;
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
  /** Submit label for the identity step. */
  submitLabel?: string;
  onComplete?: () => void;
  onIntentCreated?: (intent: InteracIntent) => void;
}

/** Terminal-success statuses (`completed` kept for intents created before the lifecycle change). */
const DONE = ["settled", "completed"];
const OPEN = ["pending", "awaiting_payment"];

const CA_PHONE_RE = /^\+?1?[2-9]\d{9}$/;

const identitySchema = z
  .object({
    amount: z.coerce.number().min(1, "Enter an amount of at least CAD 1.00"),
    senderName: z.string().trim().min(2, "Enter the sender's full name").max(100, "Name is too long"),
    senderEmail: z.string().trim().max(255, "Email is too long"),
    senderPhone: z.string().trim().max(20, "Mobile number is too long"),
    senderBank: z.string().trim().max(100, "Bank name is too long"),
  })
  .refine((v) => Boolean(v.senderEmail || v.senderPhone), {
    message: "Enter the email or mobile number you use with Interac",
    path: ["senderEmail"],
  })
  .refine((v) => !v.senderEmail || z.string().email().safeParse(v.senderEmail).success, {
    message: "Enter a valid email address",
    path: ["senderEmail"],
  })
  .refine((v) => !v.senderPhone || CA_PHONE_RE.test(v.senderPhone.replace(/[^\d+]/g, "")), {
    message: "Enter a valid Canadian mobile number",
    path: ["senderPhone"],
  });

function waitingCopy(status: string, purpose: string): string {
  switch (status) {
    case "awaiting_payment":
      return "Thanks — we're watching for your e-Transfer. This usually confirms within minutes.";
    case "received":
    case "matched":
      return "Deposit received — confirming it against your payment reference.";
    case "confirmed":
      return purpose === "transfer" ? "Payment confirmed — releasing your transfer." : "Payment confirmed — crediting your wallet.";
    case "unmatched":
      return "We received a deposit we couldn't match automatically. Our team is allocating it.";
    default:
      return "Waiting for your Interac transfer…";
  }
}

/**
 * Shared Interac e-Transfer checkout: identity step → payment instructions.
 * Deposits are reconciled in `wise-webhook`, which credits the wallet and
 * (for `purpose: "transfer"`) releases the linked payout.
 */
export default function InteracCheckout({
  walletId,
  purpose = "topup",
  transferId,
  fixedAmount,
  initialAmount,
  resumePending = purpose === "topup",
  submitLabel = "Continue",
  onComplete,
  onIntentCreated,
}: Props) {
  const amountLocked = typeof fixedAmount === "number" && fixedAmount > 0;
  const [amount, setAmount] = useState(
    amountLocked ? String(fixedAmount) : (initialAmount ?? ""),
  );
  useEffect(() => {
    if (amountLocked) setAmount(String(fixedAmount));
    else if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [amountLocked, fixedAmount, initialAmount]);

  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderBank, setSenderBank] = useState("");
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [alias, setAlias] = useState<string | null>(null);
  const [intent, setIntent] = useState<InteracIntent | null>(null);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [configured, setConfigured] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Prefill the sender from the signed-in profile so the step is mostly done
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = String(meta.full_name ?? meta.name ?? "").trim();
      setSenderName((prev) => prev || fullName);
      setSenderEmail((prev) => prev || (data.user!.email ?? ""));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createIntent = useCallback(async () => {
    const parsed = identitySchema.safeParse({ amount, senderName, senderEmail, senderPhone, senderBank });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Check your details");
      return;
    }
    setLoading(true);
    setAutoError(null);
    try {
      const { data, error } = await supabase.functions.invoke("fincra-cad-interac", {
        body: {
          action: "create",
          amount: parsed.data.amount,
          wallet_id: walletId,
          purpose,
          transfer_id: transferId,
          sender_name: parsed.data.senderName,
          sender_email: parsed.data.senderEmail || undefined,
          sender_phone: parsed.data.senderPhone || undefined,
          sender_bank: parsed.data.senderBank || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAlias((prev) => data.alias ?? prev);
      setIntent(data.intent);
      setInstructions(Array.isArray(data.instructions) ? data.instructions : []);
      onIntentCreated?.(data.intent as InteracIntent);
      toast.message("Interac details ready", {
        description: "Send the exact amount from your bank app.",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start the Interac e-Transfer";
      setAutoError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [amount, senderName, senderEmail, senderPhone, senderBank, walletId, purpose, transferId, onIntentCreated]);

  // Resolve the deposit alias (and any resumable open intent)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fincra-cad-interac`,
          {
            headers: {
              Authorization: `Bearer ${session?.access_token || ""}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            },
          },
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setAlias(json.alias ?? null);
          setConfigured(Boolean(json.configured));
          if (resumePending) {
            const pending = Array.isArray(json.pending) ? json.pending[0] : null;
            if (pending) setIntent(pending);
          }
        }
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumePending]);

  // Focus the identity step as soon as it opens so it acts like a checkout
  useEffect(() => {
    if (!bootstrapped || intent) return;
    nameRef.current?.focus();
  }, [bootstrapped, intent]);

  // Poll the active intent until it settles
  useEffect(() => {
    if (!intent || DONE.includes(intent.status)) return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts > 80) return;
      attempts += 1;
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fincra-cad-interac?intent_id=${encodeURIComponent(intent.id)}`,
          {
            headers: {
              Authorization: `Bearer ${session?.access_token || ""}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            },
          },
        );
        const json = await res.json();
        const next = json?.intent as InteracIntent | undefined;
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

    const t = setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [intent?.id, intent?.status, onComplete, purpose]);

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const claimSent = useCallback(async () => {
    if (!intent) return;
    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke("fincra-cad-interac", {
        body: { action: "claim_sent", intent_id: intent.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.intent) setIntent(data.intent as InteracIntent);
      toast.success("Thanks — we'll confirm as soon as the deposit arrives");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record your payment");
    } finally {
      setClaiming(false);
    }
  }, [intent]);

  if (intent && DONE.includes(intent.status)) {
    return (
      <div className="space-y-2 py-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <p className="font-medium">CAD {Number(intent.amount).toFixed(2)} received</p>
        {purpose === "transfer" && (
          <p className="text-sm text-muted-foreground">Your transfer is on its way.</p>
        )}
      </div>
    );
  }

  const showInstructions = Boolean(intent && OPEN.includes(intent.status));
  const showStatusOnly = Boolean(intent && !OPEN.includes(intent.status));

  return (
    <div className="space-y-4">
      {!configured && !intent && !loading && (
        <p className="text-sm text-muted-foreground">
          Interac details are being prepared — try again in a moment.
        </p>
      )}

      {autoError && !intent && <p className="text-sm text-destructive">{autoError}</p>}

      {!intent && loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing Interac details…
        </div>
      )}

      {!intent && !loading && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void createIntent();
          }}
        >
          <p className="text-sm font-medium">Your Interac details</p>

          {amountLocked ? (
            <div className="flex justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">You send by e-Transfer</span>
              <span className="font-semibold tabular-nums">CAD {fixedAmount!.toFixed(2)}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="etx-amount">Amount (CAD)</Label>
              <Input
                id="etx-amount"
                type="number"
                min={1}
                step="0.01"
                placeholder="e.g. 25"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Minimum CAD 1.00 · Send this exact amount</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="etx-name">Full name</Label>
            <Input
              id="etx-name"
              ref={nameRef}
              autoComplete="name"
              maxLength={100}
              placeholder="As it appears on your bank account"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="etx-email">Interac email</Label>
            <Input
              id="etx-email"
              type="email"
              autoComplete="email"
              maxLength={255}
              placeholder="you@example.com"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="etx-phone">Interac mobile number (optional)</Label>
            <Input
              id="etx-phone"
              type="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder="e.g. +1 416 555 0134"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Give the email or mobile you use with Interac so we can match your deposit.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="etx-bank">Sending bank (optional)</Label>
            <Input
              id="etx-bank"
              maxLength={100}
              placeholder="e.g. RBC, TD, Scotiabank"
              value={senderBank}
              onChange={(e) => setSenderBank(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={!(Number(amount) > 0)}>
            {autoError ? "Try again" : submitLabel}
          </Button>
        </form>
      )}

      {showInstructions && intent && (
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Send exactly</span>
              <span className="font-semibold tabular-nums">CAD {Number(intent.amount).toFixed(2)}</span>
            </div>
            {(intent.sender_name || intent.sender_email || intent.sender_phone) && (
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>Sending from</span>
                <span className="break-all text-right">
                  {[intent.sender_name, intent.sender_email || intent.sender_phone, intent.sender_bank]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            )}

            {alias && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Interac recipient</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-sm">{alias}</code>
                  <Button type="button" size="sm" variant="outline" onClick={() => void copy(alias, "Email")}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy email
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Payment reference (put this in the message field)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-sm">{intent.public_id || intent.reference}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copy(intent.public_id || intent.reference, "Reference")}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copy reference
                </Button>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() =>
                void copy(
                  [
                    `Amount: CAD ${Number(intent.amount).toFixed(2)}`,
                    alias ? `Send to: ${alias}` : null,
                    `Reference: ${intent.public_id || intent.reference}`,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  "Payment details",
                )}
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> Copy payment details
            </Button>
          </div>

          <ul className="list-inside list-disc space-y-1.5 text-xs text-muted-foreground">
            {(instructions.length
              ? instructions
              : [
                  "Open your Canadian banking app and start an Interac e-Transfer.",
                  `Send exactly CAD ${Number(intent.amount).toFixed(2)} to the address above.`,
                  "Autodeposit is on — no security question.",
                  purpose === "transfer"
                    ? "Your transfer is sent automatically once the deposit arrives."
                    : "This page updates when your payment is confirmed.",
                ]
            ).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          {intent.status === "pending" ? (
            <Button type="button" variant="outline" className="w-full" disabled={claiming} onClick={() => void claimSent()}>
              {claiming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              I've sent the payment
            </Button>
          ) : null}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {waitingCopy(intent.status, purpose)}
          </div>
        </div>
      )}

      {showStatusOnly && intent && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {waitingCopy(intent.status, purpose)}
        </div>
      )}
    </div>
  );
}
