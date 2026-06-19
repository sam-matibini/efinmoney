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
import { ArrowRightLeft } from "lucide-react";
import { useCards, useCardMutations, type Card } from "@/hooks/useCards";

interface TransferCardModalProps {
  open: boolean;
  onClose: () => void;
  sourceCard: Card | null;
}

const isTransferable = (c: Card) =>
  c.funding_source !== "external" && c.status === "active";

const TransferCardModal = ({ open, onClose, sourceCard }: TransferCardModalProps) => {
  const { data: allCards } = useCards();
  const { transferBetweenCards } = useCardMutations();
  const [toCardId, setToCardId] = useState("");
  const [amount, setAmount] = useState("");

  const currency = sourceCard?.currency_code || "USD";
  const destinations = (allCards || []).filter(
    (c) => c.id !== sourceCard?.id && isTransferable(c)
      && (!sourceCard?.currency_code || c.currency_code === sourceCard.currency_code),
  );

  useEffect(() => {
    if (!open) {
      setAmount("");
      setToCardId("");
      return;
    }
    if (destinations.length && !destinations.some((d) => d.id === toCardId)) {
      setToCardId(destinations[0].id);
    }
  }, [open, destinations, toCardId]);

  const dest = destinations.find((d) => d.id === toCardId);

  const handleTransfer = async () => {
    if (!sourceCard) return;
    const amt = Number(amount);
    if (!toCardId || !(amt > 0)) return;
    await transferBetweenCards.mutateAsync({
      from_card_id: sourceCard.id,
      to_card_id: toCardId,
      amount: amt,
    });
    onClose();
  };

  if (!sourceCard) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Transfer between cards
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <p><span className="text-muted-foreground">From:</span> •••• {sourceCard.last_four}</p>
            <p><span className="text-muted-foreground">Balance:</span> {currency} {Number(sourceCard.balance || 0).toFixed(2)}</p>
          </div>

          {destinations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You need another active card in {currency} to transfer to. Create a second card first.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>To card</Label>
                <Select value={toCardId} onValueChange={setToCardId}>
                  <SelectTrigger><SelectValue placeholder="Select destination card" /></SelectTrigger>
                  <SelectContent>
                    {destinations.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        •••• {c.last_four} — {c.currency_code || currency} {Number(c.balance || 0).toFixed(2)}
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
                {dest && (
                  <p className="text-xs text-muted-foreground">
                    {dest.cardholder_name} will receive {amount || "0"} {currency}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleTransfer}
            disabled={!toCardId || !Number(amount) || transferBetweenCards.isPending || destinations.length === 0}
          >
            {transferBetweenCards.isPending ? "Transferring…" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TransferCardModal;
