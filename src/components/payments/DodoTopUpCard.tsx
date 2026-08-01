import { useState } from "react";
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
}

export default function DodoTopUpCard({ walletId, walletCurrency }: Props) {
  const currency = walletCurrency.toUpperCase();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isDodoTopupCurrency(currency)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dodo Payments</CardTitle>
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
      toast.info("Opening Dodo checkout…");
      window.location.href = res.checkout_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start Dodo checkout");
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Card checkout (Dodo)</CardTitle>
        <CardDescription>
          Pay with card on Dodo Payments’ global checkout. Your {currency} wallet credits after payment succeeds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
        <Button className="w-full" disabled={loading} onClick={() => void onPay()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
          Continue to Dodo
        </Button>
      </CardContent>
    </Card>
  );
}
