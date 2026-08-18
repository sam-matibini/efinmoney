import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import FlutterwaveCardForm from "@/components/payments/FlutterwaveCardForm";
import { isLiveTopupCurrency } from "@/lib/productFeatures";
import { STRIPE_DISABLED_MESSAGE } from "@/lib/stripeDisabled";

const FLUTTERWAVE_CURRENCIES = ["NGN", "KES", "UGX", "ZMW", "RWF", "GHS", "TZS"];

interface Props {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  defaultWalletId?: string;
  title?: string;
}

const TopUpModal = ({ children, open: openProp, onOpenChange, defaultWalletId, title = "Top up wallet" }: Props) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const navigate = useNavigate();
  const { data: wallets } = useWallets();

  const wallet = wallets?.find((w) => w.wallet_id === defaultWalletId);
  const currency = wallet?.currency_code || "USD";
  const isFlutterwave = FLUTTERWAVE_CURRENCIES.includes(currency);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent
        className="max-w-md max-h-[85vh] flex flex-col p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> {title}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto px-6 pb-6 flex-1">
          {!isLiveTopupCurrency(currency) ? (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                {currency} top-up is coming soon. Live currencies: NGN, GHS, KES, ZMW, CAD, and USD.
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  navigate(`/wallet/topup?walletId=${defaultWalletId || ""}&currency=${currency}`);
                }}
              >
                Open top-up page
              </Button>
            </div>
          ) : isFlutterwave ? (
            <div className="pt-2">
              <FlutterwaveCardForm defaultWalletId={defaultWalletId} showWalletSelect />
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">{STRIPE_DISABLED_MESSAGE}</p>
              <Button
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  navigate(`/wallet/topup?walletId=${defaultWalletId || ""}&currency=${currency}`);
                }}
              >
                Go to top-up page
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TopUpModal;
