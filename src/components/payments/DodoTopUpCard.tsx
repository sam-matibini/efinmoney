import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { currencySymbol } from "@/lib/currency";
import {
  dodoMinAmount,
  initiateDodoCheckout,
  isDodoTopupCurrency,
  savePendingDodoRef,
} from "@/lib/dodoPayments";

interface Props {
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
  initialAmount?: string;
  embedded?: boolean;
}

export default function DodoTopUpCard({
  walletId,
  walletCurrency,
  initialAmount,
  embedded,
}: Props) {
  const currency = walletCurrency.toUpperCase();
  const [amount, setAmount] = useState(initialAmount ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);

  if (!isDodoTopupCurrency(currency)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Card checkout</CardTitle>
          <CardDescription>Not available for {currency} wallets yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const min = dodoMinAmount(currency);
  const parsed = Number(amount);

  const onPay = async () => {
    if (!Number.isFinite(parsed) || parsed < min) {
      toast.error(`Enter at least ${currencySymbol(currency)}${min}`);
      return;
    }
    setLoading(true);
    try {
      const res = await initiateDodoCheckout({
        walletId,
        currency,
        amount: parsed,
      });
      if (res.reference) savePendingDodoRef(res.reference);
      toast.info("Opening secure checkout…");
      window.location.href = res.checkout_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setLoading(false);
    }
  };

  return (
    <Card className={embedded ? "border-0 shadow-none bg-transparent" : "border-primary/20"}>
      {!embedded && (
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Secure checkout</CardTitle>
          <CardDescription>
            Pay with card on a secure page. Your {currency} wallet credits after payment succeeds.
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className={embedded ? "p-0 space-y-4" : "space-y-4"}>
        {(!embedded || !initialAmount) && (
          <div className="space-y-2">
            <Label htmlFor="dodo-amount">Amount ({currency})</Label>
            <Input
              id="dodo-amount"
              type="number"
              min={min}
              step="0.01"
              placeholder={`Min ${min}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        )}
        <Button className="w-full" disabled={loading} onClick={() => void onPay()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
