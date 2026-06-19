import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useCardMutations, type Card } from "@/hooks/useCards";

interface FundCardModalProps {
  open: boolean;
  onClose: () => void;
  card: Card | null;
}

const FundCardModal = ({ open, onClose, card }: FundCardModalProps) => {
  const { data: wallets } = useWallets();
  const { fundCard } = useCardMutations();
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");

  const currency = card?.currency_code || wallets?.find((w) => w.wallet_id === walletId)?.currency_code || "USD";
  const matchingWallets = (wallets || []).filter((w) =>
    !card?.currency_code || w.currency_code === card.currency_code,
  );

  useEffect(() => {
    if (!open) {
      setAmount("");
      return;
    }
    const preferred = card?.wallet_id || matchingWallets[0]?.wallet_id || "";
    setWalletId(preferred);
  }, [open, card, matchingWallets]);

  const selectedWallet = wallets?.find((w) => w.wallet_id === walletId);

  const handleFund = async () => {
    if (!card) return;
    const amt = Number(amount);
    if (!walletId || !(amt > 0)) return;
    await fundCard.mutateAsync({ card_id: card.id, wallet_id: walletId, amount: amt });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fund card •••• {card?.last_four}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {card && Number(card.balance) > 0 && (
            <p className="text-sm text-muted-foreground">
              Current card balance: <span className="font-medium text-foreground">{currency} {Number(card.balance).toFixed(2)}</span>
            </p>
          )}
          <div className="space-y-2">
            <Label>From wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
              <SelectContent>
                {matchingWallets.map((w) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount ({currency})</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {selectedWallet && (
              <p className="text-xs text-muted-foreground">
                Available: {selectedWallet.symbol}{Number(selectedWallet.balance).toFixed(2)}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleFund}
            disabled={!walletId || !Number(amount) || fundCard.isPending}
          >
            {fundCard.isPending ? "Funding…" : "Fund card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FundCardModal;
