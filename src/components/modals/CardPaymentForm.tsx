import { useEffect, useMemo, useState } from "react";
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeElementChangeEvent } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { getStripe } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Loader2, Lock } from "lucide-react";

interface Props {
  defaultWalletId?: string;
  defaultAmount?: number;
  lockAmount?: boolean;
  showWalletSelect?: boolean;
  onSuccess?: (info: { amount: number; currency: string; walletId: string }) => void;
  ctaLabel?: string;
}

type ProcessingStage = "auth" | "charge" | "credit" | null;

const STAGE_COPY: Record<Exclude<ProcessingStage, null>, { title: string; sub: string }> = {
  auth: { title: "Authorizing your card…", sub: "Securely contacting your bank" },
  charge: { title: "Processing payment…", sub: "Confirming with your card issuer" },
  credit: { title: "Crediting your wallet…", sub: "Almost done" },
};

function resolveCssColor(value: string, fallback: string) {
  if (typeof window === "undefined" || !value) return fallback;
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color || fallback;
  document.body.removeChild(probe);
  return resolved;
}

function getThemeColors() {
  if (typeof window === "undefined") {
    return { text: "rgb(15, 23, 42)", placeholder: "rgb(148, 163, 184)" };
  }
  const styles = getComputedStyle(document.documentElement);
  const fg = styles.getPropertyValue("--foreground").trim();
  const muted = styles.getPropertyValue("--muted-foreground").trim();
  return {
    text: resolveCssColor(fg ? `hsl(${fg})` : "", "rgb(15, 23, 42)"),
    placeholder: resolveCssColor(muted ? `hsl(${muted})` : "", "rgb(148, 163, 184)"),
  };
}

function buildElementOptions() {
  const { text, placeholder } = getThemeColors();
  return {
    style: {
      base: {
        color: text,
        fontSize: "16px",
        fontFamily: "Inter, system-ui, sans-serif",
        "::placeholder": { color: placeholder },
        iconColor: text,
      },
      invalid: { color: "#ef4444", iconColor: "#ef4444" },
    },
  } as const;
}

function FieldShell({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div
        className={`rounded-lg border bg-muted/30 px-3 py-3.5 transition-colors ${
          error ? "border-destructive" : "border-border"
        }`}
      >
        {children}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function InnerForm({
  wallets,
  defaultWalletId,
  defaultAmount,
  lockAmount,
  showWalletSelect,
  onSuccess,
  ctaLabel,
}: Props & { wallets: ReturnType<typeof useWallets>["data"] }) {
  const stripe = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const elementOptions = useMemo(() => buildElementOptions(), []);

  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(defaultWalletId);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [cardholderName, setCardholderName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [numberState, setNumberState] = useState<StripeElementChangeEvent | null>(null);
  const [expiryState, setExpiryState] = useState<StripeElementChangeEvent | null>(null);
  const [cvcState, setCvcState] = useState<StripeElementChangeEvent | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>(null);
  const [success, setSuccess] = useState<{ amount: number; currency: string; symbol: string } | null>(null);

  useEffect(() => {
    if (defaultAmount !== undefined) setAmount(String(defaultAmount));
  }, [defaultAmount]);

  useEffect(() => {
    if (defaultWalletId) setSelectedWalletId(defaultWalletId);
  }, [defaultWalletId]);

  useEffect(() => {
    if (!cardholderName && profile?.full_name) setCardholderName(profile.full_name.toUpperCase());
  }, [profile?.full_name]);

  const wallet = wallets?.find((item) => item.wallet_id === (selectedWalletId ?? defaultWalletId)) ?? wallets?.[0];
  const currency = wallet?.currency_code ?? "USD";
  const symbol = wallet?.symbol ?? "$";
  const amountNum = parseFloat(amount) || 0;

  const cardComplete =
    !!numberState?.complete && !!expiryState?.complete && !!cvcState?.complete;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stripe || !elements) return toast.error("Secure payment form is still loading");
    if (!wallet?.wallet_id) return toast.error("Please select a wallet");
    if (amountNum <= 0) return toast.error("Enter a valid amount");
    if (!cardholderName.trim()) return toast.error("Cardholder name is required");

    const cardNumber = elements.getElement(CardNumberElement);
    if (!cardNumber) return toast.error("Card field not ready");

    setProcessing(true);
    setProcessingStage("auth");

    try {
      const { data: createData, error: createErr } = await supabase.functions.invoke("stripe-payment-intent", {
        body: {
          action: "create",
          walletId: wallet.wallet_id,
          amount: amountNum,
          currency,
        },
      });

      if (createErr || !createData?.clientSecret) {
        throw new Error(createErr?.message || createData?.error || "Failed to initialize payment");
      }

      setProcessingStage("charge");

      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(createData.clientSecret, {
        payment_method: {
          card: cardNumber,
          billing_details: {
            name: cardholderName.trim(),
            address: {
              country: "CA",
              postal_code: postalCode.trim() || undefined,
            },
          },
        },
      });

      if (confirmError) throw new Error(confirmError.message);
      if (paymentIntent?.status !== "succeeded") {
        throw new Error(`Payment ${paymentIntent?.status ?? "not completed"}`);
      }

      setProcessingStage("credit");

      const { data, error } = await supabase.functions.invoke("stripe-payment-intent", {
        body: { action: "confirm", paymentIntentId: paymentIntent.id },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || "Failed to credit wallet");
      }

      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      await queryClient.invalidateQueries({ queryKey: ["ledger-deposits"] });

      const result = { amount: amountNum, currency, walletId: wallet.wallet_id };
      setSuccess({ amount: amountNum, currency, symbol });
      onSuccess?.(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setProcessing(false);
      setProcessingStage(null);
    }
  };

  if (success) {
    return (
      <div className="space-y-3 py-6 text-center animate-fade-in">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-display font-bold text-foreground">Payment successful!</h3>
        <p className="text-sm text-muted-foreground">
          {success.symbol}{success.amount.toFixed(2)} added to your {success.currency} wallet
        </p>
      </div>
    );
  }

  const canSubmit =
    !!stripe &&
    !!elements &&
    cardComplete &&
    !processing &&
    amountNum > 0 &&
    !!wallet?.wallet_id &&
    cardholderName.trim().length > 0;

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="space-y-4">
        {showWalletSelect && wallets && wallets.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Deposit into wallet</Label>
            <Select value={wallet?.wallet_id} onValueChange={setSelectedWalletId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((item) => (
                  <SelectItem key={item.wallet_id} value={item.wallet_id}>
                    {item.flag_emoji} {item.currency_code} — {item.symbol}{Number(item.balance).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs">Amount ({currency})</Label>
          <Input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            disabled={lockAmount}
            className="h-12 text-lg"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Cardholder name</Label>
          <Input
            placeholder="JOHN DOE"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
            maxLength={50}
            autoComplete="cc-name"
          />
        </div>

        <FieldShell label="Card number" error={numberState?.error?.message}>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <CardNumberElement options={elementOptions} onChange={setNumberState} />
            </div>
            <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </FieldShell>

        <div className="grid grid-cols-2 gap-3">
          <FieldShell label="Expiry (MM/YY)" error={expiryState?.error?.message}>
            <CardExpiryElement options={elementOptions} onChange={setExpiryState} />
          </FieldShell>
          <FieldShell label="CVC" error={cvcState?.error?.message}>
            <CardCvcElement options={elementOptions} onChange={setCvcState} />
          </FieldShell>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Postal / ZIP code <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            placeholder="A1A 1A1"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value.toUpperCase())}
            maxLength={10}
            autoComplete="postal-code"
          />
        </div>

        <div className="sticky bottom-0 -mx-1 px-1 pt-3 pb-1 bg-background/95 backdrop-blur-sm space-y-2 border-t border-border/40">
          <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
            {processing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
            ) : (
              ctaLabel ?? `Pay ${symbol}${amountNum.toFixed(2)} ${currency}`
            )}
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Secured with bank-grade encryption
          </p>
        </div>
      </form>

      {processing && processingStage && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-md bg-background/85 backdrop-blur-sm animate-fade-in">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
            <Loader2 className="relative h-12 w-12 animate-spin text-primary" />
          </div>
          <div className="text-center space-y-1 px-6">
            <h4 className="text-base font-display font-semibold text-foreground">
              {STAGE_COPY[processingStage].title}
            </h4>
            <p className="text-xs text-muted-foreground">{STAGE_COPY[processingStage].sub}</p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Please do not close this window
          </div>
        </div>
      )}
    </div>
  );
}

export default function CardPaymentForm(props: Props) {
  const { data: wallets } = useWallets();
  const [stripeReady, setStripeReady] = useState<Awaited<ReturnType<typeof getStripe>> | null>(null);

  useEffect(() => {
    getStripe().then(setStripeReady);
  }, []);

  const elementsOptions = useMemo(() => {
    const { text } = getThemeColors();
    return {
      appearance: {
        theme: "stripe" as const,
        variables: {
          colorText: text,
          fontFamily: "Inter, system-ui, sans-serif",
        },
      },
    };
  }, []);

  if (!stripeReady) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading secure form…
      </div>
    );
  }

  return (
    <Elements stripe={stripeReady} options={elementsOptions}>
      <InnerForm {...props} wallets={wallets} />
    </Elements>
  );
}
