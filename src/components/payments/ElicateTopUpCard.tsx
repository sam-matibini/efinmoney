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
import { Smartphone, ShieldCheck, ArrowRight, Loader2, MessageSquare, KeyRound, Wallet, User, ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { initiateElicateCharge, pollElicateChargeStatus } from "@/lib/elicate";
import { useProfile } from "@/hooks/useProfile";

function networkFromPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
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
  initialAmount?: string;
  walletId: string;
  walletCurrency: string;
}

const NETWORKS = [
  { value: "MTN", label: "MTN Mobile Money" },
  { value: "AIRTEL", label: "Airtel Money" },
  { value: "ZAMTEL", label: "Zamtel Kwacha" },
];

export default function ElicateTopUpCard({ walletId, walletCurrency, initialAmount }: Props) {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const [, setParams] = useSearchParams();
  const [amount, setAmount] = useState(initialAmount ?? "");
  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);
  const [network, setNetwork] = useState("MTN");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [networkTouched, setNetworkTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [activeChargeId, setActiveChargeId] = useState<string | null>(null);
  const [sandboxMode, setSandboxMode] = useState(false);

  useEffect(() => {
    if (phoneTouched) return;
    const saved = profile?.phone_number?.trim();
    if (saved && !phone) setPhone(saved);
  }, [profile?.phone_number, phone, phoneTouched]);

  useEffect(() => {
    if (networkTouched) return;
    const detected = networkFromPhone(phone);
    if (detected && detected !== network) setNetwork(detected);
  }, [phone, network, networkTouched]);

  // Resume poll after return from hosted page
  useEffect(() => {
    const chargeId = new URLSearchParams(window.location.search).get("elicate_charge_id");
    if (!chargeId) return;

    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("elicate_charge_id");
      next.delete("elicate_status");
      next.delete("transaction_id");
      next.delete("reference");
      return next;
    }, { replace: true });

    setActiveChargeId(chargeId);
    let cancelled = false;
    const poll = async (attempt: number) => {
      if (cancelled) return;
      try {
        const charge = await pollElicateChargeStatus({ charge_id: chargeId });
        if (cancelled) return;
        if (charge.status === "completed") {
          toast.success("Top-up successful — your wallet has been credited.");
          queryClient.invalidateQueries({ queryKey: ["wallets"] });
          setActiveChargeId(null);
          setRedirectUrl(null);
          return;
        }
        if (charge.status === "failed" || charge.status === "cancelled" || charge.status === "expired") {
          toast.error(charge.failure_reason || "Top-up was not completed.");
          setActiveChargeId(null);
          setRedirectUrl(null);
          return;
        }
      } catch {
        /* keep polling */
      }
      if (attempt >= 40) {
        toast.info("Still confirming your top-up — check your balance shortly.");
        return;
      }
      setTimeout(() => poll(attempt + 1), 3000);
    };
    poll(0);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while iframe is open
  useEffect(() => {
    if (!activeChargeId || !redirectUrl) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const charge = await pollElicateChargeStatus({ charge_id: activeChargeId });
        if (cancelled) return;
        if (charge.status === "completed") {
          toast.success("Top-up successful — your wallet has been credited.");
          queryClient.invalidateQueries({ queryKey: ["wallets"] });
          setActiveChargeId(null);
          setRedirectUrl(null);
          setBusy(false);
          return;
        }
        if (charge.status === "failed") {
          toast.error(charge.failure_reason || "Top-up failed");
          setActiveChargeId(null);
          setRedirectUrl(null);
          setBusy(false);
          return;
        }
      } catch { /* continue */ }
      setTimeout(tick, 3000);
    };
    const t = setTimeout(tick, 3000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [activeChargeId, redirectUrl, queryClient]);

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
    setBusy(true);
    try {
      const returnUrl = `${window.location.origin}/wallets/topup?walletId=${walletId}`;
      const result = await initiateElicateCharge({
        amount: Number(amount),
        target_wallet_id: walletId,
        phone: phone.trim(),
        network,
        return_url: returnUrl,
      });
      setSandboxMode(result.mode === "sandbox");
      if (result.redirect_url) {
        setRedirectUrl(result.redirect_url);
        setActiveChargeId(result.charge_id);
        return;
      }
      toast.error("Top-up could not start — no payment page returned. Try again.");
      setBusy(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start top-up");
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            Top up with Mobile Money
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-700">
              <Smartphone className="w-3 h-3 mr-1" />
              MTN · Airtel · Zamtel
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!initialAmount && (
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
          )}

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
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Approve the payment with your mobile money PIN. Your ZMW wallet credits when the charge succeeds.
            </p>
          </div>

          <Button className="w-full" size="lg" onClick={validateAndConfirm} disabled={busy}>
            {busy ? "Starting…" : `Top up ${amount ? `ZMW ${amount}` : "with Mobile Money"}`}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirming} onOpenChange={(o) => { if (!o) setConfirming(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm mobile money top-up</DialogTitle>
            <DialogDescription>
              Charge <strong>{phone}</strong> ({network}) <strong>ZMW {amount}</strong> and credit your wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Step icon={<ArrowRight className="w-4 h-4" />} title="Secure verification">
              Complete any OTP / PIN steps on the payment page.
            </Step>
            <Step icon={<MessageSquare className="w-4 h-4" />} title="OTP if prompted">
              {sandboxMode
                ? "In test mode use OTP 123456 when asked."
                : "Watch for SMS or WhatsApp with a verification code."}
            </Step>
            <Step icon={<KeyRound className="w-4 h-4" />} title="Approve on your phone">
              Enter your mobile money PIN when prompted.
            </Step>
            <Step icon={<Wallet className="w-4 h-4" />} title="Wallet updates automatically">
              We confirm the payment in the background and credit your balance.
            </Step>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={proceed} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!redirectUrl} onOpenChange={(o) => {
        if (!o) {
          setRedirectUrl(null);
          setBusy(false);
        }
      }}>
        <DialogContent className="max-w-lg sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Complete payment</DialogTitle>
            <DialogDescription>
              Finish verification below. Waiting for confirmation…
            </DialogDescription>
          </DialogHeader>
          {redirectUrl && (
            <iframe
              title="Mobile money verification"
              src={redirectUrl}
              className="w-full h-[420px] rounded-xl border border-border bg-background"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {redirectUrl && (
              <Button variant="outline" asChild>
                <a href={redirectUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in new tab
                </a>
              </Button>
            )}
            <Button variant="ghost" onClick={() => { setRedirectUrl(null); setBusy(false); }}>
              Close
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
