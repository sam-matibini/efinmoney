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
import { toast } from "sonner";
import { CurrencyFlag } from "@/components/ui/FlagImage";

interface EditWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: {
    walletId: string;
    currency: string;
    balance: number;
    symbol: string;
    flag?: string;
  } | null;
  onSave: (walletId: string, data: { nickname?: string }) => Promise<void>;
}

const EditWalletModal = ({ isOpen, onClose, wallet, onSave }: EditWalletModalProps) => {
  const [nickname, setNickname] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!wallet) return;
    
    setIsSaving(true);
    try {
      await onSave(wallet.walletId, { nickname: nickname || undefined });
      toast.success("Wallet updated successfully");
      onClose();
    } catch (error) {
      toast.error("Failed to update wallet");
    } finally {
      setIsSaving(false);
    }
  };

  if (!wallet) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CurrencyFlag code={wallet.currency} size="md" />
            Edit {wallet.currency} Wallet
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="nickname">Wallet Nickname (optional)</Label>
            <Input
              id="nickname"
              placeholder={`My ${wallet.currency} Wallet`}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Current Balance</Label>
            <p className="text-2xl font-bold text-foreground">
              {wallet.symbol}{wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditWalletModal;
