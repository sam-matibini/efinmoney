/**
 * Square wallet top-up via hosted Checkout (Payment Link).
 * Hosted pages work with browser extensions; Web Payments SDK iframes often do not.
 * @see https://developer.squareup.com/docs/checkout-api/quick-pay-checkout
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  walletId: string;
  walletCurrency: string;
  initialAmount?: string;
  embedded?: boolean;
  onComplete?: () => void;
  /** Checkout link could not be created — parent may switch to a backup rail. */
  onCheckoutUnavailable?: () => void;
};

const SUPPORTED = new Set(["USD", "CAD", "EUR", "GBP"]);

function buildSquareRedirectUrl(): string {
  const path = "/wallet/topup";
  return `${window.location.origin}${path}`;
}

export default function SquareTopUpCard({
  walletId,
  walletCurrency,
  initialAmount = "",
  embedded = false,
  onCheckoutUnavailable,
}: Props) {
  const [amount, setAmount] = useState(initialAmount);
  const [busy, setBusy] = useState(false);
  const ccy = walletCurrency.toUpperCase();

  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);

  if (!SUPPORTED.has(ccy)) {
    return <p className="text-sm text-destructive">Card top-up is not available for {ccy}</p>;
  }

  const pay = async () => {
    const amt = Number(String(amount).replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error("Enter an amount of at least 1");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("square-create-checkout", {
        body: {
          walletId,
          amount: amt,
          currency: ccy,
          redirectUrl: buildSquareRedirectUrl(),
        },
      });
      const errMsg = (data as { error?: string } | null)?.error
        || (typeof data === "string" ? data : null)
        || error?.message;
      if (error || (data as { error?: string } | null)?.error) {
        throw new Error(errMsg || "Could not start card checkout");
      }
      const url = String(data?.checkout_url || "");
      if (!url) throw new Error("No checkout URL returned");

      try {
        sessionStorage.setItem("efm_square_pending_order", String(data.order_id || ""));
        sessionStorage.setItem("efm_square_pending_intent", String(data.intent_id || ""));
      } catch { /* ignore */ }

      toast.info("Opening secure checkout…");
      window.location.href = url;
    } catch (e) {
      if (onCheckoutUnavailable) {
        onCheckoutUnavailable();
      } else {
        toast.error(e instanceof Error ? e.message : "Checkout failed");
      }
      setBusy(false);
    }
  };

  const body = (
    <div className="space-y-4">
      {!embedded && (
        <div className="space-y-2">
          <Label>Amount ({ccy})</Label>
          <Input
            inputMode="decimal"
            placeholder="25.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            disabled={busy}
          />
        </div>
      )}
      {embedded && (
        <p className="text-xs text-muted-foreground">
          Paying <span className="font-medium text-foreground">{ccy} {amount || "—"}</span>
        </p>
      )}
      <Button className="w-full" onClick={pay} disabled={busy || !amount}>
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
        {busy ? "Opening checkout…" : `Pay ${amount ? `${ccy} ${amount}` : "with card"}`}
        {!busy && <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-70" />}
      </Button>
      <p className="text-[11px] text-muted-foreground text-center">
        You’ll complete payment on a secure page, then return here automatically.
      </p>
    </div>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Card checkout
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export async function verifySquareCheckout(orderId: string): Promise<{
  success: boolean;
  already?: boolean;
  amount?: number;
  currency?: string;
  message?: string;
}> {
  const { data, error } = await supabase.functions.invoke("square-verify-checkout", {
    body: { orderId },
  });
  if (error) throw new Error(error.message || "Could not confirm payment");
  return data || { success: false };
}
