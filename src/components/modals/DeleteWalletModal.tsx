import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { CurrencyFlag } from "@/components/ui/FlagImage";

interface DeleteWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: {
    walletId: string;
    currency: string;
    balance: number;
    symbol: string;
    flag?: string;
  } | null;
  onDelete: (walletId: string) => Promise<void>;
}

const DeleteWalletModal = ({ isOpen, onClose, wallet, onDelete }: DeleteWalletModalProps) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!wallet) return;

    if (wallet.balance > 0) {
      toast.error("Cannot delete wallet with remaining balance. Please transfer funds first.");
      return;
    }
    
    setIsDeleting(true);
    try {
      await onDelete(wallet.walletId);
      toast.success("Wallet deleted successfully");
      onClose();
    } catch (error) {
      toast.error("Failed to delete wallet");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!wallet) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CurrencyFlag code={wallet.currency} size="md" />
            Delete {wallet.currency} Wallet?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {wallet.balance > 0 ? (
              <span className="text-destructive">
                This wallet still has a balance of {wallet.symbol}{wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}. 
                Please transfer all funds before deleting.
              </span>
            ) : (
              "This action cannot be undone. This will permanently delete your wallet and remove all transaction history associated with it."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting || wallet.balance > 0}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : "Delete Wallet"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteWalletModal;
