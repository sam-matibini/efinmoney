import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCardMutations } from "@/hooks/useCards";
import { useWallets } from "@/hooks/useWallets";

interface AddCardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AddCardModal = ({ isOpen, onClose }: AddCardModalProps) => {
  const { createCard } = useCardMutations();
  const { data: wallets } = useWallets();

  const [cardType, setCardType] = useState<"virtual" | "physical">("virtual");
  const [cardNetwork, setCardNetwork] = useState<"visa" | "mastercard">("visa");
  const [cardholderName, setCardholderName] = useState("");
  const [spendingLimit, setSpendingLimit] = useState("5000");
  const [walletId, setWalletId] = useState<string>("");

  const reset = () => {
    setCardType("virtual");
    setCardNetwork("visa");
    setCardholderName("");
    setSpendingLimit("5000");
    setWalletId("");
  };

  const handleSubmit = async () => {
    if (!cardholderName.trim()) return;
    await createCard.mutateAsync({
      card_type: cardType,
      card_network: cardNetwork,
      cardholder_name: cardholderName.trim(),
      spending_limit: Number(spendingLimit) || 5000,
      wallet_id: walletId || null,
    });
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display">Add New Card</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Cardholder Name</Label>
            <Input
              placeholder="JOHN DOE"
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Card Type</Label>
              <Select value={cardType} onValueChange={(v) => setCardType(v as "virtual" | "physical")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="virtual">Virtual</SelectItem>
                  <SelectItem value="physical">Physical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Network</Label>
              <Select value={cardNetwork} onValueChange={(v) => setCardNetwork(v as "visa" | "mastercard")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa">Visa</SelectItem>
                  <SelectItem value="mastercard">Mastercard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Linked Wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="Select a wallet" /></SelectTrigger>
              <SelectContent>
                {wallets?.map((w) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Spending Limit ($)</Label>
            <Input
              type="number"
              value={spendingLimit}
              onChange={(e) => setSpendingLimit(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!cardholderName.trim() || createCard.isPending}
          >
            {createCard.isPending ? "Creating..." : "Create Card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddCardModal;
