import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Smartphone, Loader2, MessageSquare } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import {
  getGhanaPayStatus,
  initiateGhanaCollection,
  networkFromGhanaPhone,
} from "@/lib/ghanaPay";

const NETWORKS = [
  { value: "MTN", label: "MTN Mobile Money" },
  { value: "AIR", label: "AirtelTigo Money" },
  { value: "VOD", label: "Telecel Cash" },
];

interface Props {
  initialAmount?: string;
  walletId: string;
  walletCurrency: string;
}

export default function GhanaTopUpCard({ walletId, walletCurrency, initialAmount }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const [amount, setAmount] = useState(initialAmount ?? "");
  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);
  const [network, setNetwork] = useState("MTN");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [networkTouched, setNetworkTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(null);

  useEffect(() => {
    if (phoneTouched) return;
    const saved = profile?.phone_number?.trim();
    if (saved && !phone) setPhone(saved);
  }, [profile?.phone_number, phone, phoneTouched]);

  useEffect(() => {
    if (networkTouched) return;
    const detected = networkFromGhanaPhone(phone);
    if (detected && detected !== network) setNetwork(detected);
  }, [phone, network, networkTouched]);

  useEffect(() => {
    if (!pollingId) return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      if (cancelled || attempts > 40) return;
      attempts += 1;
      const status = await getGhanaPayStatus(pollingId);
      if (!status || status.status === "processing" || status.status === "pending") {
        setTimeout(poll, 3000);
        return;
      }
      if (status.status === "completed") {
        toast.success(`Wallet credited GH₵${status.amount.toLocaleString()}`);
        queryClient.invalidateQueries({ queryKey: ["wallets", user?.id] });
        setPollingId(null);
        setLoading(false);
        return;
      }
      if (status.status === "failed") {
        toast.error(status.failure_reason || "Top-up failed");
        setPollingId(null);
        setLoading(false);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [pollingId, queryClient, user?.id]);

  if (walletCurrency !== "GHS") return null;

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error("Enter at least GH₵1");
      return;
    }
    if (!phone.trim()) {
      toast.error("Enter your mobile money number");
      return;
    }
    setLoading(true);
    try {
      const result = await initiateGhanaCollection({
        amount: amt,
        target_wallet_id: walletId,
        phone: phone.trim(),
        network,
        customer_name: profile?.full_name || undefined,
      });
      toast.message("Check your phone", {
        description: result.message || "Approve the MoMo prompt to complete top-up.",
        icon: <MessageSquare className="h-4 w-4" />,
      });
      setPollingId(result.transaction_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Top-up failed");
      setLoading(false);
    }
  };

  return (
    <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-emerald-500" />
          Ghana Mobile Money (direct)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Top up via MTN, AirtelTigo, or Telecel — no card or Stripe required.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Amount (GHS)</Label>
          <Input
            type="number"
            min={1}
            step="0.01"
            placeholder="e.g. 100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Network</Label>
          <Select value={network} onValueChange={(v) => { setNetworkTouched(true); setNetwork(v); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {NETWORKS.map((n) => (
                <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Mobile number</Label>
          <Input
            type="tel"
            placeholder="024 123 4567"
            value={phone}
            onChange={(e) => { setPhoneTouched(true); setPhone(e.target.value); }}
          />
        </div>
        <Button className="w-full" onClick={handleSubmit} disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Waiting for approval…</> : "Send MoMo prompt"}
        </Button>
      </CardContent>
    </Card>
  );
}
