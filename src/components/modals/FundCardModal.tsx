import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ArrowRightLeft, Wallet, CreditCard } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallets } from "@/hooks/useWallets";
import { useCardMutations, type Card } from "@/hooks/useCards";
import { useAuth } from "@/hooks/useAuth";
import WalletFundingPanel from "@/components/wallets/WalletFundingPanel";
import { CurrencyFlag } from "@/components/ui/FlagImage";


interface FundCardModalProps {
  open: boolean;
  onClose: () => void;
  card: Card | null;
}

const FundCardModal = ({ open, onClose, card }: FundCardModalProps) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: wallets } = useWallets();
  const { fundCard } = useCardMutations();
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState("wallet");

  const currency = card?.currency_code || wallets?.find((w) => w.wallet_id === walletId)?.currency_code || "USD";
  const matchingWallets = useMemo(
    () => (wallets || []).filter((w) => !card?.currency_code || w.currency_code === card.currency_code),
    [wallets, card?.currency_code],
  );

  useEffect(() => {
    if (!open) {
      setAmount("");
      setTab("wallet");
      return;
    }
    const preferred = card?.wallet_id || matchingWallets[0]?.wallet_id || "";
    setWalletId(preferred);
  }, [open, card, matchingWallets]);

  const selectedWallet = wallets?.find((w) => w.wallet_id === walletId);
  const parsedAmount = Number(amount);
  const walletBalance = Number(selectedWallet?.balance ?? 0);
  const insufficient = parsedAmount > 0 && parsedAmount > walletBalance;

  const handleFund = async () => {
    if (!card) return;
    const amt = parsedAmount;
    if (!walletId || !(amt > 0) || amt > walletBalance) return;
    await fundCard.mutateAsync({ card_id: card.id, wallet_id: walletId, amount: amt });
    qc.invalidateQueries({ queryKey: ["wallets", user?.id] });
    qc.invalidateQueries({ queryKey: ["cards", user?.id] });
    onClose();
  };

  const handleFunded = () => {
    qc.invalidateQueries({ queryKey: ["wallets", user?.id] });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fund card •••• {card?.last_four}</DialogTitle>
        </DialogHeader>

        {card && Number(card.balance) > 0 && (
          <p className="text-sm text-muted-foreground -mt-2">
            Current card balance:{" "}
            <span className="font-medium text-foreground">
              {currency} {Number(card.balance).toFixed(2)}
            </span>
          </p>
        )}

        <Tabs value={tab} onValueChange={setTab} className="pt-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wallet" className="gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              From wallet
            </TabsTrigger>
            <TabsTrigger value="topup" className="gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              Add money
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wallet" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>From wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent>
                  {matchingWallets.map((w) => (
                    <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      <span className="inline-flex items-center gap-2"><CurrencyFlag code={w.currency_code} size="sm" />{w.currency_code} — {w.symbol}{Number(w.balance).toFixed(2)}</span>
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
                  Available: {selectedWallet.symbol}{walletBalance.toFixed(2)}
                </p>
              )}
            </div>

            {insufficient && (
              <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-foreground">
                    Not enough in this wallet. Add money with card, bank, or a payment link first.
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={() => setTab("topup")}>
                    <Wallet className="w-3.5 h-3.5 mr-1.5" />
                    Add money to wallet
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleFund}
                disabled={!walletId || !parsedAmount || insufficient || fundCard.isPending}
              >
                {fundCard.isPending ? "Funding…" : "Fund card"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="topup" className="mt-4">
            {walletId && selectedWallet ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Top up your {currency} wallet, then switch back to <strong>From wallet</strong> to fund your card.
                </p>
                <WalletFundingPanel
                  walletId={walletId}
                  currency={currency}
                  symbol={selectedWallet.symbol}
                  balance={walletBalance}
                  defaultAmount={parsedAmount > 0 ? parsedAmount : undefined}
                  onFunded={handleFunded}
                  returnPath="/cards"
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No matching wallet for this card.</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default FundCardModal;
