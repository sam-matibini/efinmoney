import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, ChevronDown, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallets } from "@/hooks/useWallets";
import { useFxRates } from "@/hooks/useFxRates";
import { resolveEffectiveRate } from "@/lib/fx";
import { getNombaExchangeRate, isNgnPair } from "@/lib/nombaNigeria";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// ISO-4217 currency -> ISO-3166-1 alpha-2 country code for flag CDN
const currencyToCountry: Record<string, string> = {
  KES: "ke", UGX: "ug", TZS: "tz", ZMW: "zm", BIF: "bi", RWF: "rw",
  USD: "us", CAD: "ca", GBP: "gb", NGN: "ng", ZAR: "za", GHS: "gh",
  ETB: "et", XOF: "sn", XAF: "cm", MAD: "ma", EGP: "eg", AUD: "au",
  CHF: "ch", JPY: "jp", CNY: "cn", INR: "in",
};

const CurrencyFlag = ({ code, size = "w-5 h-5" }: { code?: string | null; size?: string }) => {
  const cc = code ? currencyToCountry[code.toUpperCase()] : null;
  if (!cc) {
    return (
      <span className={`${size} inline-flex items-center justify-center rounded-full bg-muted text-xs`}>
        🌐
      </span>
    );
  }
  return (
    <img
      src={`https://flagcdn.com/w40/${cc}.png`}
      srcSet={`https://flagcdn.com/w80/${cc}.png 2x`}
      alt={code || ""}
      className={`${size} rounded-full object-cover ring-1 ring-border`}
      loading="lazy"
    />
  );
};

interface ExchangeModalProps {
  children: React.ReactNode;
}

const ExchangeModal = ({ children }: ExchangeModalProps) => {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState("");
  const [fromWalletId, setFromWalletId] = useState<string | null>(null);
  const [toWalletId, setToWalletId] = useState<string | null>(null);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { data: wallets } = useWallets();
  const { data: fxRates } = useFxRates();
  const queryClient = useQueryClient();

  const fromWallet = wallets?.find(w => w.wallet_id === fromWalletId) || wallets?.[0];
  const toWallet = wallets?.find(w => w.wallet_id === toWalletId) || wallets?.[1];

  const fromCode = fromWallet?.currency_code ?? "";
  const toCode = toWallet?.currency_code ?? "";
  const { data: nombaQuote } = useQuery({
    queryKey: ["exchange-modal-nomba", fromCode, toCode],
    queryFn: () => getNombaExchangeRate(fromCode, toCode),
    enabled: !!fromCode && !!toCode && fromCode !== toCode && isNgnPair(fromCode, toCode),
    staleTime: 60_000,
  });

  const dbRate = fromCode && toCode
    ? resolveEffectiveRate(fromCode, toCode, fxRates ?? [])
    : null;
  const effectiveRate = nombaQuote?.effective_rate && nombaQuote.effective_rate > 0
    ? nombaQuote.effective_rate
    : (dbRate ?? 1);
  const rateFromNomba = !!nombaQuote?.effective_rate;

  const fee = parseFloat(amount) > 0 ? parseFloat(amount) * 0.005 : 0;
  const receivedAmount = parseFloat(amount) > 0 
    ? (parseFloat(amount) - fee) * effectiveRate 
    : 0;

  const formatNumber = (num: number, decimals = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const handleSwapCurrencies = () => {
    const temp = fromWalletId;
    setFromWalletId(toWalletId);
    setToWalletId(temp);
  };

  const handleSubmit = async () => {
    if (!fromWallet || !toWallet) {
      toast.error("Please select wallets");
      return;
    }

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('fx-engine', {
        body: {
          action: 'execute',
          from_wallet_id: fromWallet.wallet_id,
          to_wallet_id: toWallet.wallet_id,
          from_currency: fromWallet.currency_code,
          to_currency: toWallet.currency_code,
          from_amount: parseFloat(amount),
        },
      });

      const serverError = (response.data as { error?: string })?.error;
      if (response.error || serverError) {
        throw new Error(serverError || response.error?.message || 'Exchange failed');
      }

      setStep(2);
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      
      setTimeout(() => {
        setIsOpen(false);
        resetForm();
      }, 3000);
    } catch (error) {
      console.error('Exchange error:', error);
      toast.error("Exchange failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setAmount("");
    setFromWalletId(null);
    setToWalletId(null);
  };

  const isValid = parseFloat(amount) > 0 && 
    fromWallet && 
    toWallet &&
    fromWallet.wallet_id !== toWallet.wallet_id &&
    parseFloat(amount) <= Number(fromWallet.balance);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetForm();
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            {step === 2 ? 'Exchange Complete!' : 'Currency Exchange'}
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 py-4"
            >
              {/* From Currency */}
              <div className="space-y-3">
                <Label className="text-muted-foreground">From</Label>
                <div className="flex gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowFromDropdown(!showFromDropdown)}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors min-w-[100px]"
                    >
                      <CurrencyFlag code={fromWallet?.currency_code} />
                      <span className="font-medium text-foreground">{fromWallet?.currency_code || 'USD'}</span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {showFromDropdown && wallets && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-popover border border-border rounded-xl shadow-elevated z-50">
                        {wallets.filter(w => w.wallet_id !== toWalletId).map((wallet) => (
                          <button
                            key={wallet.wallet_id}
                            onClick={() => {
                              setFromWalletId(wallet.wallet_id);
                              setShowFromDropdown(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl"
                          >
                            <CurrencyFlag code={wallet.currency_code} />
                            <div className="text-left">
                              <p className="font-medium text-foreground">{wallet.currency_code}</p>
                              <p className="text-xs text-muted-foreground">
                                {wallet.symbol}{formatNumber(Number(wallet.balance))}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex-1 text-2xl font-display bg-secondary border-none text-foreground"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Available: {fromWallet?.symbol || '$'}{formatNumber(Number(fromWallet?.balance || 0))}
                </p>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center">
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 180 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSwapCurrencies}
                  className="p-3 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors"
                >
                  <RefreshCw className="w-5 h-5 text-primary" />
                </motion.button>
              </div>

              {/* To Currency */}
              <div className="space-y-3">
                <Label className="text-muted-foreground">To</Label>
                <div className="flex gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowToDropdown(!showToDropdown)}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors min-w-[100px]"
                    >
                      <CurrencyFlag code={toWallet?.currency_code} />
                      <span className="font-medium text-foreground">{toWallet?.currency_code || 'CAD'}</span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {showToDropdown && wallets && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-popover border border-border rounded-xl shadow-elevated z-50">
                        {wallets.filter(w => w.wallet_id !== fromWalletId).map((wallet) => (
                          <button
                            key={wallet.wallet_id}
                            onClick={() => {
                              setToWalletId(wallet.wallet_id);
                              setShowToDropdown(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl"
                          >
                            <CurrencyFlag code={wallet.currency_code} />
                            <div className="text-left">
                              <p className="font-medium text-foreground">{wallet.currency_code}</p>
                              <p className="text-xs text-muted-foreground">
                                {wallet.symbol}{formatNumber(Number(wallet.balance))}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 px-4 py-3 rounded-xl bg-muted">
                    <p className="text-2xl font-display font-bold text-foreground">
                      {formatNumber(receivedAmount)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Rate Info */}
              {parseFloat(amount) > 0 && (
                <div className="p-4 rounded-xl bg-muted/50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Exchange rate</span>
                    <span className="text-foreground flex items-center gap-2">
                      1 {fromWallet?.currency_code} = {formatNumber(effectiveRate, 4)} {toWallet?.currency_code}
                      {rateFromNomba && (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">Live</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fee (0.5%)</span>
                    <span className="text-foreground">{fromWallet?.symbol}{formatNumber(fee)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-border">
                    <span className="text-muted-foreground">You receive</span>
                    <span className="text-primary font-semibold">
                      {toWallet?.symbol}{formatNumber(receivedAmount)}
                    </span>
                  </div>
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSubmit}
                disabled={!isValid || isLoading}
                className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-medium shadow-glow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <LoadingSpinner size={20} />
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Exchange Now
                  </>
                )}
              </motion.button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="w-20 h-20 mx-auto mb-6 rounded-full gradient-primary flex items-center justify-center shadow-glow"
              >
                <CheckCircle className="w-10 h-10 text-primary-foreground" />
              </motion.div>
              <h3 className="text-xl font-display font-bold text-foreground mb-2">
                Exchange Complete!
              </h3>
              <p className="text-muted-foreground">
                Converted {fromWallet?.symbol}{formatNumber(parseFloat(amount))} {fromWallet?.currency_code} to{' '}
                {toWallet?.symbol}{formatNumber(receivedAmount)} {toWallet?.currency_code}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default ExchangeModal;
