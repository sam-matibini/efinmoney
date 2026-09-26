import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { Loader2, Copy, CheckCircle2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { CurrencyFlag } from "@/components/ui/FlagImage";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/invokeEdgeFunction";
import { currencySymbol } from "@/lib/currency";
import { LIVE_PAYIN_CURRENCIES, isLivePayinCurrency } from "@/lib/retailPayoutFees";

export type MoneyRequestResult = {
  id: string;
  short_code: string;
  short_url: string;
  amount: number;
  currency: string;
  status: string;
  note: string | null;
  expires_at: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  defaultWalletId?: string;
}

function minAmount(currency: string): number {
  const c = currency.toUpperCase();
  if (c === "NGN") return 100;
  if (c === "KES" || c === "ZMW" || c === "GHS") return 10;
  return 2;
}

function payRailBlurb(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "CAD") return "Interac Autodeposit or card / bank (Nomba)";
  if (c === "NGN" || c === "GHS") return "bank transfer or card / mobile money";
  if (c === "KES" || c === "ZMW") return "mobile money or card";
  if (c === "USD") return "card";
  return "secure checkout";
}

function formatAmt(amount: number, currency: string): string {
  const sym = currencySymbol(currency);
  return `${sym}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export default function CreateMoneyRequestModal({
  open,
  onOpenChange,
  onCreated,
  defaultWalletId,
}: Props) {
  const { data: wallets } = useWallets();
  const liveWallets = useMemo(
    () =>
      (wallets || []).filter(
        (w) => w.status === "active" && isLivePayinCurrency(w.currency_code),
      ),
    [wallets],
  );

  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [payerHint, setPayerHint] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<MoneyRequestResult | null>(null);

  const selectedWallet = liveWallets.find((w) => w.wallet_id === walletId) ?? liveWallets[0];
  const currency = String(selectedWallet?.currency_code || "CAD").toUpperCase();
  const symbol = currencySymbol(currency);
  const minAmt = minAmount(currency);
  const parsedAmount = Number(amount);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setPayerHint("");
    setNote("");
    setAmount("");
  }, [open]);

  useEffect(() => {
    if (!liveWallets.length) return;
    if (defaultWalletId && liveWallets.some((w) => w.wallet_id === defaultWalletId)) {
      setWalletId(defaultWalletId);
      return;
    }
    if (!liveWallets.some((w) => w.wallet_id === walletId)) {
      const def = liveWallets.find((w) => w.is_default) ?? liveWallets[0];
      setWalletId(def.wallet_id);
    }
  }, [liveWallets, walletId, defaultWalletId]);

  const canSubmit =
    !!selectedWallet
    && Number.isFinite(parsedAmount)
    && parsedAmount >= minAmt;

  const handleCreate = async () => {
    if (!selectedWallet || !canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("money-request-create", {
        body: {
          amount: parsedAmount,
          currency,
          wallet_id: selectedWallet.wallet_id,
          note: note.trim() || null,
          payer_hint_name: payerHint.trim() || null,
          base_url: window.location.origin,
        },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (data?.error) throw new Error(String(data.error));
      const row = data?.request as MoneyRequestResult;
      if (!row?.short_url) throw new Error("No link returned");
      setResult(row);
      onCreated?.();
      toast.success("Request link ready — share it");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create request");
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!result?.short_url) return;
    await navigator.clipboard.writeText(result.short_url);
    toast.success("Link copied");
  };

  const shareLink = async () => {
    if (!result?.short_url) return;
    const text = `Please send me ${formatAmt(result.amount, result.currency)} on eFinMoney: ${result.short_url}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "eFinMoney request", text, url: result.short_url });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard.writeText(text);
    toast.success("Share text copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Share this link
              </DialogTitle>
              <DialogDescription>
                Anyone with the link can pay {formatAmt(result.amount, result.currency)} into your{" "}
                {result.currency} wallet via {payRailBlurb(result.currency)} — no eFinMoney account needed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Pay link</p>
                <code className="block text-sm break-all">{result.short_url}</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Expires {new Date(result.expires_at).toLocaleString()} · code {result.short_code}
              </p>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={copyLink}>
                <Copy className="h-4 w-4" /> Copy link
              </Button>
              <Button type="button" className="gap-2" onClick={shareLink}>
                <Share2 className="h-4 w-4" /> Share
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Request money</DialogTitle>
              <DialogDescription>
                Create a link your uncle, parent, or friend can open and pay from their bank or mobile money —
                into any of your live wallets ({LIVE_PAYIN_CURRENCIES.join(", ")}).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {liveWallets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Open a wallet in {LIVE_PAYIN_CURRENCIES.join(", ")}, then come back to create a request.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Credit to wallet</Label>
                    <Select value={selectedWallet?.wallet_id} onValueChange={setWalletId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose wallet" />
                      </SelectTrigger>
                      <SelectContent>
                        {liveWallets.map((w) => (
                          <SelectItem key={w.wallet_id} value={w.wallet_id}>
                            <span className="flex items-center gap-2">
                              <CurrencyFlag code={w.currency_code} />
                              {w.currency_code} — {currencySymbol(w.currency_code)}
                              {Number(w.balance).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount ({currency})</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {symbol}
                      </span>
                      <Input
                        className="pl-10"
                        inputMode="decimal"
                        placeholder={minAmt.toFixed(2)}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Minimum {symbol}{minAmt.toFixed(2)} · Payer uses {payRailBlurb(currency)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Who is this for? <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input
                      placeholder="e.g. Dad, Uncle John"
                      value={payerHint}
                      onChange={(e) => setPayerHint(e.target.value)}
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Textarea
                      placeholder="Rent help · birthday · school fees"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      maxLength={280}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={!canSubmit || submitting || liveWallets.length === 0}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create link"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
