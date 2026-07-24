import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { initializeFlwPayment, minAmount, validateMinAmount } from "@/lib/flutterwave";
import { currencySymbol } from "@/lib/currency";

interface Props {
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

/**
 * Company Flutterwave — hosted Standard checkout (redirect).
 * Card data is entered on Flutterwave's page (no PCI / no Rave v3 direct charge).
 */
export default function FlutterwaveHostedTopUpCard({ walletId, walletCurrency, onComplete }: Props) {
  const currency = walletCurrency.toUpperCase();
  const sym = currencySymbol(currency) || currency;
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const payAmount = Number(amount);
  const amountOk = Number.isFinite(payAmount) && payAmount > 0;

  const handlePay = async () => {
    const minErr = validateMinAmount(currency, payAmount);
    if (minErr) {
      toast.error(minErr);
      return;
    }

    setLoading(true);
    try {
      const result = await initializeFlwPayment({
        amount: payAmount,
        currency,
        paymentMethod: "card",
        walletId,
        redirectUrl: `${window.location.origin}/wallet/topup?walletId=${encodeURIComponent(walletId)}&flw=1`,
      });

      if (!result.payment_link) {
        throw new Error(result.error || "No Flutterwave checkout link returned");
      }

      toast.message("Opening Flutterwave checkout…");
      onComplete?.();
      window.location.href = result.payment_link;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Card checkout</CardTitle>
        <CardDescription>
          Pay securely on Flutterwave — you’ll enter card details on their page, then return here when done.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="flw-hosted-amount">Amount ({currency})</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {sym}
            </span>
            <Input
              id="flw-hosted-amount"
              className="pl-9 h-12 text-lg"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Minimum: {minAmount(currency)} {currency}
          </p>
        </div>
        <Button className="w-full" size="lg" disabled={loading || !amountOk} onClick={handlePay}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Continue to Flutterwave
              <ExternalLink className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          Wallet credits when Flutterwave confirms payment (webhook). Keep this tab — you’ll return after checkout.
        </p>
      </CardContent>
    </Card>
  );
}
