import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Smartphone, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { initiateElicateCharge, getElicateChargeStatus } from "@/lib/elicate";

interface Props {
  walletId: string;
  walletCurrency: string;
}

const NETWORKS = [
  { value: "MTN", label: "MTN Mobile Money" },
  { value: "AIRTEL", label: "Airtel Money" },
  { value: "ZAMTEL", label: "Zamtel Kwacha" },
];

type DialogState =
  | { kind: "awaiting"; chargeId: string }
  | { kind: "completed"; amount: number }
  | { kind: "failed"; reason: string }
  | null;

export default function ElicateTopUpCard({ walletId, walletCurrency }: Props) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("MTN");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const pollRef = useRef<number | null>(null);

  // Poll the charge status every 3s while awaiting approval. Stops on terminal state
  // or after 4 minutes (USSD prompts typically expire in 60-90s).
  useEffect(() => {
    if (!dialog || dialog.kind !== "awaiting") return;
    const startedAt = Date.now();
    const tick = async () => {
      const status = await getElicateChargeStatus(dialog.chargeId);
      if (!status) return;
      if (status.status === "completed") {
        await queryClient.invalidateQueries({ queryKey: ["wallets"] });
        setDialog({ kind: "completed", amount: status.amount_minor / 100 });
      } else if (["failed", "cancelled", "expired"].includes(status.status)) {
        setDialog({
          kind: "failed",
          reason: status.failure_reason || "The top-up was not completed.",
        });
      } else if (Date.now() - startedAt > 4 * 60 * 1000) {
        setDialog({
          kind: "failed",
          reason: "Timed out waiting for approval. Please check your phone and try again.",
        });
      }
    };
    pollRef.current = window.setInterval(tick, 3000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [dialog, queryClient]);

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
      const result = await initiateElicateCharge({
        amount: amt,
        target_wallet_id: walletId,
        phone: phone.trim(),
        network,
      });
      setDialog({ kind: "awaiting", chargeId: result.charge_id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start top-up");
    } finally {
      setLoading(false);
    }
  };

  const closeDialog = () => {
    setDialog(null);
    setAmount("");
    setPhone("");
  };

  return (
    <>
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
              You will receive a prompt on your phone to enter your PIN and approve the top-up.
            </p>
          </div>

          <Button className="w-full" size="lg" onClick={start} disabled={loading}>
            {loading ? "Sending prompt to your phone…" : `Top up ${amount ? `ZMW ${amount}` : "with Mobile Money"}`}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "awaiting" && "Approve on your phone"}
              {dialog?.kind === "completed" && "Top-up successful"}
              {dialog?.kind === "failed" && "Top-up failed"}
            </DialogTitle>
          </DialogHeader>
          {dialog?.kind === "awaiting" && (
            <div className="space-y-4 text-center py-4">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
              <div className="space-y-1">
                <p className="font-medium">Check your phone for the prompt</p>
                <p className="text-sm text-muted-foreground">
                  Enter your Mobile Money PIN on the {network} prompt to confirm the {amount} ZMW top-up.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={closeDialog}>
                Cancel and close
              </Button>
            </div>
          )}
          {dialog?.kind === "completed" && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
              <p className="font-medium">{dialog.amount} ZMW added to your wallet.</p>
              <Button className="w-full" onClick={closeDialog}>Done</Button>
            </div>
          )}
          {dialog?.kind === "failed" && (
            <div className="space-y-4 text-center py-4">
              <XCircle className="w-14 h-14 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">{dialog.reason}</p>
              <Button className="w-full" onClick={closeDialog}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
