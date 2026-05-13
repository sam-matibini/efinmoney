import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
// Flutterwave V3 SDK removed — V4 uses hosted payment links via the
// flw-initialize-payment edge function.
import ContactsPickerModal from "@/components/modals/ContactsPickerModal";
import AddBeneficiaryModal from "@/components/modals/AddBeneficiaryModal";
import AddCardModal from "@/components/modals/AddCardModal";
import { useBeneficiaries, recordTransferRecipient, type Beneficiary } from "@/hooks/useBeneficiaries";
import { downloadTransferReceipt } from "@/lib/receipt";
import { useAuth } from "@/hooks/useAuth";

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
import { useSavedCards } from "@/hooks/useSavedCards";
import { usePricingConfig } from "@/hooks/usePricingConfig";
import { supabase } from "@/integrations/supabase/client";
import { friendlyFlwError, fetchFxRate, cardChargeCurrency, initializeFlwPayment } from "@/lib/flutterwave";
import { currencySymbol, countryToCurrency } from "@/lib/currency";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { ArrowRight, CheckCircle, Users, Clock, Shield, Wallet, Landmark, CreditCard, AlertCircle, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CanadaSendFlow from "@/components/send/CanadaSendFlow";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import AnimatedCheck from "@/components/ui/AnimatedCheck";
import ParticleBurst from "@/components/ui/ParticleBurst";
import CountryPicker from "@/components/ui/CountryPicker";
import { findCountryById, findCountryByCode, COUNTRIES } from "@/lib/countries";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type FundingSource = 'wallet' | 'bank' | 'card';

// Stagger helpers for form fields
const fieldVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] as any },
  }),
};

const SendPage = () => {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [fundingSource, setFundingSource] = useState<FundingSource>('card');
  const [amount, setAmount] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [targetCountryId, setTargetCountryId] = useState<string>("Kenya");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [lastTransferId, setLastTransferId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savePromptOpen, setSavePromptOpen] = useState(false);   // Yes/No confirm
  const [saveModalOpen, setSaveModalOpen] = useState(false);     // pre-filled Add modal
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [pickedBeneficiaryId, setPickedBeneficiaryId] = useState<string | null>(null);
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  // NGN bank payout state
  const [ngnBanks, setNgnBanks] = useState<Array<{ code: string; name: string }>>([]);
  const [ngnBankCode, setNgnBankCode] = useState<string>("");
  const [ngnAccountNumber, setNgnAccountNumber] = useState<string>("");
  const [ngnResolving, setNgnResolving] = useState(false);
  const [ngnResolvedName, setNgnResolvedName] = useState<string | null>(null);
  const [ngnResolveError, setNgnResolveError] = useState<string | null>(null);
  // V4: no public key needed
  const navigate = useNavigate();

  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: beneficiaries } = useBeneficiaries();

  const { data: wallets } = useWallets();
  const { data: fxRates } = useFxRates();
  const { data: linkedBankSources = [] } = useFundingSources('bank');
  const { data: cardSources = [] } = useFundingSources('card');
  const { data: savedCards = [] } = useSavedCards();
  const { data: pricing } = usePricingConfig();
  const { data: profile } = useProfile();
  const createTransfer = useCreateTransfer();
  const [selectedSavedCardId, setSelectedSavedCardId] = useState<string>("");
  const qc = useQueryClient();

  // Plaid-linked bank accounts (preferred path for ACH/EFT funding)
  const { data: plaidAccounts = [] } = useQuery({
    queryKey: ["plaid_accounts", user?.id],
    queryFn: async () => {
      if (!user) return [] as any[];
      const { data, error } = await supabase
        .from("plaid_accounts")
        .select("id,name,mask,subtype, plaid_items(institution_name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Normalize Plaid accounts into the same shape as linked_funding_sources for the picker
  const bankSources = useMemo(() => {
    const fromPlaid = (plaidAccounts as any[]).map((a) => ({
      id: a.id,
      user_id: user?.id || "",
      source_type: 'bank' as const,
      display_name: a.name || 'Bank account',
      institution: a.plaid_items?.institution_name || null,
      last_four: a.mask || '',
      currency_code: 'USD',
      is_active: true,
      created_at: '',
    }));
    return [...fromPlaid, ...linkedBankSources];
  }, [plaidAccounts, linkedBankSources, user?.id]);

  // Plaid Link: let users connect a bank right from /send if none exists
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [plaidLinking, setPlaidLinking] = useState(false);
  const startPlaidLink = useCallback(async () => {
    setPlaidLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("plaid-create-link-token");
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setPlaidLinkToken((data as any).link_token);
    } catch (e: any) {
      toast.error(e?.message || "Could not start bank link");
    } finally {
      setPlaidLinking(false);
    }
  }, []);
  const onPlaidSuccess = useCallback(async (public_token: string, metadata: any) => {
    try {
      const { data, error } = await supabase.functions.invoke("plaid-exchange-token", {
        body: { public_token, institution: metadata.institution },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Linked ${metadata.institution?.name || "bank"}`);
      qc.invalidateQueries({ queryKey: ["plaid_accounts", user?.id] });
    } catch (e: any) {
      toast.error(e?.message || "Could not link bank");
    }
  }, [qc, user?.id]);
  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: plaidLinkToken || "",
    onSuccess: onPlaidSuccess,
  });
  useEffect(() => {
    if (plaidLinkToken && plaidReady) openPlaid();
  }, [plaidLinkToken, plaidReady, openPlaid]);

  const selectedWallet = wallets?.find(w => w.wallet_id === selectedWalletId) || wallets?.[0];
  const targetCountry = findCountryById(targetCountryId) || COUNTRIES[0];

  const activeSources = fundingSource === 'bank' ? bankSources : fundingSource === 'card' ? cardSources : [];
  const selectedExternalSource = activeSources.find(s => s.id === selectedSourceId) || activeSources[0];

  const sourceCurrency = fundingSource === 'wallet'
    ? (selectedWallet?.currency_code || 'USD')
    : (selectedExternalSource?.currency_code || 'USD');
  const sourceSymbol = fundingSource === 'wallet'
    ? (selectedWallet?.symbol || '$')
    : (selectedExternalSource?.currency_code === 'CAD' ? 'C$' : '$');
  const targetSymbol = targetCountry.symbol || targetCountry.code;

  // Network picker (for countries that expose multiple mobile money networks, e.g. Zambia)
  const availableNetworks = targetCountry.networks;
  const activeNetwork = availableNetworks
    ? (availableNetworks.find(n => n.id === selectedNetworkId) || availableNetworks[0])
    : null;
  const effectivePayoutMethod = activeNetwork?.payout || targetCountry.payout;
  const effectiveMethodLabel = activeNetwork?.label || targetCountry.method;

  // Reset network selection when the destination country changes
  useEffect(() => {
    setSelectedNetworkId(null);
    setNgnBankCode("");
    setNgnAccountNumber("");
    setNgnResolvedName(null);
    setNgnResolveError(null);
  }, [targetCountryId]);

  const isNGNBank = targetCountry.code === "NGN";

  // Fetch Nigerian banks list when NGN destination is selected
  useEffect(() => {
    if (!isNGNBank || ngnBanks.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        // supabase-js .invoke() doesn't support GET query params, so call directly
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flw-get-banks?country=NG`;
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${session?.access_token || ""}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });
        const json = await res.json();
        if (cancelled) return;
        const list = Array.isArray(json?.banks)
          ? json.banks.map((b: any) => ({ code: String(b.code || b.bank_code), name: String(b.name || b.bank_name) })).filter((b: any) => b.code && b.name)
          : [];
        setNgnBanks(list);
      } catch (e) {
        console.error("Failed to load NG banks", e);
      }
    })();
    return () => { cancelled = true; };
  }, [isNGNBank, ngnBanks.length]);

  // Resolve account name when NGN bank + 10-digit account number are set
  useEffect(() => {
    if (!isNGNBank) return;
    setNgnResolvedName(null);
    setNgnResolveError(null);
    if (!ngnBankCode || ngnAccountNumber.replace(/\D/g, "").length !== 10) return;
    let cancelled = false;
    setNgnResolving(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("flw-resolve-account", {
          body: { bankCode: ngnBankCode, accountNumber: ngnAccountNumber.replace(/\D/g, "") },
        });
        if (cancelled) return;
        if (error) {
          setNgnResolveError("Could not verify account");
        } else if ((data as any)?.resolved) {
          const name = (data as any).account_name as string;
          setNgnResolvedName(name);
          setRecipientName(name);
        } else if ((data as any)?.unverified) {
          // Flutterwave verification temporarily unavailable — allow continue using typed name
          setNgnResolveError((data as any)?.error || "Name verification unavailable. Double-check the account number.");
          setNgnResolvedName(recipientName?.trim() ? recipientName.trim() : "Unverified recipient");
        } else {
          setNgnResolveError((data as any)?.error || "Could not verify account");
        }
      } catch (e: any) {
        if (!cancelled) setNgnResolveError(e?.message || "Could not verify account");
      } finally {
        if (!cancelled) setNgnResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNGNBank, ngnBankCode, ngnAccountNumber]);


  const fxRate = fxRates?.find(
    r => r.from_currency === sourceCurrency && r.to_currency === targetCountry.code
  );
  const effectiveRate = fxRate ? Number(fxRate.effective_rate) : 0;
  const rateAvailable = !!fxRate;

  const parsedAmount = Math.max(0, parseFloat(amount) || 0);
  const baseFee = pricing?.transfer_base_fee ?? 0;
  const cardFee = fundingSource === 'card' ? (pricing?.transfer_card_surcharge ?? 0) : 0;
  const fee = parsedAmount > 0 ? baseFee + cardFee : 0;
  const receivedAmount = parsedAmount > 0 && rateAvailable
    ? Math.max(0, (parsedAmount - fee) * effectiveRate)
    : 0;

  const noLinkedSource = fundingSource === 'bank' && activeSources.length === 0;
  const insufficientFunds = fundingSource === 'wallet'
    && !!selectedWallet
    && parsedAmount > 0
    && parsedAmount > Number(selectedWallet.balance);

  const goToStep = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  // For card payments we always charge in USD (or NGN for NGN wallets).
  const cardCurrency = cardChargeCurrency(sourceCurrency);

  // V4: no public-key bootstrap. Card payments use a hosted link via flw-initialize-payment.

  // Convert amount (in source currency) → USD when needed.
  useEffect(() => {
    let cancelled = false;
    if (fundingSource !== 'card') { setUsdRate(1); return; }
    if (sourceCurrency === cardCurrency) { setUsdRate(1); return; }
    fetchFxRate(sourceCurrency, cardCurrency).then((r) => {
      if (!cancelled) setUsdRate(r);
    });
    return () => { cancelled = true; };
  }, [fundingSource, sourceCurrency, cardCurrency]);

  const cardChargeAmount = useMemo(
    () => (usdRate ? Math.round(parsedAmount * usdRate * 100) / 100 : 0),
    [parsedAmount, usdRate]
  );

  const txRef = useMemo(
    () => (user ? `send-${user.id.slice(0, 8)}-${Date.now()}` : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step]
  );

  // Create transfer row + maybe save beneficiary. Returns id.
  const createTransferRecord = async (overrides?: { funding_source?: 'wallet' | 'card' | 'bank' }) => {
    const ngnAcct = isNGNBank ? ngnAccountNumber.replace(/\D/g, "") : "";
    const ngnBank = isNGNBank ? (ngnBanks.find((b) => b.code === ngnBankCode)?.name || null) : null;
    const transfer = await createTransfer.mutateAsync({
      sender_wallet_id: fundingSource === 'wallet' ? selectedWallet!.wallet_id : wallets?.[0]?.wallet_id || '',
      recipient_name: recipientName,
      recipient_phone: isNGNBank ? undefined : recipientPhone,
      recipient_account: isNGNBank ? ngnAcct : undefined,
      recipient_bank_code: isNGNBank ? ngnBankCode : undefined,
      recipient_bank_name: isNGNBank ? (ngnBank || undefined) : undefined,
      recipient_country: targetCountry.code,
      transfer_type: isNGNBank ? 'bank' : 'mobile_money',
      payout_method: isNGNBank ? 'bank' : effectivePayoutMethod,
      source_currency: sourceCurrency,
      target_currency: targetCountry.code,
      source_amount: parsedAmount,
      target_amount: receivedAmount,
      exchange_rate: effectiveRate,
      fee_amount: fee,
      funding_source: overrides?.funding_source ?? fundingSource,
    });
    setLastTransferId(transfer.id);
    if (user) {
      try {
        const { isNew } = await recordTransferRecipient({
          user_id: user.id,
          name: recipientName,
          phone: isNGNBank ? "" : recipientPhone,
          country_code: targetCountry.code,
          payout_method: isNGNBank ? 'bank' : effectivePayoutMethod,
          currency_code: targetCountry.code,
          bank_name: isNGNBank ? ngnBank : null,
          bank_account: isNGNBank ? ngnAcct : null,
        } as any);
        if (isNew && !pickedBeneficiaryId) setSavePromptOpen(true);
      } catch { /* non-fatal */ }
    }
    return transfer.id;
  };


  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);

    // ── Wallet: create + execute payout immediately ──────────────────────
    if (fundingSource === 'wallet') {
      if (!selectedWallet) { setConfirming(false); return; }
      try {
        const tid = await createTransferRecord();
        const { data, error } = await supabase.functions.invoke('execute-transfer', { body: { transfer_id: tid } });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || 'Payout failed');
        const payout = (data as any)?.payout;
        if (payout && payout.success === false) {
          throw new Error(payout.error || 'Payout failed');
        }
        goToStep(4);
        toast.success(payout?.queued ? 'Transfer queued — awaiting payout partner' : 'Transfer sent successfully!');
      } catch (e: any) {
        const raw = String(e?.message || '');
        const isUpstream =
          /\b50[234]\b/.test(raw) ||
          /timeout|timed out|gateway|unavailable|OriginTimeout|Azure Front Door/i.test(raw);
        if (isUpstream) {
          toast.error("Our payout partner is temporarily unavailable. Your wallet was not charged — please try again in a few minutes.", { duration: 8000 });
        } else {
          toast.error(raw || 'Transfer failed. Please try again.');
        }
      } finally {
        setConfirming(false);
      }
      return;
    }


    // ── Bank: queue as pending; debit takes 1-2 business days ────────────
    if (fundingSource === 'bank') {
      try {
        const tid = await createTransferRecord();
        await supabase.from('transfers').update({ status: 'processing' }).eq('id', tid);
        toast.success('Bank transfer initiated — funds will be debited within 1-2 business days');
        goToStep(4);
      } catch (e: any) {
        toast.error(e?.message || 'Could not initiate bank transfer');
      } finally {
        setConfirming(false);
      }
      return;
    }

    // ── Card: charge Stripe FIRST, then create transfer + payout ────────
    const pmId = selectedSavedCardId
      || savedCards.find(c => c.is_default)?.stripe_payment_method_id
      || savedCards[0]?.stripe_payment_method_id;
    if (!pmId) {
      toast.error("No saved cards. Go to Cards page to link a card first.");
      setConfirming(false);
      return;
    }

    // Step A: charge the card
    const totalCharge = Math.round((parsedAmount + fee) * 100) / 100;
    let chargeData: any;
    try {
      const { data, error: chargeErr } = await supabase.functions.invoke('stripe-charge-saved-card', {
        body: {
          payment_method_id: pmId,
          amount: totalCharge,
          currency: sourceCurrency,
          purpose: 'transfer_funding',
        },
      });
      // Non-2xx responses populate `error` (FunctionsHttpError) and leave `data` null.
      // Read the actual JSON body so we can surface Stripe's decline reason.
      if (chargeErr) {
        let serverMsg = chargeErr.message || 'Card charge failed';
        try {
          const ctx: any = (chargeErr as any).context;
          if (ctx?.json) serverMsg = ctx.json.error || serverMsg;
          else if (typeof ctx?.text === 'function') {
            const body = await ctx.text();
            try { serverMsg = JSON.parse(body)?.error || serverMsg; } catch { /* ignore */ }
          } else if (ctx instanceof Response) {
            const body = await ctx.clone().text();
            try { serverMsg = JSON.parse(body)?.error || serverMsg; } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
        throw new Error(serverMsg);
      }
      if (!(data as any)?.success) {
        const code = (data as any)?.code as string | undefined;
        const friendly: Record<string, string> = {
          insufficient_funds: "Your card has insufficient funds. Try another card or top up your bank account.",
          card_declined: "Your bank declined this charge. Contact your bank or try another card.",
          incorrect_number: "The card number is incorrect. Please re-link the card.",
          incorrect_cvc: "The card's security code is incorrect.",
          expired_card: "This card has expired. Please link a new one.",
          processing_error: "Your bank had a temporary issue. Please try again in a moment.",
          authentication_required: "Your bank requires extra authentication for this card. Try a different card.",
        };
        throw new Error(friendly[code ?? ""] || (data as any)?.error || 'Card charge failed');
      }
      chargeData = data;
    } catch (e: any) {
      toast.error(e?.message || 'Card payment failed. Please try another card.', { duration: 8000 });
      setConfirming(false);
      return;
    }

    // Step B: card succeeded → create transfer record (funding_source='card' bypasses wallet balance check)
    let tid: string;
    try {
      tid = await createTransferRecord({ funding_source: 'card' });
    } catch (e: any) {
      toast.error(`Payment received, but we could not create the transfer: ${e?.message || ''}. Funds remain in your wallet.`);
      setConfirming(false);
      return;
    }

    // Step C: trigger payout via Flutterwave
    try {
      const { data, error } = await supabase.functions.invoke('execute-transfer', { body: { transfer_id: tid } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || 'Payout failed');
      const payout = (data as any)?.payout;
      if (payout && payout.success === false) throw new Error(payout.error || 'Payout failed');
      goToStep(4);
      toast.success(payout?.queued ? 'Card charged — payout queued' : 'Transfer sent successfully!');
    } catch (e: any) {
      // Card already charged + wallet credited. Mark transfer processing — don't roll back.
      try {
        await supabase.from('transfers')
          .update({ status: 'processing', failure_reason: `Payout queued — ${String(e?.message ?? 'orchestration pending')}` })
          .eq('id', tid);
      } catch { /* ignore */ }
      toast.success('Payment received! Payout to recipient is being processed.', { duration: 8000 });
      goToStep(4);
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelTransfer = async () => {
    if (lastTransferId) {
      try { await supabase.from('transfers').update({ status: 'failed', failure_reason: 'Cancelled by user' }).eq('id', lastTransferId); } catch { /* ignore */ }
    }
    setCancelOpen(false);
    setLastTransferId(null);
    navigate('/');
  };

  const applyBeneficiary = (b: Beneficiary) => {
    setRecipientName(b.name);
    if (b.phone) setRecipientPhone(b.phone);
    if (b.country_code) {
      const c = findCountryByCode(b.country_code);
      if (c) setTargetCountryId(c.id);
    }
    setPickedBeneficiaryId(b.id);
    // Restore saved network choice (after country reset effect runs)
    setTimeout(() => {
      if (b.network) setSelectedNetworkId(b.network);
    }, 0);
  };

  useEffect(() => {
    const bid = searchParams.get("beneficiaryId");
    if (bid && beneficiaries) {
      const b = beneficiaries.find((x) => x.id === bid);
      if (b) {
        applyBeneficiary(b);
        goToStep(2);
        searchParams.delete("beneficiaryId");
        setSearchParams(searchParams, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beneficiaries]);

  const resetForm = () => {
    setDirection(-1);
    setStep(1);
    setAmount("");
    setRecipientName("");
    setRecipientPhone("");
    setFundingSource('wallet');
    setPickedBeneficiaryId(null);
  };

  const isStep1Valid = parsedAmount > 0 && parsedAmount > fee && receivedAmount > 0 && rateAvailable && !noLinkedSource && !insufficientFunds;
  const isStep2Valid = isNGNBank
    ? (!!ngnBankCode && ngnAccountNumber.replace(/\D/g, "").length === 10 && !!ngnResolvedName && receivedAmount > 0)
    : (recipientName.length > 2 && recipientPhone.length > 8 && !!effectivePayoutMethod && receivedAmount > 0);

  const activeTab = searchParams.get('mode') === 'canada' ? 'canada' : 'international';

  // Step transitions
  const stepVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  };

  const successWords = "Transfer Sent!".split("");

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />

      <main className="container px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header — slides down with fade */}
          <motion.div
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <h1 className="text-2xl font-display font-bold text-foreground">Send Money</h1>
            <p className="text-muted-foreground">Choose how you'd like to send</p>
          </motion.div>

          {/* Tabs — spring bounce in */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.15 }}
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                const next = new URLSearchParams(searchParams);
                if (v === 'canada') next.set('mode', 'canada'); else next.delete('mode');
                setSearchParams(next, { replace: true });
              }}
              className="w-full"
            >
              <TabsList className="relative grid w-full grid-cols-2 h-12 overflow-hidden">
                {/* Sliding pill */}
                <motion.div
                  className="absolute top-1 bottom-1 w-1/2 rounded-sm bg-background shadow-sm"
                  initial={false}
                  animate={{ left: activeTab === 'international' ? '0.25rem' : 'calc(50% + 0.25rem)' }}
                  style={{ width: 'calc(50% - 0.5rem)' }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
                <TabsTrigger value="international" className="relative z-10 gap-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  🌍 Send Internationally
                </TabsTrigger>
                <TabsTrigger value="canada" className="relative z-10 gap-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  🇨🇦 Domestic
                </TabsTrigger>
              </TabsList>

              {/* Animated tab content swap */}
              <div className="mt-6 relative">
                <AnimatePresence mode="wait" initial={false}>
                  {activeTab === 'canada' ? (
                    <motion.div
                      key="canada"
                      initial={{ x: 40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -40, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <TabsContent value="canada" forceMount className="mt-0">
                        <CanadaSendFlow />
                      </TabsContent>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="international"
                      initial={{ x: -40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: 40, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <TabsContent value="international" forceMount className="mt-0 space-y-6">
                        {/* Progress Steps — staggered entry + active pulse */}
                        <div className="flex items-center justify-center gap-2">
                          {[1, 2, 3].map((s, idx) => {
                            const completed = step > s;
                            const active = step === s;
                            return (
                              <div key={s} className="flex items-center">
                                <motion.div
                                  initial={{ opacity: 0, x: -16, scale: 0.6 }}
                                  animate={{
                                    opacity: 1,
                                    x: 0,
                                    scale: active ? [1, 1.3, 1] : 1,
                                    backgroundColor: completed || active
                                      ? "hsl(var(--primary))"
                                      : "hsl(var(--muted))",
                                  }}
                                  transition={{
                                    delay: idx * 0.1 + 0.3,
                                    scale: { duration: 0.5, ease: "easeOut" },
                                    backgroundColor: { duration: 0.3 },
                                  }}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                    completed || active ? 'text-primary-foreground' : 'text-muted-foreground'
                                  }`}
                                >
                                  <AnimatePresence mode="wait" initial={false}>
                                    {completed ? (
                                      <motion.span
                                        key="check"
                                        initial={{ scale: 0, rotate: -90 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        exit={{ scale: 0 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 16 }}
                                      >
                                        <CheckCircle className="w-4 h-4" />
                                      </motion.span>
                                    ) : (
                                      <motion.span key="num" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        {s}
                                      </motion.span>
                                    )}
                                  </AnimatePresence>
                                </motion.div>
                                {s < 3 && (
                                  <motion.div
                                    initial={{ scaleX: 0, opacity: 0 }}
                                    animate={{
                                      scaleX: 1,
                                      opacity: 1,
                                      backgroundColor: step > s ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                                    }}
                                    transition={{ delay: idx * 0.1 + 0.4, duration: 0.3 }}
                                    style={{ originX: 0 }}
                                    className="w-12 h-0.5"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Step cards with directional slide */}
                        <div className="relative">
                          <AnimatePresence mode="wait" custom={direction} initial={false}>
                            {step === 1 && (
                              <motion.div
                                key="step1"
                                custom={direction}
                                variants={stepVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                              >
                                <Card>
                                  <CardHeader>
                                    <CardTitle>Enter Amount</CardTitle>
                                  </CardHeader>
                                  <CardContent className="space-y-6">
                                    <motion.div custom={0} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                      <Label>Pay From</Label>
                                      <div className="grid grid-cols-3 gap-2">
                                        {([
                                          { v: 'wallet', icon: Wallet, label: 'Wallet' },
                                          { v: 'bank', icon: Landmark, label: 'Bank' },
                                          { v: 'card', icon: CreditCard, label: 'Card' },
                                        ] as const).map(({ v, icon: Icon, label }) => (
                                          <Button
                                            key={v}
                                            type="button"
                                            variant={fundingSource === v ? 'default' : 'outline'}
                                            className="flex flex-col items-center gap-1 h-auto py-3 transition-all hover:-translate-y-0.5"
                                            onClick={() => setFundingSource(v)}
                                          >
                                            <Icon className="w-5 h-5" />
                                            <span className="text-xs">{label}</span>
                                          </Button>
                                        ))}
                                      </div>
                                    </motion.div>

                                    {fundingSource === 'wallet' && (
                                      <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>From Wallet</Label>
                                        <Select value={selectedWalletId || selectedWallet?.wallet_id} onValueChange={setSelectedWalletId}>
                                          <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                                          <SelectContent>
                                            {wallets?.map((w) => (
                                              <SelectItem key={w.wallet_id} value={w.wallet_id}>
                                                {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </motion.div>
                                    )}

                                    {fundingSource === 'bank' && (
                                      <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>From Bank Account</Label>
                                        {bankSources.length > 0 ? (
                                          <>
                                            <Select value={selectedSourceId || bankSources[0]?.id} onValueChange={setSelectedSourceId}>
                                              <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
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
                                          <div className="space-y-2 p-3 rounded-lg border border-dashed border-border bg-muted/40">
                                            <div className="flex items-start gap-2">
                                              <AlertCircle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                                              <p className="text-sm text-muted-foreground">
                                                No bank accounts linked. Connect your bank to fund transfers via ACH/EFT.
                                              </p>
                                            </div>
                                            <Button type="button" size="sm" className="w-full" onClick={startPlaidLink} disabled={plaidLinking}>
                                              <Landmark className="w-4 h-4 mr-2" />
                                              {plaidLinking ? "Starting…" : "Link bank account"}
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setFundingSource('wallet')}>
                                              <Wallet className="w-4 h-4 mr-2" />
                                              Use wallet instead
                                            </Button>
                                          </div>
                                        )}
                                      </motion.div>
                                    )}

                                    {fundingSource === 'card' && (
                                      <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>Pay with saved card</Label>
                                        {savedCards.length === 0 ? (
                                          <div className="p-3 rounded-lg border border-dashed border-border bg-muted/40 space-y-2">
                                            <div className="flex items-start gap-2">
                                              <AlertCircle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                                              <p className="text-sm text-muted-foreground">No saved cards. Go to Cards page to link a card first.</p>
                                            </div>
                                            <div className="flex gap-2">
                                              <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={() => setAddCardOpen(true)}>
                                                <CreditCard className="w-4 h-4 mr-2" />Add a card
                                              </Button>
                                              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => navigate('/cards')}>
                                                Go to Cards <ArrowRight className="w-4 h-4 ml-1" />
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="space-y-2">
                                            {savedCards.map((c) => {
                                              const id = c.stripe_payment_method_id;
                                              const checked = (selectedSavedCardId ?? savedCards.find(x => x.is_default)?.stripe_payment_method_id ?? savedCards[0].stripe_payment_method_id) === id;
                                              return (
                                                <button
                                                  key={c.id}
                                                  type="button"
                                                  onClick={() => setSelectedSavedCardId(checked ? "" : id)}
                                                  className={`w-full text-left flex items-center gap-3 p-3 rounded-lg border transition ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
                                                >
                                                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium capitalize">{c.card_brand ?? 'Card'} •••• {c.last_four}</p>
                                                    <p className="text-xs text-muted-foreground">Exp {String(c.exp_month ?? '').padStart(2, '0')}/{String(c.exp_year ?? '').slice(-2)}</p>
                                                  </div>
                                                  {checked && <CheckCircle className="w-4 h-4 text-primary" />}
                                                </button>
                                              );
                                            })}
                                            <div className="flex items-center justify-between pt-1">
                                              <p className="text-xs text-muted-foreground">Card will be charged in {sourceCurrency}.</p>
                                              <Button type="button" variant="ghost" size="sm" className="h-auto py-1 px-2 text-xs" onClick={() => setAddCardOpen(true)}>
                                                <CreditCard className="w-3.5 h-3.5 mr-1" />Add another
                                              </Button>
                                            </div>
                                          </div>
                                        )}
                                      </motion.div>
                                    )}


                                    <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                      <Label>You Send</Label>
                                      <div className="relative group">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">{sourceSymbol}</span>
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          placeholder="0.00"
                                          value={amount}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === '' || parseFloat(v) >= 0) setAmount(v);
                                          }}
                                          className="pl-10 text-2xl h-14 transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
                                        />
                                      </div>
                                      {fundingSource === 'wallet' && selectedWallet && (
                                        <div className="flex items-center justify-between">
                                          <p className="text-sm text-muted-foreground">
                                            Available: {selectedWallet.symbol}{Number(selectedWallet.balance).toFixed(2)}
                                          </p>
                                          {insufficientFunds && (
                                            <motion.p
                                              initial={{ opacity: 0, x: -6 }}
                                              animate={{ opacity: 1, x: 0 }}
                                              className="text-sm font-medium text-destructive flex items-center gap-1"
                                            >
                                              <AlertCircle className="w-3.5 h-3.5" /> Insufficient balance
                                            </motion.p>
                                          )}
                                        </div>
                                      )}
                                    </motion.div>

                                    <motion.div custom={3} variants={fieldVariants} initial="hidden" animate="show" className="flex justify-center">
                                      <div className="p-2 rounded-full bg-primary/20">
                                        <ArrowRight className="w-5 h-5 text-primary rotate-90" />
                                      </div>
                                    </motion.div>

                                    <motion.div custom={4} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                      <Label>Destination</Label>
                                      <CountryPicker
                                        value={targetCountryId}
                                        onChange={(c) => setTargetCountryId(c.id)}
                                      />
                                    </motion.div>

                                    <motion.div
                                      custom={5}
                                      variants={fieldVariants}
                                      initial="hidden"
                                      animate="show"
                                      className="p-4 rounded-xl bg-muted relative overflow-hidden"
                                    >
                                      <p className="text-sm text-muted-foreground mb-1">They receive</p>
                                      <motion.p
                                        key={`${receivedAmount}-${targetSymbol}`}
                                        initial={{ scale: 0.96 }}
                                        animate={{ scale: [1.02, 1] }}
                                        transition={{ duration: 0.25 }}
                                        className="text-3xl font-display font-bold text-foreground"
                                      >
                                        {rateAvailable ? (
                                          <>
                                            <span>{targetSymbol} </span>
                                            <AnimatedNumber value={receivedAmount} duration={500} decimals={2} />
                                          </>
                                        ) : (
                                          'Rate unavailable'
                                        )}
                                      </motion.p>
                                      <AnimatePresence>
                                        {rateAvailable ? (
                                          <motion.p
                                            key="rate"
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.3 }}
                                            className="text-sm text-muted-foreground mt-2"
                                          >
                                            Rate: 1 {sourceCurrency} = {effectiveRate.toFixed(2)} {targetCountry.code} • Fee: {sourceSymbol}{fee.toFixed(2)}
                                            {fundingSource === 'card' && cardFee > 0 && <span className="text-xs"> (incl. {sourceSymbol}{cardFee.toFixed(2)} card fee)</span>}
                                          </motion.p>
                                        ) : (
                                          <p className="text-sm text-muted-foreground mt-2">
                                            No FX rate available for {sourceCurrency} → {targetCountry.code}. Please choose a different funding source or destination.
                                          </p>
                                        )}
                                      </AnimatePresence>
                                    </motion.div>

                                    <motion.div custom={6} variants={fieldVariants} initial="hidden" animate="show" className="space-y-3">
                                      <motion.div
                                        whileTap={{ scale: 0.97 }}
                                        animate={isStep1Valid ? { boxShadow: [
                                          "0 0 0 0 hsl(var(--primary) / 0)",
                                          "0 0 0 6px hsl(var(--primary) / 0.15)",
                                          "0 0 0 0 hsl(var(--primary) / 0)",
                                        ] } : { boxShadow: "0 0 0 0 hsl(var(--primary) / 0)" }}
                                        transition={isStep1Valid ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                                        className="rounded-md"
                                      >
                                        <Button
                                          className="w-full"
                                          size="lg"
                                          onClick={() => goToStep(2)}
                                          disabled={!isStep1Valid}
                                        >
                                          Continue
                                        </Button>
                                      </motion.div>
                                      <button
                                        type="button"
                                        onClick={() => navigate('/')}
                                        className="block mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                                      >
                                        Cancel
                                      </button>
                                    </motion.div>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            )}

                            {step === 2 && (
                              <motion.div
                                key="step2"
                                custom={direction}
                                variants={stepVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                              >
                                <Card>
                                  <CardHeader className="flex-row items-center justify-between space-y-0">
                                    <CardTitle>Recipient Details</CardTitle>
                                    <button
                                      type="button"
                                      onClick={() => navigate('/')}
                                      aria-label="Close and return to dashboard"
                                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    >
                                      <X className="w-5 h-5" />
                                    </button>
                                  </CardHeader>
                                  <CardContent className="space-y-6">
                                    <motion.div custom={0} variants={fieldVariants} initial="hidden" animate="show">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full gap-2"
                                        onClick={() => setPickerOpen(true)}
                                      >
                                        <Users className="w-4 h-4" /> 👤 Choose from saved contacts
                                      </Button>
                                    </motion.div>

                                    {pickedBeneficiaryId && (
                                      <motion.div
                                        initial={{ opacity: 0, y: -6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-center justify-between gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                      >
                                        <span className="inline-flex items-center gap-2 text-sm font-medium">
                                          <CheckCircle className="w-4 h-4" /> Contact selected ✓ — {recipientName}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => { setPickedBeneficiaryId(null); setRecipientName(""); setRecipientPhone(""); }}
                                          className="text-emerald-700/80 dark:text-emerald-300/80 hover:opacity-100 opacity-70"
                                          aria-label="Clear selected contact"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </motion.div>
                                    )}

                                    <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                      <Label>Recipient Name</Label>
                                      <Input
                                        placeholder="Full name as registered"
                                        value={recipientName}
                                        onChange={(e) => setRecipientName(e.target.value)}
                                        className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
                                      />
                                    </motion.div>
                                    {availableNetworks && availableNetworks.length > 1 && (
                                      <motion.div custom={1.5} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>Mobile Money Network</Label>
                                        <div className="grid grid-cols-3 gap-2">
                                          {availableNetworks.map((n) => {
                                            const active = (activeNetwork?.id === n.id);
                                            return (
                                              <button
                                                key={n.id}
                                                type="button"
                                                onClick={() => setSelectedNetworkId(n.id)}
                                                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                                                  active
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border bg-card hover:bg-muted text-foreground"
                                                }`}
                                              >
                                                {n.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </motion.div>
                                    )}
                                    {isNGNBank ? (
                                      <>
                                        <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                          <Label>Recipient Bank</Label>
                                          <Select value={ngnBankCode} onValueChange={setNgnBankCode}>
                                            <SelectTrigger>
                                              <SelectValue placeholder={ngnBanks.length ? "Select Nigerian bank" : "Loading banks..."} />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[300px]">
                                              {ngnBanks.map((b) => (
                                                <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </motion.div>
                                        <motion.div custom={2.5} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                          <Label>NUBAN Account Number</Label>
                                          <Input
                                            inputMode="numeric"
                                            maxLength={10}
                                            placeholder="10-digit account number"
                                            value={ngnAccountNumber}
                                            onChange={(e) => setNgnAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                                            className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
                                          />
                                          {ngnResolving && (
                                            <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
                                              <span className="h-3 w-3 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
                                              Verifying account…
                                            </p>
                                          )}
                                          {ngnResolvedName && !ngnResolving && (
                                            <p className="text-sm text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                                              <CheckCircle className="w-3.5 h-3.5" /> {ngnResolvedName}
                                            </p>
                                          )}
                                          {ngnResolveError && !ngnResolving && (
                                            <p className="text-sm text-destructive inline-flex items-center gap-1">
                                              <AlertCircle className="w-3.5 h-3.5" /> {ngnResolveError}
                                            </p>
                                          )}
                                          <p className="text-xs text-muted-foreground">Funds will be deposited directly to the bank account above.</p>
                                        </motion.div>
                                      </>
                                    ) : (
                                      <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>Mobile Money Number</Label>
                                        <Input
                                          placeholder="+254..."
                                          value={recipientPhone}
                                          onChange={(e) => setRecipientPhone(e.target.value)}
                                          className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
                                        />
                                        <p className="text-sm text-muted-foreground">
                                          Funds will be sent via {effectiveMethodLabel}
                                        </p>
                                      </motion.div>
                                    )}

                                    <motion.div custom={3} variants={fieldVariants} initial="hidden" animate="show" className="flex gap-3">
                                      <Button variant="outline" className="flex-1" onClick={() => goToStep(1)}>Back</Button>
                                      <motion.div
                                        whileTap={{ scale: 0.97 }}
                                        animate={isStep2Valid && !createTransfer.isPending ? { boxShadow: [
                                          "0 0 0 0 hsl(var(--primary) / 0)",
                                          "0 0 0 6px hsl(var(--primary) / 0.15)",
                                          "0 0 0 0 hsl(var(--primary) / 0)",
                                        ] } : { boxShadow: "0 0 0 0 hsl(var(--primary) / 0)" }}
                                        transition={isStep2Valid && !createTransfer.isPending ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                                        className="flex-1 rounded-md"
                                      >
                                        <Button className="w-full" onClick={() => goToStep(3)} disabled={!isStep2Valid}>
                                          Continue
                                        </Button>
                                      </motion.div>
                                    </motion.div>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            )}

                            {step === 3 && (
                              <motion.div
                                key="step3-review"
                                custom={direction}
                                variants={stepVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                              >
                                <Card>
                                  <CardHeader className="flex-row items-center justify-between space-y-0">
                                    <CardTitle>Review &amp; Confirm</CardTitle>
                                    <button
                                      type="button"
                                      onClick={() => setCancelOpen(true)}
                                      aria-label="Cancel transfer"
                                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    >
                                      <X className="w-5 h-5" />
                                    </button>
                                  </CardHeader>
                                  <CardContent className="space-y-5">
                                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm">
                                      <div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><span className="font-medium">{recipientName}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-medium">{recipientPhone}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Destination</span><span className="font-medium">{targetCountry.flag} {targetCountry.country}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span className="font-medium">{effectiveMethodLabel}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Funding</span><span className="font-medium capitalize">{fundingSource}</span></div>
                                    </div>
                                    <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
                                      <div className="flex justify-between"><span className="text-muted-foreground">You send</span><span className="font-medium">{sourceSymbol}{parsedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sourceCurrency}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-medium">{sourceSymbol}{fee.toFixed(2)}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span className="font-medium">1 {sourceCurrency} = {effectiveRate.toFixed(4)} {targetCountry.code}</span></div>
                                      <div className="flex justify-between text-base pt-2 border-t border-border"><span>They receive</span><span className="font-bold">{targetSymbol} {receivedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                      {fundingSource === 'card' && usdRate !== null && sourceCurrency !== cardCurrency && (
                                        <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border"><span>Card charge</span><span>{cardCurrency} {cardChargeAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                      )}
                                    </div>
                                    {fundingSource === 'bank' && (
                                      <p className="text-xs text-muted-foreground text-center">Bank transfer — funds will be debited within 1-2 business days.</p>
                                    )}
                                    {fundingSource === 'card' && (
                                      <p className="text-xs text-muted-foreground text-center">You'll be redirected to a secure card checkout in {cardCurrency}.</p>
                                    )}
                                    <div className="flex gap-3">
                                      <Button variant="outline" className="flex-1" onClick={() => goToStep(2)} disabled={confirming}>Back</Button>
                                      <Button className="flex-1" onClick={handleConfirm} disabled={confirming}>
                                        {confirming ? (
                                          <span className="inline-flex items-center gap-2">
                                            <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                                            Processing...
                                          </span>
                                        ) : fundingSource === 'card' ? 'Pay with Card' : 'Confirm Transfer'}
                                      </Button>
                                    </div>
                                    <Button
                                      variant="outline"
                                      className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => setCancelOpen(true)}
                                      disabled={confirming}
                                    >
                                      Cancel Transfer
                                    </Button>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            )}

                            {step === 4 && (
                              <motion.div
                                key="step4"
                                custom={direction}
                                variants={stepVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                              >
                                <Card>
                                  <CardContent className="py-12 text-center">
                                    <div className="relative w-24 h-24 mx-auto mb-6">
                                      <ParticleBurst count={20} />
                                      <div className="relative flex items-center justify-center">
                                        <AnimatedCheck size={88} />
                                      </div>
                                    </div>
                                    <h3 className="text-2xl font-display font-bold mb-2 inline-flex">
                                      {successWords.map((ch, i) => (
                                        <motion.span
                                          key={i}
                                          initial={{ opacity: 0, y: 14 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          transition={{ delay: 0.6 + i * 0.04, type: "spring", stiffness: 380, damping: 18 }}
                                          className="inline-block"
                                          style={{ whiteSpace: ch === ' ' ? 'pre' : undefined }}
                                        >
                                          {ch}
                                        </motion.span>
                                      ))}
                                    </h3>
                                    <motion.p
                                      initial={{ opacity: 0, y: 8 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: 1.1, duration: 0.35 }}
                                      className="text-muted-foreground mb-6"
                                    >
                                      {sourceSymbol}{parsedAmount.toFixed(2)} is on its way to {recipientName}
                                    </motion.p>
                                    <motion.div
                                      initial={{ opacity: 0, y: 16 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: 1.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                                      className="flex flex-col sm:flex-row gap-3 justify-center"
                                    >
                                      {lastTransferId && (
                                        <Button asChild>
                                          <Link to={`/transfers/${lastTransferId}`}>Track your transfer</Link>
                                        </Button>
                                      )}
                                      {lastTransferId && (
                                        <Button variant="outline" onClick={() => downloadTransferReceipt(lastTransferId)}>
                                          Download Receipt
                                        </Button>
                                      )}
                                      <Button variant="outline" onClick={resetForm}>Send Another</Button>
                                    </motion.div>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Features */}
                        <motion.div
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.5, duration: 0.4 }}
                          className="grid grid-cols-3 gap-4"
                        >
                          {[
                            { Icon: Clock, label: 'Instant Delivery' },
                            { Icon: Shield, label: 'Secure Transfer' },
                            { Icon: Users, label: '24/7 Support' },
                          ].map(({ Icon, label }, i) => (
                            <motion.div
                              key={label}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.55 + i * 0.08, duration: 0.3 }}
                              whileHover={{ y: -3 }}
                              className="text-center p-4"
                            >
                              <Icon className="w-8 h-8 mx-auto mb-2 text-primary" />
                              <p className="text-sm font-medium">{label}</p>
                            </motion.div>
                          ))}
                        </motion.div>
                      </TabsContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Tabs>
          </motion.div>
        </div>
      </main>

      <ContactsPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={applyBeneficiary}
      />

      <AlertDialog open={savePromptOpen} onOpenChange={setSavePromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>💾 Save {recipientName || "this recipient"} as a contact?</AlertDialogTitle>
            <AlertDialogDescription>
              Save them for faster sending next time — no need to re-enter their details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, thanks</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setSavePromptOpen(false); setSaveModalOpen(true); }}>
              Yes, save contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to cancel this transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              {lastTransferId
                ? "The transfer will be marked as cancelled and you'll be returned to the dashboard."
                : "You'll be returned to the dashboard. Your recipient details will be cleared."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, keep going</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelTransfer} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddBeneficiaryModal
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        editing={{
          id: "",
          user_id: "",
          name: recipientName,
          phone: recipientPhone,
          country_code: targetCountry.code,
          payout_method: effectivePayoutMethod,
          network: activeNetwork?.id || null,
          bank_name: null,
          bank_account: null,
          currency_code: targetCountry.code,
          nickname: null,
          avatar_initials: null,
          transfer_count: 0,
          last_sent_at: null,
          created_at: "",
          updated_at: "",
        } as any}
      />
      <AddCardModal isOpen={addCardOpen} onClose={() => setAddCardOpen(false)} defaultMode="link" />
      <MobileNav />
    </div>
  );
};

export default SendPage;
