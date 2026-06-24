import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, ExternalLink, Link2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import CardPaymentForm from "@/components/modals/CardPaymentForm";
import CreatePaymentLinkModal from "@/components/payment-links/CreatePaymentLinkModal";
import ReceiveMoneyModal from "@/components/modals/ReceiveMoneyModal";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { friendlyFlwError, minAmount, validateMinAmount } from "@/lib/flutterwave";
import { routeWalletTopupGateway } from "@/lib/walletTopupGateway";
import LoadingSpinner from "@/components/LoadingSpinner";
import { cn } from "@/lib/utils";

interface WalletFundingPanelProps {
  walletId: string;
  currency: string;
  symbol?: string;
  flag?: string;
  balance?: number;
  defaultAmount?: number;
  onFunded?: () => void;
  returnPath?: string;
  className?: string;
}

const WalletFundingPanel = ({
  walletId,
  currency,
  symbol = "",
  flag = "",
  balance,
  defaultAmount,
  onFunded,
  returnPath = "/cards",
  className,
}: WalletFundingPanelProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const gateway = routeWalletTopupGateway(currency);

  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [hostedLoading, setHostedLoading] = useState(false);
  const [paymentLinkOpen, setPaymentLinkOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const parsedAmount = Number(amount);
  const invalidateWallets = () => {
    qc.invalidateQueries({ queryKey: ["wallets", user?.id] });
    onFunded?.();
  };

  const handleFlutterwaveLink = async () => {
    const amt = parsedAmount;
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const minErr = validateMinAmount(currency, amt);
    if (minErr) {
      toast.error(minErr);
      return;
    }
    setHostedLoading(true);
    try {
      const redirectUrl = `${window.location.origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}walletId=${walletId}&topup=1`;
      const txRef = `topup-${user?.id || "anon"}-${walletId.slice(0, 8)}-${Date.now()}`;
      const { data, error } = await supabase.functions.invoke("flw-initialize-payment", {
        body: {
          amount: amt,
          currency,
          paymentMethod: "card",
          redirectUrl,
          tx_ref: txRef,
          type: "wallet_topup",
          walletId,
        },
      });
      if (error) throw error;
      const link = (data as { payment_link?: string; error?: string })?.payment_link;
      if ((data as { error?: string })?.error || !link) {
        throw new Error((data as { error?: string })?.error || "No payment link returned");
      }
      window.location.href = link;
    } catch (e) {
      toast.error(friendlyFlwError(e, currency));
      setHostedLoading(false);
    }
  };

  const handleStripeCheckoutLink = async () => {
    const amt = parsedAmount;
    if (!Number.isFinite(amt) || amt < 5) {
      toast.error(`Minimum 5 ${currency}`);
      return;
    }
    setHostedLoading(true);
    try {
      const data = await invokeEdgeFunction<{ url?: string }>("stripe-create-checkout-session", {
        wallet_id: walletId,
        amount: amt,
        currency,
        success_url: `${window.location.origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}walletId=${walletId}&topup=success`,
        cancel_url: `${window.location.origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}walletId=${walletId}&topup=cancelled`,
      });
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setHostedLoading(false);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {balance !== undefined && (
        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Wallet balance: </span>
          <span className="font-medium tabular-nums">
            {flag} {symbol}{Number(balance).toFixed(2)} {currency}
          </span>
        </div>
      )}

      {gateway === "unsupported" ? (
        <p className="text-sm text-muted-foreground">
          Top-up for {currency} is not available here yet. Contact support or use another wallet.
        </p>
      ) : (
        <>
          {gateway === "stripe" && (
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="w-4 h-4 text-primary" />
                Pay with debit or credit card
              </div>
              <CardPaymentForm
                defaultWalletId={walletId}
                defaultAmount={parsedAmount > 0 ? parsedAmount : undefined}
                showWalletSelect={false}
                ctaLabel="Top up wallet"
                onSuccess={() => {
                  invalidateWallets();
                  toast.success("Wallet topped up");
                }}
              />
            </div>
          )}

          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="w-4 h-4 text-primary" />
              Pay via secure payment link
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {gateway === "flutterwave"
                ? "Opens Flutterwave checkout — card, bank transfer, mobile money, or USSD."
                : "Opens Stripe Checkout — Apple Pay, Google Pay, Link, cards, and local methods."}
            </p>
            <div className="space-y-2">
              <Label>Amount ({currency})</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={gateway === "stripe" ? 5 : minAmount(currency)}
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {gateway === "flutterwave" && (
                <p className="text-xs text-muted-foreground">Minimum: {minAmount(currency)} {currency}</p>
              )}
              {gateway === "stripe" && (
                <p className="text-xs text-muted-foreground">Minimum: 5 {currency}</p>
              )}
            </div>
            <Button
              className="w-full"
              onClick={gateway === "flutterwave" ? handleFlutterwaveLink : handleStripeCheckoutLink}
              disabled={hostedLoading}
            >
              {hostedLoading ? (
                <>
                  <LoadingSpinner size={16} className="mr-2" />
                  Redirecting…
                </>
              ) : (
                <>Continue to payment link</>
              )}
            </Button>
          </div>
        </>
      )}

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <QrCode className="w-4 h-4 text-primary" />
          Receive from someone on eFin
        </div>
        <p className="text-xs text-muted-foreground">
          Share your account number, eFin tag, or QR so others can send money to this wallet.
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={() => setReceiveOpen(true)}>
          Show receive details
        </Button>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="w-4 h-4 text-primary" />
          eFin payment link
        </div>
        <p className="text-xs text-muted-foreground">
          Create a shareable claim link to send held funds to anyone (Interac, EFT, or debit card for CAD).
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={() => setPaymentLinkOpen(true)}>
          Create payment link
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        className="w-full text-muted-foreground"
        onClick={() => navigate(`/wallet/topup?walletId=${walletId}`)}
      >
        <ExternalLink className="w-4 h-4 mr-2" />
        All top-up options
      </Button>

      <CreatePaymentLinkModal
        open={paymentLinkOpen}
        onOpenChange={setPaymentLinkOpen}
        defaultWalletId={walletId}
        defaultAmount={parsedAmount > 0 ? parsedAmount : undefined}
      />

      <ReceiveMoneyModal
        isOpen={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        wallet={{
          walletId,
          currency,
          balance: balance ?? 0,
          symbol,
          flag,
        }}
      />
    </div>
  );
};

export default WalletFundingPanel;
