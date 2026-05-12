import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Check, ChevronsUpDown, LoaderCircle, Smartphone } from "lucide-react";
import { useFlutterwave, closePaymentModal } from "flutterwave-react-v3";
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
import { MOBILE_MONEY_CURRENCY, fetchFxRate, friendlyFlwError, validateMinAmount } from "@/lib/flutterwave";
import { MM_COUNTRIES, POPULAR_MM_CODES, findCountry } from "@/lib/mobileMoneyNetworks";

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

  const { data: wallets } = useWallets();
  const { user } = useAuth();
  const createTransfer = useCreateTransfer();

  const country = findCountry(countryCode) || MM_COUNTRIES[0];
  const network = country.networks.find((n) => n.value === networkValue) || country.networks[0];
  const wallet = wallets?.find((w) => w.wallet_id === walletId) || wallets?.[0];

  const flutterwavePublicKey =
    import.meta.env.VITE_FLW_PUBLIC_KEY?.trim() ||
    "FLWPUBK_TEST-b6b1a9a088a3bae587f81e8faccffb26-X";

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

  const handleFlutterPayment = useFlutterwave({
    public_key: flutterwavePublicKey,
    tx_ref: txRef,
    amount: chargeAmount,
    currency: chargeCurrency,
    payment_options:
      "mobilemoneyfranco,mobilemoneyghana,mobilemoneykenya,mobilemoneyrwanda,mobilemoneytanzania,mobilemoneyuganda,mobilemoneyzambia,mobilemoney",
    customer: {
      email: user?.email || `${user?.id || "guest"}@efin.money`,
      phone_number: phone.trim(),
      name: recipientName.trim() || "eFinMoney user",
    },
    customizations: {
      title: "eFinMoney",
      description: `Mobile money to ${recipientName.trim() || "recipient"}`,
      logo: typeof window !== "undefined" ? `${window.location.origin}/favicon.ico` : "",
    },
    meta: {
      country: country.code,
      network: network.value,
      wallet_id: wallet?.wallet_id || "",
      wallet_currency: walletCurrency,
      charge_currency: chargeCurrency,
    },
  });

  const resetForm = () => {
    setPhone("");
    setRecipientName("");
    setAmount("");
    setWalletId("");
  };

  const handlePay = async () => {
    const result = schema.safeParse({ phone, amount: parsedAmount, recipientName });
    if (!result.success) return toast.error(result.error.issues[0].message);
    if (!wallet) return toast.error("Select a source wallet");
    if (Number(wallet.balance) <= 0)
      return toast.error(`Insufficient ${wallet.currency_code} wallet balance. Please deposit funds first.`);
    if (Number(wallet.balance) < result.data.amount)
      return toast.error(`Insufficient wallet balance. Available: ${wallet.symbol}${Number(wallet.balance).toLocaleString()}`);
    if (!user) return toast.error("Please sign in to continue");
    if (!flutterwavePublicKey) return toast.error("Flutterwave public key is missing");
    if (fxRate === null)
      return toast.error(`No exchange rate available for ${walletCurrency} → ${chargeCurrency}. Please try a different wallet.`);
    const minErr = validateMinAmount(chargeCurrency, chargeAmount);
    if (minErr) return toast.error(minErr);

    setIsLoading(true);
    let transferId: string | null = null;
    try {
      const transfer = await createTransfer.mutateAsync({
        sender_wallet_id: wallet.wallet_id,
        recipient_name: recipientName.trim(),
        recipient_phone: phone.trim(),
        recipient_country: country.code,
        transfer_type: "mobile_money",
        payout_method: network.value,
        source_currency: walletCurrency,
        target_currency: chargeCurrency,
        source_amount: result.data.amount,
        target_amount: chargeAmount,
        exchange_rate: fxRate,
        fee_amount: 0,
      });
      transferId = transfer.id;
    } catch (e) {
      setIsLoading(false);
      return toast.error(getErrorMessage(e, "Failed to create transfer"));
    }

    const tId = transferId!;
    try {
      handleFlutterPayment({
        callback: async (response) => {
          try {
            const status = String(response.status || "").toLowerCase();
            const success = ["successful", "completed", "success"].includes(status);
            const updatePayload = success
              ? {
                  status: "completed" as const,
                  provider_reference: response.flw_ref || String(response.transaction_id || txRef),
                  failure_reason: null,
                  completed_at: new Date().toISOString(),
                }
              : {
                  status: "failed" as const,
                  provider_reference: response.flw_ref || null,
                  failure_reason: response.status || "Checkout failed",
                };
            await supabase.from("transfers").update(updatePayload).eq("id", tId).eq("sender_id", user.id);
            await supabase.from("notifications").insert({
              user_id: user.id,
              title: success ? "Transfer completed" : "Transfer failed",
              message: success
                ? `Your ${wallet.currency_code} ${parsedAmount} transfer to ${recipientName.trim()} is complete.`
                : response.status || "Flutterwave could not complete this transfer.",
              type: success ? "transfer" : "error",
            });
            if (success) {
              toast.success("Transfer completed");
              setOpen(false);
              resetForm();
            } else {
              toast.error(response.status || "Transfer was not completed");
            }
          } catch (err) {
            toast.error(getErrorMessage(err, "Unable to update transfer"));
          } finally {
            closePaymentModal();
            setIsLoading(false);
          }
        },
        onClose: async () => {
          try {
            await supabase
              .from("transfers")
              .update({ status: "failed", failure_reason: "User closed payment without paying" })
              .eq("id", tId)
              .eq("sender_id", user.id)
              .eq("status", "initiated");
          } catch {
            // ignore
          }
          setIsLoading(false);
        },
      });
    } catch (e) {
      setIsLoading(false);
      toast.error(friendlyFlwError(e, chargeCurrency));
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
            <Label htmlFor="mm-name">Recipient name</Label>
            <Input id="mm-name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={100} />
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
          <Button className="w-full" onClick={handlePay} disabled={createTransfer.isPending || isLoading}>
            {createTransfer.isPending || isLoading ? (
              <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Preparing…</>
            ) : (
              "Pay with Flutterwave"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MobileMoneyModal;
