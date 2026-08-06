import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Copy, Landmark, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  initialAmount?: string;
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

type Intent = {
  id: string;
  amount: number;
  currency_code: string;
  reference: string;
  status: string;
  expires_at?: string;
};

type DetailField = { label: string; value: string };

const fnHeaders = async () => {
  const session = (await supabase.auth.getSession()).data.session;
  return {
    Authorization: `Bearer ${session?.access_token || ""}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  };
};

export default function WiseTopUpCard({ walletId, walletCurrency, onComplete, initialAmount }: Props) {
  const currency = walletCurrency.toUpperCase();
  const [amount, setAmount] = useState(initialAmount ?? "");
  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [details, setDetails] = useState<DetailField[]>([]);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wise-topup-intent`,
          { headers: await fnHeaders() },
        );
        const json = await res.json().catch(() => ({}));
        setConfigured(Boolean(json.configured));
        const pending = Array.isArray(json.pending) ? json.pending[0] : null;
        if (pending && String(pending.currency_code).toUpperCase() === currency) {
          setIntent(pending);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [currency]);

  useEffect(() => {
    if (!intent || intent.status !== "pending") return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts > 100) return;
      attempts += 1;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wise-topup-intent?intent_id=${encodeURIComponent(intent.id)}`,
          { headers: await fnHeaders() },
        );
        const json = await res.json();
        const next = json?.intent as Intent | undefined;
        if (next) {
          setIntent(next);
          if (next.status === "completed") {
            toast.success(`${next.currency_code} ${next.amount} credited to your wallet`);
            onComplete?.();
            return;
          }
        }
      } catch {
        /* retry */
      }
      if (!cancelled) setTimeout(poll, 5000);
    };

    const t = setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [intent?.id, intent?.status, onComplete]);

  const handleCreate = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error(`Enter an amount of at least 1.00 ${currency}`);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("wise-topup-intent", {
        body: { action: "create", amount: amt, wallet_id: walletId },
      });
      if (error) {
        let msg = error.message || "Could not start Wise top-up";
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) {
            const body = await ctx.json().catch(() => null) as { error?: string } | null;
            if (body?.error) msg = body.error;
          }
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setIntent(data.intent);
      setDetails(Array.isArray(data.account_details) ? data.account_details : []);
      setInstructions(Array.isArray(data.instructions) ? data.instructions : []);
      toast.message("Bank details ready", {
        description: "Send the exact amount and include your payment reference.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start Wise top-up");
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  if (intent?.status === "completed") {
    return (
      <Card className="border-emerald-500/30">
        <CardContent className="pt-6 text-center space-y-2">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
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
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          Bank transfer
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pay into our receive account. Your {currency} wallet credits when the deposit arrives.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured && !intent && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Bank transfer top-up is not available yet. Try card checkout instead.
          </p>
        )}

        {!intent && (
          <>
            {!initialAmount && (
              <div className="space-y-2">
                <Label>Amount ({currency})</Label>
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  placeholder="e.g. 25"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 1.00 · Send this exact amount with the payment reference
                </p>
              </div>
            )}
            <Button className="w-full" onClick={handleCreate} disabled={loading || !configured}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Preparing…
                </>
              ) : (
                "Get bank details"
              )}
            </Button>
          </>
        )}

        {intent && intent.status === "pending" && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Send exactly</span>
                <span className="font-semibold tabular-nums">
                  {currency} {Number(intent.amount).toFixed(2)}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Payment reference (required)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm break-all">{intent.reference}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(intent.reference, "Reference")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {details.map((d) => (
                <div key={`${d.label}-${d.value}`} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{d.label}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm break-all">{d.value}</code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => copyText(d.value, d.label)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {instructions.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                {instructions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Waiting for your bank transfer…
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setIntent(null);
                setDetails([]);
                setInstructions([]);
              }}
            >
              Start over
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
