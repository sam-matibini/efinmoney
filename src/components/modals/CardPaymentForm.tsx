import { useEffect, useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { getStripe } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Lock } from "lucide-react";

interface Props {
  defaultWalletId?: string;
  defaultAmount?: number;
  lockAmount?: boolean;
  showWalletSelect?: boolean;
  onSuccess?: (info: { amount: number; currency: string; walletId: string }) => void;
  ctaLabel?: string;
}

function PaymentElementForm({
  amount,
  currency,
  walletId,
  clientSecret,
  isInitializing,
  onSuccess,
  ctaLabel,
}: {
  amount: number;
  currency: string;
  walletId: string;
  clientSecret: string | null;
  isInitializing: boolean;
  onSuccess?: (info: { amount: number; currency: string; walletId: string }) => void;
  ctaLabel?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);
  const [elementReady, setElementReady] = useState(false);
  const [success, setSuccess] = useState<{ amount: number; currency: string } | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!stripe || !elements) {
      toast.error("Secure payment form is still loading");
      return;
    }

    if (!clientSecret) {
      toast.error("Payment is still initializing");
      return;
    }

    setProcessing(true);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message);

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        redirect: "if_required",
      });

      if (confirmError) throw new Error(confirmError.message);
      if (paymentIntent?.status !== "succeeded") {
        throw new Error(`Payment ${paymentIntent?.status ?? "not completed"}`);
      }

      const { data, error } = await supabase.functions.invoke("stripe-payment-intent", {
        body: {
          action: "confirm",
          paymentIntentId: paymentIntent.id,
        },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || "Failed to credit wallet");
      }

      await queryClient.invalidateQueries({ queryKey: ["wallets"] });

      const result = { amount, currency, walletId };
      setSuccess({ amount, currency });
      onSuccess?.(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setProcessing(false);
    }
  };

  const canSubmit = !!stripe && !!elements && !!clientSecret && !isInitializing && !processing;

  if (success) {
    return (
      <div className="space-y-3 py-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-display font-bold text-foreground">Payment successful!</h3>
        <p className="text-sm text-muted-foreground">
          Payment successful! ${success.amount.toFixed(2)} added to your {success.currency} wallet
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Card details</span>
          {(isInitializing || !elementReady) && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading secure form…
            </span>
          )}
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <PaymentElement
            onReady={() => setElementReady(true)}
            onLoaderStart={() => setElementReady(false)}
            options={{
              layout: {
                type: "tabs",
                defaultCollapsed: false,
              },
            }}
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
        {processing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
          </>
        ) : isInitializing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Initializing payment…
          </>
        ) : (
          ctaLabel ?? `Pay $${amount.toFixed(2)}`
        )}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" /> Secured with bank-grade encryption
      </p>
    </form>
  );
}

export default function CardPaymentForm({
  defaultWalletId,
  defaultAmount,
  lockAmount,
  showWalletSelect = true,
  onSuccess,
  ctaLabel,
}: Props) {
  const { data: wallets } = useWallets();
  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(defaultWalletId);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [stripeReady, setStripeReady] = useState<Awaited<ReturnType<typeof getStripe>> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    getStripe().then(setStripeReady);
  }, []);

  useEffect(() => {
    if (defaultAmount !== undefined) setAmount(String(defaultAmount));
  }, [defaultAmount]);

  useEffect(() => {
    if (defaultWalletId) setSelectedWalletId(defaultWalletId);
  }, [defaultWalletId]);

  const wallet = wallets?.find((item) => item.wallet_id === (selectedWalletId ?? defaultWalletId)) ?? wallets?.[0];
  const currency = wallet?.currency_code ?? "USD";
  const amountNum = parseFloat(amount) || 0;
  const normalizedAmount = Math.max(Math.round(amountNum * 100), 100);

  useEffect(() => {
    if (!wallet?.wallet_id || amountNum <= 0) {
      setClientSecret(null);
      setIsInitializing(false);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setIsInitializing(true);

    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke("stripe-payment-intent", {
        body: {
          action: "create",
          walletId: wallet.wallet_id,
          amount: amountNum,
          currency,
        },
      });

      if (requestIdRef.current !== currentRequestId) return;

      if (error || !data?.clientSecret) {
        setClientSecret(null);
        setIsInitializing(false);
        toast.error(error?.message || data?.error || "Failed to initialize payment");
        return;
      }

      setClientSecret(data.clientSecret);
      setIsInitializing(false);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [wallet?.wallet_id, amountNum, currency]);

  const elementsOptions = useMemo(() => ({
    mode: "payment" as const,
    currency: currency.toLowerCase(),
    amount: normalizedAmount,
    appearance: {
      theme: "night" as const,
      variables: {
        colorPrimary: "hsl(var(--primary))",
        colorBackground: "hsl(var(--muted) / 0.3)",
        colorText: "hsl(var(--foreground))",
        colorDanger: "hsl(var(--destructive))",
        colorTextSecondary: "hsl(var(--muted-foreground))",
        borderRadius: "8px",
        fontFamily: "Inter, system-ui, sans-serif",
      },
      rules: {
        ".Input": {
          backgroundColor: "hsl(var(--muted) / 0.3)",
          border: "1px solid hsl(var(--border))",
          boxShadow: "none",
        },
        ".Tab": {
          border: "1px solid hsl(var(--border))",
          backgroundColor: "hsl(var(--background))",
        },
        ".Tab--selected": {
          backgroundColor: "hsl(var(--accent))",
        },
      },
    },
  }), [currency, normalizedAmount]);

  if (!stripeReady) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading secure form…
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          type="number"
          inputMode="decimal"
          step="0.01"
          min="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          disabled={lockAmount}
          className="h-12 text-lg"
        />
      </div>

      <Elements stripe={stripeReady} options={elementsOptions} key={`${currency}-${normalizedAmount}`}>
        {wallet?.wallet_id && amountNum > 0 ? (
          <PaymentElementForm
            amount={amountNum}
            currency={currency}
            walletId={wallet.wallet_id}
            clientSecret={clientSecret}
            isInitializing={isInitializing}
            onSuccess={onSuccess}
            ctaLabel={ctaLabel}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Enter an amount to load the secure card form.
          </div>
        )}
      </Elements>
    </div>
  );
}