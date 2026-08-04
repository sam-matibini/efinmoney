import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { supabase } from "@/integrations/supabase/client";
import { fetchFxRate, validateMinAmount } from "@/lib/flutterwave";

/** Must match execute-transfer ZAMBIA_FINCRA_TEST_TOKEN (or its default). */
export const ZM_FINCRA_OPS_TOKEN = "efm-zm-fincra-7f3a9c";

const NETWORKS = [
  { id: "mtn", label: "MTN Mobile Money", payout: "mtn_mobile" },
  { id: "airtel", label: "Airtel Money", payout: "airtel_money" },
  { id: "zamtel", label: "Zamtel Kwacha", payout: "zamtel_money" },
] as const;

/**
 * Private ops page: wallet-funded Zambia MoMo via Fincra only (no FLW failover).
 * URL: /ops/zm-fincra/:token
 */
export default function ZambiaFincraTestPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: wallets } = useWallets();
  const createTransfer = useCreateTransfer();

  const [walletId, setWalletId] = useState("");
  const [networkId, setNetworkId] = useState<string>("airtel");
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("+260 ");
  const [amount, setAmount] = useState("");
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const activeWallets = useMemo(
    () => (wallets || []).filter((w) => w.status === "active"),
    [wallets],
  );
  const wallet = activeWallets.find((w) => w.wallet_id === walletId) || activeWallets[0];
  const network = NETWORKS.find((n) => n.id === networkId) || NETWORKS[1];
  const sourceCurrency = wallet?.currency_code || "ZMW";
  const parsedAmount = parseFloat(amount) || 0;
  const chargeAmount = fxRate != null ? Math.round(parsedAmount * fxRate * 100) / 100 : 0;

  useEffect(() => {
    if (!walletId && activeWallets.length) {
      const zmw = activeWallets.find((w) => w.currency_code === "ZMW");
      setWalletId((zmw || activeWallets[0]).wallet_id);
    }
  }, [activeWallets, walletId]);

  useEffect(() => {
    let cancelled = false;
    if (!wallet) {
      setFxRate(null);
      return;
    }
    if (sourceCurrency === "ZMW") {
      setFxRate(1);
      return;
    }
    fetchFxRate(sourceCurrency, "ZMW").then((r) => {
      if (!cancelled) setFxRate(r);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceCurrency, wallet]);

  if (token !== ZM_FINCRA_OPS_TOKEN) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Sign in required");
    if (!wallet) return toast.error("Select a wallet");
    if (!recipientName.trim()) return toast.error("Recipient name required");
    if (phone.replace(/\D/g, "").length < 9) return toast.error("Enter a valid Zambian phone");
    if (parsedAmount <= 0) return toast.error("Enter an amount");
    if (fxRate == null) return toast.error(`No FX for ${sourceCurrency} → ZMW`);
    if (parsedAmount > Number(wallet.balance)) {
      return toast.error(`Insufficient ${sourceCurrency} balance (${wallet.balance})`);
    }
    const minErr = validateMinAmount("ZMW", chargeAmount);
    if (minErr) return toast.error(minErr);

    setSubmitting(true);
    setLastResult(null);
    try {
      const transfer = await createTransfer.mutateAsync({
        sender_wallet_id: wallet.wallet_id,
        recipient_name: recipientName.trim(),
        recipient_phone: phone.trim(),
        recipient_country: "ZM",
        transfer_type: "mobile_money",
        payout_method: network.payout,
        source_currency: sourceCurrency,
        target_currency: "ZMW",
        source_amount: parsedAmount,
        target_amount: chargeAmount,
        exchange_rate: fxRate,
        fee_amount: 0,
        funding_source: "wallet",
      });

      const { data, error } = await supabase.functions.invoke("execute-transfer", {
        body: {
          transfer_id: transfer.id,
          force_rail: "fincra_only",
          ops_token: ZM_FINCRA_OPS_TOKEN,
        },
      });

      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Payout failed");
      }
      const payout = (data as any)?.payout;
      if (payout && payout.success === false) {
        throw new Error(payout.error || "Fincra payout failed");
      }

      const ref = payout?.provider_reference || transfer.id;
      setLastResult(`OK · rail=fincra · transfer=${transfer.id} · ref=${ref}`);
      toast.success("Fincra Zambia payout submitted");
      navigate(`/transfers/${transfer.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payout failed";
      setLastResult(`FAILED · ${msg}`);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8 space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FlaskConical className="h-4 w-4" />
            Ops · Fincra only
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Zambia MoMo test payout</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Debits your wallet balance and pays out ZMW via Fincra only — no Flutterwave failover.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-2">
          <Label>Source wallet</Label>
          <Select value={wallet?.wallet_id || ""} onValueChange={setWalletId}>
            <SelectTrigger>
              <SelectValue placeholder="Select wallet" />
            </SelectTrigger>
            <SelectContent>
              {activeWallets.map((w) => (
                <SelectItem key={w.wallet_id} value={w.wallet_id}>
                  {w.currency_code} · {Number(w.balance).toLocaleString()} {w.symbol || w.currency_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Network</Label>
          <Select value={networkId} onValueChange={setNetworkId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NETWORKS.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Recipient name</Label>
          <Input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Mercy Phiri"
            autoComplete="name"
          />
        </div>

        <div className="space-y-2">
          <Label>Phone</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+260 97XXXXXXX"
            inputMode="tel"
          />
        </div>

        <div className="space-y-2">
          <Label>Amount ({sourceCurrency})</Label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            inputMode="decimal"
          />
          {fxRate != null && sourceCurrency !== "ZMW" && parsedAmount > 0 && (
            <p className="text-xs text-muted-foreground">
              Recipient gets ~{chargeAmount.toLocaleString()} ZMW (rate {fxRate})
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Sending via Fincra…" : "Pay out via Fincra"}
        </Button>

        {lastResult && (
          <p className="text-xs font-mono break-all text-muted-foreground">{lastResult}</p>
        )}
      </form>
    </div>
  );
}
