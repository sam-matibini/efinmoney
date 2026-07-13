import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallets } from "@/hooks/useWallets";
import { validateMinAmount, friendlyFlwError, minAmount } from "@/lib/flutterwave";
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
  const { user } = useAuth();
  const { data: wallets } = useWallets();

  const wallet = wallets?.find((w) => w.wallet_id === defaultWalletId);
  const currency = wallet?.currency_code || "USD";
  const isFlutterwave = FLUTTERWAVE_CURRENCIES.includes(currency);

  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleProceed = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    const minErr = validateMinAmount(currency, amt);
    if (minErr) { toast.error(minErr); return; }
    if (!defaultWalletId) { toast.error("No wallet selected"); return; }
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/wallet/topup`;
      const txRef = `topup-${user?.id || "anon"}-${defaultWalletId.slice(0, 8)}-${Date.now()}`;
      const { data, error } = await supabase.functions.invoke("flw-initialize-payment", {
        body: {
          amount: amt,
          currency,
          paymentMethod: "card",
          redirectUrl,
          tx_ref: txRef,
          type: "wallet_topup",
          walletId: defaultWalletId,
        },
      });
      if (error) throw error;
      const link = (data as { payment_link?: string; error?: string })?.payment_link;
      if ((data as { error?: string })?.error || !link) throw new Error((data as { error?: string })?.error || "No payment link");
      window.location.href = link;
    } catch (e) {
      toast.error(friendlyFlwError(e, currency));
      setLoading(false);
    }
  };

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
          {isFlutterwave ? (
            <div className="space-y-4 pt-2">
              <div>
                <Label>Amount ({currency})</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-12 text-lg"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">Minimum: {minAmount(currency)} {currency}</p>
              </div>
              <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
                <p className="text-xs text-foreground">
                  You will be redirected to Flutterwave's secure checkout to complete your payment via Card, Bank Transfer, Mobile Money, or USSD.
                </p>
              </div>
              <Button className="w-full" size="lg" onClick={handleProceed} disabled={loading}>
                {loading ? <><LoadingSpinner size={16} className="mr-2" /> Redirecting…</> : "Proceed to Payment"}
              </Button>
            </div>
          ) : isLiveTopupCurrency(currency) ? (
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
          ) : (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Top-up for {currency} is not available in this modal. Open the top-up page for supported currencies.
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TopUpModal;
