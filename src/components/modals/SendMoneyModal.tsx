import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import LiveFxCalculator from "@/components/fx/LiveFxCalculator";
import {
  buildUsdMap,
  midRateFromUsdMap,
  quoteTransferRecipient,
  quoteTransferSend,
  parseAmount,
  type MarketResponse,
} from "@/components/fx/liveFxUtils";
import { resolveEffectiveRate } from "@/lib/fx";
import { supabase } from "@/integrations/supabase/client";
import { useWallets } from "@/hooks/useWallets";
import { useFxRates } from "@/hooks/useFxRates";
import { usePricingConfig } from "@/hooks/usePricingConfig";
import { findCountryByCode, COUNTRIES } from "@/lib/countries";
import { saveSendHandoff } from "@/lib/sendHandoff";
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
  const { data: fxRates } = useFxRates();
  const { data: pricing } = usePricingConfig();

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

  const baseFee = pricing?.transfer_base_fee ?? 0;

  const quoteRecipient = useCallback(
    (send: number) => {
      if (!rateReady || !effectiveRate) return 0;
      return quoteTransferRecipient(send, effectiveRate, baseFee);
    },
    [rateReady, effectiveRate, baseFee],
  );

  const quoteSend = useCallback(
    (recv: number) => {
      if (!rateReady || !effectiveRate) return 0;
      return quoteTransferSend(recv, effectiveRate, baseFee);
    },
    [rateReady, effectiveRate, baseFee],
  );

  const feeLabel = baseFee > 0 ? `${from} ${baseFee.toFixed(2)} flat fee` : "No transfer fee";

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
          displayRate={rateReady ? effectiveRate : undefined}
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
