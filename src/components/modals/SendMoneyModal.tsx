import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const currencies = [
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸', balance: 12458.32 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦', balance: 8234.50 },
];

const targetCountries = [
  { code: 'KES', country: 'Kenya', flag: '🇰🇪', rate: 153.45, method: 'M-Pesa' },
  { code: 'UGX', country: 'Uganda', flag: '🇺🇬', rate: 3742.50, method: 'Mobile Money' },
  { code: 'TZS', country: 'Tanzania', flag: '🇹🇿', rate: 2505.00, method: 'M-Pesa' },
  { code: 'ZMW', country: 'Zambia', flag: '🇿🇲', rate: 26.85, method: 'MTN Mobile' },
  { code: 'BIF', country: 'Burundi', flag: '🇧🇮', rate: 2850.00, method: 'Lumicash' },
];

interface SendMoneyModalProps {
  children: React.ReactNode;
}

const SendMoneyModal = ({ children }: SendMoneyModalProps) => {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState("");
  const [sourceCurrency, setSourceCurrency] = useState(currencies[0]);
  const [targetCountry, setTargetCountry] = useState(targetCountries[0]);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const fee = parseFloat(amount) > 0 ? 2.99 : 0;
  const receivedAmount = parseFloat(amount) > 0 
    ? (parseFloat(amount) - fee) * targetCountry.rate 
    : 0;

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = () => {
    setStep(4);
    setTimeout(() => {
      setIsOpen(false);
      setStep(1);
      setAmount("");
      setRecipientName("");
      setRecipientPhone("");
    }, 3000);
  };

  const isStep1Valid = parseFloat(amount) > 0 && parseFloat(amount) <= sourceCurrency.balance;
  const isStep2Valid = recipientName.length > 2 && recipientPhone.length > 8;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">
            {step === 4 ? 'Transfer Complete!' : 'Send Money'}
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Step 1: Amount */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 py-4"
            >
              <div className="space-y-3">
                <Label className="text-muted-foreground">You send</Label>
                <div className="flex gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowSourceDropdown(!showSourceDropdown)}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
                    >
                      <span className="text-lg">{sourceCurrency.flag}</span>
                      <span className="font-medium text-foreground">{sourceCurrency.code}</span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {showSourceDropdown && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-popover border border-border rounded-xl shadow-elevated z-50">
                        {currencies.map((curr) => (
                          <button
                            key={curr.code}
                            onClick={() => {
                              setSourceCurrency(curr);
                              setShowSourceDropdown(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl"
                          >
                            <span>{curr.flag}</span>
                            <div className="text-left">
                              <p className="font-medium text-foreground">{curr.code}</p>
                              <p className="text-xs text-muted-foreground">
                                {curr.symbol}{formatNumber(curr.balance)}
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
                  Available: {sourceCurrency.symbol}{formatNumber(sourceCurrency.balance)}
                </p>
              </div>

              <div className="flex justify-center">
                <div className="p-2 rounded-full bg-primary/20">
                  <ArrowRight className="w-5 h-5 text-primary rotate-90" />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-muted-foreground">They receive</Label>
                <div className="flex gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowTargetDropdown(!showTargetDropdown)}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
                    >
                      <span className="text-lg">{targetCountry.flag}</span>
                      <span className="font-medium text-foreground">{targetCountry.code}</span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {showTargetDropdown && (
                      <div className="absolute top-full left-0 mt-2 w-56 bg-popover border border-border rounded-xl shadow-elevated z-50 max-h-64 overflow-y-auto">
                        {targetCountries.map((country) => (
                          <button
                            key={country.code}
                            onClick={() => {
                              setTargetCountry(country);
                              setShowTargetDropdown(false);
                            }}
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
                    <p className="text-2xl font-display font-bold text-foreground">
                      {formatNumber(receivedAmount)}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Rate: 1 {sourceCurrency.code} = {formatNumber(targetCountry.rate)} {targetCountry.code}
                </p>
              </div>

              {parseFloat(amount) > 0 && (
                <div className="p-4 rounded-xl bg-muted/50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Transfer fee</span>
                    <span className="text-foreground">{sourceCurrency.symbol}{fee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Delivery</span>
                    <span className="text-primary">Instant via {targetCountry.method}</span>
                  </div>
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNext}
                disabled={!isStep1Valid}
                className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-medium shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </motion.button>
            </motion.div>
          )}

          {/* Step 2: Recipient */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 py-4"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Recipient name</Label>
                  <Input
                    placeholder="Full name as registered"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="bg-secondary border-none text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Mobile money number</Label>
                  <Input
                    placeholder={`+${targetCountry.code === 'KES' ? '254' : '256'}...`}
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="bg-secondary border-none text-foreground"
                  />
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Funds will be sent via {targetCountry.method}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleBack}
                  className="flex-1 py-4 rounded-xl bg-secondary text-secondary-foreground font-medium"
                >
                  Back
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNext}
                  disabled={!isStep2Valid}
                  className="flex-1 py-4 rounded-xl gradient-primary text-primary-foreground font-medium shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Review
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 py-4"
            >
              <div className="p-6 rounded-2xl gradient-card border border-border">
                <div className="text-center mb-6">
                  <p className="text-sm text-muted-foreground mb-1">Sending</p>
                  <p className="text-3xl font-display font-bold text-foreground">
                    {sourceCurrency.symbol}{formatNumber(parseFloat(amount))}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className="text-lg">{sourceCurrency.flag}</span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <span className="text-lg">{targetCountry.flag}</span>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">To</span>
                    <span className="text-foreground font-medium">{recipientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="text-foreground">{recipientPhone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Method</span>
                    <span className="text-primary">{targetCountry.method}</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-border">
                    <span className="text-muted-foreground">They receive</span>
                    <span className="text-foreground font-bold">
                      {formatNumber(receivedAmount)} {targetCountry.code}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleBack}
                  className="flex-1 py-4 rounded-xl bg-secondary text-secondary-foreground font-medium"
                >
                  Back
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  className="flex-1 py-4 rounded-xl gradient-primary text-primary-foreground font-medium shadow-glow"
                >
                  Confirm & Send
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <motion.div
              key="step4"
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
                Money Sent!
              </h3>
              <p className="text-muted-foreground">
                {recipientName} will receive {formatNumber(receivedAmount)} {targetCountry.code} instantly via {targetCountry.method}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default SendMoneyModal;
