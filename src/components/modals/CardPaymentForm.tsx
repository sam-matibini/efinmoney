import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Lock } from "lucide-react";

interface Props {
  amount: number;
  currency: string;
  walletId: string;
  walletSymbol?: string;
  clientSecret: string | null;
  isInitializing: boolean;
  onSuccess?: (info: { amount: number; currency: string; walletId: string }) => void;
  ctaLabel?: string;
}

export default function CardPaymentForm({
  amount,
  currency,
  walletId,
  walletSymbol = "$",
  clientSecret,
  isInitializing,
  onSuccess,
  ctaLabel,
}: Props) {
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
          Payment successful! {walletSymbol}{success.amount.toFixed(2)} added to your {success.currency} wallet
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
          ctaLabel ?? `Pay ${walletSymbol}${amount.toFixed(2)}`
        )}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" /> Secured with bank-grade encryption
      </p>
    </form>
  );
}