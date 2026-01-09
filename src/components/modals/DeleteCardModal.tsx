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

interface CardData {
  id: string;
  type: string;
  last_four: string;
  brand: string;
  status: string;
  currency: string;
  balance: number;
  expires: string;
}

interface DeleteCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: CardData | null;
  onDelete: (cardId: string) => void;
}

const DeleteCardModal = ({ isOpen, onClose, card, onDelete }: DeleteCardModalProps) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!card) return;

    if (card.balance > 0) {
      toast.error("Cannot delete card with remaining balance. Please transfer funds first.");
      return;
    }
    
    setIsDeleting(true);
    try {
      onDelete(card.id);
      toast.success("Card deleted successfully");
      onClose();
    } catch (error) {
      toast.error("Failed to delete card");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!card) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {card.brand} Card •••• {card.last_four}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {card.balance > 0 ? (
              <span className="text-destructive">
                This card still has a balance of ${card.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}. 
                Please transfer all funds before deleting.
              </span>
            ) : (
              "This action cannot be undone. This will permanently cancel your card and remove all transaction history associated with it."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting || card.balance > 0}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : "Delete Card"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteCardModal;
