import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingSpinner from "@/components/LoadingSpinner";
import { toast } from "sonner";
import { Copy } from "lucide-react";

type RailMeta = {
  configured?: boolean;
  account_name?: string | null;
  account_number?: string | null;
  routing_number?: string | null;
  bank_name?: string | null;
  status?: string | null;
};

type Intent = {
  id: string;
  amount: number;
  reference: string;
  public_id?: string;
  status: string;
};

interface Props {
  walletId: string;
  initialAmount?: string;
  onComplete?: () => void;
  onExit?: () => void;
}

export default function UsdBankCheckout({ walletId, initialAmount, onComplete, onExit }: Props) {
  const [amount, setAmount] = useState(initialAmount && Number(initialAmount) > 0 ? initialAmount : "");
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [rail, setRail] = useState<RailMeta | null>(null);
  const [bankRef, setBankRef] = useState("");
  const [instructions, setInstructions] = useState<Record<string, unknown> | null>(null);

  const refreshRail = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("fincra-usd-bank", {
      body: { action: "rail_meta" },
    });
    if (!error && data?.rail) setRail(data.rail as RailMeta);
  }, []);

  useEffect(() => {
    void refreshRail();
  }, [refreshRail]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.message(text);
    }
  };

  const createIntent = async () => {
    const n = Math.round(Number(amount) * 100) / 100;
    if (!(n > 0)) {
      toast.error("Enter a valid amount");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fincra-usd-bank", {
        body: { action: "create", wallet_id: walletId, amount: n, purpose: "topup" },
      });
      if (data?.error) throw new Error(String(data.error));
      if (error) throw error;
      setIntent(data.intent as Intent);
      setInstructions((data.instructions as Record<string, unknown>) || null);
      if (data.rail) setRail(data.rail as RailMeta);
      toast.success("Deposit instructions ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start USD bank deposit");
    } finally {
      setLoading(false);
    }
  };

  const complete = async () => {
    if (!intent) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fincra-usd-bank", {
        body: {
          action: "complete",
          intent_id: intent.id,
          amount: Number(intent.amount),
          bank_reference: bankRef.trim(),
        },
      });
      if (data?.error) throw new Error(String(data.error));
      if (error) throw error;
      toast.success("USD wallet credited");
      onComplete?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm deposit");
    } finally {
      setLoading(false);
    }
  };

  if (rail && rail.configured === false) {
    return (
      <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">USD bank deposit</p>
        <p className="text-muted-foreground">
          {rail.status === "pending" || rail.status === "requested"
            ? "Fincra USD virtual account is pending approval. Card checkout is available meanwhile."
            : "USD bank receive is not set up yet. Use card checkout, or ask ops to request a Fincra USD VA."}
        </p>
        {onExit && (
          <Button type="button" variant="outline" onClick={onExit}>
            Back
          </Button>
        )}
      </div>
    );
  }

  if (!intent) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="usd-bank-amount">Amount (USD)</Label>
          <Input
            id="usd-bank-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100.00"
          />
        </div>
        <Button type="button" className="w-full" size="lg" disabled={loading} onClick={() => void createIntent()}>
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner size={18} /> Preparing…
            </span>
          ) : (
            "Get bank details"
          )}
        </Button>
      </div>
    );
  }

  const memo = String(instructions?.memo || intent.public_id || intent.reference);
  const acct = String(instructions?.account_number || rail?.account_number || "");
  const routing = String(instructions?.routing_number || rail?.routing_number || "");
  const bankName = String(instructions?.bank_name || rail?.bank_name || "Fincra USD account");
  const acctName = String(instructions?.account_name || rail?.account_name || "");

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        Send exactly <span className="font-semibold text-foreground">USD {Number(intent.amount).toFixed(2)}</span> via ACH
        and include the memo so we can match your deposit.
      </p>
      <div className="space-y-2 rounded-lg border p-3">
        {[
          ["Bank", bankName],
          ["Account name", acctName],
          ["Routing (ABA)", routing],
          ["Account number", acct],
          ["Memo / reference", memo],
          ["Amount", `USD ${Number(intent.amount).toFixed(2)}`],
        ].filter(([, v]) => v).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="font-medium break-all">{value}</div>
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={() => void copy(String(value), label)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="usd-bank-ref">Your bank confirmation / trace ID (optional)</Label>
        <Input
          id="usd-bank-ref"
          value={bankRef}
          onChange={(e) => setBankRef(e.target.value)}
          placeholder="After you send, paste the bank reference"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          className="flex-1"
          disabled={loading || bankRef.trim().length < 4}
          onClick={() => void complete()}
        >
          {loading ? "Confirming…" : "I’ve sent it — confirm"}
        </Button>
        {onExit && (
          <Button type="button" variant="outline" onClick={onExit}>
            Close
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Webhooks usually credit automatically when the memo matches. Manual confirm is a backup.
      </p>
    </div>
  );
}
