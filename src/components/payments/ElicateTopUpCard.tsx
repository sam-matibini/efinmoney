import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { initiateElicateCharge } from "@/lib/elicate";

interface Props {
  walletId: string;
  walletCurrency: string;
}

const NETWORKS = [
  { value: "MTN", label: "MTN Mobile Money" },
  { value: "AIRTEL", label: "Airtel Money" },
  { value: "ZAMTEL", label: "Zamtel Kwacha" },
];

export default function ElicateTopUpCard({ walletId, walletCurrency }: Props) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("MTN");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  // Handle return from Elicate hosted page. Elicate appends a status to our return URL.
  useEffect(() => {
    const status = params.get("elicate_status");
    if (!status) return;
    if (status === "success" || status === "successful" || status === "completed") {
      toast.success("Top-up successful — your wallet has been credited.");
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    } else if (status === "failed" || status === "cancelled") {
      toast.error("Top-up was not completed.");
    } else {
      toast.info(`Top-up status: ${status}`);
    }
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("elicate_status");
      next.delete("transaction_id");
      next.delete("reference");
      return next;
    }, { replace: true });
  }, [params, setParams, queryClient]);

  if (walletCurrency !== "ZMW") return null;

  const start = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error("Enter an amount of at least 1 ZMW");
      return;
    }
    if (!phone.trim()) {
      toast.error("Enter your mobile money number");
      return;
    }
    setLoading(true);
    try {
      const returnUrl = `${window.location.origin}/wallets/topup?walletId=${walletId}&elicate_status=success`;
      const result = await initiateElicateCharge({
        amount: amt,
        target_wallet_id: walletId,
        phone: phone.trim(),
        network,
        return_url: returnUrl,
      });
      if (result.redirect_url) {
        // Redirect-first flow (Elicate's documented model): user completes payment on
        // Elicate's hosted page, then returns to us. Webhook credits the wallet.
        window.location.href = result.redirect_url;
        return;
      }
      // Provider didn't return a redirect URL — surface a clear error rather than
      // leaving the user staring at a spinner. Mobile-money authorisation always needs
      // a PIN step that cannot happen inside our app.
      toast.error("Top-up could not start — provider did not return a payment page. Please try again or contact support.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start top-up");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Top up with Mobile Money
          <Badge variant="outline" className="border-primary/30 text-primary">
            <Smartphone className="w-3 h-3 mr-1" />
            MTN · Airtel · Zamtel
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Amount (ZMW)</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-12 text-lg"
          />
        </div>

        <div>
          <Label>Mobile Money Network</Label>
          <Select value={network} onValueChange={setNetwork}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {NETWORKS.map((n) => (
                <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Mobile Money Number</Label>
          <Input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+260 97 123 4567"
          />
          <p className="text-xs text-muted-foreground mt-1">
            You'll be taken to a secure payment page to confirm with your PIN. After payment, you'll return here automatically and your wallet will update.
          </p>
        </div>

        <Button className="w-full" size="lg" onClick={start} disabled={loading}>
          {loading ? "Starting secure payment…" : `Top up ${amount ? `ZMW ${amount}` : "with Mobile Money"}`}
        </Button>
      </CardContent>
    </Card>
  );
}
