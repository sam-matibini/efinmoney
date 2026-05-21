import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useIssuedCardMutations, type IssuedCardPurpose } from "@/hooks/useIssuedCards";
import { Sparkles, Wifi } from "lucide-react";

interface IssueVirtualCardModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (cardId: string) => void;
}

const IssueVirtualCardModal = ({ open, onClose, onCreated }: IssueVirtualCardModalProps) => {
  const { data: wallets } = useWallets();
  const { createCard } = useIssuedCardMutations();

  const [nickname, setNickname] = useState("");
  const [purpose, setPurpose] = useState<IssuedCardPurpose>("personal");
  const [currency, setCurrency] = useState("CAD");
  const [walletId, setWalletId] = useState<string>("");
  const [monthlyLimit, setMonthlyLimit] = useState("2000");
  const [perAuthLimit, setPerAuthLimit] = useState("500");
  const [tapToPay, setTapToPay] = useState(true);

  const reset = () => {
    setNickname("");
    setPurpose("personal");
    setCurrency("CAD");
    setWalletId("");
    setMonthlyLimit("2000");
    setPerAuthLimit("500");
    setTapToPay(true);
  };

  const matchingWallets = (wallets || []).filter((w: any) => w.currency_code === currency);

  const submit = async () => {
    const res = await createCard.mutateAsync({
      nickname: nickname.trim() || undefined,
      currency,
      purpose,
      funding_wallet_id: walletId || undefined,
      tap_to_pay: tapToPay,
      controls: {
        monthly_limit: Number(monthlyLimit) || undefined,
        per_authorization_limit: Number(perAuthLimit) || undefined,
        single_use: purpose === "single_use",
      },
    });
    reset();
    onClose();
    if (res?.card?.id) onCreated?.(res.card.id);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-[460px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            Issue eFinVisa Card
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nickname (optional)</Label>
            <Input
              placeholder="e.g. Subscriptions, Travel"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={60}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Purpose</Label>
              <Select value={purpose} onValueChange={(v) => setPurpose(v as IssuedCardPurpose)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="subscription">Subscription lock</SelectItem>
                  <SelectItem value="single_use">Single-use</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Funding wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="Select a wallet" /></SelectTrigger>
              <SelectContent>
                {matchingWallets.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No {currency} wallet found</div>
                )}
                {matchingWallets.map((w: any) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Per-transaction limit ({currency})</Label>
              <Input type="number" value={perAuthLimit} onChange={(e) => setPerAuthLimit(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Monthly limit ({currency})</Label>
              <Input type="number" value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} />
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex gap-3">
              <Wifi className="w-4 h-4 mt-0.5 text-emerald-500 rotate-90" />
              <div>
                <Label htmlFor="tap-to-pay" className="text-sm">Tap to pay</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add this card to Apple Pay or Google Pay for in-store contactless payments.
                </p>
              </div>
            </div>
            <Switch id="tap-to-pay" checked={tapToPay} onCheckedChange={setTapToPay} />
          </div>

          <p className="text-xs text-muted-foreground">
            eFinVisa cards work instantly online. Funded from your {currency} wallet — every authorization checks your balance in real time.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={createCard.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {createCard.isPending ? "Creating…" : "Create eFinVisa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IssueVirtualCardModal;
