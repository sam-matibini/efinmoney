import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
// Flutterwave V3 SDK removed — V4 uses hosted payment links via the
// flw-initialize-payment edge function.
import ContactsPickerModal from "@/components/modals/ContactsPickerModal";
import AddBeneficiaryModal from "@/components/modals/AddBeneficiaryModal";
import AddCardModal from "@/components/modals/AddCardModal";
import TopUpModal from "@/components/modals/TopUpModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBeneficiaries, recordTransferRecipient, type Beneficiary } from "@/hooks/useBeneficiaries";
import { useAuth } from "@/hooks/useAuth";

import BackToDashboard from "@/components/layout/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useWallets } from "@/hooks/useWallets";
import { useWalletCards } from "@/hooks/useWalletCards";
import { useCards } from "@/hooks/useCards";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFxRates } from "@/hooks/useFxRates";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { useFundingSources } from "@/hooks/useFundingSources";
import { useSavedCards } from "@/hooks/useSavedCards";
import { usePricingConfig } from "@/hooks/usePricingConfig";
import { supabase } from "@/integrations/supabase/client";
import { fetchFxRate, cardChargeCurrency, initializeFlwPayment } from "@/lib/flutterwave";
import {
  getNigeriaBanks,
  resolveNigeriaAccount,
  getNombaExchangeRate,
  previewNigeriaConversion,
  isNgnPair,
} from "@/lib/nombaNigeria";
import { resolveEffectiveRate } from "@/lib/fx";
import { currencySymbol, countryToCurrency } from "@/lib/currency";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { ArrowRight, CheckCircle, Users, Clock, Shield, Wallet, Landmark, CreditCard, AlertCircle, X, Search, Globe2, Send, Lock, Loader2, Check } from "lucide-react";
import { BrandFlag, CountryFlag } from "@/components/ui/FlagImage";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CanadaSendFlow from "@/components/send/CanadaSendFlow";
import EfinmoneyP2PFlow from "@/components/send/EfinmoneyP2PFlow";
import { createPaymentLink, PaymentLinkSuccess, type PaymentLinkResult } from "@/components/send/PaymentLinkSuccess";
import { isClaimCardCurrency } from "@/lib/stripeCorridors";
import TransactionPinDialog from "@/components/send/TransactionPinDialog";
import HeroGlobe from "@/components/send/HeroGlobe";
import FxTicker from "@/components/send/FxTicker";
import LiveFxCalculator from "@/components/fx/LiveFxCalculator";
import { parseAmount } from "@/components/fx/liveFxUtils";
import { clearSendHandoff, readSendHandoff } from "@/lib/sendHandoff";
import {
  clearCardSendIntent,
  markCardSendIntentConsumed,
  readCardSendIntent,
  saveCardSendIntent,
} from "@/lib/cardSendIntent";
import {
  clearPendingNombaTxn,
  getNombaPayStatus,
  initiateNombaCollection,
  isNombaTopupCurrency,
  nombaMinAmount,
  readPendingNombaTxn,
  savePendingNombaTxn,
} from "@/lib/nombaPay";
import { quoteDirectNombaTopup, quoteCadNombaTopup } from "@/lib/nombaTopupQuote";
import { productFeatures } from "@/lib/productFeatures";
import { cn } from "@/lib/utils";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import TransferSuccess from "@/components/send/TransferSuccess";
import { findCountryById, findCountryByCode, COUNTRIES } from "@/lib/countries";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type FundingSource = 'wallet' | 'bank' | 'card';
type CardResumeStage = "confirming" | "sending";

const CARD_RESUME_COPY: Record<CardResumeStage, { title: string; sub: string }> = {
  confirming: {
    title: "Confirming card payment…",
    sub: "We’re verifying your payment went through",
  },
  sending: {
    title: "Sending to your recipient…",
    sub: "Payment confirmed — delivering the transfer now",
  },
};

/** Dev/test FX overrides (white-label Send quotes). Remove when live rates are locked. */
const TEST_SEND_FX: Record<string, number> = {
  "USD:NGN": 250,
  "CAD:NGN": 250,
};

function testSendFxRate(from: string, to: string): number | null {
  if (!import.meta.env.DEV) return null;
  return TEST_SEND_FX[`${from.toUpperCase()}:${to.toUpperCase()}`] ?? null;
}

const cardBrandClass = (brand?: string | null) => {
  switch ((brand ?? "").toLowerCase()) {
    case "visa": return "from-[#1a1f71] to-[#3949ab]";
    case "mastercard": return "from-[#eb001b] to-[#f79e1b]";
    case "amex":
    case "american_express": return "from-[#2671b8] to-[#1f4e8c]";
    case "discover": return "from-[#ff6000] to-[#fda636]";
    default: return "from-slate-700 to-slate-900";
  }
};
const cardBrandLabel = (brand?: string | null) =>
  brand ? brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase() : "Card";

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
  const [fundingSource, setFundingSource] = useState<FundingSource>('wallet');
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
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [pickedBeneficiaryId, setPickedBeneficiaryId] = useState<string | null>(null);
  const [pendingBeneficiary, setPendingBeneficiary] = useState<Beneficiary | null>(null);
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  // NGN bank payout state
  const [ngnBanks, setNgnBanks] = useState<Array<{ code: string; name: string }>>([]);
  const [ngnBankCode, setNgnBankCode] = useState<string>("");
  const [ngnBankSearch, setNgnBankSearch] = useState("");
  const [ngnAccountNumber, setNgnAccountNumber] = useState<string>("");
  const [ngnResolving, setNgnResolving] = useState(false);
  const [ngnResolvedName, setNgnResolvedName] = useState<string | null>(null);
  const [ngnResolveError, setNgnResolveError] = useState<string | null>(null);
  const [useStellar, setUseStellar] = useState<boolean>(false);
  const [usePawapay, setUsePawapay] = useState<boolean>(false);
  const [usePaytota, setUsePaytota] = useState<boolean>(false);
  const [useFincra, setUseFincra] = useState<boolean>(import.meta.env.VITE_FINCRA_PAYOUT === "true");
  const [fromQuickSend, setFromQuickSend] = useState(false);
  const [cardResumeProcessing, setCardResumeProcessing] = useState(false);
  const [cardResumeStage, setCardResumeStage] = useState<CardResumeStage>("confirming");
  const cardResumeLock = useRef(false);

  // Ghana bank payout state (toggle between Mobile Money and Bank Transfer)
  const [ghPayoutMode, setGhPayoutMode] = useState<'mobile' | 'bank'>('mobile');
  const [ghBanks, setGhBanks] = useState<Array<{ code: string; name: string }>>([]);
  const [ghBankCode, setGhBankCode] = useState<string>("");
  const [ghBankSearch, setGhBankSearch] = useState("");
  const [ghAccountNumber, setGhAccountNumber] = useState<string>("");
  // International "send a secure link" — recipient gets an emailed claim link and
  // enters their own payout details (no card details handled by the sender).
  const [intlLinkMode, setIntlLinkMode] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [linkResult, setLinkResult] = useState<PaymentLinkResult | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  // V4: no public key needed
  const navigate = useNavigate();

  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("payout") === "fincra") setUseFincra(true);
  }, [searchParams]);
  const { data: beneficiaries } = useBeneficiaries();

  const { data: wallets } = useWallets();
  const { linkedCardCount } = useWalletCards();
  const { data: internalCards = [] } = useCards();
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
        .select("id,name,mask,subtype,currency_code, plaid_items(institution_name)")
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
      currency_code: a.currency_code || 'CAD',
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

  // Selected saved card (for card funding source) — drives charge currency
  const activeSavedCard = savedCards.find(c => c.stripe_payment_method_id === selectedSavedCardId)
    || savedCards.find(c => c.is_default)
    || savedCards[0];

  const profileCurrency = profile?.default_currency
    || countryToCurrency(profile?.country_code)
    || wallets?.find(w => w.is_default)?.currency_code
    || null;

  const sourceCurrency = fundingSource === 'wallet'
    ? (selectedWallet?.currency_code || profileCurrency || 'USD')
    : fundingSource === 'card'
    ? (selectedWallet && isNombaTopupCurrency(selectedWallet.currency_code)
      ? selectedWallet.currency_code
      : (profileCurrency && isNombaTopupCurrency(profileCurrency) ? profileCurrency : 'USD'))
    : (selectedExternalSource?.currency_code || profileCurrency || 'USD');
  const sourceSymbol = currencySymbol(sourceCurrency);
  const targetSymbol = targetCountry.symbol || targetCountry.code;

  // Network picker (for countries that expose multiple mobile money networks, e.g. Zambia)
  const availableNetworks = targetCountry.networks;
  const activeNetwork = availableNetworks
    ? (availableNetworks.find(n => n.id === selectedNetworkId) || availableNetworks[0])
    : null;
  const effectivePayoutMethod = activeNetwork?.payout || targetCountry.payout;
  const effectiveMethodLabel = activeNetwork?.label || targetCountry.method;

  // Reset network selection when the destination country changes.
  // Skip the reset if we're in the middle of applying a saved beneficiary
  // for this same country — otherwise we'd wipe their saved network/bank.
  useEffect(() => {
    if (pendingBeneficiary) {
      const c = pendingBeneficiary.country_code
        ? findCountryByCode(pendingBeneficiary.country_code)
        : null;
      if (c && c.id === targetCountryId) return;
    }
    setSelectedNetworkId(null);
    setNgnBankCode("");
    setNgnAccountNumber("");
    setNgnResolvedName(null);
    setNgnResolveError(null);
    setGhPayoutMode('mobile');
    setGhBankCode("");
    setGhAccountNumber("");
    setIntlLinkMode(false);
  }, [targetCountryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isNGNBank = targetCountry.code === "NGN";
  const isGhanaBank = targetCountry.code === "GHS" && ghPayoutMode === "bank";
  const isBankPayout = isNGNBank || isGhanaBank;
  const canUseFincra = ["NGN", "KES", "GHS", "UGX", "TZS", "RWF"].includes(targetCountry.code);
  const canUsePaytotaPayout =
    productFeatures.paytotaPayout
    && ["UGX", "KES", "RWF"].includes(targetCountry.code)
    && !isBankPayout;

  // "Send a secure link" is available when the destination currency supports
  // recipient claims (CAD/USD/GBP/EUR) and the sender holds a wallet in it to
  // escrow from. The recipient picks how to receive it on the claim page.
  const linkWallet = (wallets || []).find((w) => w.currency_code === targetCountry.code);
  const linkEligible = productFeatures.paymentLinks && isClaimCardCurrency(targetCountry.code) && !!linkWallet;
  const useLink = linkEligible && intlLinkMode;

  // Fetch Nigerian banks list when NGN destination is selected (Nomba primary, FLW fallback)
  useEffect(() => {
    if (!isNGNBank || ngnBanks.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { banks } = await getNigeriaBanks();
        if (cancelled) return;
        setNgnBanks(banks.map((b) => ({ code: b.code, name: b.name })));
      } catch (e) {
        console.error("Failed to load NG banks", e);
      }
    })();
    return () => { cancelled = true; };
  }, [isNGNBank, ngnBanks.length]);

  // Fetch Ghanaian banks list when GH bank-transfer mode is selected
  useEffect(() => {
    if (!isGhanaBank || ghBanks.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flw-get-banks?country=GH`;
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
        setGhBanks(list);
      } catch (e) {
        console.error("Failed to load GH banks", e);
      }
    })();
    return () => { cancelled = true; };
  }, [isGhanaBank, ghBanks.length]);

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
        const data = await resolveNigeriaAccount(
          ngnAccountNumber.replace(/\D/g, ""),
          ngnBankCode,
        );
        if (cancelled) return;
        if (data?.resolved && data.account_name) {
          const name = data.account_name;
          setNgnResolvedName(name);
          setRecipientName(name);
        } else if (data?.unverified) {
          setNgnResolveError(data?.error || "Name verification unavailable. Double-check the account number.");
          setNgnResolvedName(recipientName?.trim() ? recipientName.trim() : "Unverified recipient");
        } else {
          setNgnResolveError(data?.error || "Could not verify account");
        }
      } catch (e: any) {
        if (!cancelled) setNgnResolveError(e?.message || "Could not verify account");
      } finally {
        if (!cancelled) setNgnResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNGNBank, ngnBankCode, ngnAccountNumber]);


  const isSameCurrency = sourceCurrency === targetCountry.code;
  const fxRate = fxRates?.find(
    r => r.from_currency === sourceCurrency && r.to_currency === targetCountry.code
  );
  const resolvedDbRate = useMemo(
    () => (fxRates?.length ? resolveEffectiveRate(sourceCurrency, targetCountry.code, fxRates) : null),
    [fxRates, sourceCurrency, targetCountry.code],
  );
  const { data: derivedFxRate } = useQuery({
    queryKey: ["send-fx-rate", sourceCurrency, targetCountry.code],
    queryFn: () => fetchFxRate(sourceCurrency, targetCountry.code),
    enabled: !isSameCurrency && !resolvedDbRate && !!sourceCurrency && !!targetCountry.code,
    staleTime: 60_000,
  });
  const { data: nombaFxQuote } = useQuery({
    queryKey: ["nomba-fx", sourceCurrency, targetCountry.code],
    queryFn: () => getNombaExchangeRate(sourceCurrency, targetCountry.code),
    enabled:
      !isSameCurrency
      && isNgnPair(sourceCurrency, targetCountry.code)
      && testSendFxRate(sourceCurrency, targetCountry.code) == null,
    staleTime: 60_000,
  });
  const nombaRate = nombaFxQuote?.effective_rate && nombaFxQuote.effective_rate > 0
    ? nombaFxQuote.effective_rate
    : null;

  const parsedAmount = Math.max(0, parseAmount(amount));

  // --- Corridor pricing rule (from admin Pricing page) ---
  const destPayoutMethod = isBankPayout ? 'bank' : 'mobile_money';
  const { data: corridorRule } = useQuery({
    queryKey: ['pricing_rule', sourceCurrency, targetCountry.code, destPayoutMethod],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('pricing_rules')
        .select('fee_percent,fee_fixed,fx_markup_percent,min_amount,max_amount')
        .eq('source_currency', sourceCurrency)
        .eq('dest_currency', targetCountry.code)
        .eq('payout_method', destPayoutMethod)
        .eq('enabled', true)
        .maybeSingle();
      return data as { fee_percent: number; fee_fixed: number; fx_markup_percent: number; min_amount: number; max_amount: number } | null;
    },
    enabled: !isSameCurrency && !!sourceCurrency && !!targetCountry.code,
    staleTime: 120_000,
  });

  // Fee: use corridor rule (percent + fixed) when available, fall back to global pricing_config
  const baseFee = corridorRule && parsedAmount > 0
    ? (parsedAmount * Number(corridorRule.fee_percent) / 100) + Number(corridorRule.fee_fixed)
    : (pricing?.transfer_base_fee ?? 0);
  const cardFee = fundingSource === 'card' ? (pricing?.transfer_card_surcharge ?? 0) : 0;
  const fee = parsedAmount > 0 ? baseFee + cardFee : 0;

  const testRate = testSendFxRate(sourceCurrency, targetCountry.code);
  const directDbRate =
    fxRate && Number(fxRate.effective_rate) > 0 ? Number(fxRate.effective_rate) : null;
  const derivedRate = derivedFxRate && Number(derivedFxRate) > 0 ? Number(derivedFxRate) : null;
  const rawRate = isSameCurrency
    ? 1
    : testRate ?? nombaRate ?? resolvedDbRate ?? directDbRate ?? derivedRate ?? 0;
  // Apply FX markup from corridor rule (reduces effective rate by markup %) — skip for test overrides
  const effectiveRate = rawRate > 0 && !testRate && corridorRule?.fx_markup_percent
    ? rawRate * (1 - Number(corridorRule.fx_markup_percent) / 100)
    : rawRate;
  const rateAvailable = isSameCurrency || effectiveRate > 0;
  const rateSource = testRate
    ? "test"
    : nombaRate ? "nomba" : (resolvedDbRate || directDbRate ? "internal" : "market");

  const { data: nombaConversion } = useQuery({
    queryKey: ["nomba-conversion", sourceCurrency, targetCountry.code, parsedAmount, fee],
    queryFn: async () => {
      const net = Math.max(0, parsedAmount - fee);
      if (net <= 0) return null;
      const preview = await previewNigeriaConversion(net, sourceCurrency, targetCountry.code);
      return preview.success ? preview.converted_amount : null;
    },
    enabled:
      isNGNBank &&
      sourceCurrency !== "NGN" &&
      parsedAmount > 0 &&
      rateAvailable &&
      testRate == null,
    staleTime: 30_000,
  });

  const receivedAmount = parsedAmount > 0 && rateAvailable
    ? (nombaConversion != null && nombaConversion > 0
      ? nombaConversion
      : Math.max(0, (parsedAmount - fee) * effectiveRate))
    : 0;

  const noLinkedSource = fundingSource === 'bank' && activeSources.length === 0;
  const insufficientFunds = fundingSource === 'wallet'
    && !!selectedWallet
    && parsedAmount > 0
    && parsedAmount > Number(selectedWallet.balance);

  const nombaWallets = useMemo(
    () => (wallets ?? []).filter((w) => isNombaTopupCurrency(w.currency_code)),
    [wallets],
  );
  const nombaWalletCodes = useMemo(
    () => [...new Set(nombaWallets.map((w) => w.currency_code))],
    [nombaWallets],
  );
  const cardPayoutCodes = useMemo(() => ["NGN", "GHS"], []);
  const cardSendEnabled = productFeatures.nombaNigeria && nombaWallets.length > 0;

  const cardCheckoutQuote = useMemo(() => {
    if (fundingSource !== "card" || parsedAmount <= 0) return null;
    if (sourceCurrency.toUpperCase() === "CAD" && fxRates?.length) {
      return quoteCadNombaTopup(parsedAmount, fxRates);
    }
    if (isNombaTopupCurrency(sourceCurrency) && sourceCurrency.toUpperCase() !== "CAD") {
      return quoteDirectNombaTopup(parsedAmount, sourceCurrency);
    }
    return null;
  }, [fundingSource, parsedAmount, sourceCurrency, fxRates]);

  // When paying by card, pick a Nomba charge wallet + keep NG/GH payout destinations
  useEffect(() => {
    if (fundingSource !== "card") return;
    if (nombaWallets.length === 0) return;
    const currentOk = nombaWallets.some((w) => w.wallet_id === selectedWalletId);
    if (!currentOk) {
      const preferred =
        nombaWallets.find((w) => w.currency_code === "USD")
        || nombaWallets.find((w) => w.currency_code === "CAD")
        || nombaWallets.find((w) => w.currency_code === (profileCurrency || ""))
        || nombaWallets.find((w) => w.currency_code === "NGN")
        || nombaWallets[0];
      if (preferred) setSelectedWalletId(preferred.wallet_id);
    }
    if (!cardPayoutCodes.includes(targetCountry.code)) {
      const ng = findCountryByCode("NGN");
      if (ng) setTargetCountryId(ng.id);
    }
  }, [fundingSource, nombaWallets, selectedWalletId, targetCountry.code, profileCurrency, cardPayoutCodes]);

  const walletCurrencyCodes = useMemo(
    () => [...new Set((wallets ?? []).map((w) => w.currency_code))],
    [wallets],
  );
  const payoutCurrencyCodes = useMemo(() => COUNTRIES.map((c) => c.code), []);

  const calcQuoteRecipient = useCallback(
    (sendInFrom: number) => {
      if (!rateAvailable || effectiveRate <= 0) return 0;
      return Math.max(0, (sendInFrom - baseFee - cardFee) * effectiveRate);
    },
    [rateAvailable, effectiveRate, baseFee, cardFee],
  );
  const calcQuoteSend = useCallback(
    (recvInTo: number) => {
      if (!rateAvailable || effectiveRate <= 0) return 0;
      return recvInTo / effectiveRate + baseFee + cardFee;
    },
    [rateAvailable, effectiveRate, baseFee, cardFee],
  );

  const handleCalcFromChange = useCallback(
    (code: string) => {
      if (fundingSource === "wallet" || fundingSource === "card") {
        const w = wallets?.find((wallet) => wallet.currency_code === code);
        if (w) setSelectedWalletId(w.wallet_id);
      }
    },
    [fundingSource, wallets],
  );

  const handleCalcToChange = useCallback((code: string) => {
    const c = findCountryByCode(code);
    if (c) setTargetCountryId(c.id);
  }, []);

  const feeDisplayLabel =
    fee > 0
      ? `${sourceSymbol}${fee.toFixed(2)} flat`
      : `${sourceSymbol}0.00 fee`;

  const goToStep = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    if (next === 4) clearSendHandoff();
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
  const createTransferRecord = async (overrides?: {
    funding_source?: "wallet" | "card" | "bank";
    sender_wallet_id?: string;
    source_currency?: string;
    target_currency?: string;
    source_amount?: number;
    target_amount?: number;
    exchange_rate?: number;
    fee_amount?: number;
    recipient_name?: string;
    recipient_phone?: string;
    recipient_account?: string;
    recipient_bank_code?: string;
    recipient_bank_name?: string | null;
    recipient_country?: string;
    transfer_type?: "bank" | "mobile_money";
    payout_method?: string;
  }) => {
    const ngnAcct = isNGNBank ? ngnAccountNumber.replace(/\D/g, "") : "";
    const ngnBank = isNGNBank ? (ngnBanks.find((b) => b.code === ngnBankCode)?.name || null) : null;
    const ghAcct = isGhanaBank ? ghAccountNumber.replace(/\D/g, "") : "";
    const ghBank = isGhanaBank ? (ghBanks.find((b) => b.code === ghBankCode)?.name || null) : null;
    const bankAcct = isNGNBank ? ngnAcct : isGhanaBank ? ghAcct : "";
    const bankCode = isNGNBank ? ngnBankCode : isGhanaBank ? ghBankCode : "";
    const bankName = isNGNBank ? ngnBank : isGhanaBank ? ghBank : null;
    const funding = overrides?.funding_source ?? fundingSource;
    const walletId =
      overrides?.sender_wallet_id
      ?? (funding === "wallet" || funding === "card"
        ? selectedWallet!.wallet_id
        : wallets?.[0]?.wallet_id || "");
    const destCurrency = overrides?.target_currency ?? targetCountry.code;
    const transfer = await createTransfer.mutateAsync({
      sender_wallet_id: walletId,
      recipient_name: overrides?.recipient_name ?? recipientName,
      recipient_phone: overrides?.recipient_phone ?? (isBankPayout ? undefined : recipientPhone),
      recipient_account: overrides?.recipient_account ?? (isBankPayout ? bankAcct : undefined),
      recipient_bank_code: overrides?.recipient_bank_code ?? (isBankPayout ? bankCode : undefined),
      recipient_bank_name: overrides?.recipient_bank_name ?? (isBankPayout ? (bankName || undefined) : undefined),
      recipient_country: overrides?.recipient_country ?? destCurrency,
      transfer_type: overrides?.transfer_type ?? (isBankPayout ? "bank" : "mobile_money"),
      payout_method: overrides?.payout_method ?? (isBankPayout ? "bank" : effectivePayoutMethod),
      source_currency: overrides?.source_currency ?? sourceCurrency,
      target_currency: destCurrency,
      source_amount: overrides?.source_amount ?? parsedAmount,
      target_amount: overrides?.target_amount ?? receivedAmount,
      exchange_rate: overrides?.exchange_rate ?? effectiveRate,
      fee_amount: overrides?.fee_amount ?? fee,
      // Card sends are prepaid via Nomba into the wallet, then paid out as wallet
      funding_source: funding === "card" ? "wallet" : funding,
    });
    setLastTransferId(transfer.id);
    if (user) {
      try {
        const tType = overrides?.transfer_type ?? (isBankPayout ? "bank" : "mobile_money");
        const { isNew } = await recordTransferRecipient({
          user_id: user.id,
          name: overrides?.recipient_name ?? recipientName,
          phone: tType === "bank" ? "" : (overrides?.recipient_phone ?? recipientPhone),
          country_code: overrides?.recipient_country ?? destCurrency,
          payout_method: overrides?.payout_method ?? (isBankPayout ? "bank" : effectivePayoutMethod),
          network: tType === "bank" ? null : (activeNetwork?.id || null),
          currency_code: destCurrency,
          bank_name: overrides?.recipient_bank_name ?? (isBankPayout ? bankName : null),
          bank_account: overrides?.recipient_account ?? (isBankPayout ? bankAcct : null),
          bank_code: overrides?.recipient_bank_code ?? (isNGNBank ? ngnBankCode : null),
        } as any);
        if (isNew && !pickedBeneficiaryId) setSavePromptOpen(true);
      } catch { /* non-fatal */ }
    }
    return transfer.id;
  };


  // Require the transaction PIN before any money actually moves.
  const requestConfirm = () => {
    if (confirming) return;
    setPinOpen(true);
  };

  const handlePinVerified = () => {
    setPinOpen(false);
    void handleConfirm();
  };

  // ── Secure link: escrow from the matching-currency wallet and email a
  // claim link. The recipient enters their own payout details on /claim.
  const handleCreateLink = async () => {
    if (creatingLink) return;
    if (!linkWallet) { toast.error(`You need a ${targetCountry.code} wallet to send a link.`); return; }
    setCreatingLink(true);
    try {
      const result = await createPaymentLink({
        amount: parsedAmount,
        currency: targetCountry.code,
        sender_wallet_id: linkWallet.wallet_id,
        recipient_name: recipientName || null,
        recipient_email: recipientEmail || null,
      });
      setLinkResult(result);
      goToStep(4);
      toast.success(result.emailed ? "Payment link sent" : "Payment link created");
    } catch (e: any) {
      toast.error(e?.message || "Could not create payment link");
    } finally {
      setCreatingLink(false);
    }
  };

  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);

    // ── Wallet: create + execute payout immediately ──────────────────────
    if (fundingSource === 'wallet') {
      if (!selectedWallet) { setConfirming(false); return; }
      try {
        const tid = await createTransferRecord();
        let data: any = null;
        let invokeErr: any = null;
        try {
          const res = await supabase.functions.invoke('execute-transfer', { body: { transfer_id: tid, use_stellar: isNGNBank && useStellar, use_pawapay: !isBankPayout && usePawapay, use_paytota: canUsePaytotaPayout && usePaytota, use_fincra: useFincra && canUseFincra, recipient_country_hint: targetCountry.country } });
          data = res.data;
          invokeErr = res.error;
        } catch (err) {
          invokeErr = err;
        }
        // Recover structured body when Supabase JS throws on non-2xx
        if (invokeErr && !data && (invokeErr as any)?.context?.response) {
          try { data = await (invokeErr as any).context.response.json(); } catch { /* ignore */ }
        }
        if (data?.success === false || data?.error) {
          const refunded = data.refunded === true || data?.payout?.refunded === true;
          const rawMsg = data.error || data?.payout?.error || 'Payout failed';
          const msg = /trade region|trade context|not found for trade/i.test(String(rawMsg))
            ? 'This currency pair isn\'t supported for this corridor yet. Please switch to a CAD wallet or contact support.'
            : rawMsg;
          // Defensive: if the edge function reports a refund or payout failure
          // but didn't already mark the row failed, do it client-side so the
          // user isn't stuck on "processing".
          const looksTerminal = /refund|payout failed|unavailable|provider setup/i.test(String(msg));
          if (looksTerminal) {
            try {
              await supabase.from('transfers')
                .update({ status: 'failed', failure_reason: String(msg).slice(0, 500) })
                .eq('id', tid);
            } catch { /* ignore */ }
          }
          if (refunded) {
            toast.error(msg, { description: 'Funds have been returned to your wallet.', duration: 10000 });
          } else {
            toast.error(msg, { duration: 8000 });
          }
          return;
        }
        if (invokeErr) throw new Error(invokeErr.message || 'Payout failed');
        const payout = data?.payout;
        const redirectUrl = payout?.redirect_url;
        goToStep(4);
        if (redirectUrl) {
          window.open(redirectUrl, '_blank', 'noopener,noreferrer');
          toast.success('Please complete the verification on the payment page to finalize your transfer.', { duration: 10000 });
        } else {
          toast.success(
            data?.pending_liquidity || data?.queued || payout?.queued || payout?.pending_liquidity
              ? 'Payment received — completing delivery to your recipient'
              : 'Transfer sent successfully!',
          );
        }
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

    // ── Card: Nomba hosted checkout → credit wallet → payout (NGN/GHS) ───
    if (fundingSource === "card") {
      try {
        if (!selectedWallet || !isNombaTopupCurrency(selectedWallet.currency_code)) {
          toast.error("Pick a USD, CAD, EUR, GBP, or NGN wallet to pay by card.");
          setConfirming(false);
          return;
        }
        const cardMin = nombaMinAmount(selectedWallet.currency_code);
        if (parsedAmount < cardMin) {
          toast.error(
            `Card sends need at least ${selectedWallet.currency_code === "NGN" ? "₦" : selectedWallet.currency_code === "CAD" ? "C$" : "$"}${cardMin} so checkout can clear. Try a larger amount.`,
          );
          setConfirming(false);
          return;
        }
        if (!cardPayoutCodes.includes(targetCountry.code)) {
          toast.error("Card send currently supports Nigeria and Ghana only.");
          setConfirming(false);
          return;
        }
        if (!user?.email) {
          toast.error("Your account email is required for card checkout.");
          setConfirming(false);
          return;
        }

        const ngnAcct = isNGNBank ? ngnAccountNumber.replace(/\D/g, "") : "";
        const ngnBank = isNGNBank ? (ngnBanks.find((b) => b.code === ngnBankCode)?.name || null) : null;
        const ghAcct = isGhanaBank ? ghAccountNumber.replace(/\D/g, "") : "";
        const ghBank = isGhanaBank ? (ghBanks.find((b) => b.code === ghBankCode)?.name || null) : null;

        const returnUrl = `${window.location.origin}/send?cardSend=1&walletId=${encodeURIComponent(selectedWallet.wallet_id)}`;
        const collection = await initiateNombaCollection({
          credit_amount: parsedAmount,
          amount: parsedAmount,
          target_wallet_id: selectedWallet.wallet_id,
          email: user.email,
          corridor: selectedWallet.currency_code === "NGN" ? "nigeria" : "international",
          return_url: returnUrl,
        });

        saveCardSendIntent({
          nombaTxnId: collection.transaction_id,
          walletId: selectedWallet.wallet_id,
          sourceCurrency,
          sourceAmount: parsedAmount,
          targetCountryId,
          targetCurrency: targetCountry.code,
          targetAmount: receivedAmount,
          exchangeRate: effectiveRate,
          feeAmount: fee,
          recipientName,
          recipientPhone: isBankPayout ? "" : recipientPhone,
          payoutMethod: isBankPayout ? "bank" : effectivePayoutMethod,
          transferType: isBankPayout ? "bank" : "mobile_money",
          recipientAccount: isBankPayout ? (isNGNBank ? ngnAcct : ghAcct) : undefined,
          recipientBankCode: isBankPayout ? (isNGNBank ? ngnBankCode : ghBankCode) : undefined,
          recipientBankName: isBankPayout ? (isNGNBank ? ngnBank : ghBank) : null,
          networkId: activeNetwork?.id || null,
          ghPayoutMode,
          useStellar: isNGNBank && useStellar,
          usePawapay: !isBankPayout && usePawapay,
          usePaytota: canUsePaytotaPayout && usePaytota,
          useFincra: useFincra && canUseFincra,
          recipientCountryHint: targetCountry.country,
        });
        savePendingNombaTxn(collection.transaction_id);
        toast.message("Opening secure card checkout…");
        window.location.href = collection.payment_link;
      } catch (e: any) {
        toast.error(e?.message || "Could not start card checkout");
        setConfirming(false);
      }
      return;
    }

    toast.error("Unsupported funding source.");
    setConfirming(false);
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
    setRecipientPhone(b.phone || "");
    setPickedBeneficiaryId(b.id);
    setPendingBeneficiary(b);
    if (b.country_code) {
      const c = findCountryByCode(b.country_code);
      if (c) setTargetCountryId(c.id);
    }
  };

  // Apply saved network / bank details for a picked beneficiary once the
  // destination country (and, for NGN, the banks list) is in place.
  useEffect(() => {
    const b = pendingBeneficiary;
    if (!b) return;
    const targetIsNGNBank = targetCountry.code === "NGN";
    const expectedCountry = b.country_code
      ? findCountryByCode(b.country_code)
      : null;
    if (expectedCountry && expectedCountry.id !== targetCountryId) return;

    let allApplied = true;

    if (targetIsNGNBank) {
      if (b.bank_account && !ngnAccountNumber) {
        setNgnAccountNumber(b.bank_account);
      }
      if (b.bank_code && !ngnBankCode) {
        setNgnBankCode(b.bank_code);
      } else if (b.bank_name && !ngnBankCode) {
        if (ngnBanks.length === 0) {
          allApplied = false; // wait for banks list
        } else {
          const wanted = b.bank_name.trim().toLowerCase();
          const match =
            ngnBanks.find((x) => x.name.toLowerCase() === wanted) ||
            ngnBanks.find((x) => x.name.toLowerCase().includes(wanted)) ||
            ngnBanks.find((x) => wanted.includes(x.name.toLowerCase()));
          if (match) setNgnBankCode(match.code);
          else allApplied = false;
        }
      }
    } else if (availableNetworks && b.network) {
      const wanted = b.network;
      const match =
        availableNetworks.find((n) => n.id === wanted) ||
        availableNetworks.find((n) => n.payout === wanted) ||
        availableNetworks.find((n) => n.label?.toLowerCase() === wanted.toLowerCase());
      if (match && selectedNetworkId !== match.id) {
        setSelectedNetworkId(match.id);
      }
    }

    if (allApplied) setPendingBeneficiary(null);
  }, [pendingBeneficiary, targetCountryId, ngnBanks, availableNetworks]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Handoff from dashboard quick-send modal (sessionStorage + URL; survives Strict Mode remount)
  const handoffApplyingRef = useRef(false);
  useEffect(() => {
    if (!wallets?.length || handoffApplyingRef.current) return;

    const intent = readSendHandoff();
    const hasUrlHandoff =
      searchParams.get("quick") === "1" ||
      !!searchParams.get("amount") ||
      !!searchParams.get("targetCountryCode") ||
      !!searchParams.get("from");

    if (!intent && !hasUrlHandoff) return;

    handoffApplyingRef.current = true;

    const amountVal =
      intent?.amount ??
      (searchParams.get("amount") ? parseAmount(searchParams.get("amount")!) : 0);
    if (amountVal > 0) setAmount(String(amountVal));

    const funding =
      intent?.fundingSource ??
      (searchParams.get("fundingSource") as FundingSource | null);
    if (funding === "wallet" || funding === "bank") {
      setFundingSource(funding);
    }

    const walletId = intent?.sourceWalletId ?? searchParams.get("sourceWalletId");
    if (walletId && wallets.some((w) => w.wallet_id === walletId)) {
      setSelectedWalletId(walletId);
      setFundingSource("wallet");
    }

    const fromCode = intent?.from ?? searchParams.get("from");
    if (fromCode) {
      const w = wallets.find((wallet) => wallet.currency_code === fromCode);
      if (w) {
        setSelectedWalletId(w.wallet_id);
        setFundingSource("wallet");
      }
    }

    const toCode =
      intent?.to ??
      searchParams.get("targetCountryCode") ??
      searchParams.get("to");
    if (toCode) {
      const c = findCountryByCode(toCode);
      if (c) setTargetCountryId(c.id);
    }

    setFromQuickSend(true);
    setTimeout(() => goToStep(2), 0);

    const destCode = toCode;
    if (destCode && beneficiaries?.length) {
      const matches = beneficiaries.filter((b) => b.country_code === destCode);
      if (matches.length > 0) {
        setTimeout(() => setPickerOpen(true), 150);
      }
    }

    const next = new URLSearchParams(searchParams);
    let stripped = false;
    for (const key of ["quick", "amount", "fundingSource", "sourceWalletId", "targetCountryCode", "from", "to"]) {
      if (next.has(key)) {
        next.delete(key);
        stripped = true;
      }
    }
    if (stripped) setSearchParams(next, { replace: true });

    setTimeout(() => {
      handoffApplyingRef.current = false;
    }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets, searchParams, beneficiaries]);

  // Resume card-funded send after Nomba hosted checkout returns
  useEffect(() => {
    if (!wallets?.length || cardResumeLock.current) return;

    const intent = readCardSendIntent();
    const cardSendFlag = searchParams.get("cardSend") === "1";
    const nombaStatus = searchParams.get("nomba");
    const pendingTxn = intent?.nombaTxnId || readPendingNombaTxn();

    if (!intent || intent.status === "consumed") {
      if (cardSendFlag || nombaStatus) {
        const next = new URLSearchParams(searchParams);
        next.delete("cardSend");
        next.delete("nomba");
        next.delete("walletId");
        next.delete("orderId");
        setSearchParams(next, { replace: true });
      }
      return;
    }

    if (!cardSendFlag && nombaStatus !== "success" && nombaStatus !== "failed" && !pendingTxn) return;

    if (nombaStatus === "failed") {
      clearCardSendIntent();
      clearPendingNombaTxn();
      toast.error("Card payment failed or was cancelled. No transfer was sent.");
      const next = new URLSearchParams(searchParams);
      next.delete("cardSend");
      next.delete("nomba");
      next.delete("walletId");
      next.delete("orderId");
      setSearchParams(next, { replace: true });
      return;
    }

    cardResumeLock.current = true;
    setCardResumeStage("confirming");
    setCardResumeProcessing(true);

    const stripParams = () => {
      const next = new URLSearchParams(searchParams);
      let changed = false;
      for (const key of ["cardSend", "nomba", "walletId", "orderId"]) {
        if (next.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      if (changed) setSearchParams(next, { replace: true });
    };

    const finishPayout = async () => {
      try {
        // Restore UI context
        setFundingSource("wallet");
        setSelectedWalletId(intent.walletId);
        setAmount(String(intent.sourceAmount));
        setTargetCountryId(intent.targetCountryId);
        setRecipientName(intent.recipientName);
        setRecipientPhone(intent.recipientPhone || "");
        if (intent.ghPayoutMode) setGhPayoutMode(intent.ghPayoutMode);
        if (intent.recipientBankCode && intent.targetCurrency === "NGN") {
          setNgnBankCode(intent.recipientBankCode);
          setNgnAccountNumber(intent.recipientAccount || "");
          setNgnResolvedName(intent.recipientName);
        }
        if (intent.recipientBankCode && intent.targetCurrency === "GHS") {
          setGhBankCode(intent.recipientBankCode);
          setGhAccountNumber(intent.recipientAccount || "");
        }
        if (intent.networkId) setSelectedNetworkId(intent.networkId);

        // Wait until Nomba collection is completed (webhook may lag redirect)
        let paid = false;
        for (let i = 0; i < 40; i++) {
          const status = await getNombaPayStatus(intent.nombaTxnId);
          if (status?.status === "completed") {
            paid = true;
            break;
          }
          if (status?.status === "failed" || status?.status === "cancelled") {
            throw new Error(status.failure_reason || "Card payment failed");
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        if (!paid) {
          throw new Error("Payment is still processing. We’ll finish the send once it clears — check back shortly or contact support.");
        }

        setCardResumeStage("sending");
        await qc.invalidateQueries({ queryKey: ["wallets"] });

        const tid = await createTransferRecord({
          funding_source: "wallet",
          sender_wallet_id: intent.walletId,
          source_currency: intent.sourceCurrency,
          target_currency: intent.targetCurrency,
          source_amount: intent.sourceAmount,
          target_amount: intent.targetAmount,
          exchange_rate: intent.exchangeRate,
          fee_amount: intent.feeAmount,
          recipient_name: intent.recipientName,
          recipient_phone: intent.transferType === "bank" ? undefined : intent.recipientPhone,
          recipient_account: intent.recipientAccount,
          recipient_bank_code: intent.recipientBankCode,
          recipient_bank_name: intent.recipientBankName,
          recipient_country: intent.targetCurrency,
          transfer_type: intent.transferType,
          payout_method: intent.payoutMethod,
        });

        markCardSendIntentConsumed();
        clearPendingNombaTxn();
        stripParams();

        const res = await supabase.functions.invoke("execute-transfer", {
          body: {
            transfer_id: tid,
            use_stellar: !!intent.useStellar,
            use_pawapay: !!intent.usePawapay,
            use_paytota: !!intent.usePaytota,
            use_fincra: !!intent.useFincra,
            recipient_country_hint: intent.recipientCountryHint,
          },
        });        let data: any = res.data;
        if (res.error && !data && (res.error as any)?.context?.response) {
          try { data = await (res.error as any).context.response.json(); } catch { /* ignore */ }
        }
        if (res.error && !data?.success) {
          throw new Error(data?.error || (res.error as Error).message || "Payout failed");
        }

        clearCardSendIntent();
        toast.success("Card charged — transfer sent to your recipient!");
        goToStep(4);
      } catch (e: any) {
        toast.error(e?.message || "Could not complete transfer after card payment");
        stripParams();
      } finally {
        setCardResumeProcessing(false);
        setCardResumeStage("confirming");
        cardResumeLock.current = false;
      }
    };

    void finishPayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets, searchParams]);

  const resetForm = () => {
    setDirection(-1);
    setStep(1);
    setAmount("");
    setRecipientName("");
    setRecipientPhone("");
    setRecipientEmail("");
    setFundingSource('wallet');
    setPickedBeneficiaryId(null);
    setIntlLinkMode(false);
    setLinkResult(null);
    setFromQuickSend(false);
    clearSendHandoff();
    clearCardSendIntent();
  };

  const isStep1Valid =
    parsedAmount > 0
    && parsedAmount > fee
    && receivedAmount > 0
    && rateAvailable
    && !noLinkedSource
    && !insufficientFunds
    && (fundingSource !== "card" || (
      cardSendEnabled
      && cardPayoutCodes.includes(targetCountry.code)
      && parsedAmount >= nombaMinAmount(sourceCurrency)
    ));
  const isStep2Valid = useLink
    ? (recipientName.trim().length > 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail) && parsedAmount > 0)
    : isNGNBank
    ? (!!ngnBankCode && ngnAccountNumber.replace(/\D/g, "").length === 10 && !!ngnResolvedName && receivedAmount > 0)
    : isGhanaBank
    ? (recipientName.trim().length > 2 && !!ghBankCode && ghAccountNumber.replace(/\D/g, "").length >= 6 && receivedAmount > 0)
    : (recipientName.length > 2 && recipientPhone.length > 8 && !!effectivePayoutMethod && receivedAmount > 0);

  const modeParam = searchParams.get('mode');
  const canadaLive = productFeatures.canadaDomestic;
  const activeTab =
    modeParam === 'canada' ? 'canada'
    : modeParam === 'efinmoney' ? 'efinmoney'
    : 'international';
  const fundingOptions = ([
    { v: "wallet" as const, icon: Wallet, label: "Wallet" },
    ...(productFeatures.plaid ? [{ v: "bank" as const, icon: Landmark, label: "Bank" }] : []),
    ...(productFeatures.nombaNigeria ? [{ v: "card" as const, icon: CreditCard, label: "Card" }] : []),
  ]);

  // Step transitions
  const stepVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  };

  return (
    <>
      <AnimatePresence>
        {cardResumeProcessing && (
          <motion.div
            key="card-resume-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-md px-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="w-full max-w-sm rounded-2xl border border-border/80 bg-card p-7 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center space-y-5">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-primary/25 blur-xl animate-pulse" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                    <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={cardResumeStage}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="space-y-1.5 px-1"
                  >
                    <h3 className="text-lg font-display font-semibold text-foreground">
                      {CARD_RESUME_COPY[cardResumeStage].title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {CARD_RESUME_COPY[cardResumeStage].sub}
                    </p>
                  </motion.div>
                </AnimatePresence>

                <div className="w-full space-y-2.5 rounded-xl bg-muted/50 px-3.5 py-3 text-left">
                  {[
                    { id: "confirming" as const, label: "Verify card payment" },
                    { id: "sending" as const, label: "Deliver to recipient" },
                  ].map((step, idx) => {
                    const active = cardResumeStage === step.id;
                    const done = cardResumeStage === "sending" && step.id === "confirming";
                    return (
                      <div key={step.id} className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                            done && "bg-emerald-500/15 text-emerald-600",
                            active && "bg-primary text-primary-foreground",
                            !done && !active && "bg-muted-foreground/15 text-muted-foreground",
                          )}
                        >
                          {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                        </div>
                        <span
                          className={cn(
                            "text-sm",
                            active || done ? "text-foreground font-medium" : "text-muted-foreground",
                          )}
                        >
                          {step.label}
                        </span>
                        {active && (
                          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-primary" />
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Please don’t close this window
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AppPage width="default" innerClassName="space-y-5 sm:space-y-6">
          <BackToDashboard />
          {/* Header — slides down with fade */}
          <motion.div
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground">Send Money</h1>
            <p className="text-muted-foreground">Choose how you'd like to send</p>
          </motion.div>

          <PageHeroBanner
            icon={Send}
            label="Cross-border transfers"
            value="Send to bank & mobile money"
            meta={[
              { icon: Globe2, text: "NGN, GHS, KES & more corridors" },
              { icon: Users, text: `${beneficiaries?.length ?? 0} saved contacts ready` },
            ]}
            variant="hero"
          />

          {productFeatures.crypto && (
          <Link
            to="/send/cpn"
            className="block rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3 hover:from-primary/15 hover:to-primary/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/20 p-2 text-primary text-lg">🌐</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">New: Circle Payments Network</p>
                <p className="text-xs text-muted-foreground">USDC-settled cross-border bank payouts to new corridors.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-primary shrink-0" />
            </div>
          </Link>
          )}


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
                if (v === 'canada') next.set('mode', 'canada');
                else if (v === 'efinmoney') next.set('mode', 'efinmoney');
                else next.delete('mode');
                setSearchParams(next, { replace: true });
              }}
              className="w-full"
            >
              <TabsList
                className={cn(
                  "relative grid w-full h-11 sm:h-12 overflow-hidden",
                  canadaLive ? "grid-cols-3" : "grid-cols-2",
                )}
              >
                {/* Sliding pill */}
                <motion.div
                  className="absolute top-1 bottom-1 rounded-sm bg-background shadow-sm"
                  initial={false}
                  animate={{
                    left: canadaLive
                      ? (
                        activeTab === "international" ? "0.25rem"
                        : activeTab === "efinmoney" ? "calc(33.333% + 0.25rem)"
                        : "calc(66.666% + 0.25rem)"
                      )
                      : (
                        activeTab === "international" ? "0.25rem"
                        : "calc(50% + 0.25rem)"
                      ),
                  }}
                  style={{
                    width: canadaLive ? "calc(33.333% - 0.5rem)" : "calc(50% - 0.5rem)",
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
                <TabsTrigger value="international" className="relative z-10 gap-1.5 px-2 sm:gap-2 sm:px-3 text-xs sm:text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-border">
                    <Globe2 className="h-2.5 w-2.5 text-primary" aria-hidden />
                  </span>
                  International
                </TabsTrigger>
                <TabsTrigger value="efinmoney" className="relative z-10 gap-1.5 px-2 sm:gap-2 sm:px-3 text-xs sm:text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  <BrandFlag size="xs" />
                  eFinMoney
                </TabsTrigger>
                {canadaLive && (
                  <TabsTrigger value="canada" className="relative z-10 gap-1.5 px-2 sm:gap-2 sm:px-3 text-xs sm:text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                    <CountryFlag country="CA" size="xs" />
                    Domestic
                  </TabsTrigger>
                )}
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
                        {canadaLive ? (
                          <CanadaSendFlow />
                        ) : null}
                      </TabsContent>
                    </motion.div>
                  ) : activeTab === 'efinmoney' ? (
                    <motion.div
                      key="efinmoney"
                      initial={{ x: 0, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <TabsContent value="efinmoney" forceMount className="mt-0">
                        <EfinmoneyP2PFlow />
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
                        {/* Animated hero + live FX ticker (hidden on the success screen) */}
                        {step < 4 && (
                          <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                            className="space-y-3"
                          >
                            <HeroGlobe />
                            <FxTicker />
                          </motion.div>
                        )}

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
                                      <div className={`grid gap-2 ${fundingOptions.length === 3 ? 'grid-cols-3' : fundingOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                        {fundingOptions.map(({ v, icon: Icon, label }) => (
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
                                            {wallets?.map((w) => {
                                              const cardCount = linkedCardCount[w.wallet_id] ?? 0;
                                              return (
                                                <SelectItem key={w.wallet_id} value={w.wallet_id}>
                                                  <span className="flex items-center gap-2">
                                                    {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    {cardCount > 0 && (
                                                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
                                                        <CreditCard className="w-3 h-3" />
                                                        {cardCount}
                                                      </span>
                                                    )}
                                                  </span>
                                                </SelectItem>
                                              );
                                            })}
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

                                    {fundingSource === "card" && (
                                      <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="show" className="space-y-3">
                                        <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-3 space-y-1.5">
                                          <p className="text-sm font-medium text-foreground flex items-center gap-2">
                                            <CreditCard className="h-4 w-4 text-primary" />
                                            Pay by card, we deliver
                                          </p>
                                          <p className="text-xs text-muted-foreground leading-relaxed">
                                            You’ll enter your card on our secure checkout. Once charged, we send to Nigeria (bank) or Ghana (mobile money).
                                          </p>
                                        </div>
                                        {nombaWallets.length > 0 ? (
                                          <div className="space-y-2">
                                            <Label>Charge currency</Label>
                                            <Select value={selectedWalletId || nombaWallets[0]?.wallet_id} onValueChange={setSelectedWalletId}>
                                              <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                                              <SelectContent>
                                                {nombaWallets.map((w) => (
                                                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                                                    {w.flag_emoji} {w.currency_code} card checkout
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            {cardCheckoutQuote && (
                                              <p className="text-xs text-muted-foreground">
                                                Card charge ≈ {cardCheckoutQuote.checkoutCurrency}{" "}
                                                {cardCheckoutQuote.checkoutAmount.toLocaleString("en-US", {
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                })}
                                                {" "}(includes card processing fee)
                                              </p>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                              Minimum {sourceCurrency === "NGN" ? "₦" : sourceCurrency === "CAD" ? "C$" : "$"}
                                              {nombaMinAmount(sourceCurrency)} for card checkout
                                              {sourceCurrency === "CAD" ? " · CAD is charged in USD" : ""}.
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                                            Create a USD, CAD, EUR, GBP, or NGN wallet first to pay by card.
                                          </div>
                                        )}
                                      </motion.div>
                                    )}

                                    <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="flex justify-center py-1">
                                      <LiveFxCalculator
                                        variant="app"
                                        className="max-w-none w-full"
                                        from={sourceCurrency}
                                        to={targetCountry.code}
                                        sendAmount={amount}
                                        onFromChange={handleCalcFromChange}
                                        onToChange={handleCalcToChange}
                                        onSendAmountChange={(v) => setAmount(v)}
                                        fromCurrencyFilter={
                                          fundingSource === "wallet" ? walletCurrencyCodes
                                          : fundingSource === "card" ? nombaWalletCodes
                                          : undefined
                                        }
                                        toCurrencyFilter={
                                          fundingSource === "card" ? cardPayoutCodes : payoutCurrencyCodes
                                        }
                                        quoteRecipient={rateAvailable ? calcQuoteRecipient : undefined}
                                        quoteSend={rateAvailable ? calcQuoteSend : undefined}
                                        displayRate={rateAvailable ? effectiveRate : null}
                                        feeLabel={feeDisplayLabel}
                                        walletBalance={
                                          fundingSource === "wallet" && selectedWallet
                                            ? Number(selectedWallet.balance)
                                            : null
                                        }
                                        walletSymbol={selectedWallet?.symbol}
                                        showActions={false}
                                        showDisclaimer
                                      />
                                    </motion.div>

                                    {fundingSource === "card" && parsedAmount > 0 && parsedAmount < nombaMinAmount(sourceCurrency) && (
                                      <motion.p
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-sm font-medium text-destructive flex items-center justify-center gap-1"
                                      >
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        Card minimum is {sourceCurrency === "CAD" ? "C$" : sourceCurrency === "NGN" ? "₦" : "$"}
                                        {nombaMinAmount(sourceCurrency)}
                                      </motion.p>
                                    )}

                                    {insufficientFunds && (
                                      <motion.p
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-sm font-medium text-destructive flex items-center justify-center gap-1"
                                      >
                                        <AlertCircle className="w-3.5 h-3.5" /> Insufficient wallet balance
                                      </motion.p>
                                    )}

                                    {!rateAvailable && (
                                      <p className="text-sm text-center text-muted-foreground">
                                        No FX rate for {sourceCurrency} → {targetCountry.code}. Try another pair or funding source.
                                      </p>
                                    )}

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
                                    {fromQuickSend && parsedAmount > 0 && receivedAmount > 0 && (
                                      <motion.div
                                        custom={0}
                                        variants={fieldVariants}
                                        initial="hidden"
                                        animate="show"
                                        className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-2"
                                      >
                                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                                          Ready from calculator
                                        </p>
                                        <p className="text-base font-bold tabular-nums">
                                          {sourceSymbol}
                                          {parsedAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                          {sourceCurrency}
                                          <span className="mx-2 text-muted-foreground font-normal">→</span>
                                          {targetSymbol}
                                          {receivedAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                          {targetCountry.code}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          Wallet funded · pick a saved contact below or enter details
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setFromQuickSend(false);
                                            clearSendHandoff();
                                            goToStep(1);
                                          }}
                                          className="text-xs font-medium text-primary hover:underline"
                                        >
                                          Edit amount or funding
                                        </button>
                                      </motion.div>
                                    )}

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
                                        className="flex items-center justify-between gap-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-primary dark:text-indigo-300"
                                      >
                                        <span className="inline-flex items-center gap-2 text-sm font-medium">
                                          <CheckCircle className="w-4 h-4" /> Contact selected ✓ — {recipientName}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => { setPickedBeneficiaryId(null); setRecipientName(""); setRecipientPhone(""); }}
                                          className="text-primary/80 dark:text-indigo-300/80 hover:opacity-100 opacity-70"
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
                                    {linkEligible && (
                                      <motion.div custom={1.1} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>How should {targetCountry.country} receive it?</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                          {([
                                            { v: false, label: targetCountry.method || 'Bank Transfer', sub: 'Local rails' },
                                            { v: true,  label: 'Send a secure link', sub: 'Recipient picks · emailed' },
                                          ] as const).map(({ v, label, sub }) => {
                                            const active = intlLinkMode === v;
                                            return (
                                              <button
                                                key={String(v)}
                                                type="button"
                                                onClick={() => setIntlLinkMode(v)}
                                                className={`flex flex-col items-start rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                                                  active
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border bg-card hover:bg-muted text-foreground"
                                                }`}
                                              >
                                                <span>{label}</span>
                                                <span className="text-[10px] font-normal opacity-70">{sub}</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                          We escrow {targetCountry.symbol || ""}{parsedAmount.toFixed(2)} from your {targetCountry.code} wallet and email the recipient a secure link — they choose Interac / bank / their own debit card. You never handle their details.
                                        </p>
                                      </motion.div>
                                    )}
                                    {!useLink && targetCountry.code === "GHS" && (
                                      <motion.div custom={1.2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>Payout Method</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                          {([
                                            { v: 'mobile', label: 'Mobile Money' },
                                            { v: 'bank',   label: 'Bank Transfer' },
                                          ] as const).map(({ v, label }) => {
                                            const active = ghPayoutMode === v;
                                            return (
                                              <button
                                                key={v}
                                                type="button"
                                                onClick={() => setGhPayoutMode(v)}
                                                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                                                  active
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border bg-card hover:bg-muted text-foreground"
                                                }`}
                                              >
                                                {label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </motion.div>
                                    )}
                                    {!useLink && availableNetworks && availableNetworks.length > 1 && !isGhanaBank && !isNGNBank && (
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
                                    {useLink ? (
                                      <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>Recipient email <span className="text-xs text-muted-foreground">(we'll send the link here)</span></Label>
                                        <Input
                                          type="email"
                                          value={recipientEmail}
                                          onChange={(e) => setRecipientEmail(e.target.value)}
                                          placeholder="jane@example.com"
                                          className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                          The recipient opens the link and chooses how to receive {targetCountry.code} — bank, Interac (CAD), or their own debit card.
                                        </p>
                                      </motion.div>
                                    ) : isNGNBank ? (
                                      <>
                                        <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                          <Label>Recipient Bank</Label>
                                          <Select value={ngnBankCode} onValueChange={setNgnBankCode}>
                                            <SelectTrigger>
                                              <SelectValue placeholder={ngnBanks.length ? "Select Nigerian bank" : "Loading banks..."} />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[320px]">
                                              <div className="sticky top-0 z-10 bg-popover p-2 border-b">
                                                <div className="relative">
                                                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                  <Input
                                                    autoFocus
                                                    value={ngnBankSearch}
                                                    onChange={(e) => setNgnBankSearch(e.target.value)}
                                                    onKeyDown={(e) => e.stopPropagation()}
                                                    placeholder="Search bank..."
                                                    className="pl-8 h-8"
                                                  />
                                                </div>
                                              </div>
                                              {ngnBanks
                                                .filter((b) => b.name.toLowerCase().includes(ngnBankSearch.toLowerCase()))
                                                .map((b) => (
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
                                              <LoadingSpinner size={12} />
                                              Verifying account…
                                            </p>
                                          )}
                                          {ngnResolvedName && !ngnResolving && (
                                            <p className="text-sm text-primary inline-flex items-center gap-1">
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
                                        {productFeatures.crypto && (
                                        <motion.div custom={2.7} variants={fieldVariants} initial="hidden" animate="show" className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4 space-y-2">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">⭐ Send via Stellar (Beta)</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono uppercase">Testnet</span>
                                              </div>
                                              <p className="text-xs text-muted-foreground mt-1">
                                                Route this Naira payout over the Stellar blockchain via a SEP-31 anchor instead of the default bank rail. Settles in seconds with an on-chain receipt.
                                              </p>
                                            </div>
                                            <Switch
                                              checked={useStellar}
                                              onCheckedChange={setUseStellar}
                                              aria-label="Use Stellar network"
                                            />
                                          </div>
                                        </motion.div>
                                        )}
                                        {productFeatures.flutterwave && canUseFincra && (
                                          <motion.div custom={2.8} variants={fieldVariants} initial="hidden" animate="show" className="rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-500/5 via-background to-teal-500/5 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-sm font-medium">Alternate bank payout (test)</span>
                                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-700 dark:text-teal-300 font-mono uppercase">Test</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                  Route this payout through an alternate bank rail. Requires a funded disbursement balance.
                                                </p>
                                              </div>
                                              <Switch checked={useFincra} onCheckedChange={setUseFincra} aria-label="Use alternate bank payout" />
                                            </div>
                                          </motion.div>
                                        )}
                                      </>
                                    ) : isGhanaBank ? (
                                      <>
                                        <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                          <Label>Recipient Bank</Label>
                                          <Select value={ghBankCode} onValueChange={setGhBankCode}>
                                            <SelectTrigger>
                                              <SelectValue placeholder={ghBanks.length ? "Select Ghanaian bank" : "Loading banks..."} />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[320px]">
                                              <div className="sticky top-0 z-10 bg-popover p-2 border-b">
                                                <div className="relative">
                                                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                  <Input
                                                    autoFocus
                                                    value={ghBankSearch}
                                                    onChange={(e) => setGhBankSearch(e.target.value)}
                                                    onKeyDown={(e) => e.stopPropagation()}
                                                    placeholder="Search bank..."
                                                    className="pl-8 h-8"
                                                  />
                                                </div>
                                              </div>
                                              {ghBanks
                                                .filter((b) => b.name.toLowerCase().includes(ghBankSearch.toLowerCase()))
                                                .map((b) => (
                                                  <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                          </Select>
                                        </motion.div>
                                        <motion.div custom={2.5} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                          <Label>Account Number</Label>
                                          <Input
                                            inputMode="numeric"
                                            placeholder="Recipient bank account number"
                                            value={ghAccountNumber}
                                            onChange={(e) => setGhAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 20))}
                                            className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
                                          />
                                          <p className="text-xs text-muted-foreground">Funds will be deposited directly to the GHS bank account above. Make sure the account number and recipient name match exactly.</p>
                                        </motion.div>
                                      </>
                                    ) : (
                                      <>
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
                                      <motion.div custom={2.5} variants={fieldVariants} initial="hidden" animate="show" className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/5 via-background to-indigo-500/5 p-4">
                                        {productFeatures.flutterwave ? (
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm font-medium">🟢 Send via PawaPay (Beta)</span>
                                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-primary font-mono uppercase">Beta</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                              Route this mobile money payout through PawaPay&apos;s pan-African network instead of the default provider.
                                            </p>
                                          </div>
                                            <Switch
                                            checked={usePawapay}
                                            onCheckedChange={setUsePawapay}
                                            aria-label="Use PawaPay network"
                                          />
                                        </div>
                                        ) : (
                                          <p className="text-xs text-muted-foreground">
                                            Ghana mobile money and Nigeria bank transfers are available today.
                                          </p>
                                        )}
                                      </motion.div>
                                      {canUsePaytotaPayout && (
                                        <motion.div custom={2.55} variants={fieldVariants} initial="hidden" animate="show" className="rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-500/5 via-background to-sky-500/5 p-4">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">Alternate MoMo payout (test)</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-700 dark:text-sky-300 font-mono uppercase">Test</span>
                                              </div>
                                              <p className="text-xs text-muted-foreground mt-1">
                                                Route this {targetCountry.code} mobile money payout through an alternate rail. Default rails stay available when off.
                                              </p>
                                            </div>
                                            <Switch
                                              checked={usePaytota}
                                              onCheckedChange={setUsePaytota}
                                              aria-label="Use alternate MoMo payout"
                                            />
                                          </div>
                                        </motion.div>
                                      )}
                                      {productFeatures.flutterwave && canUseFincra && (
                                        <motion.div custom={2.6} variants={fieldVariants} initial="hidden" animate="show" className="rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-500/5 via-background to-teal-500/5 p-4">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">Alternate MoMo payout (test)</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-700 dark:text-teal-300 font-mono uppercase">Test</span>
                                              </div>
                                              <p className="text-xs text-muted-foreground mt-1">
                                                Route this mobile money payout through an alternate rail instead of the default provider.
                                              </p>
                                            </div>
                                            <Switch checked={useFincra} onCheckedChange={setUseFincra} aria-label="Use alternate MoMo payout" />
                                          </div>
                                        </motion.div>
                                      )}
                                      </>
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
                                      {useLink ? (
                                        <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{recipientEmail}</span></div>
                                      ) : isBankPayout ? (
                                        <>
                                          <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">{isNGNBank ? (ngnBanks.find((b) => b.code === ngnBankCode)?.name || "—") : (ghBanks.find((b) => b.code === ghBankCode)?.name || "—")}</span></div>
                                          <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="font-medium">{isNGNBank ? ngnAccountNumber : ghAccountNumber}</span></div>
                                        </>
                                      ) : (
                                        <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-medium">{recipientPhone}</span></div>
                                      )}
                                      <div className="flex justify-between"><span className="text-muted-foreground">Destination</span><span className="font-medium">{targetCountry.flag} {targetCountry.country}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span className="font-medium">{useLink ? "Secure link (recipient picks)" : isBankPayout ? "Bank Transfer" : effectiveMethodLabel}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Funding</span><span className="font-medium capitalize">{fundingSource === "card" ? "Card" : fundingSource}</span></div>
                                    </div>
                                    <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
                                      <div className="flex justify-between"><span className="text-muted-foreground">You send</span><span className="font-medium">{sourceSymbol}{parsedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sourceCurrency}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-medium">{sourceSymbol}{fee.toFixed(2)}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span className="font-medium">1 {sourceCurrency} = {effectiveRate.toFixed(4)} {targetCountry.code}</span></div>
                                      <div className="flex justify-between text-base pt-2 border-t border-border"><span>They receive</span><span className="font-bold">{targetSymbol} {receivedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                    </div>
                                    {fundingSource === 'bank' && (
                                      <p className="text-xs text-muted-foreground text-center">Bank transfer — funds will be debited within 1-2 business days.</p>
                                    )}
                                    {fundingSource === "card" && (
                                      <p className="text-xs text-muted-foreground text-center">
                                        Next you’ll enter card details on our secure page. After payment, we automatically send to your recipient.
                                      </p>
                                    )}
                                    <div className="flex gap-3">
                                      <Button variant="outline" className="flex-1" onClick={() => goToStep(2)} disabled={confirming || creatingLink}>Back</Button>
                                      <Button className="flex-1" onClick={useLink ? handleCreateLink : requestConfirm} disabled={confirming || creatingLink}>
                                        {(confirming || creatingLink) ? (
                                          <span className="inline-flex items-center gap-2">
                                            <LoadingSpinner size={16} />
                                            Processing...
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-2">
                                            {fundingSource === "card" ? <CreditCard className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                                            {useLink ? "Send secure link" : fundingSource === "card" ? "Pay with card" : "Confirm Transfer"}
                                          </span>
                                        )}
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
                                {linkResult ? (
                                  <PaymentLinkSuccess
                                    result={linkResult}
                                    amountLabel={`${targetSymbol}${parsedAmount.toFixed(2)}`}
                                    recipientName={recipientName}
                                    onDone={resetForm}
                                  />
                                ) : (
                                  <TransferSuccess
                                    transferId={lastTransferId}
                                    amount={parsedAmount}
                                    currency={sourceCurrency}
                                    recipientName={recipientName}
                                    targetFlag={targetCountry.flag}
                                    onSendAnother={resetForm}
                                  />
                                )}
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
      </AppPage>

      <ContactsPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={applyBeneficiary}
      />

      <TransactionPinDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        onVerified={handlePinVerified}
        amountLabel={`${sourceSymbol}${parsedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sourceCurrency}`}
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
      <TopUpModal open={topUpOpen} onOpenChange={setTopUpOpen} defaultWalletId={selectedWallet?.wallet_id} title="Top up wallet" />
    </>
  );
};

export default SendPage;
