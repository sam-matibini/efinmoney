import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CreditCard, Loader2, ExternalLink, Globe } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFxRates } from "@/hooks/useFxRates";
import {
  clearPendingNombaTxn,
  getNombaPayStatus,
  initiateNombaCollection,
  isNombaCadViaUsdCurrency,
  isNombaInternationalCurrency,
  isNombaNigeriaCurrency,
  isNombaTopupCurrency,
  nombaMinAmount,
  readPendingNombaTxn,
  savePendingNombaTxn,
} from "@/lib/nombaPay";
import { quoteCadNombaTopup, quoteDirectNombaTopup } from "@/lib/nombaTopupQuote";

interface Props {
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

function formatCredited(amount: number, currency: string): string {
  const c = currency.toUpperCase();
  const sym = c === "NGN" ? "₦" : c === "GBP" ? "£" : c === "EUR" ? "€" : c === "CAD" ? "C$" : "$";
  return `${sym}${amount.toLocaleString()} ${c}`;
}

export default function NombaTopUpCard({ walletId, walletCurrency, onComplete }: Props) {
  const { user } = useAuth();
  const { data: fxRates = [] } = useFxRates();
  const currency = walletCurrency.toUpperCase();
  const isNigeria = isNombaNigeriaCurrency(currency);
  const isInternational = isNombaInternationalCurrency(currency);
  const isCadViaUsd = isNombaCadViaUsdCurrency(currency);
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email && user?.email) setEmail(user.email);
  }, [user?.email, email]);

  useEffect(() => {
    const pendingId = readPendingNombaTxn();
    if (!pendingId) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts > 40) return;
      attempts += 1;
      const status = await getNombaPayStatus(pendingId);
      if (!status || status.status === "pending" || status.status === "processing") {
        setTimeout(poll, 3000);
        return;
      }
      if (status.status === "completed") {
        clearPendingNombaTxn();
        const credited = status.credit_amount ?? status.amount;
        const creditedCcy = status.credit_currency ?? status.currency;
        toast.success(`Wallet credited ${formatCredited(credited, creditedCcy)}`);
        onComplete?.();
        return;
      }
      if (status.status === "failed") {
        clearPendingNombaTxn();
        toast.error(status.failure_reason || "Top-up failed");
      }
    };

    void poll();
    return () => { cancelled = true; };
  }, [onComplete, isCadViaUsd]);

  const parsedAmount = Number(amount);
  const quote = useMemo(() => {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;
    if (isCadViaUsd) return quoteCadNombaTopup(parsedAmount, fxRates);
    return quoteDirectNombaTopup(parsedAmount, currency);
  }, [parsedAmount, isCadViaUsd, fxRates, currency]);

  if (!isNombaTopupCurrency(currency)) return null;

  const min = isCadViaUsd ? 2 : nombaMinAmount(currency);
  const corridor = isNigeria ? "nigeria" as const : "international" as const;

  const handleSubmit = async () => {
    const amt = parsedAmount;
    if (!Number.isFinite(amt) || amt < min) {
      toast.error(`Enter at least ${formatCredited(min, currency)}`);
      return;
    }
    if (isCadViaUsd && !quote) {
      toast.error("CAD/USD rate unavailable — try again shortly");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email for checkout");
      return;
    }

    setLoading(true);
    try {
      const result = await initiateNombaCollection({
        credit_amount: amt,
        amount: amt,
        target_wallet_id: walletId,
        email: email.trim(),
        corridor,
        return_url: `${window.location.origin}/wallet/topup?walletId=${walletId}`,
      });
      savePendingNombaTxn(result.transaction_id);
      toast.message("Opening secure checkout", {
        description: isCadViaUsd
          ? `Pay $${quote?.checkoutAmount.toFixed(2)} USD — CAD cards accepted`
          : "Complete payment on the secure checkout page.",
      });
      window.location.href = result.payment_link;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Top-up failed");
      setLoading(false);
    }
  };

  const title = isCadViaUsd
    ? "Top up CAD (USD card checkout)"
    : isInternational
      ? "International checkout"
      : "Nigeria checkout";

  const subtitle = isCadViaUsd
    ? "Enter how much CAD you want in your wallet. You'll pay the USD equivalent at checkout — Canadian debit/credit cards are accepted."
    : isInternational
      ? `Pay with card in ${currency} via our secure hosted checkout (USD, EUR, GBP).`
      : "Pay with Nigerian debit/credit card via our secure hosted checkout.";

  return (
    <Card className={
      isCadViaUsd
        ? "border-red-500/30 bg-gradient-to-br from-red-950/15 to-background"
        : isInternational
          ? "border-indigo-500/30 bg-gradient-to-br from-indigo-950/20 to-background"
          : "border-green-600/30 bg-gradient-to-br from-green-950/20 to-background"
    }>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {isCadViaUsd || isInternational
            ? <Globe className="h-4 w-4 text-indigo-400" />
            : <CreditCard className="h-4 w-4 text-green-500" />}
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Amount to credit ({currency})</Label>
          <Input
            type="number"
            min={min}
            step={isNigeria ? "1" : "0.01"}
            placeholder={isCadViaUsd ? "e.g. 10" : isInternational ? "e.g. 50" : "e.g. 5000"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Minimum {formatCredited(min, currency)} · Includes eFin processing fee (1.9% + {currency === "CAD" ? "C$0.30" : currency === "NGN" ? "₦100" : "$0.30"})
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
            {isCadViaUsd && quote.fxRate && (
              <>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Checkout total (approx.)</span>
                  <span className="font-semibold tabular-nums">${quote.checkoutAmount.toFixed(2)} USD</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Rate: 1 CAD ≈ {quote.fxRate.toFixed(4)} USD · You pay USD at checkout; your CAD wallet is credited after confirmation.
                </p>
              </>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>Email for receipt</Label>
          <Input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button className="w-full" onClick={handleSubmit} disabled={loading || (isCadViaUsd && !quote)}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Opening checkout…
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4 mr-2" />
              {isCadViaUsd && quote
                ? `Continue — pay $${quote.checkoutAmount.toFixed(2)} USD`
                : "Continue to secure checkout"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
