import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallets } from "@/hooks/useWallets";
import { useFxRates, useFxRatesLastUpdated } from "@/hooks/useFxRates";
import { useStellarWallet } from "@/hooks/useStellarWallet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { RefreshCw, ArrowUpDown, TrendingUp, CheckCircle, Bitcoin, DollarSign, ExternalLink, Sparkles } from "lucide-react";
import { CryptoTradingPanel } from "@/components/crypto/CryptoTradingPanel";
import { flagForCurrency } from "@/lib/flags";
import { resolveEffectiveRate } from "@/lib/fx";
import { getNombaExchangeRate, isNgnPair } from "@/lib/nombaNigeria";
import { CurrencyFlag } from "@/components/ui/FlagImage";
import FeatureGate from "@/components/common/FeatureGate";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import { productFeatures } from "@/lib/productFeatures";

// Synthetic wallet id used to represent the on-chain USDC option.
const STELLAR_USDC_ID = "stellar-usdc";
const FEE_RATE = 0.005;

const parseAmt = (v: string) => {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const FxTradingPanel = () => {
  const [sendAmount, setSendAmount] = useState("");
  const [recvAmount, setRecvAmount] = useState("");
  const [lastEdited, setLastEdited] = useState<"send" | "receive">("send");
  const [fromWalletId, setFromWalletId] = useState("");
  const [toWalletId, setToWalletId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [swapRotation, setSwapRotation] = useState(0);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  const { data: wallets } = useWallets();
  const { data: fxRates } = useFxRates();
  const stellar = useStellarWallet();
  const queryClient = useQueryClient();

  const fiatWallets = wallets?.filter(w => !['BTC', 'USDT', 'USDC'].includes(w.currency_code)) ?? [];

  // Stellar USDC appears as a virtual destination wallet driven by the live
  // on-chain balance from useStellarWallet.
  const stellarUsdcOption = stellar.publicKey
    ? {
        wallet_id: STELLAR_USDC_ID,
        currency_code: "USDC",
        symbol: "$",
        flag_emoji: "⭐",
        balance: Number(stellar.usdcBalance ?? 0),
        isStellar: true as const,
      }
    : null;

  const destinationOptions = [
    ...fiatWallets.map(w => ({ ...w, isStellar: false as const })),
    ...(stellarUsdcOption ? [stellarUsdcOption] : []),
  ];

  const fromWallet = fiatWallets.find(w => w.wallet_id === fromWalletId) ?? fiatWallets[0];
  const toWallet = destinationOptions.find(w => w.wallet_id === toWalletId) ?? destinationOptions[1];
  const isCryptoSwap = toWallet && "isStellar" in toWallet && toWallet.isStellar;

  const fromCode = fromWallet?.currency_code ?? "";
  const toCode = toWallet?.currency_code ?? "";
  const { data: nombaQuote } = useQuery({
    queryKey: ["exchange-page-nomba", fromCode, toCode],
    queryFn: () => getNombaExchangeRate(fromCode, toCode),
    enabled: !!fromCode && !!toCode && fromCode !== toCode && !isCryptoSwap && isNgnPair(fromCode, toCode),
    staleTime: 60_000,
  });

  const effectiveRate = useMemo(() => {
    if (!fromCode || !toCode) return null;
    if (isCryptoSwap) {
      if (fromCode === "USD") return 1;
      return resolveEffectiveRate(fromCode, "USD", fxRates ?? []);
    }
    if (nombaQuote?.effective_rate && nombaQuote.effective_rate > 0) {
      return nombaQuote.effective_rate;
    }
    return resolveEffectiveRate(fromCode, toCode, fxRates ?? []);
  }, [fromCode, toCode, isCryptoSwap, fxRates, nombaQuote?.effective_rate]);
  const rateFromNomba = !!nombaQuote?.effective_rate;
  const recvDecimals = isCryptoSwap ? 4 : 2;

  const quoteReceive = useCallback(
    (send: number) => {
      if (!effectiveRate || send <= 0) return 0;
      return (send - send * FEE_RATE) * effectiveRate;
    },
    [effectiveRate],
  );

  const quoteSend = useCallback(
    (recv: number) => {
      if (!effectiveRate || recv <= 0) return 0;
      return recv / effectiveRate / (1 - FEE_RATE);
    },
    [effectiveRate],
  );

  const fmtRecv = (n: number) => n.toFixed(recvDecimals);
  const fmtSend = (n: number) => n.toFixed(2);

  const syncFromSend = useCallback(
    (raw: string) => {
      const s = parseAmt(raw);
      setRecvAmount(s > 0 ? fmtRecv(quoteReceive(s)) : "");
    },
    [quoteReceive, recvDecimals],
  );

  const syncFromRecv = useCallback(
    (raw: string) => {
      const r = parseAmt(raw);
      setSendAmount(r > 0 ? fmtSend(quoteSend(r)) : "");
    },
    [quoteSend],
  );

  useEffect(() => {
    if (!effectiveRate) return;
    if (lastEdited === "send") syncFromSend(sendAmount);
    else syncFromRecv(recvAmount);
  }, [effectiveRate, fromWallet?.currency_code, toWallet?.currency_code]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedSend = parseAmt(sendAmount);
  const parsedRecv = parseAmt(recvAmount);
  const fee = parsedSend > 0 ? parsedSend * FEE_RATE : 0;
  const receivedAmount = parsedSend > 0 ? quoteReceive(parsedSend) : parsedRecv;

  const onSendChange = (v: string) => {
    const clean = v.replace(/[^0-9.,]/g, "");
    setSendAmount(clean);
    setLastEdited("send");
    syncFromSend(clean);
  };

  const onRecvChange = (v: string) => {
    const clean = v.replace(/[^0-9.,]/g, "");
    setRecvAmount(clean);
    setLastEdited("receive");
    syncFromRecv(clean);
  };

  const handleSwap = () => {
    if (toWallet && "isStellar" in toWallet && toWallet.isStellar) return;
    const temp = fromWalletId;
    setFromWalletId(toWalletId);
    setToWalletId(temp);
    setSwapRotation((r) => r + 180);
    const tempSend = sendAmount;
    setSendAmount(recvAmount);
    setRecvAmount(tempSend);
    setLastEdited(lastEdited === "send" ? "receive" : "send");
  };

  const handleExchange = async () => {
    if (!fromWallet || !toWallet) return;
    if (!effectiveRate) {
      toast.error(`No exchange rate available for ${fromWallet.currency_code} → ${toWallet.currency_code}`);
      return;
    }

    setIsLoading(true);
    setLastTxHash(null);

    try {
      const response = isCryptoSwap
        ? await supabase.functions.invoke('execute-crypto-swap', {
            body: {
              from_wallet_id: fromWallet.wallet_id,
              from_amount: parsedSend,
              to_currency: 'USDC',
            },
          })
        : await supabase.functions.invoke('fx-engine', {
            body: {
              action: 'execute',
              from_wallet_id: fromWallet.wallet_id,
              to_wallet_id: toWallet.wallet_id,
              from_currency: fromWallet.currency_code,
              to_currency: toWallet.currency_code,
              from_amount: parsedSend,
            },
          });

      const serverError = (response.data as any)?.error;
      if (response.error || serverError) {
        const msg = serverError || response.error?.message || 'Exchange failed';
        throw new Error(msg);
      }

      const txHash = (response.data as any)?.stellar_tx_hash ?? null;
      setLastTxHash(txHash);
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['fx_rates'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-fx'] });
      queryClient.invalidateQueries({ queryKey: ['stellar-balance', stellar.publicKey] });
      stellar.refetchBalance?.();
      toast.success(isCryptoSwap ? 'USDC delivered to your Stellar wallet!' : 'Exchange completed successfully!');

      successTimer.current = setTimeout(() => {
        setSuccess(false);
        setSendAmount("");
        setRecvAmount("");
      }, 4000);
    } catch (error: any) {
      console.error('Exchange error:', error);
      toast.error(error?.message || 'Exchange failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = parsedSend > 0 &&
    fromWallet &&
    toWallet &&
    fromWallet.wallet_id !== toWallet.wallet_id &&
    !!effectiveRate &&
    parsedSend <= Number(fromWallet.balance);

  const rateLabel = useMemo(() => {
    if (!fromWallet || !toWallet || !effectiveRate) return null;
    return `1 ${fromWallet.currency_code} = ${effectiveRate.toFixed(4)} ${toWallet.currency_code}`;
  }, [fromWallet, toWallet, effectiveRate]);

  if (success) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-20 h-20 mx-auto mb-6 rounded-full bg-indigo-500/20 flex items-center justify-center"
          >
            <CheckCircle className="w-10 h-10 text-primary" />
          </motion.div>
          <h3 className="text-2xl font-display font-bold mb-2">Exchange Complete!</h3>
          <p className="text-muted-foreground">
            Converted {fromWallet?.symbol}{sendAmount} to {toWallet?.symbol}{receivedAmount.toFixed(recvDecimals)} {toWallet?.currency_code}
          </p>
          {lastTxHash && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${lastTxHash}`}
              target="_blank" rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              View on StellarExpert <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/25 via-[hsl(var(--accent-amber)/0.12)] to-primary/5 opacity-80" />
        <Card className="relative overflow-hidden border-border/60 shadow-lg">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/[0.06] to-transparent" />
          <CardHeader className="relative pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Live exchange
              </CardTitle>
              {rateLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {rateLabel}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="relative space-y-5 pt-2">
            <div className="space-y-2.5 rounded-xl bg-muted/40 p-4 ring-1 ring-border/60">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">You pay</Label>
            <Select value={fromWalletId || fromWallet?.wallet_id || ""} onValueChange={setFromWalletId}>
                <SelectTrigger className="h-11 border-border/60 bg-background/80">
                <SelectValue placeholder="Select wallet" />
              </SelectTrigger>
              <SelectContent>
                {fiatWallets?.filter(w => w.wallet_id !== toWalletId).map((w) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      <span className="inline-flex items-center gap-2">
                        <CurrencyFlag code={w.currency_code} size="sm" />
                        {w.currency_code} · {w.symbol}{Number(w.balance).toFixed(2)}
                      </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">
                  {fromWallet?.symbol || "$"}
              </span>
              <Input
                  type="text"
                  inputMode="decimal"
                placeholder="0.00"
                  value={sendAmount}
                  onChange={(e) => onSendChange(e.target.value)}
                  className="h-14 border-border/60 bg-background pl-10 font-display text-2xl font-bold tabular-nums focus-visible:ring-primary/30"
              />
            </div>
              <p className="text-xs text-muted-foreground">
              Available: {fromWallet?.symbol}{Number(fromWallet?.balance || 0).toFixed(2)}
            </p>
          </div>

            <div className="-my-1 flex justify-center">
            <motion.button
              type="button"
              onClick={handleSwap}
              animate={{ rotate: swapRotation }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              whileTap={{ scale: 0.9 }}
                className="z-10 flex h-11 w-11 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary shadow-sm hover:bg-primary/15"
              aria-label="Swap currencies"
            >
                <ArrowUpDown className="h-4 w-4" />
            </motion.button>
          </div>

            <div className="space-y-2.5 rounded-xl bg-gradient-to-br from-primary/[0.07] to-muted/30 p-4 ring-1 ring-primary/15">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">You receive</Label>
            <Select value={toWalletId || toWallet?.wallet_id || ""} onValueChange={setToWalletId}>
                <SelectTrigger className="h-11 border-border/60 bg-background/80">
                <SelectValue placeholder="Select wallet" />
              </SelectTrigger>
              <SelectContent>
                {destinationOptions.filter(w => w.wallet_id !== fromWalletId).map((w) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      <span className="inline-flex items-center gap-2">
                        {w.isStellar ? (
                          <span className="text-base">{w.flag_emoji}</span>
                        ) : (
                          <CurrencyFlag code={w.currency_code} size="sm" />
                        )}
                      {w.currency_code}
                        {w.isStellar ? " (Stellar)" : ""} · {w.symbol}{Number(w.balance).toFixed(w.isStellar ? 4 : 2)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">
                  {toWallet?.symbol || "$"}
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={recvAmount}
                  onChange={(e) => onRecvChange(e.target.value)}
                  className="h-14 border-border/60 bg-background/90 pl-10 font-display text-2xl font-bold tabular-nums focus-visible:ring-primary/30"
                />
              </div>
              {isCryptoSwap && (
                <p className="text-xs text-muted-foreground">Delivered on-chain to your Stellar wallet</p>
              )}
          </div>

            {parsedSend > 0 && (
              <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
              <div className="flex justify-between">
                  <span className="text-muted-foreground">Exchange rate</span>
                  <span className="font-medium tabular-nums flex items-center gap-2">
                  {effectiveRate
                    ? (
                      <>
                        {`1 ${fromWallet?.currency_code} = ${effectiveRate.toFixed(4)} ${toWallet?.currency_code}`}
                        {rateFromNomba && (
                          <span className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">Live</span>
                        )}
                      </>
                    )
                    : <span className="text-destructive">Rate unavailable</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee (0.5%)</span>
                  <span className="tabular-nums">{fromWallet?.symbol}{fee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2 font-semibold">
                  <span>You receive</span>
                  <span className="text-primary tabular-nums">{toWallet?.symbol}{fmtRecv(receivedAmount)}</span>
              </div>
            </div>
          )}

          <Button 
              className="h-12 w-full text-base font-semibold shadow-[0_4px_20px_hsl(var(--primary)/0.25)]"
            size="lg" 
            onClick={handleExchange}
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <>
                  <RefreshCw className="mr-2 h-5 w-5" />
                Exchange Now
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      </div>

      <LiveFxRatesCard />
    </div>
  );
};

const formatRelative = (iso: string | null) => {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const LiveFxRatesCard = () => {
  const { data: fxRates } = useFxRates();
  const { data: lastUpdated } = useFxRatesLastUpdated();
  const { data: nombaUsdNgn } = useQuery({
    queryKey: ["exchange-live-nomba-usd-ngn"],
    queryFn: () => getNombaExchangeRate("USD", "NGN"),
    staleTime: 60_000,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Live FX Rates
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Updated {formatRelative(lastUpdated ?? null)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {nombaUsdNgn?.effective_rate ? (
            <div className="flex justify-between items-center text-sm">
              <span>{flagForCurrency("USD")} USD → {flagForCurrency("NGN")} NGN</span>
              <span className="font-mono flex items-center gap-2">
                {Number(nombaUsdNgn.effective_rate).toFixed(4)}
                <span className="text-[10px] uppercase text-emerald-600 font-semibold">Live</span>
              </span>
            </div>
          ) : null}
          {fxRates?.slice(0, 4).map((rate) => (
              <div key={rate.id} className="flex justify-between items-center text-sm">
                <span>{flagForCurrency(rate.from_currency)} {rate.from_currency} → {flagForCurrency(rate.to_currency)} {rate.to_currency}</span>
                <span className="font-mono">{Number(rate.effective_rate).toFixed(4)}</span>
              </div>
            ))}
            {(!fxRates || fxRates.length === 0) && (
              <p className="text-muted-foreground text-sm">No rates available</p>
            )}
          </div>
        </CardContent>
      </Card>
  );
};

const ExchangePage = () => {
  return (
    <AppPage width="default">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="text-center">
            <h1 className="text-2xl font-display font-bold text-foreground">Exchange</h1>
            <p className="text-muted-foreground">
              {productFeatures.crypto ? "Trade currencies and crypto instantly" : "Convert between the currencies you hold at live rates"}
            </p>
          </div>

          <PageHeroBanner
            icon={ArrowUpDown}
            label="Instant conversion"
            value="Live FX rates"
            meta={[
              { icon: TrendingUp, text: "0.5% spread on wallet swaps" },
              { icon: Sparkles, text: productFeatures.crypto ? "Fiat & on-chain USDC" : "Live rates for NGN pairs" },
            ]}
            variant="cta"
          />

          <Tabs defaultValue="fx" className="space-y-6">
            <TabsList className={productFeatures.crypto ? "grid w-full grid-cols-2" : "grid w-full grid-cols-1"}>
              <TabsTrigger value="fx" className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Currency
              </TabsTrigger>
              {productFeatures.crypto && (
              <TabsTrigger value="crypto" className="flex items-center gap-2">
                <Bitcoin className="w-4 h-4" />
                Crypto
              </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="fx">
              <FxTradingPanel />
            </TabsContent>

            {productFeatures.crypto && (
            <TabsContent value="crypto">
              <FeatureGate feature="crypto">
                <CryptoTradingPanel />
              </FeatureGate>
            </TabsContent>
            )}
          </Tabs>
        </motion.div>
    </AppPage>
  );
};

export default ExchangePage;
