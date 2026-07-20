import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  clearPendingPaytotaTxn,
  confirmPaytotaPayment,
  getPaytotaPayStatus,
  initiatePaytotaCollection,
  isPaytotaTopupCurrency,
  paytotaMinAmount,
  readPendingPaytotaTxn,
  savePendingPaytotaTxn,
} from "@/lib/paytotaPay";
import { quoteDirectNombaTopup } from "@/lib/nombaTopupQuote";

interface Props {
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

function formatCredited(amount: number, currency: string): string {
  const c = currency.toUpperCase();
  const sym = c === "GBP" ? "£" : c === "EUR" ? "€" : c === "CAD" ? "C$" : "$";
  return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

export default function PaytotaTopUpCard({ walletId, walletCurrency, onComplete }: Props) {
  const { user } = useAuth();
  const currency = walletCurrency.toUpperCase();
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email && user?.email) setEmail(user.email);
  }, [user?.email, email]);

  useEffect(() => {
    const pendingId = readPendingPaytotaTxn();
    if (!pendingId) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts > 40) return;
      attempts += 1;

      try {
        await confirmPaytotaPayment({ transaction_id: pendingId });
      } catch {
        /* status table poll still runs */
      }

      const status = await getPaytotaPayStatus(pendingId);
      if (!status || status.status === "pending" || status.status === "processing") {
        setTimeout(poll, 3000);
        return;
      }
      if (status.status === "completed") {
        clearPendingPaytotaTxn();
        const credited = status.credit_amount ?? status.amount;
        const creditedCcy = status.credit_currency ?? status.currency;
        toast.success(`Wallet credited ${formatCredited(credited, creditedCcy)}`);
        onComplete?.();
        return;
      }
      if (status.status === "failed") {
        clearPendingPaytotaTxn();
        toast.error(status.failure_reason || "Top-up failed");
      }
    };

    void poll();
    return () => { cancelled = true; };
  }, [onComplete]);

  const parsedAmount = Number(amount);
  const quote = useMemo(() => {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;
    return quoteDirectNombaTopup(parsedAmount, currency);
  }, [parsedAmount, currency]);

  if (!isPaytotaTopupCurrency(currency)) return null;

  const min = paytotaMinAmount(currency);

  const handleConfirm = async () => {
    const amt = parsedAmount;
    if (!Number.isFinite(amt) || amt < min) {
      toast.error(`Enter at least ${formatCredited(min, currency)}`);
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email for the invoice");
      return;
    }

    setLoading(true);
    try {
      const result = await initiatePaytotaCollection({
        credit_amount: amt,
        amount: amt,
        target_wallet_id: walletId,
        email: email.trim(),
        return_url: `${window.location.origin}/wallet/topup?walletId=${walletId}`,
      });
      savePendingPaytotaTxn(result.transaction_id);
      toast.message("Opening Paytota invoice", {
        description: `Confirm ${formatCredited(quote?.checkoutAmount ?? amt, currency)} on Paytota.`,
      });
      window.location.href = result.payment_link;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create invoice");
      setLoading(false);
    }
  };

  return (
    <Card className="border-sky-500/30 bg-gradient-to-br from-sky-950/15 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-sky-500" />
          Top up {currency}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Confirm the amount to open your Paytota invoice. Card checkout is pending partner setup —
          settlement is handled on the invoice.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Amount to credit ({currency})</Label>
          <Input
            type="number"
            min={min}
            step="0.01"
            placeholder="e.g. 25"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Minimum {formatCredited(min, currency)} · Includes processing fee (1.9% + fixed)
          </p>
        </div>

        {quote && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Wallet credit</span>
              <span className="font-medium tabular-nums">{formatCredited(quote.creditAmount, quote.creditCurrency)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Processing fee</span>
              <span className="font-medium tabular-nums">{formatCredited(quote.feeAmount, quote.creditCurrency)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Invoice total</span>
              <span className="font-semibold tabular-nums">{formatCredited(quote.checkoutAmount, quote.checkoutCurrency)}</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Email for invoice</Label>
          <Input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <Button className="w-full" onClick={handleConfirm} disabled={loading || !quote}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating invoice…
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 mr-2" />
              {quote
                ? `Confirm — ${formatCredited(quote.checkoutAmount, quote.checkoutCurrency)}`
                : "Confirm"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
