import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CreditCard, ExternalLink, Globe, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  clearPendingSwychrTxn,
  getSwychrPayinStatus,
  initiateSwychrCollection,
  readPendingSwychrTxn,
  savePendingSwychrTxn,
} from "@/lib/swychrPay";

interface Props {
  initialAmount?: string;
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

export default function SwychrTopUpCard({ walletId, walletCurrency, onComplete, initialAmount }: Props) {
  const { user } = useAuth();
  const currency = walletCurrency.toUpperCase();
  const [amount, setAmount] = useState(initialAmount ?? "");
  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email && user?.email) setEmail(user.email);
    if (!name && user?.email) setName(user.email.split("@")[0]);
  }, [user?.email, email, name]);

  useEffect(() => {
    const pendingId = readPendingSwychrTxn();
    if (!pendingId) return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      if (cancelled || attempts > 40) return;
      attempts += 1;
      const status = await getSwychrPayinStatus(pendingId);
      if (!status || status.status === "pending" || status.status === "processing") {
        setTimeout(poll, 3000);
        return;
      }
      if (status.status === "completed") {
        clearPendingSwychrTxn();
        toast.success(`Wallet credited ${currency} ${status.amount}`);
        onComplete?.();
        return;
      }
      if (status.status === "failed") {
        clearPendingSwychrTxn();
        toast.error(status.failure_reason || "Top-up failed");
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [onComplete, currency]);

  const parsed = Number(amount);
  const min = currency === "NGN" ? 100 : 1;

  const handleSubmit = async () => {
    if (!Number.isFinite(parsed) || parsed < min) {
      toast.error(`Enter at least ${min} ${currency}`);
      return;
    }
    if (!email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setLoading(true);
    try {
      const result = await initiateSwychrCollection({
        amount: parsed,
        target_wallet_id: walletId,
        email: email.trim(),
        name: name.trim() || email.split("@")[0],
      });
      if (result.swychr_transaction_id) savePendingSwychrTxn(result.swychr_transaction_id);
      toast.message("Opening secure checkout");
      window.location.href = result.payment_link!;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Top-up failed");
      setLoading(false);
    }
  };

  return (
    <Card className="border-violet-500/30 bg-gradient-to-br from-violet-950/20 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4 text-violet-400" />
          Secure checkout
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pay with mobile money on a secure page for your {currency} wallet.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!initialAmount && (
          <div className="space-y-2">
            <Label>Amount ({currency})</Label>
            <Input
              type="number"
              min={min}
              step={currency === "NGN" ? "1" : "0.01"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={currency === "NGN" ? "5000" : "50"}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="space-y-2">
          <Label>Email for receipt</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button className="w-full" onClick={handleSubmit} disabled={loading || !(Number(amount) > 0)}>
          {loading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Opening checkout…</>
          ) : (
            <><ExternalLink className="h-4 w-4 mr-2" />Continue</>
          )}
        </Button>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CreditCard className="h-3 w-3" /> Card &amp; local payment methods where supported
        </p>
      </CardContent>
    </Card>
  );
}
