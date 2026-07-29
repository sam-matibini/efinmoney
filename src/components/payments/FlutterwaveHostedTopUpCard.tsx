import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { initializeFlwPayment, minAmount, validateMinAmount, type FlwMethod } from "@/lib/flutterwave";
import { currencySymbol } from "@/lib/currency";

interface Props {
  walletId: string;
  walletCurrency: string;
  /** Hosted checkout methods to offer (defaults to card). */
  methods?: FlwMethod[];
  onComplete?: () => void;
}

/**
 * Company Flutterwave — hosted Standard checkout (redirect).
 * Card data is entered on Flutterwave's page (no PCI / no Rave v3 direct charge).
 */
export default function FlutterwaveHostedTopUpCard({
  walletId,
  walletCurrency,
  methods,
  onComplete,
}: Props) {
  const currency = walletCurrency.toUpperCase();
  const sym = currencySymbol(currency) || currency;
  const available = (methods?.length ? methods : ["card"]).filter((m) =>
    ["card", "banktransfer", "ussd"].includes(m),
  ) as Array<"card" | "banktransfer" | "ussd">;
  const [paymentMethod, setPaymentMethod] = useState<"card" | "banktransfer" | "ussd">(
    available[0] || "card",
  );
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const payAmount = Number(amount);
  const amountOk = Number.isFinite(payAmount) && payAmount > 0;

  const title =
    paymentMethod === "banktransfer"
      ? "Bank transfer"
      : paymentMethod === "ussd"
        ? "USSD"
        : "Card checkout";
  const description =
    paymentMethod === "banktransfer"
      ? "Pay with a bank transfer on a secure page, then return here when done."
      : paymentMethod === "ussd"
        ? "Complete USSD payment on a secure page, then return here when done."
        : "Pay on a secure page — you’ll enter card details there, then return here when done.";

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
        paymentMethod,
        walletId,
        redirectUrl: `${window.location.origin}/wallet/topup?walletId=${encodeURIComponent(walletId)}&flw=1`,
      });

      if (!result.payment_link) {
        throw new Error(result.error || "No checkout link returned");
      }

      toast.message("Opening secure checkout…");
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
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {available.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {available.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={paymentMethod === m ? "default" : "outline"}
                onClick={() => setPaymentMethod(m)}
              >
                {m === "card" ? "Card" : m === "banktransfer" ? "Bank transfer" : "USSD"}
              </Button>
            ))}
          </div>
        )}
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
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Minimum: {minAmount(currency)} {currency}
          </p>
        </div>
        <Button className="w-full h-11" disabled={!amountOk || loading} onClick={() => void handlePay()}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              Continue to checkout
              <ExternalLink className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
