import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Smartphone } from "lucide-react";
import { initializeFlwPayment, minAmount, validateMinAmount } from "@/lib/flutterwave";
import { MM_COUNTRIES } from "@/lib/mobileMoneyNetworks";
import { currencySymbol } from "@/lib/currency";

interface Props {
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

function formatAmt(amount: number, currency: string): string {
  const c = currency.toUpperCase();
  const zero = c === "UGX" || c === "RWF" || c === "TZS";
  const sym = currencySymbol(c) || c;
  return `${sym}${amount.toLocaleString(undefined, {
    minimumFractionDigits: zero ? 0 : 2,
    maximumFractionDigits: zero ? 0 : 2,
  })} ${c}`;
}

export default function FlutterwaveMomoTopUpCard({ walletId, walletCurrency, onComplete }: Props) {
  const currency = walletCurrency.toUpperCase();
  const mm = useMemo(() => MM_COUNTRIES.find((c) => c.currency === currency), [currency]);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState(mm?.networks[0]?.value || "");
  const [loading, setLoading] = useState(false);
  const [pendingNote, setPendingNote] = useState<string | null>(null);

  useEffect(() => {
    setNetwork(mm?.networks[0]?.value || "");
  }, [mm]);

  if (!mm) return null;

  const handleConfirm = async () => {
    const amt = Number(amount);
    const minErr = validateMinAmount(currency, amt);
    if (minErr) {
      toast.error(minErr);
      return;
    }
    if (!phone.trim()) {
      toast.error("Enter the mobile money phone number");
      return;
    }
    const dial = mm.dialCode.replace("+", "");
    const digits = phone.replace(/\D/g, "");
    const wrongDials = ["254", "256", "255", "250", "233", "260"].filter((d) => d !== dial);
    if (wrongDials.some((d) => digits.startsWith(d))) {
      toast.error(`Use a ${currency} number starting with ${dial}`);
      return;
    }
    const national = digits.startsWith(dial)
      ? digits.slice(dial.length)
      : digits.startsWith("0")
      ? digits.slice(1)
      : digits;
    if (national.length < 7 || national.length > 10) {
      toast.error(`Enter a valid ${currency} phone (e.g. ${dial}7…)`);
      return;
    }
    if (!network) {
      toast.error("Select a mobile network");
      return;
    }

    setLoading(true);
    setPendingNote(null);
    try {
      const result = await initializeFlwPayment({
        amount: amt,
        currency,
        paymentMethod: "mobilemoney",
        phone: phone.trim(),
        network,
        country: mm.code,
        walletId,
        redirectUrl: `${window.location.origin}/wallet/topup?walletId=${walletId}&flw=1`,
      });

      if (result.payment_link) {
        toast.message("Opening mobile money checkout");
        window.location.href = result.payment_link;
        return;
      }

      const note =
        result.message ||
        result.next_action?.payment_instruction?.note ||
        "Approve the payment on your phone. Your wallet will credit automatically.";
      setPendingNote(note);
      toast.success("Approve the payment on your phone", {
        description: "We’ll credit your wallet when payment is confirmed.",
        duration: 12000,
      });
      onComplete?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start mobile money top-up");
    } finally {
      setLoading(false);
    }
  };

  const min = minAmount(currency);
  const parsed = Number(amount);

  return (
    <Card className="border-orange-500/30 bg-gradient-to-br from-orange-950/10 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-orange-500" />
          Mobile money
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pay with {mm.name} mobile money. Your {currency} wallet credits when you approve on your phone.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Amount ({currency})</Label>
          <Input
            type="number"
            min={min}
            step={currency === "UGX" || currency === "RWF" || currency === "TZS" ? "1" : "0.01"}
            placeholder={`e.g. ${min}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Minimum {formatAmt(min, currency)}</p>
        </div>

        <div className="space-y-2">
          <Label>Network</Label>
          <Select value={network} onValueChange={setNetwork}>
            <SelectTrigger>
              <SelectValue placeholder="Select network" />
            </SelectTrigger>
            <SelectContent>
              {mm.networks.map((n) => (
                <SelectItem key={n.value} value={n.value}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Mobile money phone</Label>
          <Input
            type="tel"
            placeholder={`${mm.dialCode.replace("+", "")}7… or 07…`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {currency} numbers only (country code {mm.dialCode})
          </p>
        </div>

        {pendingNote && (
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 text-sm text-muted-foreground">
            {pendingNote}
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleConfirm}
          disabled={loading || !Number.isFinite(parsed) || parsed < min}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Smartphone className="h-4 w-4 mr-2" />
              {Number.isFinite(parsed) && parsed >= min
                ? `Confirm — ${formatAmt(parsed, currency)}`
                : "Confirm"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
