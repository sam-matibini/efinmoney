import { useState } from "react";
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
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ArrowUpDown, TrendingUp, CheckCircle, Bitcoin, DollarSign, ExternalLink } from "lucide-react";
import { CryptoTradingPanel } from "@/components/crypto/CryptoTradingPanel";
import { flagForCurrency } from "@/lib/flags";

// Synthetic wallet id used to represent the on-chain USDC option.
const STELLAR_USDC_ID = "stellar-usdc";

const FxTradingPanel = () => {
  const [amount, setAmount] = useState("");
  const [fromWalletId, setFromWalletId] = useState("");
  const [toWalletId, setToWalletId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [swapRotation, setSwapRotation] = useState(0);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

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

  // For USDC destination we use the FIAT → USD rate (USDC is pegged to USD).
  const fxRate = toWallet
    ? isCryptoSwap
      ? fromWallet?.currency_code === "USD"
        ? { effective_rate: 1, rate: 1, markup_rate: 0 }
        : fxRates?.find(r => r.from_currency === fromWallet?.currency_code && r.to_currency === "USD")
      : fxRates?.find(r => r.from_currency === fromWallet?.currency_code && r.to_currency === toWallet.currency_code)
    : null;

  const effectiveRate = fxRate ? Number(fxRate.effective_rate) : null;

  const fee = parseFloat(amount) > 0 ? parseFloat(amount) * 0.005 : 0;
  const receivedAmount = effectiveRate && parseFloat(amount) > 0
    ? (parseFloat(amount) - fee) * effectiveRate
    : 0;

  const handleSwap = () => {
    // Don't allow swapping into a fiat slot from the synthetic USDC option
    if (toWallet && "isStellar" in toWallet && toWallet.isStellar) return;
    const temp = fromWalletId;
    setFromWalletId(toWalletId);
    setToWalletId(temp);
    setSwapRotation((r) => r + 180);
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
              from_amount: parseFloat(amount),
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
              from_amount: parseFloat(amount),
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

      setTimeout(() => {
        setSuccess(false);
        setAmount("");
      }, 4000);
    } catch (error: any) {
      console.error('Exchange error:', error);
      toast.error(error?.message || 'Exchange failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = parseFloat(amount) > 0 &&
    fromWallet &&
    toWallet &&
    fromWallet.wallet_id !== toWallet.wallet_id &&
    !!effectiveRate &&
    parseFloat(amount) <= Number(fromWallet.balance);

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
            Converted {fromWallet?.symbol}{amount} to {toWallet?.symbol}{receivedAmount.toFixed(2)} {toWallet?.currency_code}
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
      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* From */}
          <div className="space-y-2">
            <Label>From</Label>
            <Select value={fromWalletId || fromWallet?.wallet_id || ""} onValueChange={setFromWalletId}>
              <SelectTrigger>
                <SelectValue placeholder="Select wallet" />
              </SelectTrigger>
              <SelectContent>
                {fiatWallets?.filter(w => w.wallet_id !== toWalletId).map((w) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    <span className="text-2xl mr-1.5 align-middle">{w.flag_emoji}</span>
                    <span className="align-middle">{w.currency_code} - {w.symbol}{Number(w.balance).toFixed(2)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
                {fromWallet?.symbol || '$'}
              </span>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10 text-2xl h-14"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Available: {fromWallet?.symbol}{Number(fromWallet?.balance || 0).toFixed(2)}
            </p>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <motion.button
              type="button"
              onClick={handleSwap}
              animate={{ rotate: swapRotation }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              whileTap={{ scale: 0.9 }}
              className="w-10 h-10 rounded-full border border-border bg-background hover:bg-muted flex items-center justify-center"
              aria-label="Swap currencies"
            >
              <ArrowUpDown className="w-4 h-4" />
            </motion.button>
          </div>

          {/* To */}
          <div className="space-y-2">
            <Label>To</Label>
            <Select value={toWalletId || toWallet?.wallet_id || ""} onValueChange={setToWalletId}>
              <SelectTrigger>
                <SelectValue placeholder="Select wallet" />
              </SelectTrigger>
              <SelectContent>
                {destinationOptions.filter(w => w.wallet_id !== fromWalletId).map((w) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    <span className="text-2xl mr-1.5 align-middle">{w.flag_emoji}</span>
                    <span className="align-middle">
                      {w.currency_code}
                      {w.isStellar ? " (Stellar)" : ""} - {w.symbol}{Number(w.balance).toFixed(w.isStellar ? 4 : 2)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="p-4 rounded-xl bg-muted">
              <p className="text-3xl font-display font-bold text-foreground">
                {toWallet?.symbol}{receivedAmount.toFixed(isCryptoSwap ? 4 : 2)}
                {isCryptoSwap && <span className="text-base text-muted-foreground ml-2">USDC</span>}
              </p>
              {isCryptoSwap && (
                <p className="text-xs text-muted-foreground mt-1">
                  Delivered on-chain to your Stellar wallet
                </p>
              )}
            </div>
          </div>

          {/* Rate Info */}
          {parseFloat(amount) > 0 && (
            <div className="p-4 rounded-xl bg-muted/50 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exchange Rate</span>
                <span>
                  {effectiveRate
                    ? `1 ${fromWallet?.currency_code} = ${effectiveRate.toFixed(4)} ${toWallet?.currency_code}`
                    : <span className="text-destructive">Rate unavailable</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee (0.5%)</span>
                <span>{fromWallet?.symbol}{fee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border font-semibold">
                <span>You Receive</span>
                <span className="text-primary">{toWallet?.symbol}{receivedAmount.toFixed(2)}</span>
              </div>
            </div>
          )}

          <Button 
            className="w-full" 
            size="lg" 
            onClick={handleExchange}
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <RefreshCw className="w-5 h-5 mr-2" />
                Exchange Now
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Live Rates */}
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
    <main className="container px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto space-y-6"
        >
          <div className="text-center">
            <h1 className="text-2xl font-display font-bold text-foreground">Exchange</h1>
            <p className="text-muted-foreground">Trade currencies and crypto instantly</p>
          </div>

          <Tabs defaultValue="fx" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="fx" className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Currency
              </TabsTrigger>
              <TabsTrigger value="crypto" className="flex items-center gap-2">
                <Bitcoin className="w-4 h-4" />
                Crypto
              </TabsTrigger>
            </TabsList>

            <TabsContent value="fx">
              <FxTradingPanel />
            </TabsContent>

            <TabsContent value="crypto">
              <CryptoTradingPanel />
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
  );
};

export default ExchangePage;
