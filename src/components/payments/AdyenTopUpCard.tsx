import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { createAdyenSession, storeAdyenCheckoutConfig, confirmAdyenSession, type AdyenSessionResult } from "@/lib/adyen";
import AdyenDropIn from "./AdyenDropIn";
import { useQueryClient } from "@tanstack/react-query";
import { productFeatures } from "@/lib/productFeatures";

interface Props {
  initialAmount?: string;
  walletId: string;
  walletCurrency: string;
}

export default function AdyenTopUpCard({ walletId, walletCurrency, initialAmount }: Props) {
  if (!productFeatures.adyen) return null;

  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(initialAmount ?? "");
  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<AdyenSessionResult | null>(null);
  const [open, setOpen] = useState(false);

  const start = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error("Enter a valid amount");
      return;
    }
    setLoading(true);
    try {
      const s = await createAdyenSession({
        amount: amt,
        currency: walletCurrency,
        purpose: "wallet_topup",
        target_wallet_id: walletId,
        target_currency: walletCurrency,
        return_url: `${window.location.origin}/wallets`,
      });
      storeAdyenCheckoutConfig({ clientKey: s.clientKey, environment: s.environment });
      setSession(s);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start Adyen checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Pay with Card
            <Badge variant="outline" className="border-primary/30 text-primary">
              <Sparkles className="w-3 h-3 mr-1" />
              Visa · MC · Amex
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!initialAmount && (
            <div>
              <Label>Amount ({walletCurrency})</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-12 text-lg"
              />
            </div>
          )}
          <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
            <p className="text-xs text-foreground">
              Embedded card checkout — enter your Visa, Mastercard, or Amex card details. Powered by Adyen (test mode).
            </p>
          </div>
          <Button className="w-full" size="lg" onClick={start} disabled={loading}>
            {loading ? "Preparing checkout…" : "Continue to Adyen"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete your payment</DialogTitle>
          </DialogHeader>
          {session && (
            <AdyenDropIn
              sessionId={session.sessionId}
              sessionData={session.sessionData}
              clientKey={session.clientKey}
              environment={session.environment}
              amount={session.amount}
              onPaymentCompleted={async (result) => {
                if (result?.resultCode === "Authorised" || result?.resultCode === "Received") {
                  try {
                    const confirmed = await confirmAdyenSession({
                      sessionId: session.sessionId,
                      sessionResult: result?.sessionResult ?? null,
                    });
                    if (confirmed.credited || confirmed.already) {
                      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
                      toast.success(
                        confirmed.already
                          ? "Payment already credited to your wallet."
                          : `Wallet credited: ${confirmed.amount ?? ""} ${confirmed.currency ?? walletCurrency}`.trim(),
                      );
                    } else if (confirmed.credit_error) {
                      toast.error(`Payment OK but wallet not credited: ${confirmed.credit_error}`);
                    } else {
                      toast.success("Payment authorised — wallet will credit shortly.");
                    }
                  } catch {
                    toast.success("Payment authorised — wallet will credit shortly.");
                  }
                  setOpen(false);
                } else if (result?.resultCode === "Refused") {
                  toast.error("Payment refused");
                } else {
                  toast.info(`Payment status: ${result?.resultCode || "pending"}`);
                }
              }}
              onError={(err) => {
                console.error(err);
                const msg = String(err?.message || err || "");
                if (msg.includes("Failed to fetch") || msg.includes("NETWORK_ERROR")) {
                  const origin = window.location.origin;
                  toast.error(
                    `Adyen blocked this page — add ${origin} under Adyen → Developers → API credentials → Client settings → Allowed origins, then Save. (Also add https://efin.money and https://www.efin.money if users visit both.)`,
                    { duration: 10000 },
                  );
                } else {
                  toast.error("Payment error — please try again");
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
