import { SYSTEM_DEFAULT_CURRENCY } from '@/lib/systemDefaults';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
// Flutterwave V3 SDK removed — V4 uses hosted payment links via the
// flw-initialize-payment edge function.
import ContactsPickerModal from "@/components/modals/ContactsPickerModal";
import AddBeneficiaryModal from "@/components/modals/AddBeneficiaryModal";
import ContactQuickField from "@/components/send/ContactQuickField";
import AddCardModal from "@/components/modals/AddCardModal";
import CreateWalletModal from "@/components/modals/CreateWalletModal";
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
import { usePriceQuote } from "@/hooks/usePriceQuote";
import { fetchFxRate, cardChargeCurrency, initializeFlwPayment, verifyFlwPayment } from "@/lib/flutterwave";
import {
  getNigeriaBanks,
  resolveNigeriaAccount,
  getNombaExchangeRate,
  isNgnPair,
} from "@/lib/nombaNigeria";
import { resolveEffectiveRate } from "@/lib/fx";
import { currencySymbol, countryToCurrency } from "@/lib/currency";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { ArrowRight, CheckCircle, Wallet, Landmark, CreditCard, AlertCircle, X, Search, Globe2, Lock, Loader2, Check, Shield, Users, ChevronDown } from "lucide-react";
import { BrandFlag, CountryFlag } from "@/components/ui/FlagImage";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CanadaSendFlow from "@/components/send/CanadaSendFlow";
import EfinmoneyP2PFlow from "@/components/send/EfinmoneyP2PFlow";
import MoneyFlowShell from "@/components/money/MoneyFlowShell";
import PaymentMethodRow, { type PaymentMethodOption } from "@/components/money/PaymentMethodRow";
import MethodCheckoutPanel from "@/components/send/MethodCheckoutPanel";
import FlutterwaveCardForm from "@/components/payments/FlutterwaveCardForm";


import { createPaymentLink, PaymentLinkSuccess, type PaymentLinkResult } from "@/components/send/PaymentLinkSuccess";
import { isClaimCardCurrency } from "@/lib/stripeCorridors";
import TransactionPinDialog from "@/components/send/TransactionPinDialog";
import LiveFxCalculator from "@/components/fx/LiveFxCalculator";
import { parseAmount } from "@/components/fx/liveFxUtils";
import SectionBoundary from "@/components/common/SectionBoundary";
import { clearSendHandoff, readSendHandoff } from "@/lib/sendHandoff";
import {
  clearCardSendIntent,
  clearPendingFlwTxn,
  markCardSendIntentConsumed,
  patchCardSendIntent,
  readCardSendIntent,
  readPendingFlwTxn,
  saveCardSendIntent,
  savePendingFlwTxn,
  type CardSendProvider,
} from "@/lib/cardSendIntent";
import {
  cardSendDestCurrencies,
  cardSendMinAmount,
  cardSendProvidersForCorridor,
  flutterwaveCardSendPaymentMethod,
  isCardSendCollectCurrency,
  pickBestCardProvider,
} from "@/lib/cardSendRails";
import {
  clearPendingNombaTxn,
  getNombaPayStatus,
  initiateNombaCollection,
  isNombaTopupCurrency,
  nombaMinAmount,
  readPendingNombaTxn,
  savePendingNombaTxn,
} from "@/lib/nombaPay";
import {
  clearPendingPaytotaTxn,
  confirmPaytotaPayment,
  getPaytotaPayStatus,
  initiatePaytotaCollection,
  readPendingPaytotaTxn,
  savePendingPaytotaTxn,
} from "@/lib/paytotaPay";
import {
  clearPendingSwychrTxn,
  getSwychrPayinStatus,
  initiateSwychrCollection,
  readPendingSwychrTxn,
  savePendingSwychrTxn,
  verifySwychrPayin,
} from "@/lib/swychrPay";
import { quoteDirectNombaTopup, quoteCadNombaTopup } from "@/lib/nombaTopupQuote";
import { productFeatures } from "@/lib/productFeatures";
import {
  buildFincraCardSendRedirectUrl,
  isFincraCheckoutCurrency,
  parseFincraReturnReference,
} from "@/lib/fincraTopup";
import LenhubFlutterTopUpCard from "@/components/payments/LenhubFlutterTopUpCard";
import { cn } from "@/lib/utils";
import AppPage from "@/components/layout/AppPage";
import TransferSuccess from "@/components/send/TransferSuccess";
import { findCountryById, findCountryByCode, COUNTRIES } from "@/lib/countries";
import { PRIORITY_SEND_CURRENCIES } from "@/lib/currencyPriority";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const looseDb = supabase as unknown as { from: (t: string) => any };



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
  const [showOtherFunding, setShowOtherFunding] = useState(false);
  const [amount, setAmount] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [targetCountryId, setTargetCountryId] = useState<string>("Kenya");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [lastTransferId, setLastTransferId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);     // pre-filled Add modal
  const [addCardOpen, setAddCardOpen] = useState(false);
  const createWalletTriggerRef = useRef<HTMLButtonElement>(null);
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
  const [cardSendProvider, setCardSendProvider] = useState<CardSendProvider | null>(null);
  const [showLenhubCollect, setShowLenhubCollect] = useState(false);
  const [fromQuickSend, setFromQuickSend] = useState(false);
  const [cardResumeProcessing, setCardResumeProcessing] = useState(false);
  const [cardResumeStage, setCardResumeStage] = useState<CardResumeStage>("confirming");
  const cardResumeLock = useRef(false);
  const cardResumeAbort = useRef(false);
  const [lenhubResumeTick, setLenhubResumeTick] = useState(0);

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

  // Domicile country decides the base currency; stored preference is the fallback.
  const profileCurrency = countryToCurrency(profile?.address_country || profile?.country_code)
    || profile?.default_currency
    || wallets?.find(w => w.is_default)?.currency_code
    || null;
  const baseCurrency = profileCurrency || SYSTEM_DEFAULT_CURRENCY;

  const selectedWallet = wallets?.find(w => w.wallet_id === selectedWalletId)
    || wallets?.find(w => w.currency_code === baseCurrency)
    || wallets?.find(w => w.is_default)
    || wallets?.[0];
  const targetCountry = findCountryById(targetCountryId) || COUNTRIES[0];

  // On first load, start on the wallet in the sender's base currency.
  useEffect(() => {
    if (selectedWalletId || !wallets?.length) return;
    const preferred = wallets.find(w => w.currency_code === baseCurrency)
      || wallets.find(w => w.is_default);
    if (preferred) setSelectedWalletId(preferred.wallet_id);
  }, [wallets, baseCurrency, selectedWalletId]);

  const activeSources = fundingSource === 'bank' ? bankSources : fundingSource === 'card' ? cardSources : [];
  const selectedExternalSource = activeSources.find(s => s.id === selectedSourceId) || activeSources[0];

  // Selected saved card (for card funding source) — drives charge currency
  const activeSavedCard = savedCards.find(c => c.stripe_payment_method_id === selectedSavedCardId)
    || savedCards.find(c => c.is_default)
    || savedCards[0];


  const sourceCurrency = fundingSource === 'wallet'
    ? (selectedWallet?.currency_code || profileCurrency || SYSTEM_DEFAULT_CURRENCY)
    : fundingSource === 'card'
    ? (selectedWallet && isCardSendCollectCurrency(selectedWallet.currency_code)
      ? selectedWallet.currency_code
      : (profileCurrency && isCardSendCollectCurrency(profileCurrency) ? profileCurrency : SYSTEM_DEFAULT_CURRENCY))
    : (selectedExternalSource?.currency_code || profileCurrency || SYSTEM_DEFAULT_CURRENCY);
  const sourceSymbol = currencySymbol(sourceCurrency);
  const targetSymbol = targetCountry.symbol || targetCountry.code;

  // Network picker (for countries that expose multiple mobile money networks, e.g. Zambia)
  const availableNetworks = targetCountry.networks;
  const activeNetwork = availableNetworks
    ? (availableNetworks.find(n => n.id === selectedNetworkId) || availableNetworks[0])
    : null;
  const effectivePayoutMethod = activeNetwork?.payout || targetCountry.payout;
  const effectiveMethodLabel = activeNetwork?.label || targetCountry.method;

  // Reset network/bank fields only when the destination country actually changes.
  // Do not clear when pendingBeneficiary flips null after a contact apply — that
  // was wiping prefilled NUBAN/bank right after they were set.
  const prevTargetCountryId = useRef(targetCountryId);
  useEffect(() => {
    const countryChanged = prevTargetCountryId.current !== targetCountryId;
    prevTargetCountryId.current = targetCountryId;
    if (!countryChanged) return;

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
  }, [targetCountryId, pendingBeneficiary]);

  const isNGNBank = targetCountry.code === "NGN";
  const isGhanaBank = targetCountry.code === "GHS" && ghPayoutMode === "bank";
  const isBankPayout = isNGNBank || isGhanaBank;
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

  // --- Canonical pricing (central rate card via price-quote) ---
  const destPayoutMethod = isBankPayout ? 'bank' : 'mobile_money';
  const { data: priceQuote } = usePriceQuote({
    direction: 'payout',
    sourceCurrency,
    destCurrency: targetCountry.code,
    destCountry: targetCountry.code,
    paymentMethod: destPayoutMethod,
    amount: parsedAmount,
    legs: fundingSource === 'card'
      ? [{ label: 'card_funding', direction: 'payin' as const, payment_method: 'card', amount: parsedAmount }]
      : [],
  });

  const cardFundingLeg = priceQuote?.legs?.find((l) => l.label === 'card_funding');
  const baseFee = priceQuote && !priceQuote.pricing_missing
    ? Number(priceQuote.fee)
    : (pricing?.transfer_base_fee ?? 0);
  const cardFee = fundingSource === 'card'
    ? (cardFundingLeg && !cardFundingLeg.pricingMissing
      ? Number(cardFundingLeg.fee)
      : (pricing?.transfer_card_surcharge ?? 0))
    : 0;
  const fee = parsedAmount > 0
    ? (priceQuote && !priceQuote.pricing_missing && Number.isFinite(Number(priceQuote.total_fee))
      ? Number(priceQuote.total_fee)
      : baseFee + cardFee)
    : 0;

  const testRate = testSendFxRate(sourceCurrency, targetCountry.code);
  const directDbRate =
    fxRate && Number(fxRate.effective_rate) > 0 ? Number(fxRate.effective_rate) : null;
  const derivedRate = derivedFxRate && Number(derivedFxRate) > 0 ? Number(derivedFxRate) : null;
  // Prefer Nomba for NGN pairs, else fx_rates / derived — apply price-quote margin once
  const rawRate = isSameCurrency
    ? 1
    : testRate ?? nombaRate ?? resolvedDbRate ?? directDbRate ?? derivedRate ?? 0;
  const fxMarginBps = Number(priceQuote?.fx_margin_bps ?? 0);
  const effectiveRate = rawRate > 0 && !testRate && fxMarginBps > 0
    ? rawRate * (1 - fxMarginBps / 10_000)
    : rawRate;
  const rateAvailable = isSameCurrency || effectiveRate > 0;
  // Fee is charged on top: recipient gets the full send amount converted.
  const receivedAmount = parsedAmount > 0 && rateAvailable
    ? Math.max(0, parsedAmount * effectiveRate)
    : 0;
  /** What the customer actually pays / is debited: amount + fee. */
  const totalCharge = parsedAmount > 0 ? parsedAmount + fee : 0;

  const noLinkedSource = fundingSource === 'bank' && activeSources.length === 0;
  const insufficientFunds = fundingSource === 'wallet'
    && !!selectedWallet
    && parsedAmount > 0
    && totalCharge > Number(selectedWallet.balance);

  const cardWallets = useMemo(
    () =>
      (wallets ?? []).filter((w) => {
        const c = w.currency_code.toUpperCase();
        if (!isCardSendCollectCurrency(c)) return false;
        if (c === "NGN") {
          return productFeatures.nombaNigeria || productFeatures.lenhubFlutter || productFeatures.flutterwave;
        }
        if (["USD", "CAD"].includes(c)) {
          return productFeatures.lenhubFlutter || productFeatures.paytota || productFeatures.flutterwave;
        }
        if (["EUR", "GBP"].includes(c)) {
          return productFeatures.lenhubFlutter || productFeatures.paytota;
        }
        if (c === "GHS") return productFeatures.lenhubFlutter || productFeatures.flutterwave;
        if (c === "RWF") return productFeatures.paytota || productFeatures.flutterwave;
        if (c === "TZS" || c === "ZMW") return productFeatures.flutterwave;
        if (c === "XAF" || c === "XOF") return productFeatures.swychr;
        if (c === "KES" || c === "UGX") {
          return productFeatures.lenhubFlutter || productFeatures.paytota || productFeatures.swychr || productFeatures.flutterwave;
        }
        return false;
      }),
    [wallets],
  );
  const cardWalletCodes = useMemo(
    () => [...new Set(cardWallets.map((w) => w.currency_code))],
    [cardWallets],
  );
  const cardPayoutCodes = useMemo(
    () => cardSendDestCurrencies(sourceCurrency),
    [sourceCurrency],
  );
  const cardTransferTypeForDest = useMemo((): "bank" | "mobile_money" => {
    return targetCountry.code === "NGN" ? "bank" : "mobile_money";
  }, [targetCountry.code]);
  const availableCardProviders = useMemo(
    () =>
      fundingSource === "card"
        ? cardSendProvidersForCorridor(sourceCurrency, targetCountry.code, cardTransferTypeForDest)
        : [],
    [fundingSource, sourceCurrency, targetCountry.code, cardTransferTypeForDest],
  );
  const cardSendEnabled = cardWallets.length > 0 && (
    productFeatures.fincra
    || productFeatures.nombaNigeria
    || productFeatures.lenhubFlutter
    || productFeatures.paytota
    || productFeatures.swychr
    || productFeatures.flutterwave
  );

  const cardCheckoutQuote = useMemo(() => {
    if (fundingSource !== "card" || parsedAmount <= 0) return null;
    if (cardSendProvider !== "nomba") return null;
    if (sourceCurrency.toUpperCase() === "CAD" && fxRates?.length) {
      return quoteCadNombaTopup(totalCharge, fxRates);
    }
    if (isNombaTopupCurrency(sourceCurrency) && sourceCurrency.toUpperCase() !== "CAD") {
      return quoteDirectNombaTopup(totalCharge, sourceCurrency);
    }
    return null;
  }, [fundingSource, totalCharge, sourceCurrency, fxRates, cardSendProvider]);

  // Prefer a valid card-collect wallet + destination when paying by card
  useEffect(() => {
    if (fundingSource !== "card") return;
    if (cardWallets.length === 0) return;
    const currentOk = cardWallets.some((w) => w.wallet_id === selectedWalletId);
    if (!currentOk) {
      const preferred =
        cardWallets.find((w) => w.currency_code === "NGN") || cardWallets[0];
      if (preferred) setSelectedWalletId(preferred.wallet_id);
    }
    if (cardPayoutCodes.length > 0 && !cardPayoutCodes.includes(targetCountry.code)) {
      const first = findCountryByCode(cardPayoutCodes[0]);
      if (first) setTargetCountryId(first.id);
    }
  }, [fundingSource, cardWallets, selectedWalletId, targetCountry.code, cardPayoutCodes]);

  // Auto-pick card processor — customer never chooses a rail
  useEffect(() => {
    if (fundingSource !== "card") {
      setCardSendProvider(null);
      return;
    }
    setCardSendProvider(
      pickBestCardProvider(sourceCurrency, targetCountry.code, cardTransferTypeForDest),
    );
  }, [fundingSource, sourceCurrency, targetCountry.code, cardTransferTypeForDest]);

  // Card send to GHS uses MoMo (Lenhub has no GH bank payout)
  useEffect(() => {
    if (fundingSource === "card" && targetCountry.code === "GHS" && ghPayoutMode !== "mobile") {
      setGhPayoutMode("mobile");
    }
  }, [fundingSource, targetCountry.code, ghPayoutMode]);

  const walletCurrencyCodes = useMemo(
    () => [...new Set((wallets ?? []).map((w) => w.currency_code))],
    [wallets],
  );
  const payoutCurrencyCodes = useMemo(() => COUNTRIES.map((c) => c.code), []);

  const calcQuoteRecipient = useCallback(
    (sendInFrom: number) => {
      if (!rateAvailable || effectiveRate <= 0) return 0;
      return Math.max(0, sendInFrom * effectiveRate);
    },
    [rateAvailable, effectiveRate],
  );
  const calcQuoteSend = useCallback(
    (recvInTo: number) => {
      if (!rateAvailable || effectiveRate <= 0) return 0;
      return recvInTo / effectiveRate;
    },
    [rateAvailable, effectiveRate],
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
      ? `+${sourceSymbol}${fee.toFixed(2)} fee`
      : `${sourceSymbol}0.00 fee`;

  const feeNote = parsedAmount > 0 && fee > 0
    ? `+${sourceSymbol}${fee.toFixed(2)} ${sourceCurrency} fee added · total ${sourceSymbol}${totalCharge.toFixed(2)} ${sourceCurrency}`
    : undefined;

  /**
   * The Flutterwave rail supports direct card charges, so we can collect
   * cardholder name / number / expiry / CVV in-app. Every other card rail is
   * a hosted redirect where the partner collects the details.
   */
  const inlineCardEntry =
    fundingSource === "card" && cardSendProvider === "flutterwave" && !!selectedWallet;


  const goToStep = useCallback((next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    if (next === 4) clearSendHandoff();
  }, [step]);

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
    () => (usdRate ? Math.round(totalCharge * usdRate * 100) / 100 : 0),
    [totalCharge, usdRate]
  );

  const txRef = useMemo(
    () => (user ? `send-${user.id.slice(0, 8)}-${Date.now()}` : ""),
    [step, user]
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
        if (isNew) {
          toast.success("Saved as a contact");
        }
      } catch { /* non-fatal */ }
    }
    return transfer.id;
  };

  const createTransferRecordRef = useRef(createTransferRecord);
  createTransferRecordRef.current = createTransferRecord;

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

  const handleConfirm = async (fundingOverride?: "wallet" | "card" | "bank") => {
    if (confirming) return;
    setConfirming(true);
    const funding = fundingOverride ?? fundingSource;

    // ── Wallet: create + execute payout immediately ──────────────────────
    if (funding === 'wallet') {
      if (!selectedWallet) { setConfirming(false); return; }
      try {
        const tid = await createTransferRecord({ funding_source: "wallet" });

        let data: any = null;
        let invokeErr: any = null;
        try {
          const res = await supabase.functions.invoke('execute-transfer', {
            body: {
              transfer_id: tid,
              recipient_country_hint: targetCountry.country,
            },
          });
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
          const rawMsg = data.error || data?.payout?.error || data?.provider_message || 'Payout failed';
          const msg = /trade region|trade context|not found for trade/i.test(String(rawMsg))
            ? 'This currency pair isn\'t supported for this corridor yet. Please switch to a CAD wallet or contact support.'
            : rawMsg;
          // Defensive: if the edge function reports a refund or payout failure
          // but didn't already mark the row failed, do it client-side so the
          // user isn't stuck on "processing".
          const looksTerminal = /refund|payout failed|unavailable|provider setup|not enabled|whitelist|stub/i.test(String(msg));
          if (looksTerminal || refunded || data?.success === false) {
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
          // Still open tracking so the failure reason is visible on the page.
          setLastTransferId(tid);
          goToStep(4);
          return;
        }
        if (invokeErr) throw new Error(invokeErr.message || 'Payout failed');
        // Guard against false success (stub / funded with no provider handoff)
        if (data?.payout?.stub === true || data?.payout?.success === false) {
          const rawMsg = data?.payout?.error || data?.error || 'Payout provider did not accept this transfer.';
          try {
            await supabase.from('transfers')
              .update({ status: 'failed', failure_reason: String(rawMsg).slice(0, 500) })
              .eq('id', tid);
          } catch { /* ignore */ }
          toast.error(rawMsg, { duration: 10000 });
          setLastTransferId(tid);
          goToStep(4);
          return;
        }
        try {
          const { data: row } = await supabase.from('transfers').select('status,failure_reason,provider_reference').eq('id', tid).maybeSingle();
          if (row?.status === 'failed') {
            toast.error(row.failure_reason || 'Payout failed', { duration: 10000 });
            setLastTransferId(tid);
            goToStep(4);
            return;
          }
          if (row && ['funded', 'initiated'].includes(row.status) && !row.provider_reference) {
            const stuckMsg = 'Payout did not start with the provider. Tap Refresh on the tracking page to see the real error.';
            toast.error(stuckMsg, { duration: 10000 });
            setLastTransferId(tid);
            goToStep(4);
            return;
          }
        } catch { /* ignore */ }
        qc.invalidateQueries({ queryKey: ["wallets"] });
        qc.invalidateQueries({ queryKey: ["transfers"] });
        qc.invalidateQueries({ queryKey: ["dashboard-transfers"] });
        const payout = data?.payout;
        const redirectUrl = payout?.redirect_url;
        goToStep(4);
        if (redirectUrl) {
          const opened = window.open(redirectUrl, '_blank', 'noopener,noreferrer');
          if (!opened) {
            toast.error('Pop-up blocked. Allow pop-ups for this site, then tap the link in your transfer to complete payment.', { duration: 10000 });
          } else {
            toast.success('Please complete the verification on the payment page to finalize your transfer.', { duration: 10000 });
          }
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
    if (funding === 'bank') {
      try {
        const tid = await createTransferRecord();
        await supabase.from('transfers').update({ status: 'processing' }).eq('id', tid);
        qc.invalidateQueries({ queryKey: ["transfers"] });
        qc.invalidateQueries({ queryKey: ["dashboard-transfers"] });
        toast.success('Bank transfer initiated — funds will be debited within 1-2 business days');
        goToStep(4);
      } catch (e: any) {
        toast.error(e?.message || 'Could not initiate bank transfer');
      } finally {
        setConfirming(false);
      }
      return;
    }

    // ── Card: Fincra → Flutterwave → Nomba… collect → credit → payout ─
    if (funding === "card") {
      try {
        if (!selectedWallet || !isCardSendCollectCurrency(selectedWallet.currency_code)) {
          toast.error("Pick a supported card currency wallet first.");
          setConfirming(false);
          return;
        }
        const provider = cardSendProvider || availableCardProviders[0];
        if (!provider) {
          toast.error("No card rail available for this corridor.");
          setConfirming(false);
          return;
        }
        const minAmt = cardSendMinAmount(provider, selectedWallet.currency_code);
        if (parsedAmount < minAmt) {
          toast.error(`Card sends need at least ${minAmt} ${selectedWallet.currency_code}.`);
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
        const transferType: "bank" | "mobile_money" = isNGNBank ? "bank" : "mobile_money";
        const payoutMethod = isNGNBank ? "bank" : (effectivePayoutMethod || "mobile_money");
        const intentBase = {
          walletId: selectedWallet.wallet_id,
          sourceCurrency,
          sourceAmount: parsedAmount,
          targetCountryId,
          targetCurrency: targetCountry.code,
          targetAmount: receivedAmount,
          exchangeRate: effectiveRate,
          feeAmount: fee,
          recipientName,
          recipientPhone: isNGNBank ? "" : recipientPhone,
          payoutMethod,
          transferType,
          recipientAccount: isNGNBank ? ngnAcct : undefined,
          recipientBankCode: isNGNBank ? ngnBankCode : undefined,
          recipientBankName: isNGNBank ? ngnBank : null,
          networkId: selectedNetworkId || null,
          ghPayoutMode: targetCountry.code === "GHS" ? ("mobile" as const) : undefined,
          useStellar: false,
          usePawapay: false,
          useFincra: false,
          usePaytota: false,
          useLenhubFlutter: false,
          useSwychr: false,
          useFlutterwave: false,
          useFincraCollect: false,
          recipientCountryHint: targetCountry.country,
        };

        if (provider === "fincra") {
          if (!isFincraCheckoutCurrency(selectedWallet.currency_code)) {
            toast.error(`Secure checkout does not support ${selectedWallet.currency_code}. Try another payment method.`);
            setConfirming(false);
            return;
          }
          const { url: redirectUrl, usesProductionReturn } = buildFincraCardSendRedirectUrl();
          if (usesProductionReturn) {
            toast.info("After payment, you will return to efin.money (required for checkout).");
          }
          const reference =
            `cardsend-fincra-${(user.id || "anon").slice(0, 8)}-${selectedWallet.wallet_id.slice(0, 8)}-${Date.now()}`;
          const { data, error } = await supabase.functions.invoke("fincra-initialize-checkout", {
            body: {
              amount: totalCharge,
              currency: selectedWallet.currency_code,
              charge_amount: totalCharge,
              charge_currency: selectedWallet.currency_code,
              credit_amount: totalCharge,
              credit_currency: selectedWallet.currency_code,
              redirectUrl,
              reference,
              walletId: selectedWallet.wallet_id,
            },
          });
          if (error) throw error;
          const link = (data as { payment_link?: string; error?: string })?.payment_link;
          if ((data as { error?: string })?.error || !link) {
            throw new Error((data as { error?: string })?.error || "Checkout link was empty");
          }
          saveCardSendIntent({
            ...intentBase,
            provider: "fincra",
            fincraReference: reference,
            useFincraCollect: true,
          });
          toast.message("Opening secure card checkout…");
          window.location.href = link;
          return;
        }

        if (provider === "nomba") {
          if (targetCountry.code !== "NGN" || !isNGNBank) {
            toast.error("Express card currently pays out to Nigerian bank accounts only.");
            setConfirming(false);
            return;
          }
          const returnUrl = `${window.location.origin}/send?cardSend=1&provider=nomba&walletId=${encodeURIComponent(selectedWallet.wallet_id)}`;
          const collection = await initiateNombaCollection({
            credit_amount: totalCharge,
            amount: totalCharge,
            target_wallet_id: selectedWallet.wallet_id,
            email: user.email,
            corridor: "nigeria",
            return_url: returnUrl,
          });
          if (!collection.payment_link) {
            throw new Error("Checkout link was empty — try again or use wallet balance.");
          }
          saveCardSendIntent({
            ...intentBase,
            provider: "nomba",
            nombaTxnId: collection.transaction_id,
          });
          savePendingNombaTxn(collection.transaction_id);
          toast.message("Opening secure card checkout…");
          window.location.href = collection.payment_link;
          return;
        }

        if (provider === "lenhub") {
          saveCardSendIntent({
            ...intentBase,
            provider: "lenhub",
          });
          setShowLenhubCollect(true);
          setConfirming(false);
          toast.message("Enter your card to fund this send…");
          return;
        }

        if (provider === "paytota") {
          const returnUrl = `${window.location.origin}/send?cardSend=1&provider=paytota&walletId=${encodeURIComponent(selectedWallet.wallet_id)}`;
          const collection = await initiatePaytotaCollection({
            amount: totalCharge,
            credit_amount: totalCharge,
            target_wallet_id: selectedWallet.wallet_id,
            email: user.email,
            phone: recipientPhone || undefined,
            return_url: returnUrl,
          });
          saveCardSendIntent({
            ...intentBase,
            provider: "paytota",
            paytotaTxnId: collection.transaction_id,
          });
          savePendingPaytotaTxn(collection.transaction_id);
          if (collection.payment_link) {
            toast.message("Opening MoMo checkout…");
            window.location.href = collection.payment_link;
            return;
          }
          // Africa STK — stay on Send and poll
          toast.message("Approve the payment on your phone…");
          const next = new URLSearchParams(searchParams);
          next.set("cardSend", "1");
          next.set("provider", "paytota");
          next.set("walletId", selectedWallet.wallet_id);
          setSearchParams(next, { replace: true });
          setConfirming(false);
          return;
        }

        if (provider === "swychr") {
          const returnUrl = `${window.location.origin}/send?cardSend=1&provider=swychr&walletId=${encodeURIComponent(selectedWallet.wallet_id)}`;
          const collection = await initiateSwychrCollection({
            amount: totalCharge,
            target_wallet_id: selectedWallet.wallet_id,
            email: user.email,
            name: recipientName || user.email.split("@")[0],
            mobile: recipientPhone || undefined,
            return_url: returnUrl,
          });
          const txnId = collection.swychr_transaction_id || collection.transaction_id;
          if (!txnId || !collection.payment_link) {
            throw new Error(collection.message || "Checkout link was empty");
          }
          saveCardSendIntent({
            ...intentBase,
            provider: "swychr",
            swychrTxnId: txnId,
          });
          savePendingSwychrTxn(txnId);
          toast.message("Opening mobile checkout…");
          window.location.href = collection.payment_link;
          return;
        }

        if (provider === "flutterwave") {
          const returnUrl =
            `${window.location.origin}/send?cardSend=1&provider=flutterwave&walletId=${encodeURIComponent(selectedWallet.wallet_id)}`;
          const collection = await initializeFlwPayment({
            amount: totalCharge,
            currency: selectedWallet.currency_code,
            paymentMethod: flutterwaveCardSendPaymentMethod(selectedWallet.currency_code),
            walletId: selectedWallet.wallet_id,
            redirectUrl: returnUrl,
            phone: recipientPhone || undefined,
          });
          const txRef = collection.reference;
          if (!txRef || !collection.payment_link) {
            throw new Error(collection.error || collection.message || "Checkout link was empty");
          }
          saveCardSendIntent({
            ...intentBase,
            provider: "flutterwave",
            flwTxRef: txRef,
          });
          savePendingFlwTxn(txRef);
          toast.message("Opening card checkout…");
          window.location.href = collection.payment_link;
          return;
        }

        throw new Error("Unsupported card rail");
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

  const applyBeneficiary = useCallback((b: Beneficiary) => {
    setRecipientName(b.name);
    setRecipientPhone(b.phone || "");
    setPickedBeneficiaryId(b.id);
    setPendingBeneficiary(b);
    // Prefill bank details immediately when present (effect below also reconciles
    // bank_code via name match once the banks list loads).
    if (b.bank_account) {
      setNgnAccountNumber(String(b.bank_account).replace(/\D/g, "").slice(0, 10));
    }
    if (b.bank_code) {
      setNgnBankCode(String(b.bank_code));
    }
    if (b.country_code === "GHS" || b.country_code === "GH") {
      if (b.bank_account) {
        setGhPayoutMode("bank");
        setGhAccountNumber(String(b.bank_account).replace(/\D/g, "").slice(0, 20));
      }
      if (b.bank_code) setGhBankCode(String(b.bank_code));
    }
    if (b.country_code) {
      const c = findCountryByCode(b.country_code);
      if (c) setTargetCountryId(c.id);
    }
  }, []);

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
      if (b.bank_account) {
        const acct = String(b.bank_account).replace(/\D/g, "").slice(0, 10);
        if (ngnAccountNumber !== acct) setNgnAccountNumber(acct);
      }
      if (b.bank_code) {
        if (ngnBankCode !== b.bank_code) setNgnBankCode(b.bank_code);
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
    } else if (targetCountry.code === "GHS" && (b.bank_account || b.bank_code)) {
      setGhPayoutMode("bank");
      if (b.bank_account) {
        const acct = String(b.bank_account).replace(/\D/g, "").slice(0, 20);
        if (ghAccountNumber !== acct) setGhAccountNumber(acct);
      }
      if (b.bank_code && ghBankCode !== b.bank_code) setGhBankCode(b.bank_code);
      else if (b.bank_name && !ghBankCode) {
        if (ghBanks.length === 0) allApplied = false;
        else {
          const wanted = b.bank_name.trim().toLowerCase();
          const match =
            ghBanks.find((x) => x.name.toLowerCase() === wanted) ||
            ghBanks.find((x) => x.name.toLowerCase().includes(wanted));
          if (match) setGhBankCode(match.code);
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
  }, [pendingBeneficiary, targetCountryId, ngnBanks, availableNetworks]);

  useEffect(() => {
    const bid = searchParams.get("beneficiaryId");
    if (bid && beneficiaries) {
      const b = beneficiaries.find((x) => x.id === bid);
      if (b) {
        applyBeneficiary(b);
        goToStep(2);
        const next = new URLSearchParams(searchParams);
        next.delete("beneficiaryId");
        setSearchParams(next, { replace: true });
      }
    }
  }, [beneficiaries, searchParams, goToStep, applyBeneficiary]);

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
  }, [wallets, searchParams, beneficiaries, goToStep]);

  // Resume card-funded send after collect (Nomba / Lenhub / Paytota / Swychr / Flutterwave)
  useEffect(() => {
    const createTransferRecord = createTransferRecordRef.current;
    if (!wallets?.length || cardResumeLock.current) return;

    const intent = readCardSendIntent();
    const cardSendFlag = searchParams.get("cardSend") === "1";
    const nombaStatus = searchParams.get("nomba");
    const paytotaStatus = searchParams.get("paytota");
    const swychrStatus = searchParams.get("swychr");
    const flwStatus = searchParams.get("status") || searchParams.get("flw");
    const flwTxFromUrl = searchParams.get("tx_ref") || searchParams.get("txRef");
    const flwTxnIdFromUrl = searchParams.get("transaction_id");
    const fincraRefFromUrl = parseFincraReturnReference(window.location.search);
    const providerParam = (searchParams.get("provider") || intent?.provider || "").toLowerCase();
    const pendingNomba = intent?.nombaTxnId || readPendingNombaTxn();
    const pendingPaytota = intent?.paytotaTxnId || readPendingPaytotaTxn();
    const pendingSwychr = intent?.swychrTxnId || readPendingSwychrTxn();
    const pendingFlw = intent?.flwTxRef || readPendingFlwTxn() || flwTxFromUrl;
    const pendingFincra =
      intent?.fincraReference
      || (fincraRefFromUrl?.startsWith("cardsend-fincra-") ? fincraRefFromUrl : null);
    const lenhubReady = intent?.provider === "lenhub" && !!intent.lenhubChargeId && lenhubResumeTick > 0;

    const stripResumeParams = (next: URLSearchParams) => {
      for (const key of [
        "cardSend", "nomba", "paytota", "swychr", "walletId", "orderId", "provider",
        "transaction_id", "tx_ref", "txRef", "status", "flw", "reference",
      ]) {
        next.delete(key);
      }
    };

    if (!intent || intent.status === "consumed") {
      if (cardSendFlag || nombaStatus || paytotaStatus || swychrStatus || flwTxFromUrl
        || (fincraRefFromUrl?.startsWith("cardsend-fincra-"))) {
        const next = new URLSearchParams(searchParams);
        stripResumeParams(next);
        setSearchParams(next, { replace: true });
      }
      return;
    }

    const provider = (intent.provider || providerParam || "nomba") as CardSendProvider;
    const failedReturn =
      nombaStatus === "failed"
      || paytotaStatus === "failed"
      || paytotaStatus === "cancelled"
      || swychrStatus === "failed"
      || flwStatus === "cancelled"
      || flwStatus === "failed"
      || searchParams.get("cancelled") === "1"
      || searchParams.get("cancel") === "1";

    // Only resume when the PSP actually returned us (URL evidence).
    // Do NOT start from sessionStorage alone — browser Back from checkout
    // restores /send with a pending intent and would fake "Confirming…".
    const shouldStart =
      lenhubReady
      || cardSendFlag
      || nombaStatus === "success"
      || paytotaStatus === "success"
      || swychrStatus === "success"
      || flwStatus === "successful"
      || flwStatus === "success"
      || flwStatus === "completed"
      || !!flwTxFromUrl
      || !!flwTxnIdFromUrl
      || (!!fincraRefFromUrl?.startsWith("cardsend-fincra-") && provider === "fincra");

    if (!shouldStart && !failedReturn) return;

    if (failedReturn) {
      clearCardSendIntent();
      clearPendingNombaTxn();
      clearPendingPaytotaTxn();
      clearPendingSwychrTxn();
      clearPendingFlwTxn();
      toast.error("Card payment failed or was cancelled. No transfer was sent.");
      const next = new URLSearchParams(searchParams);
      stripResumeParams(next);
      setSearchParams(next, { replace: true });
      return;
    }

    cardResumeLock.current = true;
    cardResumeAbort.current = false;
    setCardResumeStage("confirming");
    setCardResumeProcessing(true);

    const stripParams = () => {
      const next = new URLSearchParams(searchParams);
      let changed = false;
      for (const key of [
        "cardSend", "nomba", "paytota", "swychr", "walletId", "orderId", "provider",
        "transaction_id", "tx_ref", "txRef", "status", "flw", "reference",
      ]) {
        if (next.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      if (changed) setSearchParams(next, { replace: true });
    };

    const finishPayout = async () => {
      const sleep = (ms: number) => new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => {
          if (cardResumeAbort.current) reject(new Error("cancelled"));
          else resolve();
        }, ms);
        if (cardResumeAbort.current) {
          clearTimeout(t);
          reject(new Error("cancelled"));
        }
      });

      try {
        if (cardResumeAbort.current) throw new Error("cancelled");
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

        let paid = false;
        if (provider === "lenhub") {
          const chargeId = intent.lenhubChargeId;
          if (!chargeId) throw new Error("Missing payment reference");
          for (let i = 0; i < 40; i++) {
            if (cardResumeAbort.current) throw new Error("cancelled");
            const { data } = await looseDb
              .from("lenhub_flutter_charges")
              .select("status, credited_at")
              .eq("id", chargeId)
              .maybeSingle();
            if (data?.credited_at || data?.status === "credited" || data?.status === "success") {
              paid = true;
              break;
            }
            if (data?.status === "failed" || data?.status === "cancelled") {
              throw new Error("Card payment failed");
            }
            await sleep(1500);
          }
        } else if (provider === "paytota") {
          const txnId = intent.paytotaTxnId || pendingPaytota;
          if (!txnId) throw new Error("Missing payment reference");
          for (let i = 0; i < 40; i++) {
            if (cardResumeAbort.current) throw new Error("cancelled");
            try {
              await confirmPaytotaPayment({
                transaction_id: txnId,
                wallet_id: intent.walletId,
              });
            } catch { /* ignore confirm errors while polling */ }
            const status = await getPaytotaPayStatus(txnId);
            if (status?.status === "completed") {
              paid = true;
              break;
            }
            if (status?.status === "failed" || status?.status === "cancelled") {
              throw new Error(status.failure_reason || "Card payment failed");
            }
            await sleep(1500);
          }
        } else if (provider === "swychr") {
          const txnId = intent.swychrTxnId || pendingSwychr;
          if (!txnId) throw new Error("Missing payment reference");
          for (let i = 0; i < 40; i++) {
            if (cardResumeAbort.current) throw new Error("cancelled");
            try {
              await verifySwychrPayin(txnId);
            } catch { /* ignore */ }
            const status = await getSwychrPayinStatus(txnId);
            if (status?.status === "completed" || status?.status === "success" || status?.status === "credited") {
              paid = true;
              break;
            }
            if (status?.status === "failed" || status?.status === "cancelled") {
              throw new Error(status.failure_reason || "Card payment failed");
            }
            await sleep(1500);
          }
        } else if (provider === "flutterwave") {
          const txRef = intent.flwTxRef || pendingFlw || undefined;
          const txnId = intent.flwTransactionId || flwTxnIdFromUrl || undefined;
          if (!txRef && !txnId) throw new Error("Missing payment reference");
          for (let i = 0; i < 40; i++) {
            if (cardResumeAbort.current) throw new Error("cancelled");
            const verified = await verifyFlwPayment({
              tx_ref: txRef,
              transaction_id: txnId,
            });
            if (verified?.verified) {
              paid = true;
              break;
            }
            if (verified?.status === "failed" || verified?.status === "cancelled") {
              throw new Error(verified.error || "Card payment failed");
            }
            await sleep(1500);
          }
        } else if (provider === "fincra") {
          const reference = pendingFincra || intent.fincraReference;
          if (!reference) throw new Error("Missing payment reference");
          const session = (await supabase.auth.getSession()).data.session;
          for (let i = 0; i < 40; i++) {
            if (cardResumeAbort.current) throw new Error("cancelled");
            const url =
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fincra-verify-payment?reference=${encodeURIComponent(reference)}`;
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${session?.access_token || ""}` },
            });
            const json = await res.json().catch(() => ({}));
            if (json?.verified) {
              paid = true;
              break;
            }
            if (json?.status === "failed" || json?.status === "cancelled" || json?.error === "Payment failed") {
              throw new Error(json?.error || "Card payment failed");
            }
            await sleep(1500);
          }
        } else {
          const txnId = intent.nombaTxnId || pendingNomba;
          if (!txnId) throw new Error("Missing card payment reference");
          for (let i = 0; i < 40; i++) {
            if (cardResumeAbort.current) throw new Error("cancelled");
            const status = await getNombaPayStatus(txnId);
            if (status?.status === "completed") {
              paid = true;
              break;
            }
            if (status?.status === "failed" || status?.status === "cancelled") {
              throw new Error(status.failure_reason || "Card payment failed");
            }
            await sleep(1500);
          }
        }
        if (cardResumeAbort.current) throw new Error("cancelled");
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
        clearPendingPaytotaTxn();
        clearPendingSwychrTxn();
        clearPendingFlwTxn();
        stripParams();
        setShowLenhubCollect(false);

        const res = await supabase.functions.invoke("execute-transfer", {
          body: {
            transfer_id: tid,
            recipient_country_hint: intent.recipientCountryHint,
          },
        });
        let data: any = res.data;
        if (res.error && !data && (res.error as any)?.context?.response) {
          try { data = await (res.error as any).context.response.json(); } catch { /* ignore */ }
        }
        if (res.error && !data?.success) {
          throw new Error(data?.error || (res.error as Error).message || "Payout failed");
        }

        clearCardSendIntent();
        qc.invalidateQueries({ queryKey: ["wallets"] });
        qc.invalidateQueries({ queryKey: ["transfers"] });
        qc.invalidateQueries({ queryKey: ["dashboard-transfers"] });
        toast.success("Card charged — transfer sent to your recipient!");
        goToStep(4);
      } catch (e: any) {
        if (e?.message === "cancelled" || cardResumeAbort.current) {
          toast.message("Payment cancelled", { description: "No transfer was sent." });
        } else {
          toast.error(e?.message || "Could not complete transfer after card payment");
        }
        stripParams();
      } finally {
        setCardResumeProcessing(false);
        setCardResumeStage("confirming");
        cardResumeLock.current = false;
        cardResumeAbort.current = false;
      }
    };

    void finishPayout();
  }, [wallets, searchParams, lenhubResumeTick, goToStep]);

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
    && receivedAmount > 0
    && rateAvailable
    && !noLinkedSource
    && !insufficientFunds
    && (fundingSource !== "card" || (
      cardSendEnabled
      && cardPayoutCodes.includes(targetCountry.code)
      && availableCardProviders.length > 0
      && !!cardSendProvider
      && parsedAmount >= cardSendMinAmount(cardSendProvider, sourceCurrency)
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
  const cardFundingAvailable = productFeatures.nombaNigeria || productFeatures.lenhubFlutter
    || productFeatures.paytota || productFeatures.swychr || productFeatures.flutterwave;

  const fundingMethodOptions: PaymentMethodOption<"wallet" | "bank" | "card">[] = [
    ...(cardFundingAvailable
      ? [{ id: "card" as const, label: "Card", sublabel: "Debit or credit", icon: CreditCard, tone: "card" as const }]
      : []),
    ...(productFeatures.plaid
      ? [{ id: "bank" as const, label: "Bank", sublabel: "Linked account", icon: Landmark, tone: "bank" as const }]
      : []),
    { id: "wallet" as const, label: "Wallet", sublabel: "eFinMoney balance", icon: Wallet, tone: "wallet" as const },
  ];

  const fundingOptions = ([
    { v: "wallet" as const, icon: Wallet, label: "Wallet" },
    ...(productFeatures.plaid ? [{ v: "bank" as const, icon: Landmark, label: "Bank" }] : []),
    ...((productFeatures.nombaNigeria || productFeatures.lenhubFlutter || productFeatures.paytota || productFeatures.swychr || productFeatures.flutterwave)
      ? [{ v: "card" as const, icon: CreditCard, label: "Card" }]
      : []),
  ]);

  useEffect(() => {
    if (fundingSource === "bank" || fundingSource === "card") {
      setShowOtherFunding(true);
    }
  }, [fundingSource]);

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

                {cardResumeStage === "confirming" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => {
                      cardResumeAbort.current = true;
                      clearCardSendIntent();
                      clearPendingNombaTxn();
                      clearPendingPaytotaTxn();
                      clearPendingSwychrTxn();
                      clearPendingFlwTxn();
                      setCardResumeProcessing(false);
                      setCardResumeStage("confirming");
                      cardResumeLock.current = false;
                      toast.message("Payment cancelled", { description: "No transfer was sent." });
                    }}
                  >
                    I didn’t complete payment
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLenhubCollect && selectedWallet && (
          <motion.div
            key="lenhub-card-collect"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-md px-4 py-8"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="w-full max-w-lg space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Card payment for this send</p>
                  <p className="text-xs text-muted-foreground">
                    Pay {currencySymbol(sourceCurrency)}
                    {parsedAmount.toLocaleString()} {sourceCurrency} — then we deliver to your recipient.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowLenhubCollect(false);
                    clearCardSendIntent();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <SectionBoundary name="SendLenhubFlutterTopUp"><LenhubFlutterTopUpCard
                walletId={selectedWallet.wallet_id}
                walletCurrency={selectedWallet.currency_code}
                fixedAmount={parsedAmount}
                amountReadOnly
                onCredited={({ localId, chargeId }) => {
                  patchCardSendIntent({
                    lenhubChargeId: localId,
                    lenhubProviderChargeId: chargeId || undefined,
                  });
                  setShowLenhubCollect(false);
                  setLenhubResumeTick((t) => t + 1);
                }}
              /></SectionBoundary>
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
            <p className="text-muted-foreground">Send money to 150+ countries</p>
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
                          <SectionBoundary name="CanadaSendFlow"><CanadaSendFlow /></SectionBoundary>
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
                        <SectionBoundary name="EfinmoneyP2PFlow"><EfinmoneyP2PFlow /></SectionBoundary>
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

                        {/* Step cards with directional slide */}
                        <div className="relative max-w-lg mx-auto">
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
                                <MoneyFlowShell
                                  steps={[
                                    { n: 1, label: "Amount" },
                                    { n: 2, label: "Recipient" },
                                    { n: 3, label: "Confirm" },
                                  ]}
                                  currentStep={1}
                                  title="Amount"
                                  subtitle="How much you send and what they get"
                                  footer={
                                    <div className="space-y-3">
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
                                    </div>
                                  }
                                    <motion.div custom={0} variants={fieldVariants} initial="hidden" animate="show" className="space-y-3">
                                      <ContactQuickField
                                        label="To"
                                        placeholder="Select contact"
                                        valueLabel={pickedBeneficiaryId ? recipientName : null}
                                        onSelect={applyBeneficiary}
                                        onClear={pickedBeneficiaryId ? () => { setPickedBeneficiaryId(null); setRecipientName(""); setRecipientPhone(""); } : undefined}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setPickerOpen(true)}
                                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                                      >
                                        <Users className="w-3.5 h-3.5" /> Browse all contacts
                                      </button>
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
                                        onChange={(e) => setRecipientName(e.target.value.replace(/[^\p{L}\p{M}'\-. ]/gu, "").slice(0, 100))}
                                        maxLength={100}
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
                                          onChange={(e) => setRecipientEmail(e.target.value.trimStart().slice(0, 254))}
                                          placeholder="jane@example.com"
                                          maxLength={254}
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
                                            maxLength={20}
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
                                          onChange={(e) => setRecipientPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 15))}
                                          maxLength={15}
                                          className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
                                        />
                                        <p className="text-sm text-muted-foreground">
                                          Funds will be sent via {effectiveMethodLabel} to this number.
                                        </p>
                                      </motion.div>
                                      </>
                                    )}

                                >
                                    <motion.div custom={0} variants={fieldVariants} initial="hidden" animate="show" className="space-y-3">
                                      <div className="space-y-2">
                                        <Label>Pay with</Label>
                                        <PaymentMethodRow
                                          options={fundingMethodOptions}
                                          value={fundingSource}
                                          onChange={(v) => setFundingSource(v)}
                                        />
                                      </div>

                                    </motion.div>

                                    <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="show">
                                      <MethodCheckoutPanel
                                        method={fundingSource as "card" | "bank" | "wallet"}
                                        wallets={(fundingSource === "card" ? cardWallets : (wallets ?? [])).map((w) => ({
                                          wallet_id: w.wallet_id,
                                          currency_code: w.currency_code,
                                          symbol: w.symbol,
                                          balance: w.balance,
                                          flag_emoji: w.flag_emoji,
                                        }))}
                                        selectedWalletId={selectedWalletId || selectedWallet?.wallet_id}
                                        onWalletChange={(id) => setSelectedWalletId(id)}
                                        linkedCardCount={linkedCardCount}
                                        bankSources={bankSources}
                                        selectedSourceId={selectedSourceId || bankSources[0]?.id}
                                        onSourceChange={setSelectedSourceId}
                                        onLinkBank={startPlaidLink}
                                        linkingBank={plaidLinking}
                                        savedCards={savedCards.map((c) => ({
                                          id: c.stripe_payment_method_id,
                                          card_brand: c.card_brand,
                                          last_four: c.last_four,
                                          exp_month: c.exp_month,
                                          exp_year: c.exp_year,
                                        }))}
                                        selectedCardId={activeSavedCard?.stripe_payment_method_id}
                                        onCardChange={setSelectedSavedCardId}
                                        onAddCard={() => setAddCardOpen(true)}
                                        onAddWallet={() => createWalletTriggerRef.current?.click()}
                                        amount={parsedAmount}
                                        fee={fee}
                                        total={totalCharge}
                                        currency={sourceCurrency}
                                        symbol={sourceSymbol}
                                        cardProviderReady={!!cardSendProvider}
                                        cardChargeNote={
                                          cardCheckoutQuote
                                            ? `Card charge ≈ ${cardCheckoutQuote.checkoutCurrency} ${cardCheckoutQuote.checkoutAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cardSendProvider === "nomba" && sourceCurrency === "CAD" ? " · CAD charged in USD" : ""}`
                                            : null
                                        }
                                        cardMinNote={
                                          cardSendProvider
                                            ? `Minimum card send is ${cardSendMinAmount(cardSendProvider, sourceCurrency)} ${sourceCurrency}.`
                                            : null
                                        }
                                        inlineEntry={inlineCardEntry}
                                        insufficientBalance={insufficientFunds}
                                        onTopUp={() => navigate("/wallet/topup")}
                                      />
                                    </motion.div>


                                    <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="flex justify-center py-1">
                                      <SectionBoundary name="LiveFxCalculator"><LiveFxCalculator
                                        variant="app"
                                        showDisclaimer={false}
                                        className="max-w-none w-full"
                                        from={sourceCurrency}
                                        to={targetCountry.code}
                                        sendAmount={amount}
                                        onFromChange={handleCalcFromChange}
                                        onToChange={handleCalcToChange}
                                        onSendAmountChange={(v) => setAmount(v)}
                                        fromCurrencyFilter={
                                          fundingSource === "wallet" ? walletCurrencyCodes
                                          : fundingSource === "card" ? cardWalletCodes
                                          : undefined
                                        }
                                        toCurrencyFilter={
                                          fundingSource === "card" ? cardPayoutCodes : payoutCurrencyCodes
                                        }
                                        priorityCodes={PRIORITY_SEND_CURRENCIES}
                                        quoteRecipient={rateAvailable ? calcQuoteRecipient : undefined}
                                        quoteSend={rateAvailable ? calcQuoteSend : undefined}
                                        displayRate={rateAvailable ? effectiveRate : null}
                                       feeLabel={feeDisplayLabel}
                                       feeNote={feeNote}
                                        walletBalance={
                                          fundingSource === "wallet" && selectedWallet
                                            ? Number(selectedWallet.balance)
                                            : null
                                        }
                                        walletSymbol={selectedWallet?.symbol}
                                        showActions={false}
                                      /></SectionBoundary>
                                    </motion.div>




                                    {fundingSource === "card" && cardSendProvider && parsedAmount > 0
                                      && parsedAmount < cardSendMinAmount(cardSendProvider, sourceCurrency) && (
                                      <motion.p
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-sm font-medium text-destructive flex items-center justify-center gap-1"
                                      >
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        Card minimum is {cardSendMinAmount(cardSendProvider, sourceCurrency)} {sourceCurrency}
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
                                </MoneyFlowShell>
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
                                <MoneyFlowShell
                                  steps={[
                                    { n: 1, label: "Amount" },
                                    { n: 2, label: "Recipient" },
                                    { n: 3, label: "Confirm" },
                                  ]}
                                  currentStep={3}
                                  title="Confirm"
                                  subtitle="Review the quote, then send"
                                >
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
                                      <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-medium">+{sourceSymbol}{fee.toFixed(2)}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Total to pay</span><span className="font-semibold">{sourceSymbol}{totalCharge.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sourceCurrency}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span className="font-medium">1 {sourceCurrency} = {effectiveRate.toFixed(4)} {targetCountry.code}</span></div>
                                      <div className="flex justify-between text-base pt-2 border-t border-border"><span>They receive</span><span className="font-bold">{targetSymbol} {receivedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                    </div>
                                    {fundingSource === 'bank' && (
                                      <p className="text-xs text-muted-foreground text-center">Bank transfer — funds will be debited within 1-2 business days.</p>
                                    )}
                                    {fundingSource === "card" && !inlineCardEntry && (
                                      <p className="text-xs text-muted-foreground text-center">
                                        Next you’ll enter card details on our secure page. After payment, we automatically send to your recipient.
                                      </p>
                                    )}
                                    {fundingSource === "card" && inlineCardEntry ? (
                                      <div className="space-y-3">
                                        <p className="text-sm font-semibold">Card details</p>
                                        <SectionBoundary name="FlutterwaveCardForm">
                                          <FlutterwaveCardForm
                                            defaultWalletId={selectedWallet?.wallet_id}
                                            defaultAmount={totalCharge}
                                            lockAmount
                                            ctaLabel={`Pay ${sourceSymbol}${totalCharge.toFixed(2)} & send`}
                                            onSuccess={() => { void handleConfirm("wallet"); }}
                                          />
                                        </SectionBoundary>
                                        <Button
                                          variant="outline"
                                          className="w-full"
                                          onClick={() => goToStep(2)}
                                          disabled={confirming}
                                        >
                                          Back
                                        </Button>
                                      </div>
                                    ) : (
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
                                    )}

                                    <Button
                                      variant="outline"
                                      className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => setCancelOpen(true)}
                                      disabled={confirming}
                                    >
                                      Cancel Transfer
                                    </Button>
                                </MoneyFlowShell>
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
                                  <SectionBoundary name="PaymentLinkSuccess"><PaymentLinkSuccess
                                    result={linkResult}
                                    amountLabel={`${targetSymbol}${parsedAmount.toFixed(2)}`}
                                    recipientName={recipientName}
                                    onDone={resetForm}
                                  /></SectionBoundary>
                                ) : (
                                  <SectionBoundary name="TransferSuccess"><TransferSuccess
                                    transferId={lastTransferId}
                                    amount={parsedAmount}
                                    currency={sourceCurrency}
                                    recipientName={recipientName}
                                    targetFlag={targetCountry.flag}
                                    onSendAnother={resetForm}
                                  /></SectionBoundary>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

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
      <CreateWalletModal>
        <button type="button" ref={createWalletTriggerRef} className="hidden" aria-hidden="true" tabIndex={-1} />
      </CreateWalletModal>
      <TopUpModal open={topUpOpen} onOpenChange={setTopUpOpen} defaultWalletId={selectedWallet?.wallet_id} title="Top up wallet" />
    </>
  );
};

export default SendPage;
