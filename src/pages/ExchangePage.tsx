import { useState } from "react";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useFxRates } from "@/hooks/useFxRates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ArrowUpDown, TrendingUp, CheckCircle } from "lucide-react";

const ExchangePage = () => {
  const [amount, setAmount] = useState("");
  const [fromWalletId, setFromWalletId] = useState("");
  const [toWalletId, setToWalletId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const { data: wallets } = useWallets();
  const { data: fxRates } = useFxRates();
  const queryClient = useQueryClient();

  const fromWallet = wallets?.find(w => w.wallet_id === fromWalletId) || wallets?.[0];
  const toWallet = wallets?.find(w => w.wallet_id === toWalletId) || wallets?.[1];

  const fxRate = fxRates?.find(
    r => r.from_currency === fromWallet?.currency_code && r.to_currency === toWallet?.currency_code
  );

  const effectiveRate = fxRate ? Number(fxRate.effective_rate) : 
    (fromWallet?.currency_code === 'USD' && toWallet?.currency_code === 'CAD' ? 1.35 : 1);

  const fee = parseFloat(amount) > 0 ? parseFloat(amount) * 0.005 : 0;
  const receivedAmount = parseFloat(amount) > 0 ? (parseFloat(amount) - fee) * effectiveRate : 0;

  const handleSwap = () => {
    const temp = fromWalletId;
    setFromWalletId(toWalletId);
    setToWalletId(temp);
  };

  const handleExchange = async () => {
    if (!fromWallet || !toWallet) return;

    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('fx-engine/execute', {
        body: {
          from_wallet_id: fromWallet.wallet_id,
          to_wallet_id: toWallet.wallet_id,
          from_currency: fromWallet.currency_code,
          to_currency: toWallet.currency_code,
          from_amount: parseFloat(amount)
        }
      });

      if (response.error) throw new Error(response.error.message);

      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      toast.success('Exchange completed successfully!');

      setTimeout(() => {
        setSuccess(false);
        setAmount("");
      }, 3000);
    } catch (error) {
      console.error('Exchange error:', error);
      toast.error('Exchange failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = parseFloat(amount) > 0 && 
    fromWallet && 
    toWallet &&
    fromWallet.wallet_id !== toWallet.wallet_id &&
    parseFloat(amount) <= Number(fromWallet.balance);

  if (success) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-8">
        <Header />
        <main className="container px-4 py-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="py-12 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
              >
                <CheckCircle className="w-10 h-10 text-green-500" />
              </motion.div>
              <h3 className="text-2xl font-display font-bold mb-2">Exchange Complete!</h3>
              <p className="text-muted-foreground">
                Converted {fromWallet?.symbol}{amount} to {toWallet?.symbol}{receivedAmount.toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      
      <main className="container px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto space-y-6"
        >
          <div className="text-center">
            <h1 className="text-2xl font-display font-bold text-foreground">Currency Exchange</h1>
            <p className="text-muted-foreground">Convert between your wallets instantly</p>
          </div>

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
                    {wallets?.filter(w => w.wallet_id !== toWalletId).map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        {w.flag_emoji} {w.currency_code} - {w.symbol}{Number(w.balance).toFixed(2)}
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
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={handleSwap}
                >
                  <ArrowUpDown className="w-4 h-4" />
                </Button>
              </div>

              {/* To */}
              <div className="space-y-2">
                <Label>To</Label>
                <Select value={toWalletId || toWallet?.wallet_id || ""} onValueChange={setToWalletId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets?.filter(w => w.wallet_id !== fromWalletId).map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        {w.flag_emoji} {w.currency_code} - {w.symbol}{Number(w.balance).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="p-4 rounded-xl bg-muted">
                  <p className="text-3xl font-display font-bold text-foreground">
                    {toWallet?.symbol}{receivedAmount.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Rate Info */}
              {parseFloat(amount) > 0 && (
                <div className="p-4 rounded-xl bg-muted/50 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exchange Rate</span>
                    <span>1 {fromWallet?.currency_code} = {effectiveRate.toFixed(4)} {toWallet?.currency_code}</span>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="w-4 h-4" />
                Live Rates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {fxRates?.slice(0, 4).map((rate) => (
                  <div key={rate.id} className="flex justify-between items-center text-sm">
                    <span>{rate.from_currency} → {rate.to_currency}</span>
                    <span className="font-mono">{Number(rate.effective_rate).toFixed(4)}</span>
                  </div>
                ))}
                {(!fxRates || fxRates.length === 0) && (
                  <p className="text-muted-foreground text-sm">No rates available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <MobileNav />
    </div>
  );
};

export default ExchangePage;
