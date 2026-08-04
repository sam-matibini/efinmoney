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
import { createPaymentLink, PaymentLinkSuccess, type PaymentLinkResult } from "@/components/send/PaymentLinkSuccess";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CurrencyFlag } from "@/components/ui/FlagImage";

interface CreatePaymentLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  defaultWalletId?: string;
  defaultAmount?: number;
}

const CreatePaymentLinkModal = ({
  open,
  onOpenChange,
  onCreated,
  defaultWalletId,
  defaultAmount,
}: CreatePaymentLinkModalProps) => {
  const { data: wallets } = useWallets();
  const activeWallets = useMemo(
    () => (wallets || []).filter((w) => w.status === "active"),
    [wallets],
  );

  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PaymentLinkResult | null>(null);

  const selectedWallet = activeWallets.find((w) => w.wallet_id === walletId) ?? activeWallets[0];
  const parsedAmount = Number(amount);
  const currency = selectedWallet?.currency_code ?? "CAD";

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setRecipientName("");
    setRecipientEmail("");
    setNote("");
    if (defaultAmount && defaultAmount > 0) {
      setAmount(String(defaultAmount));
    } else {
      setAmount("");
    }
  }, [open, defaultAmount]);

  useEffect(() => {
    if (!activeWallets.length) return;
    if (defaultWalletId && activeWallets.some((w) => w.wallet_id === defaultWalletId)) {
      setWalletId(defaultWalletId);
      return;
    }
    if (!activeWallets.some((w) => w.wallet_id === walletId)) {
      const def = activeWallets.find((w) => w.is_default) ?? activeWallets[0];
      setWalletId(def.wallet_id);
    }
  }, [activeWallets, walletId, defaultWalletId]);

  const canSubmit =
    !!selectedWallet
    && Number.isFinite(parsedAmount)
    && parsedAmount > 0
    && parsedAmount <= Number(selectedWallet.balance);

  const handleCreate = async () => {
    if (!selectedWallet || !canSubmit) return;
    setSubmitting(true);
    try {
      const res = await createPaymentLink({
        amount: parsedAmount,
        currency: selectedWallet.currency_code,
        sender_wallet_id: selectedWallet.wallet_id,
        recipient_name: recipientName.trim() || null,
        recipient_email: recipientEmail.trim() || null,
        recipient_note: note.trim() || null,
        source: "send",
      });
      setResult(res);
      onCreated?.();
      toast.success(res.emailed ? "Payment link created and emailed" : "Payment link created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create payment link");
    } finally {
      setSubmitting(false);
    }
  };

  const amountLabel = `${selectedWallet?.symbol ?? ""}${parsedAmount.toFixed(2)} ${currency}`.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {result ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>Payment link created</DialogTitle>
              <DialogDescription>Share this link with your recipient.</DialogDescription>
            </DialogHeader>
            <PaymentLinkSuccess
              result={result}
              amountLabel={amountLabel}
              recipientName={recipientName.trim() || null}
              onDone={() => onOpenChange(false)}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New payment link</DialogTitle>
              <DialogDescription>
                Hold funds in escrow and share a link. The recipient chooses how to claim (Interac, EFT, or debit card for CAD).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Pay from</Label>
                {activeWallets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active wallets. Top up or create a wallet first.</p>
                ) : (
                  <Select value={selectedWallet?.wallet_id || ""} onValueChange={setWalletId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeWallets.map((w) => (
                        <SelectItem key={w.wallet_id} value={w.wallet_id}>
                          <span className="inline-flex items-center gap-2"><CurrencyFlag code={w.currency_code} size="sm" />{w.currency_code} — {w.symbol}
                          {Number(w.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} available
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="plink-amount">Amount ({currency})</Label>
                <Input
                  id="plink-amount"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {parsedAmount > 0 && selectedWallet && parsedAmount > Number(selectedWallet.balance) && (
                  <p className="text-xs text-destructive">Insufficient wallet balance</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="plink-name">Recipient name (optional)</Label>
                <Input
                  id="plink-name"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Who is this for?"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plink-email">Recipient email (optional)</Label>
                <Input
                  id="plink-email"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="Send them the link by email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plink-note">Note (optional)</Label>
                <Textarea
                  id="plink-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Rent for June"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!canSubmit || submitting} onClick={handleCreate}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create link"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CreatePaymentLinkModal;
