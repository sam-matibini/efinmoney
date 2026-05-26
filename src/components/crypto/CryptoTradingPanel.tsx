import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useWallets } from "@/hooks/useWallets";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  CheckCircle,
  Info,
} from "lucide-react";
import { motion } from "framer-motion";

interface CryptoPair {
  id: string;
  base_currency: string;
  quote_currency: string;
  trading_fee_percent: number;
  min_trade_amount: number;
  max_trade_amount: number | null;
  is_active: boolean;
  current_price: number | null;
  price_available: boolean;
}

const PRIORITY = ["BTC", "ETH", "SOL", "USDT", "BNB", "XRP"];

const formatPrice = (price: number | null) => {
  if (!price) return "-";
  return price >= 1
    ? price.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : price.toFixed(6);
};

const formatBase = (n: number) =>
  n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : n.toFixed(8);

export const CryptoTradingPanel = () => {
  const queryClient = useQueryClient();
  const { data: wallets } = useWallets();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [baseCurrency, setBaseCurrency] = useState<string>("BTC");
  const [quoteCurrency, setQuoteCurrency] = useState<string>("USD");
  const [amount, setAmount] = useState("");

  const { data: pairs, isLoading: pairsLoading, error: pairsError, refetch: refetchPairs } = useQuery({
    queryKey: ["crypto-pairs"],
    queryFn: async () => {
      const response = await supabase.functions.invoke("crypto-trading", {
        body: { action: "pairs" },
      });
      const errMsg =
        (response.data as any)?.error ||
        (response.error ? response.error.message : null);
      if (errMsg) throw new Error(errMsg);
      return response.data.pairs as CryptoPair[];
    },
    refetchInterval: 30000,
    retry: 1,
  });

  // Available bases (sorted by priority)
  const availableBases = useMemo(() => {
    const set = new Set(pairs?.filter(p => p.price_available).map(p => p.base_currency) ?? []);
    const list = Array.from(set);
    list.sort((a, b) => {
      const ia = PRIORITY.indexOf(a);
      const ib = PRIORITY.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return list;
  }, [pairs]);

  // Pick a default base/quote on load
  useEffect(() => {
    if (!pairs?.length) return;
    if (!availableBases.includes(baseCurrency)) {
      setBaseCurrency(availableBases[0] ?? "BTC");
    }
  }, [pairs, availableBases, baseCurrency]);

  // Quote candidates = quote currencies for which a pair exists with current base
  const quoteOptions = useMemo(() => {
    return Array.from(
      new Set(
        pairs
          ?.filter(p => p.base_currency === baseCurrency && p.price_available)
          .map(p => p.quote_currency) ?? [],
      ),
    );
  }, [pairs, baseCurrency]);

  useEffect(() => {
    if (quoteOptions.length && !quoteOptions.includes(quoteCurrency)) {
      setQuoteCurrency(quoteOptions[0]);
    }
  }, [quoteOptions, quoteCurrency]);

  const selectedPair = pairs?.find(
    p => p.base_currency === baseCurrency && p.quote_currency === quoteCurrency,
  );

  const quoteWallet = wallets?.find(w => w.currency_code === quoteCurrency);
  const baseWallet = wallets?.find(w => w.currency_code === baseCurrency);

  const amountNum = parseFloat(amount) || 0;
  const fee = selectedPair ? Number(selectedPair.trading_fee_percent) : 0;
  const price = selectedPair?.current_price ?? 0;

  // Preview computation
  const preview = useMemo(() => {
    if (!selectedPair || !price || amountNum <= 0) return null;
    if (side === "buy") {
      // amount in quote currency
      const feeAmt = amountNum * fee;
      const baseReceived = (amountNum - feeAmt) / price;
      return { youPay: amountNum, youGet: baseReceived, feeAmt, payCcy: quoteCurrency, getCcy: baseCurrency };
    } else {
      // amount in base currency
      const gross = amountNum * price;
      const feeAmt = gross * fee;
      const quoteReceived = gross - feeAmt;
      return { youPay: amountNum, youGet: quoteReceived, feeAmt, payCcy: baseCurrency, getCcy: quoteCurrency };
    }
  }, [selectedPair, price, amountNum, fee, side, baseCurrency, quoteCurrency]);

  const minLabel = useMemo(() => {
    if (!selectedPair || !price) return null;
    if (side === "buy") {
      const minQuote = Number(selectedPair.min_trade_amount) * price;
      return `Min trade: ~${quoteCurrency === "USD" ? "$" : ""}${minQuote.toFixed(2)} ${quoteCurrency}`;
    }
    return `Min trade: ${selectedPair.min_trade_amount} ${baseCurrency}`;
  }, [selectedPair, price, side, baseCurrency, quoteCurrency]);

  const insufficientBalance = useMemo(() => {
    if (!amountNum) return false;
    if (side === "buy") return quoteWallet ? amountNum > Number(quoteWallet.balance) : false;
    return baseWallet ? amountNum > Number(baseWallet.balance) : false;
  }, [amountNum, side, quoteWallet, baseWallet]);

  const tradeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPair) throw new Error("Pair unavailable");
      const response = await supabase.functions.invoke("crypto-trading", {
        body: {
          action: "execute",
          pair_id: selectedPair.id,
          side,
          amount: amountNum,
          amount_type: side === "buy" ? "quote" : "base",
        },
      });
      const errMsg =
        (response.data as any)?.error ||
        (response.error ? response.error.message : null);
      if (errMsg) throw new Error(errMsg);
      return response.data;
    },
    onSuccess: () => {
      const verb = side === "buy" ? "bought" : "sold";
      const what = preview
        ? `${formatBase(preview.youGet)} ${preview.getCcy}`
        : baseCurrency;
      toast.success(`You ${verb} ${what} successfully!`);
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["crypto-trades"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canTrade =
    !!selectedPair &&
    !!price &&
    amountNum > 0 &&
    !insufficientBalance &&
    !tradeMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4 pb-4 flex gap-3 items-start">
          <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Buy and sell cryptocurrency instantly using your eFinMoney wallet balance.
            All trades are settled in your wallet.
          </p>
        </CardContent>
      </Card>

      {/* Live Prices */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4" />
              Live Crypto Prices
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchPairs()}
              disabled={pairsLoading}
            >
              <RefreshCw className={`w-4 h-4 ${pairsLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pairsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : pairsError ? (
            <div className="p-6 rounded-lg border border-destructive/30 bg-destructive/5 text-center space-y-3">
              <p className="text-sm text-destructive">
                Could not load live crypto prices: {(pairsError as Error).message}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetchPairs()}>
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          ) : !pairs?.some(p => p.price_available) ? (
            <div className="p-6 rounded-lg border border-border bg-muted/30 text-center text-sm text-muted-foreground">
              No live prices available right now. Please try again shortly.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pairs
                ?.filter(p => p.price_available && p.quote_currency === "USD")
                .sort((a, b) => {
                  const ia = PRIORITY.indexOf(a.base_currency);
                  const ib = PRIORITY.indexOf(b.base_currency);
                  if (ia === -1 && ib === -1) return a.base_currency.localeCompare(b.base_currency);
                  if (ia === -1) return 1;
                  if (ib === -1) return -1;
                  return ia - ib;
                })
                .map(pair => {
                  const isSelected =
                    pair.base_currency === baseCurrency && pair.quote_currency === quoteCurrency;
                  return (
                    <button
                      key={pair.id}
                      onClick={() => {
                        setBaseCurrency(pair.base_currency);
                        setQuoteCurrency(pair.quote_currency);
                      }}
                      className={`p-4 rounded-lg border text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                          : "border-border hover:bg-muted hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">
                          {pair.base_currency}/{pair.quote_currency}
                        </span>
                      </div>
                      <div className="mt-1 text-2xl font-display font-bold">
                        ${formatPrice(pair.current_price)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Fee {(pair.trading_fee_percent * 100).toFixed(2)}%
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trading Form */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Crypto</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={side} onValueChange={(v) => { setSide(v as "buy" | "sell"); setAmount(""); }}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="buy" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
                <TrendingUp className="w-4 h-4 mr-2" /> Buy Crypto
              </TabsTrigger>
              <TabsTrigger value="sell" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
                <TrendingDown className="w-4 h-4 mr-2" /> Sell Crypto
              </TabsTrigger>
            </TabsList>

            <TabsContent value={side} className="space-y-5 mt-0">
              {/* Crypto select */}
              <div className="space-y-2">
                <Label>{side === "buy" ? "I want to buy" : "I want to sell"}</Label>
                <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBases.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Wallet / quote currency */}
              <div className="space-y-2">
                <Label>{side === "buy" ? "I will pay with" : "Send proceeds to"}</Label>
                <Select value={quoteCurrency} onValueChange={setQuoteCurrency}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {quoteOptions.map(q => {
                      const w = wallets?.find(x => x.currency_code === q);
                      return (
                        <SelectItem key={q} value={q}>
                          {w ? `${w.flag_emoji ?? ""} ${q} - ${w.symbol}${Number(w.balance).toFixed(2)}` : q}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label>
                  {side === "buy"
                    ? `How much ${quoteCurrency} to spend`
                    : `How much ${baseCurrency} to sell`}
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={side === "buy" ? "0.01" : "0.00000001"}
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || parseFloat(v) >= 0) setAmount(v);
                  }}
                  className="h-14 text-2xl"
                />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {minLabel && <span className="text-muted-foreground">{minLabel}</span>}
                  {price > 0 && (
                    <span className="text-muted-foreground">
                      1 {baseCurrency} = ${formatPrice(price)} {quoteCurrency}
                    </span>
                  )}
                </div>
                {insufficientBalance && (
                  <p className="text-xs text-destructive">
                    Insufficient {side === "buy" ? quoteCurrency : baseCurrency} balance
                  </p>
                )}
              </div>

              {/* Live preview */}
              {preview && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl bg-muted space-y-2 text-sm"
                >
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You will receive approximately</span>
                    <span className="font-semibold text-primary">
                      {formatBase(preview.youGet)} {preview.getCcy}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Fee ({(fee * 100).toFixed(2)}%)</span>
                    <span>
                      {preview.feeAmt.toFixed(side === "buy" ? 2 : 8)}{" "}
                      {side === "buy" ? quoteCurrency : quoteCurrency}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* CTA */}
              <Button
                size="lg"
                className={`w-full h-14 text-base ${
                  side === "buy" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
                disabled={!canTrade}
                onClick={() => tradeMutation.mutate()}
              >
                {tradeMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    {side === "buy" ? <TrendingUp className="w-5 h-5 mr-2" /> : <TrendingDown className="w-5 h-5 mr-2" />}
                    {side === "buy" ? `Buy ${baseCurrency}` : `Sell ${baseCurrency}`}
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CryptoTradingPanel;
