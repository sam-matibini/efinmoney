import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Smartphone, ShieldCheck, ArrowRight, Loader2, MessageSquare, KeyRound, Wallet, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { initiateElicateCharge } from "@/lib/elicate";
import { useProfile } from "@/hooks/useProfile";

// Zambia mobile-money prefix → default network. User can still override.
function networkFromPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  // Normalise to last 9 (national) — strip 260 country code if present.
  let n = digits;
  if (n.startsWith("260")) n = n.slice(3);
  if (n.startsWith("0")) n = n.slice(1);
  if (n.length < 2) return null;
  const prefix = n.slice(0, 2);
  if (["96", "76"].includes(prefix)) return "MTN";
  if (["97", "77"].includes(prefix)) return "AIRTEL";
  if (["95", "75"].includes(prefix)) return "ZAMTEL";
  return null;
}

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
  const { data: profile } = useProfile();
  const [params, setParams] = useSearchParams();
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("MTN");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [networkTouched, setNetworkTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Pre-fill the user's saved phone (one-time, before they type anything).
  useEffect(() => {
    if (phoneTouched) return;
    const saved = profile?.phone_number?.trim();
    if (saved && !phone) setPhone(saved);
  }, [profile?.phone_number, phone, phoneTouched]);

  // Auto-detect network from phone prefix unless user has manually picked one.
  useEffect(() => {
    if (networkTouched) return;
    const detected = networkFromPhone(phone);
    if (detected && detected !== network) setNetwork(detected);
  }, [phone, network, networkTouched]);

  // Handle return from Elicate hosted page.
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

  const validateAndConfirm = () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error("Enter an amount of at least 1 ZMW");
      return;
    }
    if (!phone.trim()) {
      toast.error("Enter your mobile money number");
      return;
    }
    setConfirming(true);
  };

  const proceed = async () => {
    setConfirming(false);
    setRedirecting(true);
    try {
      const returnUrl = `${window.location.origin}/wallets/topup?walletId=${walletId}&elicate_status=success`;
      const result = await initiateElicateCharge({
        amount: Number(amount),
        target_wallet_id: walletId,
        phone: phone.trim(),
        network,
        return_url: returnUrl,
      });
      if (result.redirect_url) {
        // Redirect-first flow. Webhook credits the wallet after PIN authorisation.
        window.location.href = result.redirect_url;
        return;
      }
      toast.error("Top-up could not start — provider did not return a payment page. Please try again or contact support.");
      setRedirecting(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start top-up");
      setRedirecting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
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
            <Select value={network} onValueChange={(v) => { setNetwork(v); setNetworkTouched(true); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NETWORKS.map((n) => (
                  <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!networkTouched && phone && (
              <p className="text-xs text-muted-foreground mt-1">
                Auto-selected from phone prefix — change manually if wrong.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Mobile Money Number</Label>
              {profile?.phone_number && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => { setPhone(profile.phone_number || ""); setPhoneTouched(true); }}
                >
                  <User className="w-3 h-3 mr-1" />
                  Use my number
                </Button>
              )}
            </div>
            <Input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneTouched(true); }}
              placeholder="+260 97 123 4567"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {profile?.phone_number && phone === profile.phone_number
                ? "Topping up your own wallet. Change the number to top up someone else."
                : phone && phone !== profile?.phone_number
                  ? "Topping up someone else's mobile money — make sure the number is correct."
                  : "Enter the phone number to charge for this top-up."}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Mobile money payments are processed by our regulated payment partner. You'll
              briefly leave eFinMoney to enter an OTP and confirm with your PIN — then return
              here automatically with your wallet credited.
            </p>
          </div>

          <Button className="w-full" size="lg" onClick={validateAndConfirm} disabled={redirecting}>
            {redirecting ? "Connecting to secure payment partner…" : `Top up ${amount ? `ZMW ${amount}` : "with Mobile Money"}`}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirming} onOpenChange={(o) => { if (!o) setConfirming(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>You're about to leave eFinMoney</DialogTitle>
            <DialogDescription>
              {profile?.phone_number && phone === profile.phone_number ? (
                <>We'll take you to our secure payment partner to authorise this {network} top-up of <strong>ZMW {amount}</strong> from <strong>{phone}</strong>.</>
              ) : (
                <>This will charge <strong>{phone}</strong> ({network}) <strong>ZMW {amount}</strong> and credit your wallet. The owner of that phone must approve the OTP and PIN — so only proceed if you have access to it (or they're with you).</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Step icon={<ArrowRight className="w-4 h-4" />} title="You'll be redirected">
              You'll see a page hosted by our payment processor. This is normal — it's how mobile money authorisation works.
            </Step>
            <Step icon={<MessageSquare className="w-4 h-4" />} title="Enter the OTP we send to your phone">
              Watch for an SMS or WhatsApp message with a verification code, and enter it on the page.
            </Step>
            <Step icon={<KeyRound className="w-4 h-4" />} title="Approve with your Mobile Money PIN">
              Your phone will get a USSD prompt. Enter your PIN — this is how MTN/Airtel/Zamtel confirm you're authorising the payment.
            </Step>
            <Step icon={<Wallet className="w-4 h-4" />} title="Wallet credits automatically">
              You'll be returned to eFinMoney and your ZMW balance will update within seconds.
            </Step>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)} disabled={redirecting}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={proceed} disabled={redirecting}>
              {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue to payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
