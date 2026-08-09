import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink, Loader2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildWisePayUrl } from "@/lib/wisePayLink";

interface Props {
  walletId: string;
  walletCurrency: string;
  initialAmount?: string;
  onComplete?: () => void;
}

type Intent = {
  id: string;
  amount: number;
  currency_code: string;
  reference: string;
  status: string;
};

/** "Pay with Wise": creates a matching intent, then hands the payer to the hosted Wise pay page. */
export default function WisePayLinkCard({ walletId, walletCurrency, initialAmount, onComplete }: Props) {
  const currency = walletCurrency.toUpperCase();
  const [amount, setAmount] = useState(initialAmount ?? "");
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);

  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);

  useEffect(() => {
    if (!intent || intent.status !== "pending") return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts > 100) return;
      attempts += 1;
      const { data } = await supabase.functions.invoke("wise-topup-intent", {
        body: { action: "status", intent_id: intent.id },
      });
      const next = (data as { intent?: Intent } | null)?.intent;
      if (next && !cancelled) {
        setIntent(next);
        if (next.status === "completed") {
          toast.success(`${next.currency_code} ${next.amount} credited to your wallet`);
          onComplete?.();
          return;
        }
      }
      if (!cancelled) setTimeout(poll, 5000);
    };

    const t = setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [intent?.id, intent?.status, onComplete]);

  const start = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error(`Enter an amount of at least 1.00 ${currency}`);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("wise-topup-intent", {
        body: { action: "create_link", amount: amt, wallet_id: walletId },
      });
      if (error) throw new Error(error.message);
      const created = (data as { intent?: Intent; error?: string } | null);
      if (created?.error) throw new Error(created.error);
      if (!created?.intent) throw new Error("Could not start the Wise payment");
      setIntent(created.intent);
      window.open(buildWisePayUrl(amt, currency), "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the Wise payment");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  if (intent?.status === "completed") {
    return (
      <Card className="border-emerald-500/30">
        <CardContent className="pt-6 text-center space-y-2">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="font-medium">
            {intent.currency_code} {intent.amount} credited
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-gradient-to-br from-muted/40 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          Pay with Wise
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pay by bank transfer or card on our secure Wise page. Your {currency} wallet credits
          automatically once the payment lands.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!intent && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="wise-link-amount">Amount ({currency})</Label>
              <Input
                id="wise-link-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <Button className="w-full" size="lg" onClick={() => void start()} disabled={loading}>
              {loading ? "Preparing…" : "Continue to Wise"}
              {!loading && <ExternalLink className="ml-2 h-4 w-4" />}
            </Button>
          </>
        )}

        {intent && intent.status === "pending" && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pay exactly</span>
                <span className="font-semibold tabular-nums">
                  {intent.currency_code} {Number(intent.amount).toFixed(2)}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Payment reference — paste this into the Wise payment message
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-sm">{intent.reference}</code>
                  <Button size="sm" variant="outline" onClick={() => void copy(intent.reference, "Reference")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                window.open(
                  buildWisePayUrl(Number(intent.amount), intent.currency_code),
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Reopen Wise payment page
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Waiting for your payment…
            </p>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setIntent(null)}>
              Start over
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
