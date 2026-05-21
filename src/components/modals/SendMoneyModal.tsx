import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ArrowRight, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallets } from "@/hooks/useWallets";
import { useFxRates } from "@/hooks/useFxRates";
import { toast } from "sonner";

const targetCountries = [
  { code: 'NGN', country: 'Nigeria', flag: '🇳🇬', method: 'Bank Transfer' },
  { code: 'KES', country: 'Kenya', flag: '🇰🇪', method: 'M-Pesa' },
  { code: 'UGX', country: 'Uganda', flag: '🇺🇬', method: 'Mobile Money' },
  { code: 'GHS', country: 'Ghana', flag: '🇬🇭', method: 'MTN Mobile' },
  { code: 'TZS', country: 'Tanzania', flag: '🇹🇿', method: 'M-Pesa' },
  { code: 'ZMW', country: 'Zambia', flag: '🇿🇲', method: 'MTN Mobile' },
  { code: 'RWF', country: 'Rwanda', flag: '🇷🇼', method: 'MTN Mobile' },
  { code: 'USD', country: 'United States', flag: '🇺🇸', method: 'Bank Transfer' },
];

const fallbackRates: Record<string, number> = {
  KES: 153.45, UGX: 3742.50, TZS: 2505.00, ZMW: 26.85,
  NGN: 1580.00, GHS: 15.20, RWF: 1320.00, CAD: 1.36, USD: 1,
};

interface SendMoneyModalProps {
  children: React.ReactNode;
}

const SendMoneyModal = ({ children }: SendMoneyModalProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [targetCountryCode, setTargetCountryCode] = useState<string | null>(null);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);

  const { data: wallets } = useWallets();
  const { data: fxRates } = useFxRates();

  const selectedWallet = wallets?.find(w => w.wallet_id === selectedWalletId) || wallets?.[0];

  // Default target country to match the source wallet currency so amounts mirror 1:1 until user changes it
  const sourceCode = selectedWallet?.currency_code;
  const effectiveTargetCode =
    targetCountryCode ??
    (sourceCode && targetCountries.find(c => c.code === sourceCode) ? sourceCode : targetCountries[0].code);
  const targetCountry =
    targetCountries.find(c => c.code === effectiveTargetCode) ?? targetCountries[0];

  const fxRate = fxRates?.find(
    r => r.from_currency === selectedWallet?.currency_code && r.to_currency === targetCountry.code
  );
  const effectiveRate = fxRate ? Number(fxRate.effective_rate) : (fallbackRates[targetCountry.code] ?? 1);

  const parsedAmount = parseFloat(amount) || 0;
  const receivedAmount = parsedAmount > 0 ? parsedAmount * effectiveRate : 0;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const reset = () => {
    setAmount("");
    setSelectedWalletId(null);
    setTargetCountryCode(null);
  };

  const goToDomestic = () => {
    setIsOpen(false);
    navigate("/send?mode=canada");
  };

  const handleContinue = () => {
    if (!selectedWallet) {
      toast.error("Please select a source wallet");
      return;
    }
    if (parsedAmount <= 0) {
      toast.error("Enter an amount");
      return;
    }
    if (parsedAmount > Number(selectedWallet.balance)) {
      toast.error("Insufficient wallet balance");
      return;
    }

    const params = new URLSearchParams({
      amount: String(parsedAmount),
      sourceWalletId: selectedWallet.wallet_id,
      targetCountryCode: targetCountry.code,
    });
    setIsOpen(false);
    navigate(`/send?${params.toString()}`);
    setTimeout(reset, 200);
  };

  const isValid =
    parsedAmount > 0 &&
    !!selectedWallet &&
    parsedAmount <= Number(selectedWallet?.balance ?? 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">Quick Send</DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          <motion.div
            key="picker"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6 py-4"
          >
            {/* You send */}
            <div className="space-y-3">
              <Label className="text-muted-foreground">You send</Label>
              <div className="flex gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSourceDropdown(!showSourceDropdown)}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    <span className="text-lg">{selectedWallet?.flag_emoji || '💰'}</span>
                    <span className="font-medium text-foreground">{selectedWallet?.currency_code || 'USD'}</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </button>
                  {showSourceDropdown && wallets && (
                    <div className="absolute top-full left-0 mt-2 w-56 bg-popover border border-border rounded-xl shadow-elevated z-50 max-h-64 overflow-y-auto">
                      {wallets.map((wallet) => (
                        <button
                          key={wallet.wallet_id}
                          type="button"
                          onClick={() => { setSelectedWalletId(wallet.wallet_id); setShowSourceDropdown(false); }}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl"
                        >
                          <span>{wallet.flag_emoji || '💰'}</span>
                          <div className="text-left">
                            <p className="font-medium text-foreground">{wallet.currency_code}</p>
                            <p className="text-xs text-muted-foreground">
                              {wallet.symbol}{fmt(Number(wallet.balance))}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 text-2xl font-display bg-secondary border-none text-foreground"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Available: {selectedWallet?.symbol || '$'}{fmt(Number(selectedWallet?.balance || 0))}
              </p>
            </div>

            <div className="flex justify-center">
              <div className="p-2 rounded-full bg-primary/20">
                <ArrowRight className="w-5 h-5 text-primary rotate-90" />
              </div>
            </div>

            {/* They receive */}
            <div className="space-y-3">
              <Label className="text-muted-foreground">They receive</Label>
              <div className="flex gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTargetDropdown(!showTargetDropdown)}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    <span className="text-lg">{targetCountry.flag}</span>
                    <span className="font-medium text-foreground">{targetCountry.code}</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </button>
                  {showTargetDropdown && (
                    <div className="absolute top-full left-0 mt-2 w-60 bg-popover border border-border rounded-xl shadow-elevated z-50 max-h-64 overflow-y-auto">
                      {targetCountries.map((country) => (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => { setTargetCountry(country); setShowTargetDropdown(false); }}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl"
                        >
                          <span>{country.flag}</span>
                          <div className="text-left">
                            <p className="font-medium text-foreground">{country.country}</p>
                            <p className="text-xs text-muted-foreground">{country.method}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 px-4 py-3 rounded-xl bg-muted">
                  <p className="text-2xl font-display font-bold text-foreground">{fmt(receivedAmount)}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Rate: 1 {selectedWallet?.currency_code || 'USD'} = {fmt(effectiveRate)} {targetCountry.code}
                {!fxRate && <span className="ml-1 text-amber-500">(indicative)</span>}
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleContinue}
              disabled={!isValid}
              className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-medium shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue on Send Page
            </motion.button>

            <button
              type="button"
              onClick={goToDomestic}
              className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <MapPin className="w-4 h-4" />
              Sending within Canada? Use Domestic 🇨🇦
            </button>
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default SendMoneyModal;
