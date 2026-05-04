import { useEffect, useState } from "react";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { StripeCardElementOptions } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";

const cardElementOptions: StripeCardElementOptions = {
  hidePostalCode: true,
  style: {
    base: {
      color: "hsl(0 0% 98%)",
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: "16px",
      fontSmoothing: "antialiased",
      "::placeholder": { color: "hsl(0 0% 60%)" },
      iconColor: "hsl(0 0% 80%)",
    },
    invalid: { color: "hsl(0 84% 60%)", iconColor: "hsl(0 84% 60%)" },
  },
};

interface Props {
  defaultWalletId?: string;
  defaultAmount?: number;
  lockAmount?: boolean;
  showWalletSelect?: boolean;
  onSuccess?: (info: { amount: number; currency: string; walletId: string }) => void;
  ctaLabel?: string;
}

function InnerForm({
  walletId,
  amount,
  currency,
  onDone,
  ctaLabel,
}: {
  walletId: string | undefined;
  amount: number;
  currency: string;
  onDone: (info: { amount: number; currency: string; walletId: string }) => void;
  ctaLabel?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [cardName, setCardName] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (!walletId) { toast.error("Select a wallet"); return; }
    if (amount <= 0) { toast.error("Enter an amount"); return; }
    setProcessing(true);
    try {
      const { data: created, error: fnErr } = await supabase.functions.invoke(
        "stripe-payment-intent",
        { body: { action: "create", amount, currency, walletId } },
      );
      if (fnErr || !created?.clientSecret) {
        throw new Error(fnErr?.message || created?.error || "Failed to start payment");
      }
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card element not ready");
      const { error: confirmErr, paymentIntent } = await stripe.confirmCardPayment(
        created.clientSecret,
        { payment_method: { card, billing_details: { name: cardName || undefined } } },
      );
      if (confirmErr) throw new Error(confirmErr.message);
      if (paymentIntent?.status !== "succeeded") throw new Error(`Payment ${paymentIntent?.status}`);

      const { data: settled, error: settleErr } = await supabase.functions.invoke(
        "stripe-payment-intent",
        { body: { action: "confirm", paymentIntentId: paymentIntent.id } },
      );
      if (settleErr || !settled?.success) {
        throw new Error(settleErr?.message || settled?.error || "Settlement failed");
      }
      onDone({ amount, currency, walletId });
    } catch (e: any) {
      toast.error(e.message || "Payment failed");
    } finally {
      setProcessing(false);
    }
  };

  const canSubmit = !!stripe && !!walletId && amount > 0 && !processing;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Name on card</Label>
        <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Full name" autoComplete="cc-name" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Card details</Label>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-3.5">
          <CardElement options={cardElementOptions} />
        </div>
      </div>
      <Button type="submit" disabled={!canSubmit} className="w-full" size="lg">
        {processing ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</>) : (
          amount > 0 ? (ctaLabel ?? `Pay ${currency} ${amount.toFixed(2)}`) : "Enter an amount to continue"
        )}
      </Button>
      <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3" /> Secured with bank-grade encryption
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
  const [stripeReady, setStripeReady] = useState<any>(null);
  const [success, setSuccess] = useState<{ amount: number; currency: string } | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (defaultAmount !== undefined) setAmount(String(defaultAmount));
  }, [defaultAmount]);

  useEffect(() => { if (!stripeReady) getStripe().then(setStripeReady); }, [stripeReady]);

  const wallet = wallets?.find((w) => w.wallet_id === (selectedWalletId ?? defaultWalletId)) || wallets?.[0];
  const currency = wallet?.currency_code ?? "USD";
  const amountNum = parseFloat(amount) || 0;

  const handleDone = (info: { amount: number; currency: string; walletId: string }) => {
    setSuccess({ amount: info.amount, currency: info.currency });
    queryClient.invalidateQueries({ queryKey: ["wallets"] });
    onSuccess?.(info);
  };

  if (success) {
    return (
      <div className="py-6 text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-xl font-display font-bold">Payment Successful</h3>
        <p className="text-sm text-muted-foreground">
          {success.currency} {success.amount.toFixed(2)} added to your wallet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showWalletSelect && wallets && wallets.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Deposit into wallet</Label>
          <Select value={wallet?.wallet_id} onValueChange={setSelectedWalletId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {wallets.map((w) => (
                <SelectItem key={w.wallet_id} value={w.wallet_id}>
                  {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toFixed(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs">Amount ({currency})</Label>
        <Input
          type="number" inputMode="decimal" step="0.01" min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          disabled={lockAmount}
          className="text-lg h-12"
        />
      </div>

      {!stripeReady ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading secure form…
        </div>
      ) : (
        <Elements stripe={stripeReady}>
          <InnerForm
            walletId={wallet?.wallet_id}
            amount={amountNum}
            currency={currency}
            onDone={handleDone}
            ctaLabel={ctaLabel}
          />
        </Elements>
      )}
    </div>
  );
}
