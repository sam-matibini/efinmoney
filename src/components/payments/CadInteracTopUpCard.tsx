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

export default function CadInteracTopUpCard({ walletId, walletCurrency, onComplete, initialAmount }: Props) {
  const currency = walletCurrency.toUpperCase();
  const [amount, setAmount] = useState(initialAmount ?? "");
  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);
  const [loading, setLoading] = useState(false);
  const [alias, setAlias] = useState<string | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    if (currency !== "CAD") return;
    void (async () => {
      const { data, error } = await supabase.functions.invoke("fincra-cad-interac", {
        method: "GET",
      });
      // invoke doesn't support GET well — use fetch
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fincra-cad-interac`,
        { headers: { Authorization: `Bearer ${session?.access_token || ""}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } },
      );
      const json = await res.json().catch(() => ({}));
      if (!error && json) {
        setAlias(json.alias ?? null);
        setConfigured(Boolean(json.configured));
        const pending = Array.isArray(json.pending) ? json.pending[0] : null;
        if (pending) setIntent(pending);
      }
    })();
  }, [currency]);

  // Poll active intent
  useEffect(() => {
    if (!intent || intent.status !== "pending") return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts > 80) return;
      attempts += 1;
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fincra-cad-interac?intent_id=${encodeURIComponent(intent.id)}`,
          { headers: { Authorization: `Bearer ${session?.access_token || ""}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } },
        );
        const json = await res.json();
        const next = json?.intent as Intent | undefined;
        if (next) {
          setIntent(next);
          if (next.status === "completed") {
            toast.success(`CAD ${next.amount} credited to your wallet`);
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

  if (currency !== "CAD") return null;

  const handleCreate = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error("Enter an amount of at least CAD 1.00");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fincra-cad-interac", {
        body: { action: "create", amount: amt, wallet_id: walletId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAlias(data.alias ?? alias);
      setIntent(data.intent);
      setInstructions(Array.isArray(data.instructions) ? data.instructions : []);
      toast.message("Interac details ready", {
        description: "Send the exact amount from your bank app.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start Interac top-up");
    } finally {
      setLoading(false);
    }
  };

  const copyAlias = async () => {
    if (!alias) return;
    await navigator.clipboard.writeText(alias);
    toast.success("Interac address copied");
  };

  if (intent?.status === "completed") {
    return (
      <Card className="border-emerald-500/30">
        <CardContent className="pt-6 text-center space-y-2">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <p className="font-medium">CAD {intent.amount} credited</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-500/30 bg-gradient-to-br from-red-950/10 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4 text-red-600" />
          Interac e-Transfer
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Send CAD from your Canadian bank. Autodeposit credits your wallet when the transfer arrives.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured && !intent && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Interac e-Transfer is not available yet. Use card checkout or pay by invoice instead.
          </p>
        )}

        {!intent && (
          <>
            {!initialAmount && (
              <div className="space-y-2">
                <Label>Amount (CAD)</Label>
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  placeholder="e.g. 25"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Minimum CAD 1.00 · Send this exact amount</p>
              </div>
            )}
            <Button className="w-full" onClick={handleCreate} disabled={loading || !configured || !(Number(amount) > 0)}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Preparing…
                </>
              ) : (
                "Get Interac details"
              )}
            </Button>
          </>
        )}

        {intent && intent.status === "pending" && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Send exactly</span>
                <span className="font-semibold tabular-nums">CAD {Number(intent.amount).toFixed(2)}</span>
              </div>
              {alias && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Interac recipient</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm break-all">{alias}</code>
                    <Button type="button" size="sm" variant="outline" onClick={copyAlias}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
              {(instructions.length ? instructions : [
                "Open your Canadian banking app and start an Interac e-Transfer.",
                `Send exactly CAD ${Number(intent.amount).toFixed(2)} to the address above.`,
                "Autodeposit is on — no security question.",
                "This page updates when your wallet is credited.",
              ]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Waiting for your Interac transfer…
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
