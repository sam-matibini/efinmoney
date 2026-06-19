import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import LiveFxCalculator from "@/components/fx/LiveFxCalculator";
import { useWallets } from "@/hooks/useWallets";
import { findCountryByCode, COUNTRIES } from "@/lib/countries";
import { toast } from "sonner";

const PAYOUT_CODES = COUNTRIES.map((c) => c.code);

interface SendMoneyModalProps {
  children: React.ReactNode;
}

const SendMoneyModal = ({ children }: SendMoneyModalProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [from, setFrom] = useState<string>("USD");
  const [to, setTo] = useState<string>("NGN");
  const [amount, setAmount] = useState("100");

  const { data: wallets } = useWallets();

  const walletCodes = useMemo(
    () => [...new Set((wallets ?? []).map((w) => w.currency_code))],
    [wallets],
  );

  const selectedWallet = useMemo(() => {
    const match = wallets?.find((w) => w.currency_code === from);
    return match ?? wallets?.[0];
  }, [wallets, from]);

  useEffect(() => {
    const primary = wallets?.[0]?.currency_code;
    if (primary) {
      setFrom(primary);
      if (primary === to) {
        const alt = PAYOUT_CODES.find((c) => c !== primary);
        if (alt) setTo(alt);
      }
    }
  }, [wallets]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFromChange = (code: string) => {
    setFrom(code);
    if (code === to) {
      const alt = PAYOUT_CODES.find((c) => c !== code);
      if (alt) setTo(alt);
    }
  };

  const handleToChange = (code: string) => {
    setTo(code);
  };

  const parsedAmount = parseFloat(amount.replace(/,/g, "")) || 0;
  const insufficientBalance =
    !!selectedWallet && parsedAmount > 0 && parsedAmount > Number(selectedWallet.balance);

  const reset = () => {
    setAmount("100");
    setFrom(wallets?.[0]?.currency_code ?? "USD");
    setTo("NGN");
  };

  const handleContinue = ({
    from: f,
    to: t,
    sendAmount,
  }: {
    from: string;
    to: string;
    sendAmount: number;
    recvAmount: number;
  }) => {
    const wallet = wallets?.find((w) => w.currency_code === f) ?? wallets?.[0];
    if (!wallet) {
      toast.error("No wallet found for this currency");
      return;
    }
    if (sendAmount <= 0) {
      toast.error("Enter an amount");
      return;
    }

    const country = findCountryByCode(t);
    if (!country) {
      toast.error("Destination not supported yet");
      return;
    }

    if (sendAmount > Number(wallet.balance)) {
      toast.message("Low balance — continue to top up or send from another source");
    }

    const params = new URLSearchParams({
      amount: String(sendAmount),
      fundingSource: "wallet",
      sourceWalletId: wallet.wallet_id,
      targetCountryCode: t,
      from: f,
      to: t,
    });
    setIsOpen(false);
    navigate(`/send?${params.toString()}`);
    setTimeout(reset, 200);
  };

  const isValid = parsedAmount > 0 && !!findCountryByCode(to);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="w-[calc(100%-1.5rem)] max-w-[400px] gap-0 overflow-visible border-none bg-transparent p-0 shadow-none sm:rounded-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white/70 [&>button]:opacity-100 [&>button]:ring-1 [&>button]:ring-white/20 [&>button]:hover:bg-white/10 [&>button]:hover:text-white"
      >
        <DialogTitle className="sr-only">Quick Send</DialogTitle>
        <LiveFxCalculator
          variant="app"
          embedded
          className="w-full"
          defaultFrom={wallets?.[0]?.currency_code ?? "USD"}
          defaultTo="NGN"
          defaultSendAmount="100"
          from={from}
          to={to}
          sendAmount={amount}
          onFromChange={handleFromChange}
          onToChange={handleToChange}
          onSendAmountChange={(v) => setAmount(v)}
          fromCurrencyFilter={walletCodes.length ? walletCodes : undefined}
          toCurrencyFilter={PAYOUT_CODES}
          walletBalance={selectedWallet ? Number(selectedWallet.balance) : null}
          walletSymbol={selectedWallet?.symbol}
          showActions
          showDisclaimer={false}
          continueLabel="Continue on Send Page"
          onContinue={handleContinue}
          continueDisabled={!isValid}
          footer={
            <>
              {insufficientBalance && (
                <p className="mt-2 text-center text-[10px] font-medium text-amber-300/90">
                  Balance too low for this amount — you can top up on the next screen
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate("/send?mode=canada");
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 text-[11px] text-white/55 transition-colors hover:text-white/80"
              >
                <MapPin className="h-3.5 w-3.5" />
                Sending within Canada? Use Domestic CA
              </button>
            </>
          }
        />
      </DialogContent>
    </Dialog>
  );
};

export default SendMoneyModal;
