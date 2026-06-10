import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Check, ChevronsUpDown, LoaderCircle, Smartphone, Wallet, CreditCard, Landmark, AlertCircle, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MOBILE_MONEY_CURRENCY, fetchFxRate, friendlyFlwError, initializeFlwPayment, validateMinAmount } from "@/lib/flutterwave";
import { MM_COUNTRIES, POPULAR_MM_CODES, findCountry } from "@/lib/mobileMoneyNetworks";
import { Checkbox } from "@/components/ui/checkbox";
import { useBeneficiaries, useCreateBeneficiary, initialsOf, type Beneficiary } from "@/hooks/useBeneficiaries";
import { useSavedCards } from "@/hooks/useSavedCards";
import ContactsPickerModal from "@/components/modals/ContactsPickerModal";
import { Users, UserPlus } from "lucide-react";

type FundingSource = 'wallet' | 'card' | 'bank' | 'flutterwave';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const c = error as { message?: string; error_description?: string; details?: string; hint?: string };
    return c.message || c.error_description || c.details || c.hint || fallback;
  }
  return fallback;
};

interface MobileMoneyModalProps {
  children: React.ReactNode;
}

const schema = z.object({
  phone: z.string().trim().min(7, "Phone number is too short").max(20, "Phone number is too long"),
  amount: z.number().positive("Amount must be greater than 0").max(10_000_000, "Amount is too large"),
  recipientName: z.string().trim().min(1, "Recipient name is required").max(100),
});

const popular = MM_COUNTRIES.filter((c) => POPULAR_MM_CODES.includes(c.code))
  .sort((a, b) => POPULAR_MM_CODES.indexOf(a.code) - POPULAR_MM_CODES.indexOf(b.code));
const others = MM_COUNTRIES.filter((c) => !POPULAR_MM_CODES.includes(c.code))
  .sort((a, b) => a.name.localeCompare(b.name));

const MobileMoneyModal = ({ children }: MobileMoneyModalProps) => {
  const [open, setOpen] = useState(false);
  const [countryCode, setCountryCode] = useState<string>("NG");
  const [networkValue, setNetworkValue] = useState<string>(MM_COUNTRIES[0].networks[0].value);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  const [phone, setPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [saveContact, setSaveContact] = useState(true);
  const [pickedBeneficiaryId, setPickedBeneficiaryId] = useState<string | null>(null);
  const [fundingSource, setFundingSource] = useState<FundingSource>('wallet');
  const [selectedCardId, setSelectedCardId] = useState<string>("");

  const navigate = useNavigate();
  const { data: wallets } = useWallets();
  const { data: contacts } = useBeneficiaries();
  const { data: savedCards = [] } = useSavedCards();
  const { user } = useAuth();
  const createTransfer = useCreateTransfer();
  const createBeneficiary = useCreateBeneficiary();

  const country = findCountry(countryCode) || MM_COUNTRIES[0];
  const network = country.networks.find((n) => n.value === networkValue) || country.networks[0];
  const wallet = wallets?.find((w) => w.wallet_id === walletId) || wallets?.[0];

  const chargeCurrency = MOBILE_MONEY_CURRENCY[country.code] || country.currency;
  const walletCurrency = wallet?.currency_code || "USD";

  // Reset network when country changes (if current isn't valid)
  useEffect(() => {
    if (!country.networks.some((n) => n.value === networkValue)) {
      setNetworkValue(country.networks[0].value);
    }
  }, [countryCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-prefix phone with the dial code
  useEffect(() => {
    setPhone((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return country.dialCode + " ";
      // Replace any existing leading dial code from MM_COUNTRIES with the new one
      const stripped = trimmed.replace(/^\+\d{1,4}\s*/, "");
      return `${country.dialCode} ${stripped}`.trim();
    });
  }, [countryCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const txRef = useMemo(
    () => (user ? `mm-${user.id.slice(0, 8)}-${Date.now()}` : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );

  const parsedAmount = parseFloat(amount) || 0;

  useEffect(() => {
    let cancelled = false;
    if (!wallet) { setFxRate(null); return; }
    if (walletCurrency === chargeCurrency) { setFxRate(1); return; }
    fetchFxRate(walletCurrency, chargeCurrency).then((r) => {
      if (!cancelled) setFxRate(r);
    });
    return () => { cancelled = true; };
  }, [walletCurrency, chargeCurrency, wallet]);

  const chargeAmount = fxRate ? Math.round(parsedAmount * fxRate * 100) / 100 : 0;

  const resetForm = () => {
    setPhone("");
    setRecipientName("");
    setAmount("");
    setWalletId("");
    setPickedBeneficiaryId(null);
  };

  const handlePickContact = (b: Beneficiary) => {
    setPickedBeneficiaryId(b.id);
    setRecipientName(b.name);
    if (b.country_code && findCountry(b.country_code)) {
      setCountryCode(b.country_code);
      const c = findCountry(b.country_code)!;
      // Try to match network
      const matched = c.networks.find((n) => n.value === (b.network || b.payout_method));
      setNetworkValue(matched?.value || c.networks[0].value);
    }
    if (b.phone) setPhone(b.phone);
    setSaveContact(false);
  };

  const maybeSaveContact = async () => {
    if (!saveContact || pickedBeneficiaryId) return;
    try {
      const exists = (contacts || []).some(
        (c) => (c.phone || "").trim() === phone.trim() ||
               c.name.trim().toLowerCase() === recipientName.trim().toLowerCase()
      );
      if (!exists) {
        await createBeneficiary.mutateAsync({
          name: recipientName.trim(),
          phone: phone.trim(),
          country_code: country.code,
          payout_method: "mobile_money",
          network: network.value,
          currency_code: chargeCurrency,
          avatar_initials: initialsOf(recipientName.trim()),
        });
      }
    } catch { /* non-fatal */ }
  };

  const buildTransferPayload = (fs: 'wallet' | 'card' | 'bank') => ({
    sender_wallet_id: wallet!.wallet_id,
    recipient_name: recipientName.trim(),
    recipient_phone: phone.trim(),
    recipient_country: country.code,
    transfer_type: "mobile_money" as const,
    payout_method: network.value,
    source_currency: walletCurrency,
    target_currency: chargeCurrency,
    source_amount: parsedAmount,
    target_amount: chargeAmount,
    exchange_rate: fxRate!,
    fee_amount: 0,
    funding_source: fs,
  });

  const handlePay = async () => {
    const result = schema.safeParse({ phone, amount: parsedAmount, recipientName });
    if (!result.success) return toast.error(result.error.issues[0].message);
    if (!wallet) return toast.error("Select a source wallet");
    if (!user) return toast.error("Please sign in to continue");
    if (fxRate === null)
      return toast.error(`No exchange rate available for ${walletCurrency} → ${chargeCurrency}. Please try a different wallet.`);
    const minErr = validateMinAmount(chargeCurrency, chargeAmount);
    if (minErr) return toast.error(minErr);

    setIsLoading(true);

    // ── WALLET: create + execute payout ────────────────────────────────
    if (fundingSource === 'wallet') {
      try {
        const transfer = await createTransfer.mutateAsync(buildTransferPayload('wallet') as any);
        const { data, error } = await supabase.functions.invoke('execute-transfer', { body: { transfer_id: transfer.id } });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || 'Payout failed');
        const payout = (data as any)?.payout;
        if (payout && payout.success === false) throw new Error(payout.error || 'Payout failed');
        await maybeSaveContact();
        toast.success(payout?.queued ? 'Transfer queued — awaiting payout partner' : 'Transfer sent!');
        setOpen(false);
        resetForm();
      } catch (e) {
        toast.error(getErrorMessage(e, 'Transfer failed'));
      } finally { setIsLoading(false); }
      return;
    }

    // ── CARD: charge Stripe → create transfer → payout ─────────────────
    if (fundingSource === 'card') {
      const pmId = selectedCardId
        || savedCards.find(c => c.is_default)?.stripe_payment_method_id
        || savedCards[0]?.stripe_payment_method_id;
      if (!pmId) {
        toast.error('No saved cards. Add a card on the Cards page.');
        setIsLoading(false);
        return;
      }
      try {
        const { data: charge, error: chErr } = await supabase.functions.invoke('stripe-charge-saved-card', {
          body: { payment_method_id: pmId, amount: parsedAmount, currency: walletCurrency, purpose: 'transfer_funding' },
        });
        if (chErr || !(charge as any)?.success) {
          throw new Error((charge as any)?.error || chErr?.message || 'Card charge failed');
        }
        const transfer = await createTransfer.mutateAsync(buildTransferPayload('card') as any);
        const { data, error } = await supabase.functions.invoke('execute-transfer', { body: { transfer_id: transfer.id } });
        if (error || (data as any)?.error) {
          await supabase.from('transfers').update({ status: 'processing', failure_reason: 'Payout queued' }).eq('id', transfer.id);
          await maybeSaveContact();
          toast.success('Card charged — payout is being processed.');
        } else {
          await maybeSaveContact();
          toast.success('Card charged — transfer sent!');
        }
        setOpen(false);
        resetForm();
      } catch (e) {
        toast.error(getErrorMessage(e, 'Card payment failed'));
      } finally { setIsLoading(false); }
      return;
    }

    // ── BANK (ACH/EFT): queue as processing ────────────────────────────
    if (fundingSource === 'bank') {
      try {
        const transfer = await createTransfer.mutateAsync(buildTransferPayload('bank') as any);
        await supabase.from('transfers').update({ status: 'processing' }).eq('id', transfer.id);
        await maybeSaveContact();
        toast.success('Bank transfer initiated — funds will be debited within 1-2 business days');
        setOpen(false);
        resetForm();
      } catch (e) {
        toast.error(getErrorMessage(e, 'Could not initiate bank transfer'));
      } finally { setIsLoading(false); }
      return;
    }

    // ── FLUTTERWAVE HOSTED CHECKOUT (legacy fallback) ──────────────────
    let transferId: string | null = null;
    try {
      const transfer = await createTransfer.mutateAsync(buildTransferPayload('wallet') as any);
      transferId = transfer.id;
    } catch (e) {
      setIsLoading(false);
      return toast.error(getErrorMessage(e, "Failed to create transfer"));
    }
    const tId = transferId!;
    try {
      const callbackUrl = typeof window !== "undefined"
        ? `${window.location.origin}/payment-callback?transfer_id=${tId}`
        : "";
      const result2 = await initializeFlwPayment({
        amount: chargeAmount, currency: chargeCurrency, paymentMethod: "mobilemoney",
        phone: phone.trim(), network: network.value, country: country.code, redirectUrl: callbackUrl,
      });
      await supabase.from("transfers").update({
        status: "processing",
        provider_reference: result2.charge_id ? String(result2.charge_id) : result2.reference,
      }).eq("id", tId).eq("sender_id", user.id);
      await maybeSaveContact();
      if (!result2.payment_link) throw new Error("No payment link returned");
      try { sessionStorage.setItem("pending_transfer_id", tId); } catch { /* ignore */ }
      toast.success("Redirecting to Flutterwave…");
      window.location.href = result2.payment_link;
    } catch (e) {
      try {
        await supabase.from("transfers")
          .update({ status: "failed", failure_reason: getErrorMessage(e, "Mobile money charge failed") })
          .eq("id", tId).eq("sender_id", user.id);
      } catch { /* ignore */ }
      toast.error(friendlyFlwError(e, chargeCurrency));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Send Mobile Money
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Country */}
          <div>
            <Label>1. Select country</Label>
            <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-lg leading-none">{country.flag}</span>
                    <span>{country.name}</span>
                    <span className="text-muted-foreground text-xs">({country.currency})</span>
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command
                  filter={(value, search) => {
                    // value contains code|name|networks; search across all
                    if (!search) return 1;
                    return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder="Search country or network…" />
                  <CommandList>
                    <CommandEmpty>No country found.</CommandEmpty>
                    <CommandGroup heading="Popular">
                      {popular.map((c) => (
                        <CommandItem
                          key={c.code}
                          value={`${c.code}|${c.name}|${c.networks.map((n) => n.label).join(",")}`}
                          onSelect={() => {
                            setCountryCode(c.code);
                            setCountryPickerOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", countryCode === c.code ? "opacity-100" : "opacity-0")} />
                          <span className="mr-2 text-lg">{c.flag}</span>
                          <span>{c.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{c.currency}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="All countries">
                      {others.map((c) => (
                        <CommandItem
                          key={c.code}
                          value={`${c.code}|${c.name}|${c.networks.map((n) => n.label).join(",")}`}
                          onSelect={() => {
                            setCountryCode(c.code);
                            setCountryPickerOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", countryCode === c.code ? "opacity-100" : "opacity-0")} />
                          <span className="mr-2 text-lg">{c.flag}</span>
                          <span>{c.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{c.currency}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Step 2: Network */}
          <div>
            <Label htmlFor="mm-network">2. Select network</Label>
            <Select value={networkValue} onValueChange={setNetworkValue}>
              <SelectTrigger id="mm-network"><SelectValue /></SelectTrigger>
              <SelectContent>
                {country.networks.map((n) => (
                  <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-3">
            <span className="text-3xl leading-none">{country.flag}</span>
            <div className="text-sm">
              <div className="font-medium">{country.name} — {network.label}</div>
              <div className="text-xs text-muted-foreground">Charged in {chargeCurrency}</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="mm-name">Recipient name</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setContactsOpen(true)}
              >
                <Users className="w-3.5 h-3.5" />
                {(contacts || []).length > 0 ? `Choose contact (${(contacts || []).length})` : "Choose contact"}
              </Button>
            </div>
            <Input
              id="mm-name"
              value={recipientName}
              onChange={(e) => { setRecipientName(e.target.value); setPickedBeneficiaryId(null); }}
              maxLength={100}
              placeholder="e.g. Amina Mwangi"
            />
            {pickedBeneficiaryId && (
              <p className="text-xs text-muted-foreground mt-1">From your saved contacts</p>
            )}
          </div>

          <div>
            <Label htmlFor="mm-phone">Phone number</Label>
            <Input
              id="mm-phone"
              type="tel"
              placeholder={`${country.dialCode} 712 345 678`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={24}
            />
          </div>
          {/* Funding source selector */}
          <div>
            <Label>Pay with</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {([
                { v: 'wallet', icon: Wallet, label: 'Wallet' },
                { v: 'card', icon: CreditCard, label: 'Card' },
                { v: 'bank', icon: Landmark, label: 'Bank' },
              ] as const).map(({ v, icon: Icon, label }) => (
                <Button
                  key={v}
                  type="button"
                  variant={fundingSource === v ? 'default' : 'outline'}
                  className="flex flex-col items-center gap-1 h-auto py-2.5 transition-all hover:-translate-y-0.5"
                  onClick={() => setFundingSource(v)}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs">{label}</span>
                </Button>
              ))}
            </div>
          </div>

          {fundingSource === 'wallet' && (
            <div>
              <Label htmlFor="mm-wallet">From wallet</Label>
              <Select value={walletId || wallet?.wallet_id || ""} onValueChange={setWalletId}>
                <SelectTrigger id="mm-wallet"><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent>
                  {(wallets || []).map((w) => (
                    <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {fundingSource === 'card' && (
            <div>
              <Label>Saved card</Label>
              {savedCards.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-border bg-muted/40 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground">No saved cards yet.</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => { setOpen(false); navigate('/cards'); }}>
                    Go to Cards <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              ) : (
                <Select
                  value={selectedCardId || savedCards.find(c => c.is_default)?.stripe_payment_method_id || savedCards[0].stripe_payment_method_id}
                  onValueChange={setSelectedCardId}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {savedCards.map((c) => (
                      <SelectItem key={c.id} value={c.stripe_payment_method_id}>
                        {(c.card_brand || 'Card')} •••• {c.last_four} {c.is_default ? '· default' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground mt-1.5">Card charged in {walletCurrency}; funds routed via your wallet.</p>
            </div>
          )}

          {fundingSource === 'bank' && (
            <div className="p-3 rounded-lg border border-dashed border-border bg-muted/40 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Bank transfers (ACH/EFT) settle in 1-2 business days. Link or pick a bank on the full Send page.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => { setOpen(false); navigate('/send'); }}>
                Open Send page <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          <div>
            <Label htmlFor="mm-amount">Amount ({walletCurrency})</Label>
            <Input id="mm-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {parsedAmount > 0 && fxRate !== null && walletCurrency !== chargeCurrency && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">You pay</span><span className="font-medium">{walletCurrency} {parsedAmount.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Recipient gets</span><span className="font-medium">{chargeCurrency} {chargeAmount.toLocaleString()}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Rate</span><span>1 {walletCurrency} = {fxRate.toFixed(4)} {chargeCurrency}</span></div>
            </div>
          )}
          {parsedAmount > 0 && fxRate === null && walletCurrency !== chargeCurrency && (
            <p className="text-xs text-destructive">No FX rate available for {walletCurrency} → {chargeCurrency}.</p>
          )}
          {!pickedBeneficiaryId && recipientName.trim() && phone.trim() && (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox
                checked={saveContact}
                onCheckedChange={(v) => setSaveContact(v === true)}
              />
              <span className="flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-muted-foreground" />
                Save {recipientName.trim()} to my contacts
              </span>
            </label>
          )}
          <Button
            className="w-full"
            onClick={handlePay}
            disabled={createTransfer.isPending || isLoading || (fundingSource === 'card' && savedCards.length === 0)}
          >
            {createTransfer.isPending || isLoading ? (
              <><LoadingSpinner size={16} className="mr-2" />Processing…</>
            ) : fundingSource === 'wallet' ? (
              "Send from wallet"
            ) : fundingSource === 'card' ? (
              "Charge card & send"
            ) : (
              "Initiate bank transfer"
            )}
          </Button>
          <button
            type="button"
            className="w-full text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            onClick={() => { setFundingSource('flutterwave'); setTimeout(handlePay, 0); }}
          >
            Or pay directly on Flutterwave's page →
          </button>
        </div>
        <ContactsPickerModal
          open={contactsOpen}
          onOpenChange={setContactsOpen}
          onSelect={handlePickContact}
        />
      </DialogContent>
    </Dialog>
  );
};

export default MobileMoneyModal;
