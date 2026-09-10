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
import { executeWalletFxSwap } from "@/lib/walletTransfer";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { RefreshCw, ArrowUpDown, TrendingUp, CheckCircle, Bitcoin, DollarSign, Sparkles } from "lucide-react";
import { CryptoTradingPanel } from "@/components/crypto/CryptoTradingPanel";
import { resolveEffectiveRate } from "@/lib/fx";
import { fxQuoteLabel, type QuoteConvention } from "@/lib/fxQuote";
import { getFlovideOrNombaRate, isNgnPair } from "@/lib/flovide";
import { CurrencyFlag } from "@/components/ui/FlagImage";
import FeatureGate from "@/components/common/FeatureGate";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import { productFeatures } from "@/lib/productFeatures";

const FEE_RATE = 0.005;
const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 1_000_000;

const friendlyFxError = (raw: string | undefined | null): string => {
  const m = String(raw || "").toLowerCase();
  if (!m) return "Exchange failed. Please try again.";
  if (m.includes("rate limit")) return "Too many exchanges in a short window. Please wait a minute and try again.";
  if (m.includes("insufficient")) return "Insufficient wallet balance for this exchange.";
  if (m.includes("rate") && (m.includes("not available") || m.includes("unavailable")))
    return "No exchange rate is available for this currency pair right now.";
  if (m.includes("source wallet"))
    return "Your source wallet is unavailable. Please refresh and try again.";
  if (m.includes("destination wallet"))
    return "Your destination wallet is unavailable. Please refresh and try again.";
  if (m.includes("not set up for live exchange") || m.includes("account_id") || m.includes("null value"))
    return "This currency is not set up for live exchange yet. Please try again in a moment.";
  if (m.includes("row-level security") || m.includes("ledger_entries"))
    return "Exchange could not be posted to your wallets. Please try again in a moment.";
  if (m.includes("service temporarily unavailable") || m.includes("non-2xx") || m.includes("edge function"))
    return "Exchange is temporarily unavailable. Please try again in a moment.";
  return raw || "Exchange failed. Please try again.";
};

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
  const [quoteConvention, setQuoteConvention] = useState<QuoteConvention>("indirect");
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  const { data: wallets } = useWallets();
  const { data: fxRates } = useFxRates();
  const queryClient = useQueryClient();

  const fiatWallets = useMemo(
    () => wallets?.filter((w) => !["BTC", "ETH", "SOL", "BNB", "XRP"].includes(w.currency_code)) ?? [],
    [wallets],
  );

  useEffect(() => {
    if (fiatWallets.length === 0) return;
    setFromWalletId((id) => {
      if (id && fiatWallets.some((w) => w.wallet_id === id)) return id;
      return fiatWallets.find((w) => w.currency_code === "CAD")?.wallet_id
        ?? fiatWallets[0].wallet_id;
    });
  }, [fiatWallets]);

  useEffect(() => {
    if (fiatWallets.length < 2) return;
    const fromId = fromWalletId || fiatWallets[0]?.wallet_id;
    setToWalletId((id) => {
      if (id && id !== fromId && fiatWallets.some((w) => w.wallet_id === id)) return id;
      return fiatWallets.find((w) => w.wallet_id !== fromId && w.currency_code === "GHS")?.wallet_id
        ?? fiatWallets.find((w) => w.wallet_id !== fromId)?.wallet_id
        ?? "";
    });
  }, [fiatWallets, fromWalletId]);

  const fromWallet = fiatWallets.find(w => w.wallet_id === fromWalletId) ?? fiatWallets[0];
  const toWallet = fiatWallets.find(w => w.wallet_id === toWalletId)
    ?? fiatWallets.find(w => w.wallet_id !== fromWallet?.wallet_id)
    ?? fiatWallets[1];
  const selectedFromId = fromWallet?.wallet_id ?? "";
  const selectedToId = toWallet?.wallet_id ?? "";

  const fromCode = fromWallet?.currency_code ?? "";
  const toCode = toWallet?.currency_code ?? "";
  const { data: nombaQuote } = useQuery({
    queryKey: ["exchange-page-nomba", fromCode, toCode],
    queryFn: () => getFlovideOrNombaRate(fromCode, toCode),
    enabled: !!fromCode && !!toCode && fromCode !== toCode && isNgnPair(fromCode, toCode),
    staleTime: 60_000,
  });

  const effectiveRate = useMemo(() => {
    if (!fromCode || !toCode) return null;
    // Mid-market fx_rates first so corridors stay consistent with each other.
    const db = resolveEffectiveRate(fromCode, toCode, fxRates ?? []);
    if (db && db > 0) return db;
    if (nombaQuote?.effective_rate && nombaQuote.effective_rate > 0) {
      return nombaQuote.effective_rate;
    }
    return null;
  }, [fromCode, toCode, fxRates, nombaQuote?.effective_rate]);
  const rateFromNomba = useMemo(() => {
    if (!fromCode || !toCode) return false;
    const db = resolveEffectiveRate(fromCode, toCode, fxRates ?? []);
    return !(db && db > 0) && !!nombaQuote?.effective_rate;
  }, [fromCode, toCode, fxRates, nombaQuote?.effective_rate]);
  const recvDecimals = 2;

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
    const fromId = fromWallet?.wallet_id;
    const toId = toWallet?.wallet_id;
    if (!fromId || !toId || fromId === toId) {
      toast.error("Add another currency wallet to switch this pair.");
      return;
    }
    setFromWalletId(toId);
    setToWalletId(fromId);
    setSwapRotation((r) => r + 180);
    setLastEdited("send");
  };

  const handleExchange = async () => {
    if (!fromWallet || !toWallet) return;
    if (!effectiveRate) {
      toast.error(`No exchange rate available for ${fromWallet.currency_code} → ${toWallet.currency_code}`);
      return;
    }

    setIsLoading(true);

    try {
      await executeWalletFxSwap({
        from_wallet_id: fromWallet.wallet_id,
        to_wallet_id: toWallet.wallet_id,
        from_currency: fromWallet.currency_code,
        to_currency: toWallet.currency_code,
        from_amount: parsedSend,
        effective_rate: effectiveRate,
        fee_amount: fee,
      });

      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['fx_rates'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-fx'] });
      toast.success('Exchange completed successfully!');

      successTimer.current = setTimeout(() => {
        setSuccess(false);
        setSendAmount("");
        setRecvAmount("");
      }, 4000);
    } catch (error: any) {
      console.error('Exchange error:', error);
      toast.error(friendlyFxError(error?.message));
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = parsedSend > 0 &&
    parsedSend >= MIN_AMOUNT &&
    parsedSend <= MAX_AMOUNT &&
    fromWallet &&
    toWallet &&
    fromWallet.wallet_id !== toWallet.wallet_id &&
    !!effectiveRate &&
    parsedSend <= Number(fromWallet.balance);

  const amountError =
    parsedSend > 0 && parsedSend < MIN_AMOUNT
      ? `Minimum exchange is ${MIN_AMOUNT}.`
      : parsedSend > MAX_AMOUNT
        ? `Maximum exchange is ${MAX_AMOUNT.toLocaleString()}.`
        : null;

  const rateQuote = useMemo(() => {
    if (!fromWallet || !toWallet || !effectiveRate) return null;
    return fxQuoteLabel(
      fromWallet.currency_code,
      toWallet.currency_code,
      effectiveRate,
      quoteConvention,
    );
  }, [fromWallet, toWallet, effectiveRate, quoteConvention]);

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Live exchange
              </CardTitle>
              {rateQuote && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div
                    className="inline-flex rounded-full bg-background p-0.5 ring-1 ring-border"
                    role="group"
                    aria-label="FX quotation convention"
                  >
                    <button
                      type="button"
                      onClick={() => setQuoteConvention("indirect")}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        quoteConvention === "indirect"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Indirect
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuoteConvention("direct")}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        quoteConvention === "direct"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Direct
                    </button>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    {rateQuote.label}
                  </span>
                </div>
              )}
            </div>
            {rateQuote && (
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{rateQuote.hint}</p>
            )}
          </CardHeader>
          <CardContent className="relative space-y-5 pt-2">
            <div className="space-y-2.5 rounded-xl bg-muted/40 p-4 ring-1 ring-border/60">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">You pay</Label>
            <Select value={selectedFromId} onValueChange={setFromWalletId}>
                <SelectTrigger className="h-11 border-border/60 bg-background/80">
                <SelectValue placeholder="Select wallet" />
              </SelectTrigger>
              <SelectContent>
                {fiatWallets.filter(w => w.wallet_id !== selectedToId).map((w) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      <span className="inline-flex items-center gap-2">
                        <CurrencyFlag code={w.currency_code} size="sm" />
                        {w.currency_code} · {w.symbol}{Number(w.balance).toFixed(2)}
                      </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex h-14 items-center gap-2 rounded-md border border-border/60 bg-background px-4 focus-within:ring-2 focus-within:ring-primary/30">
                <span className="shrink-0 whitespace-nowrap text-lg font-medium text-muted-foreground">
                  {fromWallet?.symbol || "$"}
              </span>
              <Input
                  type="text"
                  inputMode="decimal"
                placeholder="0.00"
                  value={sendAmount}
                  onChange={(e) => onSendChange(e.target.value)}
                  aria-label="You pay amount"
                  className="h-14 min-w-0 flex-1 border-0 bg-transparent p-0 font-display text-2xl font-bold tabular-nums shadow-none focus-visible:ring-0"
              />
            </div>
              <p className="text-xs text-muted-foreground">
              Available: {fromWallet?.symbol}{Number(fromWallet?.balance || 0).toFixed(2)}
            </p>
            {amountError && (
              <p className="text-xs text-destructive">{amountError}</p>
            )}
          </div>

            <div className="relative z-20 -my-3 flex justify-center">
            <motion.button
              type="button"
              onClick={handleSwap}
              animate={{ rotate: swapRotation }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
                className="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-primary/30 bg-background text-primary shadow-md hover:bg-primary/10"
              aria-label="Switch pay and receive currencies"
            >
                <ArrowUpDown className="h-4 w-4" />
            </motion.button>
          </div>

            <div className="space-y-2.5 rounded-xl bg-gradient-to-br from-primary/[0.07] to-muted/30 p-4 ring-1 ring-primary/15">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">You receive</Label>
            <Select value={selectedToId} onValueChange={setToWalletId}>
                <SelectTrigger className="h-11 border-border/60 bg-background/80">
                <SelectValue placeholder="Select wallet" />
              </SelectTrigger>
              <SelectContent>
                {fiatWallets.filter(w => w.wallet_id !== selectedFromId).map((w) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      <span className="inline-flex items-center gap-2">
                        <CurrencyFlag code={w.currency_code} size="sm" />
                      {w.currency_code}
                        · {w.symbol}{Number(w.balance).toFixed(2)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
              <div className="flex h-14 items-center gap-2 rounded-md border border-border/60 bg-background/90 px-4 focus-within:ring-2 focus-within:ring-primary/30">
                <span className="shrink-0 whitespace-nowrap text-lg font-medium text-muted-foreground">
                  {toWallet?.symbol || "$"}
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={recvAmount}
                  onChange={(e) => onRecvChange(e.target.value)}
                  aria-label="You receive amount"
                  className="h-14 min-w-0 flex-1 border-0 bg-transparent p-0 font-display text-2xl font-bold tabular-nums shadow-none focus-visible:ring-0"
                />
              </div>
          </div>

            {parsedSend > 0 && (
              <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
              <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{quoteConvention === "direct" ? "Direct quote" : "Indirect quote"}</span>
                  <span className="font-medium tabular-nums flex min-w-0 items-center justify-end gap-2">
                  {effectiveRate
                    ? (
                      <>
                        <span className="truncate">{rateQuote?.label}</span>
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
                <div className="flex justify-between border-t border-border/60 pt-2 font-semibold gap-3">
                  <span className="shrink-0">You receive</span>
                  <span className="min-w-0 truncate text-right text-primary tabular-nums">{toWallet?.symbol}{fmtRecv(receivedAmount)}</span>
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
    queryFn: () => getFlovideOrNombaRate("USD", "NGN"),
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
              <span className="inline-flex items-center gap-1"><CurrencyFlag code="USD" size="xs" />USD → <CurrencyFlag code="NGN" size="xs" />NGN</span>
              <span className="font-mono flex items-center gap-2">
                {Number(nombaUsdNgn.effective_rate).toFixed(4)}
                <span className="text-[10px] uppercase text-emerald-600 font-semibold">Live</span>
              </span>
            </div>
          ) : null}
          {fxRates?.slice(0, 4).map((rate) => (
              <div key={rate.id} className="flex justify-between items-center text-sm">
                <span className="inline-flex items-center gap-1"><CurrencyFlag code={rate.from_currency} size="xs" />{rate.from_currency} → <CurrencyFlag code={rate.to_currency} size="xs" />{rate.to_currency}</span>
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
              { icon: Sparkles, text: "Live rates for supported pairs" },
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
