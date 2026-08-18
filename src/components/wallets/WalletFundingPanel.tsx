import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ExternalLink, QrCode } from "lucide-react";
import CreatePaymentLinkModal from "@/components/payment-links/CreatePaymentLinkModal";
import ReceiveMoneyModal from "@/components/modals/ReceiveMoneyModal";
import ComingSoon from "@/components/common/ComingSoon";
import { isLiveTopupCurrency, productFeatures } from "@/lib/productFeatures";
import { routeWalletTopupGateway } from "@/lib/walletTopupGateway";
import { cn } from "@/lib/utils";
import { CurrencyFlag } from "@/components/ui/FlagImage";
import { isBankVaCurrency } from "@/lib/bankVirtualAccounts";


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
  returnPath = "/wallets",
  className,
}: WalletFundingPanelProps) => {
  const navigate = useNavigate();
  const gateway = routeWalletTopupGateway(
    currency,
    undefined,
    undefined,
    productFeatures.swychr,
    false,
  );
  const liveTopup = isLiveTopupCurrency(currency);

  const [paymentLinkOpen, setPaymentLinkOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const legacyGatewayVisible =
    (gateway === "flutterwave" && productFeatures.flutterwave) ||
    (gateway === "fincra" && productFeatures.flutterwave) ||
    (gateway === "elicate" && productFeatures.flutterwave);

  return (
    <div className={cn("space-y-4", className)}>
      {balance !== undefined && (
        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Wallet balance: </span>
          <span className="inline-flex items-center gap-1.5 font-medium tabular-nums align-middle">
            <CurrencyFlag code={currency} size="xs" />{symbol}{Number(balance).toFixed(2)} {currency}
          </span>

        </div>
      )}

      {liveTopup ? (
        <div className="rounded-xl border p-4 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Top up this wallet via secure checkout on the dedicated top-up page.
          </p>
          <Button
            className="w-full"
            onClick={() => navigate(`/wallet/topup?walletId=${walletId}&currency=${currency}`)}
          >
            Go to top-up
          </Button>
        </div>
      ) : legacyGatewayVisible ? (
        <div className="rounded-xl border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Legacy card checkout is available for this currency in admin-only mode.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate(`/wallet/topup?walletId=${walletId}&currency=${currency}`)}
          >
            View top-up options
          </Button>
        </div>
      ) : (
        <ComingSoon
          title={`${currency} top-up is not available`}
          description="Coming soon. Live top-up currencies: NGN, GHS, KES, ZMW, CAD, and USD."
          backHref={returnPath}
          backLabel="Back"
          className="border-solid"
        />
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

      {isBankVaCurrency(currency) && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
          <p className="text-sm font-medium">Bank transfer ({currency})</p>
          <p className="text-xs text-muted-foreground">
            Get a permanent {currency} account number. Anyone can send from their bank app.
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={() => navigate(`/wallet/receive?currency=${currency}&walletId=${walletId}`)}
          >
            Get {currency} bank account
          </Button>
        </div>
      )}

      {productFeatures.paymentLinks ? (
        <div className="rounded-xl border p-4 space-y-3">
          <p className="text-sm font-medium">eFin payment link</p>
          <p className="text-xs text-muted-foreground">
            Create a shareable claim link to send held funds to anyone.
          </p>
          <Button type="button" variant="outline" className="w-full" onClick={() => setPaymentLinkOpen(true)}>
            Create payment link
          </Button>
        </div>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        className="w-full text-muted-foreground"
        onClick={() => navigate(`/wallet/topup?walletId=${walletId}`)}
      >
        <ExternalLink className="w-4 h-4 mr-2" />
        All top-up options
      </Button>

      {productFeatures.paymentLinks && (
        <CreatePaymentLinkModal
          open={paymentLinkOpen}
          onOpenChange={setPaymentLinkOpen}
          defaultWalletId={walletId}
          defaultAmount={defaultAmount && defaultAmount > 0 ? defaultAmount : undefined}
        />
      )}

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
