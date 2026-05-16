import { useState } from "react";
import { Loader2, Send, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableBalance: string;
  onSent?: () => void;
}

const STELLAR_ADDR_RE = /^G[A-Z2-7]{55}$/;

const SendStellarModal = ({ open, onOpenChange, availableBalance, onSent }: Props) => {
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setDestination("");
    setAmount("");
    setMemo("");
  };

  const validate = (): string | null => {
    if (!STELLAR_ADDR_RE.test(destination.trim())) {
      return "Destination must be a valid Stellar public address (starts with G, 56 chars).";
    }
    if (!/^\d+(\.\d{1,7})?$/.test(amount.trim())) {
      return "Enter a valid amount (max 7 decimals).";
    }
    const n = Number(amount);
    if (!(n > 0)) return "Amount must be greater than 0.";
    if (n > Number(availableBalance)) return "Amount exceeds available balance.";
    if (memo && memo.length > 28) return "Memo must be 28 characters or less.";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stellar-send-payment", {
        body: {
          destinationAddress: destination.trim(),
          amount: amount.trim(),
          memo: memo.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(
        <div className="flex flex-col gap-1">
          <span>Sent {amount} XLM successfully</span>
          <a
            href={data.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline inline-flex items-center gap-1"
          >
            View on StellarExpert <ExternalLink className="w-3 h-3" />
          </a>
        </div>,
        { duration: 8000 },
      );

      reset();
      onOpenChange(false);
      onSent?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Stellar payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Send XLM (Testnet)
          </DialogTitle>
          <DialogDescription>
            Available: {Number(availableBalance).toLocaleString("en-US", { maximumFractionDigits: 4 })} XLM
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="dest">Destination address</Label>
            <Input
              id="dest"
              placeholder="GABC...XYZ"
              value={destination}
              onChange={(e) => setDestination(e.target.value.toUpperCase())}
              maxLength={56}
              className="font-mono text-xs"
              disabled={submitting}
            />
          </div>

          <div>
            <Label htmlFor="amt">Amount (XLM)</Label>
            <Input
              id="amt"
              type="text"
              inputMode="decimal"
              placeholder="10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div>
            <Label htmlFor="memo">Memo (optional, max 28 chars)</Label>
            <Input
              id="memo"
              placeholder="Invoice #123"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={28}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send XLM
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendStellarModal;
