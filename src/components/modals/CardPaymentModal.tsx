import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreditCard } from "lucide-react";
import CardPaymentForm from "./CardPaymentForm";

interface Props {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  defaultWalletId?: string;
  defaultAmount?: number;
  lockAmount?: boolean;
  onSuccess?: (info: { amount: number; currency: string; walletId: string }) => void;
  title?: string;
}

const CardPaymentModal = ({
  children, open: openProp, onOpenChange, defaultWalletId, defaultAmount, lockAmount, onSuccess,
  title = "Pay by Card",
}: Props) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> {title}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto px-6 pb-6 flex-1">
          <CardPaymentForm
            defaultWalletId={defaultWalletId}
            defaultAmount={defaultAmount}
            lockAmount={lockAmount}
            onSuccess={(info) => {
              onSuccess?.(info);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CardPaymentModal;
