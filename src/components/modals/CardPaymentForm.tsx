import { useEffect, useMemo, useState } from "react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
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

function getThemeColors() {
  if (typeof window === "undefined") {
    return { text: "#0f172a", placeholder: "#94a3b8" };
  }
  const styles = getComputedStyle(document.documentElement);
  const fg = styles.getPropertyValue("--foreground").trim();
  const muted = styles.getPropertyValue("--muted-foreground").trim();
  return {
    text: fg ? `hsl(${fg})` : "#0f172a",
    placeholder: muted ? `hsl(${muted})` : "#94a3b8",
  };
}

function buildCardOptions() {
  const { text, placeholder } = getThemeColors();
  return {
    hidePostalCode: true,
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

  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(defaultWalletId);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [processing, setProcessing] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [success, setSuccess] = useState<{ amount: number; currency: string } | null>(null);

  useEffect(() => {
    if (defaultAmount !== undefined) setAmount(String(defaultAmount));
  }, [defaultAmount]);

  useEffect(() => {
    if (defaultWalletId) setSelectedWalletId(defaultWalletId);
  }, [defaultWalletId]);

  const wallet = wallets?.find((item) => item.wallet_id === (selectedWalletId ?? defaultWalletId)) ?? wallets?.[0];
  const currency = wallet?.currency_code ?? "USD";
  const amountNum = parseFloat(amount) || 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!stripe || !elements) {
      toast.error("Secure payment form is still loading");
      return;
    }
    if (!wallet?.wallet_id) {
      toast.error("Please select a wallet");
      return;
    }
    if (amountNum <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    const card = elements.getElement(CardElement);
    if (!card) {
      toast.error("Card field not ready");
      return;
    }

    setProcessing(true);

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

      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(createData.clientSecret, {
        payment_method: {
          card,
          billing_details: {
            address: { country: "CA" },
          },
        },
      });

      if (confirmError) throw new Error(confirmError.message);
      if (paymentIntent?.status !== "succeeded") {
        throw new Error(`Payment ${paymentIntent?.status ?? "not completed"}`);
      }

      const { data, error } = await supabase.functions.invoke("stripe-payment-intent", {
        body: { action: "confirm", paymentIntentId: paymentIntent.id },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || "Failed to credit wallet");
      }

      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      await queryClient.invalidateQueries({ queryKey: ["ledger-deposits"] });

      const result = { amount: amountNum, currency, walletId: wallet.wallet_id };
      setSuccess({ amount: amountNum, currency });
      onSuccess?.(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setProcessing(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-3 py-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-display font-bold text-foreground">Payment successful!</h3>
        <p className="text-sm text-muted-foreground">
          ${success.amount.toFixed(2)} added to your {success.currency} wallet
        </p>
      </div>
    );
  }

  const canSubmit = !!stripe && !!elements && cardReady && !processing && amountNum > 0 && !!wallet?.wallet_id;

  return (
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

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Card details</span>
          {!cardReady && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </span>
          )}
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-3.5">
          <CardElement options={buildCardOptions()} onReady={() => setCardReady(true)} />
        </div>
      </div>

      <div className="sticky bottom-0 -mx-1 px-1 pt-3 pb-1 bg-background/95 backdrop-blur-sm space-y-2 border-t border-border/40">
        <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
          {processing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
            </>
          ) : (
            ctaLabel ?? `Pay $${amountNum.toFixed(2)}`
          )}
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" /> Secured with bank-grade encryption
        </p>
      </div>
    </form>
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
