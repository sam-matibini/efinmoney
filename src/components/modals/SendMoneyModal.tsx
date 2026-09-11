import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import LiveFxCalculator from "@/components/fx/LiveFxCalculator";
import TopUpModal from "@/components/modals/TopUpModal";
import {
  buildUsdMap,
  midRateFromUsdMap,
  parseAmount,
  type MarketResponse,
} from "@/components/fx/liveFxUtils";
import { resolveEffectiveRate } from "@/lib/fx";
import { supabase } from "@/integrations/supabase/client";
import { useWallets } from "@/hooks/useWallets";
import { useFxRates } from "@/hooks/useFxRates";
import { findCountryByCode, COUNTRIES } from "@/lib/countries";
import { invertSendAmount, quoteTransfer } from "@/lib/pricing/costRecoveryEngine";
import { saveSendHandoff } from "@/lib/sendHandoff";
import { productFeatures } from "@/lib/productFeatures";
import { toast } from "sonner";

const PAYOUT_CODES = COUNTRIES.map((c) => c.code);
const AFRICAN_PAYOUT = new Set(["NGN", "KES", "GHS", "ZMW", "UGX", "TZS", "RWF", "XOF", "XAF"]);

interface SendMoneyModalProps {
  children: React.ReactNode;
}

const SendMoneyModal = ({ children }: SendMoneyModalProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [from, setFrom] = useState<string>("USD");
  const [to, setTo] = useState<string>("NGN");
  const [amount, setAmount] = useState("100");
  const [showTopUp, setShowTopUp] = useState(false);

  const { data: wallets } = useWallets();
  const { data: fxRates } = useFxRates();

  const { data: marketData } = useQuery({
    queryKey: ["market-rates-fx-calc"],
    queryFn: async (): Promise<MarketResponse> => {
      const { data, error } = await supabase.functions.invoke("market-rates");
      if (error) throw error;
      return data as MarketResponse;
    },
    staleTime: 30_000,
  });

  const dbRate = useMemo(() => {
    if (!fxRates?.length) return null;
    return resolveEffectiveRate(from, to, fxRates);
  }, [fxRates, from, to]);

  const marketRate = useMemo(() => {
    const map = buildUsdMap(marketData?.fiat ?? [], "price");
    return midRateFromUsdMap(from, to, map);
  }, [marketData, from, to]);

  const effectiveRate = dbRate ?? marketRate;
  const rateReady = effectiveRate != null && effectiveRate > 0;

  const african = AFRICAN_PAYOUT;
  const engineQuote = useMemo(
    () =>
      quoteTransfer({
        sourceCurrency: from,
        destinationCurrency: to,
        amount: parseAmount(amount),
        channel: from === to ? "wallet" : "external",
        payoutMethod: from === to ? "WALLET_TO_WALLET" : african.has(to) ? "MOBILE_MONEY" : "BANK",
        midMarketRate: effectiveRate,
      }),
    [from, to, amount, effectiveRate],
  );

  const quoteRecipient = useCallback(
    (send: number) => {
      if (!rateReady || !effectiveRate) return 0;
      return (
        quoteTransfer({
          sourceCurrency: from,
          destinationCurrency: to,
          amount: send,
          channel: from === to ? "wallet" : "external",
          payoutMethod: from === to ? "WALLET_TO_WALLET" : african.has(to) ? "MOBILE_MONEY" : "BANK",
          midMarketRate: effectiveRate,
        }).youReceive ?? 0
      );
    },
    [rateReady, effectiveRate, from, to],
  );

  const quoteSend = useCallback(
    (recv: number) => {
      if (!rateReady || !effectiveRate) return 0;
      return invertSendAmount(recv, {
        sourceCurrency: from,
        destinationCurrency: to,
        channel: from === to ? "wallet" : "external",
        payoutMethod: from === to ? "WALLET_TO_WALLET" : AFRICAN_PAYOUT.has(to) ? "MOBILE_MONEY" : "BANK",
        midMarketRate: effectiveRate,
      });
    },
    [rateReady, effectiveRate, from, to],
  );

  const displayRate = engineQuote.customerRate ?? effectiveRate;
  const feeLabel = engineQuote.pricingMissing
    ? "Live rate card"
    : `${from} ${engineQuote.transferFee.toFixed(2)} transfer fee`;

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

  const parsedAmount = parseAmount(amount);
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
    recvAmount,
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

    saveSendHandoff({
      amount: sendAmount,
      from: f,
      to: t,
      recvAmount,
      sourceWalletId: wallet.wallet_id,
      fundingSource: "wallet",
    });

    const params = new URLSearchParams({
      quick: "1",
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
          quoteRecipient={rateReady ? quoteRecipient : undefined}
          quoteSend={rateReady ? quoteSend : undefined}
          displayRate={rateReady ? displayRate : undefined}
          feeLabel={feeLabel}
          fromCurrencyFilter={walletCodes.length ? walletCodes : undefined}
          toCurrencyFilter={PAYOUT_CODES}
          walletBalance={selectedWallet ? Number(selectedWallet.balance) : null}
          walletSymbol={selectedWallet?.symbol}
          showActions
          showDisclaimer={false}
          continueLabel="Add recipient →"
          onContinue={handleContinue}
          continueDisabled={!isValid}
          footer={
            <>
              {insufficientBalance && (
                <div className="mt-2 flex items-center justify-center gap-2">
                  <p className="text-[10px] font-medium text-amber-300/90">
                    Balance too low for this amount
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowTopUp(true)}
                    className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300 transition-colors hover:bg-amber-400/30"
                  >
                    Top Up Now
                  </button>
                </div>
              )}
              {productFeatures.canadaDomestic && (
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
              )}
            </>
          }
        />
      </DialogContent>
      <TopUpModal
        open={showTopUp}
        onOpenChange={setShowTopUp}
        defaultWalletId={selectedWallet?.wallet_id}
        title={`Top up ${selectedWallet?.currency_code ?? ""} wallet`}
      />
    </Dialog>
  );
};

export default SendMoneyModal;
