import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CreditCard, Loader2, ExternalLink, Globe } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  clearPendingNombaTxn,
  getNombaPayStatus,
  initiateNombaCollection,
  isNombaInternationalCurrency,
  isNombaNigeriaCurrency,
  nombaMinAmount,
  readPendingNombaTxn,
  savePendingNombaTxn,
} from "@/lib/nombaPay";

interface Props {
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

function formatCredited(amount: number, currency: string): string {
  const c = currency.toUpperCase();
  const sym = c === "NGN" ? "₦" : c === "GBP" ? "£" : c === "EUR" ? "€" : "$";
  return `${sym}${amount.toLocaleString()} ${c}`;
}

export default function NombaTopUpCard({ walletId, walletCurrency, onComplete }: Props) {
  const { user } = useAuth();
  const currency = walletCurrency.toUpperCase();
  const isNigeria = isNombaNigeriaCurrency(currency);
  const isInternational = isNombaInternationalCurrency(currency);
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
        toast.success(`Wallet credited ${formatCredited(status.amount, status.currency)}`);
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
  }, [onComplete]);

  if (!isNigeria && !isInternational) return null;

  const min = nombaMinAmount(currency);
  const corridor = isNigeria ? "nigeria" as const : "international" as const;

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < min) {
      toast.error(`Enter at least ${formatCredited(min, currency)}`);
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email for checkout");
      return;
    }

    setLoading(true);
    try {
      const result = await initiateNombaCollection({
        amount: amt,
        target_wallet_id: walletId,
        email: email.trim(),
        corridor,
        return_url: `${window.location.origin}/wallet/topup?walletId=${walletId}`,
      });
      savePendingNombaTxn(result.transaction_id);
      toast.message("Opening Nomba checkout", {
        description: "Complete payment on the secure checkout page.",
      });
      window.location.href = result.payment_link;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Top-up failed");
      setLoading(false);
    }
  };

  return (
    <Card className={isInternational
      ? "border-indigo-500/30 bg-gradient-to-br from-indigo-950/20 to-background"
      : "border-green-600/30 bg-gradient-to-br from-green-950/20 to-background"}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {isInternational
            ? <Globe className="h-4 w-4 text-indigo-400" />
            : <CreditCard className="h-4 w-4 text-green-500" />}
          {isInternational ? "International checkout (Nomba)" : "Nigeria checkout (Nomba)"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {isInternational
            ? `Pay with card in ${currency} via secure Nomba hosted checkout (USD, EUR, GBP).`
            : "Pay with Nigerian debit/credit card via secure Nomba hosted checkout."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Amount ({currency})</Label>
          <Input
            type="number"
            min={min}
            step={isInternational ? "0.01" : "1"}
            placeholder={isInternational ? "e.g. 50" : "e.g. 5000"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Minimum {formatCredited(min, currency)} · Nomba may add a small processing fee
          </p>
        </div>
        <div className="space-y-2">
          <Label>Email for receipt</Label>
          <Input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button className="w-full" onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Opening checkout…
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4 mr-2" />
              Continue to Nomba checkout
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
