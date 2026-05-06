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
import { useCreateTransfer } from "@/hooks/useTransfers";
import { useFundingSources } from "@/hooks/useFundingSources";
import { usePricingConfig } from "@/hooks/usePricingConfig";
import { toast } from "sonner";
import { ArrowRight, CheckCircle, Users, Clock, Shield, Wallet, Landmark, CreditCard, AlertCircle } from "lucide-react";
import CardPaymentForm from "@/components/modals/CardPaymentForm";

const targetCountries = [
  { code: 'KES', country: 'Kenya', flag: '🇰🇪', method: 'M-Pesa', payout: 'mpesa', symbol: 'KSh' },
  { code: 'UGX', country: 'Uganda', flag: '🇺🇬', method: 'Mobile Money', payout: 'airtel_money', symbol: 'USh' },
  { code: 'TZS', country: 'Tanzania', flag: '🇹🇿', method: 'M-Pesa', payout: 'mpesa', symbol: 'TSh' },
  { code: 'ZMW', country: 'Zambia', flag: '🇿🇲', method: 'MTN Mobile', payout: 'mtn_mobile', symbol: 'ZK' },
  { code: 'BIF', country: 'Burundi', flag: '🇧🇮', method: 'Lumicash', payout: 'lumicash', symbol: 'FBu' },
];

type FundingSource = 'wallet' | 'bank' | 'card';

const SendPage = () => {
  const [step, setStep] = useState(1);
  const [fundingSource, setFundingSource] = useState<FundingSource>('wallet');
  const [amount, setAmount] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [targetCountryCode, setTargetCountryCode] = useState("KES");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");

  const { data: wallets } = useWallets();
  const { data: fxRates } = useFxRates();
  const { data: bankSources = [] } = useFundingSources('bank');
  const { data: cardSources = [] } = useFundingSources('card');
  const { data: pricing } = usePricingConfig();
  const createTransfer = useCreateTransfer();

  const selectedWallet = wallets?.find(w => w.wallet_id === selectedWalletId) || wallets?.[0];
  const targetCountry = targetCountries.find(c => c.code === targetCountryCode) || targetCountries[0];

  const activeSources = fundingSource === 'bank' ? bankSources : fundingSource === 'card' ? cardSources : [];
  const selectedExternalSource = activeSources.find(s => s.id === selectedSourceId) || activeSources[0];

  const sourceCurrency = fundingSource === 'wallet'
    ? (selectedWallet?.currency_code || 'CAD')
    : (selectedExternalSource?.currency_code || 'CAD');
  const sourceSymbol = fundingSource === 'wallet' ? (selectedWallet?.symbol || 'C$') : '$';

  const fxRate = fxRates?.find(
    r => r.from_currency === sourceCurrency && r.to_currency === targetCountry.code
  );
  const effectiveRate = fxRate ? Number(fxRate.effective_rate) : 0;
  const rateAvailable = !!fxRate;

  const baseFee = pricing?.transfer_base_fee ?? 0;
  const cardFee = fundingSource === 'card' ? (pricing?.transfer_card_surcharge ?? 0) : 0;
  const fee = parseFloat(amount) > 0 ? baseFee + cardFee : 0;
  const receivedAmount = parseFloat(amount) > 0 && rateAvailable
    ? (parseFloat(amount) - fee) * effectiveRate
    : 0;

  const noLinkedSource = fundingSource === 'bank' && activeSources.length === 0;

  const handleSubmit = async () => {
    if (fundingSource === 'wallet' && !selectedWallet) return;

    try {
      const transfer = await createTransfer.mutateAsync({
        sender_wallet_id: fundingSource === 'wallet' ? selectedWallet!.wallet_id : wallets?.[0]?.wallet_id || '',
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        recipient_country: targetCountry.code,
        transfer_type: 'mobile_money',
        payout_method: targetCountry.payout,
        source_currency: sourceCurrency,
        target_currency: targetCountry.code,
        source_amount: parseFloat(amount),
        target_amount: receivedAmount,
        exchange_rate: effectiveRate,
        fee_amount: fee,
      });

      // Post ledger entries and trigger payout
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('execute-transfer', {
        body: { transfer_id: transfer.id },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Payout failed');
      }

      setStep(3);
      toast.success('Transfer sent successfully!');
    } catch (error: any) {
      toast.error(error?.message || 'Transfer failed. Please try again.');
    }
  };

  const resetForm = () => {
    setStep(1);
    setAmount("");
    setRecipientName("");
    setRecipientPhone("");
    setFundingSource('wallet');
  };

  const isStep1Valid = parseFloat(amount) > 0 && rateAvailable && !noLinkedSource && (
    fundingSource !== 'wallet' ||
    (selectedWallet && parseFloat(amount) <= Number(selectedWallet.balance))
  );
  const isStep2Valid = recipientName.length > 2 && recipientPhone.length > 8;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      
      <main className="container px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto space-y-6"
        >
          <div className="text-center">
            <h1 className="text-2xl font-display font-bold text-foreground">Send Money</h1>
            <p className="text-muted-foreground">Fast transfers to Africa</p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {step > s ? <CheckCircle className="w-4 h-4" /> : s}
                </div>
                {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Amount */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Enter Amount</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Funding Source Selection */}
                <div className="space-y-2">
                  <Label>Pay From</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant={fundingSource === 'wallet' ? 'default' : 'outline'}
                      className="flex flex-col items-center gap-1 h-auto py-3"
                      onClick={() => setFundingSource('wallet')}
                    >
                      <Wallet className="w-5 h-5" />
                      <span className="text-xs">Wallet</span>
                    </Button>
                    <Button
                      type="button"
                      variant={fundingSource === 'bank' ? 'default' : 'outline'}
                      className="flex flex-col items-center gap-1 h-auto py-3"
                      onClick={() => setFundingSource('bank')}
                    >
                      <Landmark className="w-5 h-5" />
                      <span className="text-xs">Bank</span>
                    </Button>
                    <Button
                      type="button"
                      variant={fundingSource === 'card' ? 'default' : 'outline'}
                      className="flex flex-col items-center gap-1 h-auto py-3"
                      onClick={() => setFundingSource('card')}
                    >
                      <CreditCard className="w-5 h-5" />
                      <span className="text-xs">Card</span>
                    </Button>
                  </div>
                </div>

                {/* Wallet Selection - only show when wallet is selected */}
                {fundingSource === 'wallet' && (
                  <div className="space-y-2">
                    <Label>From Wallet</Label>
                    <Select value={selectedWalletId || selectedWallet?.wallet_id} onValueChange={setSelectedWalletId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select wallet" />
                      </SelectTrigger>
                      <SelectContent>
                        {wallets?.map((w) => (
                          <SelectItem key={w.wallet_id} value={w.wallet_id}>
                            {w.flag_emoji} {w.currency_code} - {w.symbol}{Number(w.balance).toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Bank Account Selection */}
                {fundingSource === 'bank' && (
                  <div className="space-y-2">
                    <Label>From Bank Account</Label>
                    {bankSources.length > 0 ? (
                      <>
                        <Select value={selectedSourceId || bankSources[0]?.id} onValueChange={setSelectedSourceId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select bank account" />
                          </SelectTrigger>
                          <SelectContent>
                            {bankSources.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                🏦 {s.institution ? `${s.institution} ` : ''}{s.display_name} ••••{s.last_four}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Transfers from bank may take 1-2 business days</p>
                      </>
                    ) : (
                      <div className="flex items-start gap-2 p-3 rounded-lg border border-dashed border-border bg-muted/40">
                        <AlertCircle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        <p className="text-sm text-muted-foreground">No bank accounts linked yet. Link a bank in Settings to fund transfers from your bank.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Credit Card Selection */}
                {fundingSource === 'card' && (
                  <div className="space-y-2">
                    <Label>Pay with Card</Label>
                    <div className="p-3 rounded-lg border border-border bg-muted/40 space-y-2">
                      <p className="text-sm text-foreground">
                        Securely charge your card. Funds will be added to your {wallets?.[0]?.currency_code || 'wallet'} wallet, then sent.
                      </p>
                      <CardPaymentModal
                        title="Fund Transfer with Card"
                        defaultWalletId={wallets?.[0]?.wallet_id}
                        defaultAmount={parseFloat(amount) || undefined}
                      >
                        <Button type="button" variant="secondary" className="w-full" disabled={!(parseFloat(amount) > 0)}>
                          <CreditCard className="w-4 h-4 mr-2" />
                          {parseFloat(amount) > 0 ? `Pay ${sourceSymbol}${parseFloat(amount).toFixed(2)} with Card` : 'Enter an amount first'}
                        </Button>
                      </CardPaymentModal>
                      {cardFee > 0 && (
                        <p className="text-xs text-muted-foreground">+${cardFee.toFixed(2)} card processing fee applies</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>You Send</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
                      {sourceSymbol}
                    </span>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="pl-10 text-2xl h-14"
                    />
                  </div>
                  {fundingSource === 'wallet' && (
                    <p className="text-sm text-muted-foreground">
                      Available: {selectedWallet?.symbol}{Number(selectedWallet?.balance || 0).toFixed(2)}
                    </p>
                  )}
                </div>

                <div className="flex justify-center">
                  <div className="p-2 rounded-full bg-primary/20">
                    <ArrowRight className="w-5 h-5 text-primary rotate-90" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Destination</Label>
                  <Select value={targetCountryCode} onValueChange={setTargetCountryCode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {targetCountries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.flag} {c.country} ({c.method})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 rounded-xl bg-muted">
                  <p className="text-sm text-muted-foreground mb-1">They receive</p>
                  <p className="text-3xl font-display font-bold text-foreground">
                    {rateAvailable
                      ? `${receivedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${targetCountry.code}`
                      : 'Rate unavailable'}
                  </p>
                  {rateAvailable ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      Rate: 1 {sourceCurrency} = {effectiveRate.toFixed(2)} {targetCountry.code} • Fee: {sourceSymbol}{fee.toFixed(2)}
                      {fundingSource === 'card' && cardFee > 0 && <span className="text-xs"> (incl. {sourceSymbol}{cardFee.toFixed(2)} card fee)</span>}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">
                      No FX rate available for {sourceCurrency} → {targetCountry.code}. Please choose a different funding source or destination.
                    </p>
                  )}
                </div>

                <Button className="w-full" size="lg" onClick={() => setStep(2)} disabled={!isStep1Valid}>
                  Continue
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Recipient */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Recipient Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Recipient Name</Label>
                  <Input
                    placeholder="Full name as registered"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Mobile Money Number</Label>
                  <Input
                    placeholder="+254..."
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Funds will be sent via {targetCountry.method}
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                  <Button className="flex-1" onClick={handleSubmit} disabled={!isStep2Valid || createTransfer.isPending}>
                    {createTransfer.isPending ? 'Processing...' : 'Send Money'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <Card>
              <CardContent className="py-12 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
                >
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </motion.div>
                <h3 className="text-2xl font-display font-bold mb-2">Transfer Sent!</h3>
                <p className="text-muted-foreground mb-6">
                  {selectedWallet?.symbol}{amount} is on its way to {recipientName}
                </p>
                <Button onClick={resetForm}>Send Another</Button>
              </CardContent>
            </Card>
          )}

          {/* Features */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4">
              <Clock className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium">Instant Delivery</p>
            </div>
            <div className="text-center p-4">
              <Shield className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium">Secure Transfer</p>
            </div>
            <div className="text-center p-4">
              <Users className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium">24/7 Support</p>
            </div>
          </div>
        </motion.div>
      </main>

      <MobileNav />
    </div>
  );
};

export default SendPage;
