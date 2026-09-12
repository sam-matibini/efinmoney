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
import { useBeneficiaries, recordTransferRecipient, isCanadaBeneficiary, type Beneficiary } from "@/hooks/useBeneficiaries";
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
import { quoteTransfer } from "@/lib/pricing/costRecoveryEngine";
import { fetchFxRate, cardChargeCurrency, initializeFlwPayment, verifyFlwPayment } from "@/lib/flutterwave";
import { payoutMinAmount, validatePayoutMin } from "@/lib/payoutMins";
import {
  getCorridorBanks,
  resolveCorridorAccount,
  getFlovideOrNombaRate,
  isNgnPair,
} from "@/lib/flovide";
import { resolveEffectiveRate } from "@/lib/fx";
import { currencySymbol, countryToCurrency } from "@/lib/currency";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { ArrowRight, CheckCircle, Wallet, CreditCard, AlertCircle, X, Search, Globe2, Lock, Loader2, Check, Shield, Users, UserPlus, ChevronDown, Banknote, Landmark } from "lucide-react";
import { BrandFlag, CountryFlag } from "@/components/ui/FlagImage";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CanadaSendFlow from "@/components/send/CanadaSendFlow";
import EfinmoneyP2PFlow from "@/components/send/EfinmoneyP2PFlow";
import MoneyFlowShell from "@/components/money/MoneyFlowShell";
import PaymentMethodRow, { type PaymentMethodOption } from "@/components/money/PaymentMethodRow";
import MethodCheckoutPanel from "@/components/send/MethodCheckoutPanel";
import WisePayLinkCard from "@/components/payments/WisePayLinkCard";
import { verifySquareCheckout } from "@/components/payments/SquareTopUpCard";

import { isWisePayCurrency } from "@/lib/wisePayLink";
import WiseInteracInvoiceCheckout from "@/components/payments/WiseInteracInvoiceCheckout";
import SendHeaderCountry from "@/components/send/SendHeaderCountry";
import RecipientQuickBox from "@/components/send/RecipientQuickBox";
import FlutterwaveCardForm from "@/components/payments/FlutterwaveCardForm";
import { emptyCardFields, isCardFieldsValid, maskedCardLabel, type CardFieldsValue } from "@/components/payments/cardFields";


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
import { productFeatures } from "@/lib/productFeatures";
import { FINCRA_CAD_INTERAC_ALIAS } from "@/lib/fincraCad";
import { CAD_INTERAC_MISSING_CONTACT, resolveCadInteracDestination } from "@/lib/cadInteracPayout";
import {
  buildFincraCardSendRedirectUrl,
  isFincraCheckoutCurrency,
  parseFincraReturnReference,
} from "@/lib/fincraTopup";
import LenhubFlutterTopUpCard from "@/components/payments/LenhubFlutterTopUpCard";
import BankAccountCheckout from "@/components/payments/BankAccountCheckout";
import { cn } from "@/lib/utils";
import AppPage from "@/components/layout/AppPage";
import TransferSuccess from "@/components/send/TransferSuccess";
import ComingSoon from "@/components/common/ComingSoon";
import { findCountryById, findCountryByCode, COUNTRIES, isLiveSendCountryId } from "@/lib/countries";
import { LIVE_PAYOUT_CURRENCIES, isLivePayinCurrency } from "@/lib/retailPayoutFees";
import { MM_COUNTRIES } from "@/lib/mobileMoneyNetworks";

import { PRIORITY_SEND_CURRENCIES } from "@/lib/currencyPriority";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const looseDb = supabase as unknown as { from: (t: string) => any };



type FundingSource = 'wallet' | 'bank' | 'card' | 'interac' | 'wise';
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
  const [interacFunding, setInteracFunding] = useState<
    { transferId: string; walletId: string; amount: number } | null
  >(null);
  const [bankCheckoutFunding, setBankCheckoutFunding] = useState<
    { transferId: string; walletId: string; amount: number; currency: string } | null
  >(null);
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
  // Canada international payout (NGN/USD → CAD): Interac email or EFT bank details.
  const [cadPayoutMode, setCadPayoutMode] = useState<"interac" | "eft">("interac");
  const [caInstitutionNumber, setCaInstitutionNumber] = useState("");
  const [caTransitNumber, setCaTransitNumber] = useState("");
  const [caAccountNumber, setCaAccountNumber] = useState("");
  const [caBankName, setCaBankName] = useState("");
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
        .select("id,name,mask,subtype,currency_code,available_balance,current_balance,balances_iso_currency,balances_updated_at,plaid_items(institution_name)")
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
      liveAvailable: a.available_balance,
      liveCurrent: a.current_balance,
      liveCurrency: a.balances_iso_currency || a.currency_code,
    }));
    return [...fromPlaid, ...linkedBankSources];
  }, [plaidAccounts, linkedBankSources, user?.id]);

  // Plaid Link: let users connect a bank right from /send if none exists
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [plaidLinking, setPlaidLinking] = useState(false);
  const startPlaidLink = useCallback(async () => {
    setPlaidLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("plaid-create-link-token", {
        body: { country_codes: ["CA", "US"] },
      });
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


  const cadWallet = wallets?.find((w) => w.currency_code === 'CAD');

  const sourceCurrency = fundingSource === 'interac'
    ? 'CAD'
    : fundingSource === 'wallet' || fundingSource === 'wise' || fundingSource === 'bank'
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
      if (isCanadaBeneficiary(pendingBeneficiary) && targetCountryId === "Canada") return;
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
    setCadPayoutMode("interac");
    setCaInstitutionNumber("");
    setCaTransitNumber("");
    setCaAccountNumber("");
    setCaBankName("");
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
  const isCanadaIntlPayout = targetCountry.code === "CAD" && !useLink;
  const cadInteracDest = useMemo(() => {
    if (!isCanadaIntlPayout || cadPayoutMode !== "interac") return null;
    return resolveCadInteracDestination({
      recipient_account: recipientEmail,
      recipient_phone: recipientPhone,
    });
  }, [isCanadaIntlPayout, cadPayoutMode, recipientEmail, recipientPhone]);

  // Fetch Nigerian banks list when NGN destination is selected (Nomba primary, FLW fallback)
  useEffect(() => {
    if (!isNGNBank || ngnBanks.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { banks } = await getCorridorBanks("NGN");
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
        const data = await resolveCorridorAccount(
          ngnAccountNumber.replace(/\D/g, ""),
          ngnBankCode,
          "NGN",
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
    queryKey: ["corridor-fx", sourceCurrency, targetCountry.code],
    queryFn: () => getFlovideOrNombaRate(sourceCurrency, targetCountry.code),
    enabled: !isSameCurrency && isNgnPair(sourceCurrency, targetCountry.code),
    staleTime: 60_000,
  });
  const nombaRate = nombaFxQuote?.effective_rate && nombaFxQuote.effective_rate > 0
    ? nombaFxQuote.effective_rate
    : null;

  const parsedAmount = Math.max(0, parseAmount(amount));

  // --- Canonical pricing (central rate card via price-quote) ---
  const destPayoutMethod = isCanadaIntlPayout
    ? (cadPayoutMode === "interac" ? "interac" : "eft")
    : isBankPayout ? "bank" : "mobile_money";
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

  const directDbRate =
    fxRate && Number(fxRate.effective_rate) > 0 ? Number(fxRate.effective_rate) : null;
  const derivedRate = derivedFxRate && Number(derivedFxRate) > 0 ? Number(derivedFxRate) : null;
  // Mid-market fx_rates first; Nomba only as NGN fallback.
  const rawRate = isSameCurrency
    ? 1
    : resolvedDbRate ?? directDbRate ?? derivedRate ?? nombaRate ?? 0;
  const engineQuote = useMemo(
    () =>
      quoteTransfer({
        sourceCurrency,
        destinationCurrency: targetCountry.code,
        amount: parsedAmount,
        channel: "external",
        payoutMethod: destPayoutMethod,
        midMarketRate: rawRate > 0 ? rawRate : null,
      }),
    [sourceCurrency, targetCountry.code, parsedAmount, destPayoutMethod, rawRate],
  );
  const engineReady = !engineQuote.pricingMissing && parsedAmount > 0 && rawRate > 0;
  const fxMarginBps = engineReady
    ? engineQuote.fxSpread * 10_000
    : Number(priceQuote?.fx_margin_bps ?? 0);
  const effectiveRate = engineReady && engineQuote.customerRate
    ? engineQuote.customerRate
    : rawRate > 0 && fxMarginBps > 0
      ? rawRate * (1 - fxMarginBps / 10_000)
      : rawRate;
  const rateAvailable = isSameCurrency || effectiveRate > 0;
  const fee = parsedAmount > 0
    ? (engineReady
      ? engineQuote.transferFee + cardFee
      : (priceQuote && !priceQuote.pricing_missing && Number.isFinite(Number(priceQuote.total_fee))
        ? Number(priceQuote.total_fee)
        : baseFee + cardFee))
    : 0;
  const receivedAmount = parsedAmount > 0 && rateAvailable
    ? (engineReady ? (engineQuote.youReceive ?? 0) : Math.max(0, parsedAmount * effectiveRate))
    : 0;
  const payoutMinError = receivedAmount > 0
    ? validatePayoutMin(targetCountry.code, receivedAmount)
    : null;
  /** What the customer actually pays / is debited: amount + fee. */
  const totalCharge = parsedAmount > 0 ? parsedAmount + fee : 0;

  const noLinkedSource = false;
  const insufficientFunds = fundingSource === 'wallet'
    && !!selectedWallet
    && parsedAmount > 0
    && totalCharge > Number(selectedWallet.balance);

  const cardWallets = useMemo(
    () =>
      (wallets ?? []).filter((w) => {
        const c = w.currency_code.toUpperCase();
        if (!isCardSendCollectCurrency(c)) return false;
        if (!isLivePayinCurrency(c)) return false;
        if (c === "NGN") {
          return productFeatures.nombaNigeria || productFeatures.lenhubFlutter || productFeatures.flutterwave;
        }
        if (["USD", "CAD"].includes(c)) {
          return productFeatures.nombaNigeria || productFeatures.lenhubFlutter || productFeatures.paytota || productFeatures.flutterwave;
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
    () => cardSendDestCurrencies(sourceCurrency).filter((c) =>
      (LIVE_PAYOUT_CURRENCIES as readonly string[]).includes(c.toUpperCase()),
    ),
    [sourceCurrency],
  );
  const cardTransferTypeForDest = useMemo((): "bank" | "mobile_money" => {
    if (targetCountry.code === "NGN" || targetCountry.code === "CAD") return "bank";
    return "mobile_money";
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

  // Prefer a valid card-collect wallet + destination when paying by card
  useEffect(() => {
    if (fundingSource !== "card") return;
    if (cardWallets.length === 0) return;
    const currentOk = cardWallets.some((w) => w.wallet_id === selectedWalletId);
    if (!currentOk) {
      const preferred =
        cardWallets.find((w) => w.currency_code === targetCountry.code)
        || cardWallets.find((w) => w.currency_code === "CAD")
        || cardWallets.find((w) => w.currency_code === "NGN")
        || cardWallets[0];
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
  const payoutCurrencyCodes = useMemo(() => [...LIVE_PAYOUT_CURRENCIES], []);

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
    funding_source?: FundingSource;
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
    transfer_type?: "bank" | "mobile_money" | "domestic_canada";
    payout_method?: string;
  }) => {
    const ngnAcct = isNGNBank ? ngnAccountNumber.replace(/\D/g, "") : "";
    const ngnBank = isNGNBank ? (ngnBanks.find((b) => b.code === ngnBankCode)?.name || null) : null;
    const ghAcct = isGhanaBank ? ghAccountNumber.replace(/\D/g, "") : "";
    const ghBank = isGhanaBank ? (ghBanks.find((b) => b.code === ghBankCode)?.name || null) : null;
    const bankAcct = isNGNBank ? ngnAcct : isGhanaBank ? ghAcct : "";
    const bankCode = isNGNBank ? ngnBankCode : isGhanaBank ? ghBankCode : "";
    const bankName = isNGNBank ? ngnBank : isGhanaBank ? ghBank : null;
    const canadaPayoutMethod = cadPayoutMode === "interac" ? "interac" : "eft";
    const canadaAcct = isCanadaIntlPayout
      ? (cadPayoutMode === "interac"
        ? (cadInteracDest?.ok
          ? (cadInteracDest.dest.email || cadInteracDest.dest.phone || "")
          : (recipientEmail.trim() || recipientPhone.trim()))
        : `${caInstitutionNumber.replace(/\D/g, "")}-${caTransitNumber.replace(/\D/g, "")}-${caAccountNumber.replace(/\D/g, "")}`)
      : "";
    const funding = overrides?.funding_source ?? fundingSource;
    const walletId =
      overrides?.sender_wallet_id
      ?? (funding === "interac"
        ? (cadWallet?.wallet_id || "")
        : funding === "wallet" || funding === "card" || funding === "wise" || funding === "bank"
        ? selectedWallet!.wallet_id
        : wallets?.[0]?.wallet_id || "");
    const destCurrency = overrides?.target_currency ?? targetCountry.code;
    // Store ISO2 country (NG), never currency (NGN) — corridor rail policies key off ISO2.
    const isoFromCurrency: Record<string, string> = {
      NGN: "NG", GHS: "GH", KES: "KE", UGX: "UG", TZS: "TZ", RWF: "RW",
      ZMW: "ZM", ZAR: "ZA", CAD: "CA", USD: "US", GBP: "GB", EUR: "DE",
      XOF: "SN", XAF: "CM", MWK: "MW",
    };
    const rawCountry = (overrides?.recipient_country || "").trim().toUpperCase();
    const destCountryIso =
      (rawCountry.length === 2 ? rawCountry : null)
      || isoFromCurrency[rawCountry]
      || isoFromCurrency[destCurrency]
      || destCurrency;
    const transfer = await createTransfer.mutateAsync({
      sender_wallet_id: walletId,
      recipient_name: overrides?.recipient_name ?? recipientName,
      recipient_phone: overrides?.recipient_phone ?? (
        isCanadaIntlPayout && cadPayoutMode === "interac"
          ? (cadInteracDest?.ok ? cadInteracDest.dest.phone || undefined : recipientPhone.trim() || undefined)
          : isBankPayout || isCanadaIntlPayout ? undefined : recipientPhone
      ),
      recipient_account: overrides?.recipient_account ?? (isBankPayout ? bankAcct : isCanadaIntlPayout ? canadaAcct : undefined),
      recipient_bank_code: overrides?.recipient_bank_code ?? (isBankPayout ? bankCode : isCanadaIntlPayout && cadPayoutMode === "eft" ? caInstitutionNumber.replace(/\D/g, "") : undefined),
      recipient_bank_name: overrides?.recipient_bank_name ?? (isBankPayout ? (bankName || undefined) : isCanadaIntlPayout && cadPayoutMode === "eft" ? (caBankName.trim() || undefined) : undefined),
      recipient_country: destCountryIso,
      transfer_type: overrides?.transfer_type ?? (isCanadaIntlPayout ? "domestic_canada" : isBankPayout ? "bank" : "mobile_money"),
      payout_method: overrides?.payout_method ?? (isBankPayout ? "bank" : isCanadaIntlPayout ? canadaPayoutMethod : effectivePayoutMethod),
      source_currency: overrides?.source_currency ?? sourceCurrency,
      target_currency: destCurrency,
      source_amount: overrides?.source_amount ?? parsedAmount,
      target_amount: overrides?.target_amount ?? receivedAmount,
      exchange_rate: overrides?.exchange_rate ?? effectiveRate,
      fee_amount: overrides?.fee_amount ?? fee,
      // Card: prepaid into wallet, then paid out as wallet.
      // Interac/Wise: park as bank-funded until Fincra Autodeposit credits the CAD wallet.
      funding_source:
        funding === "card"
          ? "wallet"
          : funding === "interac" || funding === "wise"
          ? "bank"
          : funding,
    });
    setLastTransferId(transfer.id);
    if (user) {
      try {
        const tType = overrides?.transfer_type ?? (isCanadaIntlPayout ? "domestic_canada" : isBankPayout ? "bank" : "mobile_money");
        const { isNew } = await recordTransferRecipient({
          user_id: user.id,
          name: overrides?.recipient_name ?? recipientName,
          phone: isCanadaIntlPayout && cadPayoutMode === "interac"
            ? (cadInteracDest?.ok ? cadInteracDest.dest.phone || "" : recipientPhone)
            : tType === "bank" || isCanadaIntlPayout ? "" : (overrides?.recipient_phone ?? recipientPhone),
          country_code: overrides?.recipient_country ?? destCurrency,
          payout_method: overrides?.payout_method ?? (isBankPayout ? "bank" : isCanadaIntlPayout ? canadaPayoutMethod : effectivePayoutMethod),
          network: tType === "bank" || isCanadaIntlPayout ? null : (activeNetwork?.id || null),
          currency_code: destCurrency,
          bank_name: overrides?.recipient_bank_name ?? (isBankPayout ? bankName : isCanadaIntlPayout && cadPayoutMode === "eft" ? (caBankName.trim() || null) : null),
          bank_account: overrides?.recipient_account ?? (isBankPayout ? bankAcct : isCanadaIntlPayout && cadPayoutMode === "eft" ? caAccountNumber.replace(/\D/g, "") : null),
          bank_code: overrides?.recipient_bank_code ?? (isNGNBank ? ngnBankCode : null),
          interac_email: isCanadaIntlPayout && cadPayoutMode === "interac"
            ? (cadInteracDest?.ok ? cadInteracDest.dest.email : recipientEmail.trim()) || null
            : null,
          eft_institution: isCanadaIntlPayout && cadPayoutMode === "eft" ? caInstitutionNumber.replace(/\D/g, "") : null,
          eft_transit: isCanadaIntlPayout && cadPayoutMode === "eft" ? caTransitNumber.replace(/\D/g, "") : null,
          eft_account: isCanadaIntlPayout && cadPayoutMode === "eft" ? caAccountNumber.replace(/\D/g, "") : null,
          eft_account_holder: isCanadaIntlPayout ? recipientName.trim() : null,
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

  const handleConfirm = async (fundingOverride?: FundingSource) => {
    if (confirming) return;
    setConfirming(true);
    const funding = fundingOverride ?? fundingSource;

    if (isCanadaIntlPayout && cadPayoutMode === "interac" && !cadInteracDest?.ok) {
      toast.error(cadInteracDest?.error || CAD_INTERAC_MISSING_CONTACT);
      setConfirming(false);
      return;
    }

    // Bank transfer checkout: park the payout, then collect from the sender's bank.
    if (funding === "bank") {
      const wallet =
        selectedWallet ||
        (wallets ?? []).find((w) => String(w.currency_code).toUpperCase() === sourceCurrency.toUpperCase());
      if (!wallet) {
        toast.error(`Open a ${sourceCurrency} wallet first so we can match the bank deposit.`);
        setConfirming(false);
        return;
      }
      try {
        const tid = await createTransferRecord({
          funding_source: "bank",
          sender_wallet_id: wallet.wallet_id,
        });
        if (sourceCurrency.toUpperCase() === "CAD") {
          setInteracFunding({ transferId: tid, walletId: wallet.wallet_id, amount: totalCharge });
        } else {
          setBankCheckoutFunding({
            transferId: tid,
            walletId: wallet.wallet_id,
            amount: totalCharge,
            currency: sourceCurrency,
          });
        }
        goToStep(4);
      } catch (e: any) {
        toast.error(e?.message || "Could not start bank checkout");
      } finally {
        setConfirming(false);
      }
      return;
    }

    // CAD Interac pay-in: park the transfer, then open Fincra Autodeposit checkout.
    if (funding === 'interac') {
      if (!cadWallet) {
        toast.error('You need a CAD wallet to pay from your Canadian bank.');
        setConfirming(false);
        return;
      }
      try {
        const tid = await createTransferRecord({
          funding_source: 'interac',
          sender_wallet_id: cadWallet.wallet_id,
        });
        setInteracFunding({ transferId: tid, walletId: cadWallet.wallet_id, amount: totalCharge });
        goToStep(4);
      } catch (e: any) {
        toast.error(e?.message || 'Could not start bank pay-in');
      } finally {
        setConfirming(false);
      }
      return;
    }

    // ── Wallet: create + execute payout immediately ──────────────────────
    if (funding === 'wallet') {
      if (!selectedWallet) { setConfirming(false); return; }
      if (payoutMinError) {
        toast.error(payoutMinError);
        setConfirming(false);
        return;
      }
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
            data?.pending_liquidity || data?.queued || data?.pending_ops || payout?.queued || payout?.pending_liquidity || payout?.pending_ops
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

    // ── Card: Nomba → Fincra → Flutterwave… collect → credit → payout ─
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
        const transferType: "bank" | "mobile_money" = isNGNBank || isCanadaIntlPayout ? "bank" : "mobile_money";
        const payoutMethod = isNGNBank
          ? "bank"
          : isCanadaIntlPayout
            ? (cadPayoutMode === "interac" ? "interac" : "eft")
            : (effectivePayoutMethod || "mobile_money");
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
          recipientPhone: isCanadaIntlPayout && cadPayoutMode === "interac"
            ? (cadInteracDest?.ok ? cadInteracDest.dest.phone || "" : recipientPhone)
            : isNGNBank ? "" : recipientPhone,
          recipientEmail: isCanadaIntlPayout && cadPayoutMode === "interac"
            ? (cadInteracDest?.ok ? cadInteracDest.dest.email || recipientEmail : recipientEmail)
            : recipientEmail || undefined,
          payoutMethod,
          transferType,
          recipientAccount: isNGNBank
            ? ngnAcct
            : isCanadaIntlPayout
              ? (cadPayoutMode === "interac"
                ? (cadInteracDest?.ok
                  ? (cadInteracDest.dest.email || cadInteracDest.dest.phone || "")
                  : (recipientEmail.trim() || recipientPhone.trim()))
                : `${caInstitutionNumber.replace(/\D/g, "")}-${caTransitNumber.replace(/\D/g, "")}-${caAccountNumber.replace(/\D/g, "")}`)
              : undefined,
          recipientBankCode: isNGNBank
            ? ngnBankCode
            : isCanadaIntlPayout && cadPayoutMode === "eft"
              ? caInstitutionNumber.replace(/\D/g, "")
              : undefined,
          recipientBankName: isNGNBank
            ? ngnBank
            : isCanadaIntlPayout && cadPayoutMode === "eft"
              ? (caBankName.trim() || null)
              : null,
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

        if (provider === "square") {
          const returnUrl =
            `${window.location.origin}/send?cardSend=1&provider=square&walletId=${encodeURIComponent(selectedWallet.wallet_id)}`;
          const { data, error } = await supabase.functions.invoke("square-create-checkout", {
            body: {
              walletId: selectedWallet.wallet_id,
              amount: totalCharge,
              currency: selectedWallet.currency_code,
              redirectUrl: returnUrl,
            },
          });
          const sqErr = (data as { error?: string } | null)?.error || error?.message;
          const checkoutUrl = String((data as { checkout_url?: string } | null)?.checkout_url || "");
          if (sqErr || !checkoutUrl) {
            throw new Error(sqErr || "Could not start card checkout");
          }
          saveCardSendIntent({
            ...intentBase,
            provider: "square",
            squareOrderId: String((data as { order_id?: string }).order_id || ""),
          });
          toast.message("Opening secure card checkout…");
          window.location.href = checkoutUrl;
          return;
        }

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
          const returnUrl = `${window.location.origin}/send?cardSend=1&provider=nomba&walletId=${encodeURIComponent(selectedWallet.wallet_id)}`;
          const collection = await initiateNombaCollection({
            credit_amount: totalCharge,
            amount: totalCharge,
            target_wallet_id: selectedWallet.wallet_id,
            email: user.email,
            corridor: sourceCurrency === "NGN" ? "nigeria" : "international",
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
    navigate('/dashboard');
  };

  const clearSelectedContact = useCallback(() => {
    setPickedBeneficiaryId(null);
    setPendingBeneficiary(null);
    setRecipientName("");
    setRecipientPhone("");
    setRecipientEmail("");
    setNgnAccountNumber("");
    setNgnBankCode("");
    setGhAccountNumber("");
    setGhBankCode("");
    setCadPayoutMode("interac");
    setCaInstitutionNumber("");
    setCaTransitNumber("");
    setCaAccountNumber("");
    setCaBankName("");
    setSelectedNetworkId(null);
  }, []);

  const applyBeneficiary = useCallback((b: Beneficiary) => {
    if (isCanadaBeneficiary(b)) {
      const next = new URLSearchParams(searchParams);
      next.set("mode", "canada");
      next.set("beneficiaryId", b.id);
      setSearchParams(next, { replace: true });
      return;
    }
    setRecipientName(b.eft_account_holder || b.name);
    if (b.phone) setRecipientPhone(b.phone.replace(/[^\d+]/g, "").slice(0, 15));
    if (b.email || b.interac_email) setRecipientEmail(b.interac_email || b.email || "");
    setPickedBeneficiaryId(b.id);
    setPendingBeneficiary(b);
    // Reset bank selection — effect below matches code/name against the live list.
    setNgnBankCode("");
    setGhBankCode("");
    // Prefill account immediately; bank code is resolved after the banks list
    // loads (see pendingBeneficiary effect) so Select never gets a stale code.
    if (b.bank_account) {
      setNgnAccountNumber(String(b.bank_account).replace(/\D/g, "").slice(0, 10));
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
  }, [searchParams, setSearchParams]);

  // Apply saved network / bank details for a picked beneficiary once the
  // destination country (and, for NGN/GHS, the banks list) is in place. The
  // pending record is kept until everything it can fill has actually landed,
  // so a slow bank/network list never drops the prefill.
  useEffect(() => {
    const b = pendingBeneficiary;
    if (!b) return;
    const targetIsNGNBank = targetCountry.code === "NGN";
    const expectedCountry = isCanadaBeneficiary(b)
      ? (findCountryById("Canada") || findCountryByCode("CAD") || findCountryByCode(b.country_code))
      : (b.country_code ? findCountryByCode(b.country_code) : null);
    // Country stored but not resolvable yet — keep the pending record and retry.
    if (b.country_code && !expectedCountry) return;
    if (expectedCountry && expectedCountry.id !== targetCountryId) return;

    let allApplied = true;

    // Contact details that apply to every corridor.
    if (b.phone) {
      const phone = b.phone.replace(/[^\d+]/g, "").slice(0, 15);
      if (!recipientPhone) setRecipientPhone(phone);
    }
    if ((b.interac_email || b.email) && !recipientEmail) {
      setRecipientEmail(b.interac_email || b.email || "");
    }

    if (targetIsNGNBank) {
      if (b.bank_account) {
        const acct = String(b.bank_account).replace(/\D/g, "").slice(0, 10);
        if (ngnAccountNumber !== acct) setNgnAccountNumber(acct);
      }

      // Resolve bank once the list is loaded. Prefer code match, then name —
      // contacts often store a stale/provider-specific bank_code that isn't in
      // the live Flovide/Nomba list, which leaves Radix Select blank.
      if (ngnBanks.length === 0 && (b.bank_code || b.bank_name)) {
        allApplied = false;
      } else if (ngnBanks.length > 0) {
        const code = b.bank_code ? String(b.bank_code).trim() : "";
        const byCode = code
          ? ngnBanks.find((x) => x.code === code || x.code === code.replace(/^0+/, ""))
          : undefined;
        const wanted = (b.bank_name || "").trim().toLowerCase();
        const byName = wanted
          ? ngnBanks.find((x) => x.name.toLowerCase() === wanted)
            || ngnBanks.find((x) => x.name.toLowerCase().includes(wanted))
            || ngnBanks.find((x) => wanted.includes(x.name.toLowerCase()))
          : undefined;
        const match = byCode || byName;
        if (match) {
          if (ngnBankCode !== match.code) setNgnBankCode(match.code);
        } else if (code || wanted) {
          // Stale code with no name match — clear so the user can pick.
          if (ngnBankCode) setNgnBankCode("");
          allApplied = false;
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
    } else if (targetCountry.code === "CAD") {
      if (b.eft_account || b.payout_method === "eft") {
        setCadPayoutMode("eft");
        if (b.eft_institution && !caInstitutionNumber) {
          setCaInstitutionNumber(String(b.eft_institution).replace(/\D/g, "").slice(0, 3));
        }
        if (b.eft_transit && !caTransitNumber) {
          setCaTransitNumber(String(b.eft_transit).replace(/\D/g, "").slice(0, 5));
        }
        if (!caAccountNumber) {
          setCaAccountNumber(String(b.eft_account).replace(/\D/g, ""));
        }
        if (b.bank_name && !caBankName) setCaBankName(b.bank_name);
      } else if (b.interac_email || b.email || b.phone || b.payout_method === "interac") {
        setCadPayoutMode("interac");
        if (!recipientEmail) setRecipientEmail(b.interac_email || b.email || "");
      }
    } else if (b.network || b.payout_method) {
      if (!availableNetworks || availableNetworks.length === 0) {
        // No network picker for this corridor — nothing further to apply.
      } else {
        const wanted = String(b.network || "").toLowerCase();
        const wantedPayout = String(b.payout_method || "").toLowerCase();
        // "mtn_mobile" / "airtel_money" -> "mtn" / "airtel"
        const payoutStem = wantedPayout.split("_")[0];
        const match =
          availableNetworks.find((n) => !!wanted && n.id.toLowerCase() === wanted) ||
          availableNetworks.find((n) => !!wanted && n.payout.toLowerCase() === wanted) ||
          availableNetworks.find((n) => !!wanted && n.label?.toLowerCase() === wanted) ||
          availableNetworks.find((n) => !!wanted && n.label?.toLowerCase().includes(wanted)) ||
          availableNetworks.find((n) => !!wantedPayout && n.payout.toLowerCase() === wantedPayout) ||
          availableNetworks.find((n) => !!wantedPayout && n.id.toLowerCase() === wantedPayout) ||
          availableNetworks.find((n) => !!payoutStem && n.id.toLowerCase() === payoutStem) ||
          availableNetworks.find((n) => !!payoutStem && n.payout.toLowerCase().startsWith(payoutStem));
        if (match && selectedNetworkId !== match.id) {
          setSelectedNetworkId(match.id);
        }
      }
    }



    if (allApplied) setPendingBeneficiary(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBeneficiary, targetCountryId, ngnBanks, ghBanks, availableNetworks]);

  // Short summary of what got prefilled from the selected contact.
  const prefillSummary = useMemo(() => {
    if (!pickedBeneficiaryId) return "";
    const parts: string[] = [];
    if (isNGNBank) {
      const bank = ngnBanks.find((x) => x.code === ngnBankCode)?.name;
      if (bank) parts.push(bank);
      if (ngnAccountNumber) parts.push(ngnAccountNumber);
    } else if (isGhanaBank) {
      const bank = ghBanks.find((x) => x.code === ghBankCode)?.name;
      if (bank) parts.push(bank);
      if (ghAccountNumber) parts.push(ghAccountNumber);
    } else if (isCanadaIntlPayout) {
      if (cadPayoutMode === "interac") {
        if (recipientEmail) parts.push(recipientEmail);
        if (recipientPhone) parts.push(recipientPhone);
      } else {
        if (caInstitutionNumber && caTransitNumber) parts.push(`${caInstitutionNumber}-${caTransitNumber}`);
        if (caAccountNumber) parts.push(`···${caAccountNumber.slice(-4)}`);
      }
    } else {
      if (activeNetwork?.label) parts.push(activeNetwork.label);
      if (recipientPhone) parts.push(recipientPhone);
    }
    if (parts.length === 0) return "Couldn't prefill payout details — please enter them below";
    return parts.join(" · ");
  }, [pickedBeneficiaryId, isNGNBank, isGhanaBank, isCanadaIntlPayout, cadPayoutMode, ngnBanks, ngnBankCode, ngnAccountNumber, ghBanks, ghBankCode, ghAccountNumber, caInstitutionNumber, caTransitNumber, caAccountNumber, recipientEmail, activeNetwork, recipientPhone]);

  const phonePlaceholder = useMemo(() => {
    const mm = MM_COUNTRIES.find(
      (c) => c.currency === targetCountry.code || c.name.toLowerCase() === targetCountry.id.toLowerCase(),
    );
    if (targetCountry.code === "ZMW") return "26097XXXXXXX or 097XXXXXXX";
    if (targetCountry.code === "KES") return "2547XXXXXXX or 07XXXXXXX";
    return `${mm?.dialCode ?? "+"}...`;
  }, [targetCountry]);



  useEffect(() => {
    const bid = searchParams.get("beneficiaryId");
    if (!bid || !beneficiaries) return;
    if (searchParams.get("mode") === "canada") return;
    const b = beneficiaries.find((x) => x.id === bid);
    if (!b) return;
    if (isCanadaBeneficiary(b)) {
      const next = new URLSearchParams(searchParams);
      next.set("mode", "canada");
      setSearchParams(next, { replace: true });
      return;
    }
    applyBeneficiary(b);
    goToStep(1);
    const next = new URLSearchParams(searchParams);
    next.delete("beneficiaryId");
    setSearchParams(next, { replace: true });
  }, [beneficiaries, searchParams, goToStep, applyBeneficiary, setSearchParams]);

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
      if (funding !== "bank") setFundingSource("wallet");
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
    setTimeout(() => goToStep(1), 0);

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
        if (provider === "square") {
          const orderId = intent.squareOrderId || searchParams.get("orderId") || "";
          if (!orderId) throw new Error("Missing card payment reference");
          for (let i = 0; i < 40; i++) {
            if (cardResumeAbort.current) throw new Error("cancelled");
            try {
              const result = await verifySquareCheckout(orderId);
              if (result?.success) {
                paid = true;
                break;
              }
            } catch { /* keep polling — Square settles a moment after redirect */ }
            await sleep(1500);
          }
        } else if (provider === "lenhub") {

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
            // Pay-in must fund the wallet before we create/execute the send.
            if (verified?.verified && (verified?.wallet_funded === true || verified?.credited === true || verified?.already === true)) {
              paid = true;
              break;
            }
            if (verified?.verified && verified?.wallet_funded === false) {
              // Provider success without ledger credit — keep polling.
            } else if (verified?.verified && verified?.wallet_funded == null && verified?.credited == null) {
              paid = true; // legacy responses
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
            if (json?.verified && (json?.wallet_funded === true || json?.credited === true || json?.already === true)) {
              paid = true;
              break;
            }
            if (json?.verified && json?.wallet_funded === false) {
              // verified at Fincra but wallet not credited — retry
            } else if (json?.verified && json?.wallet_funded == null && json?.credited == null) {
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
          recipient_phone: intent.targetCurrency === "CAD" || intent.payoutMethod === "interac"
            ? (intent.recipientPhone || undefined)
            : intent.transferType === "bank" ? undefined : intent.recipientPhone,
          recipient_account: intent.recipientAccount,
          recipient_bank_code: intent.recipientBankCode,
          recipient_bank_name: intent.recipientBankName,
          recipient_country: ({
            NGN: "NG", GHS: "GH", KES: "KE", UGX: "UG", TZS: "TZ", RWF: "RW",
            ZMW: "ZM", ZAR: "ZA", CAD: "CA", USD: "US", GBP: "GB", EUR: "DE",
          } as Record<string, string>)[intent.targetCurrency] || intent.recipientCountryHint || intent.targetCurrency,
          transfer_type: intent.targetCurrency === "CAD" ? "domestic_canada" : intent.transferType,
          payout_method: intent.targetCurrency === "CAD"
            && (!intent.payoutMethod || intent.payoutMethod === "mobile_money" || intent.payoutMethod === "mpesa")
            ? "interac"
            : intent.payoutMethod,
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
    setInteracFunding(null);
    setBankCheckoutFunding(null);
    setFromQuickSend(false);
    clearSendHandoff();
    clearCardSendIntent();
  };
  /** Card details captured once, in the step-1 checkout panel. */
  const [cardFields, setCardFields] = useState<CardFieldsValue>(emptyCardFields);
  /**
   * The new-card form is only expanded when the user has no saved card, or
   * after they explicitly click "Quick add new card".
   */
  const [showNewCardForm, setShowNewCardForm] = useState(false);
  useEffect(() => {
    if (savedCards.length === 0) setShowNewCardForm(true);
  }, [savedCards.length]);

  const openNewCardForm = () => {
    setCardFields((prev) => ({
      ...prev,
      cardholderName: prev.cardholderName || activeSavedCard?.cardholder_name || "",
      expiry: prev.expiry
        || (activeSavedCard?.exp_month && activeSavedCard?.exp_year
          ? `${String(activeSavedCard.exp_month).padStart(2, "0")}/${String(activeSavedCard.exp_year).slice(-2)}`
          : ""),
    }));
    setShowNewCardForm(true);
  };

  const isStep1Valid =
    parsedAmount > 0
    && receivedAmount > 0
    && !payoutMinError
    && rateAvailable
    && !noLinkedSource
    && !insufficientFunds
    && (fundingSource !== "card" || (
      cardSendEnabled
      && cardPayoutCodes.includes(targetCountry.code)
      && availableCardProviders.length > 0
      && !!cardSendProvider
      && parsedAmount >= cardSendMinAmount(cardSendProvider, sourceCurrency)
      && (
        !inlineCardEntry
        || (showNewCardForm ? isCardFieldsValid(cardFields) : !!activeSavedCard)
      )
    ));

  const isStep2Valid = useLink
    ? (recipientName.trim().length > 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail) && parsedAmount > 0)
    : isNGNBank
    ? (!!ngnBankCode && ngnAccountNumber.replace(/\D/g, "").length === 10 && !!ngnResolvedName && receivedAmount > 0)
    : isGhanaBank
    ? (recipientName.trim().length > 2 && !!ghBankCode && ghAccountNumber.replace(/\D/g, "").length >= 6 && receivedAmount > 0)
    : isCanadaIntlPayout
    ? (cadPayoutMode === "interac"
      ? recipientName.trim().length > 1
          && !!cadInteracDest?.ok
          && receivedAmount > 0
      : recipientName.trim().length > 1
          && /^\d{3}$/.test(caInstitutionNumber.replace(/\D/g, ""))
          && /^\d{5}$/.test(caTransitNumber.replace(/\D/g, ""))
          && caAccountNumber.replace(/\D/g, "").length >= 4
          && receivedAmount > 0)
    : (recipientName.length > 2 && recipientPhone.length > 8 && !!effectivePayoutMethod && receivedAmount > 0);

  const continueBlockers = useMemo(() => {
    const reasons: string[] = [];
    if (!isLiveSendCountryId(targetCountryId)) {
      reasons.push(`${targetCountry.country} is coming soon`);
      return reasons;
    }
    if (!(parsedAmount > 0)) reasons.push("Enter an amount to send");
    if (parsedAmount > 0 && !rateAvailable) reasons.push("Waiting for exchange rate");
    if (payoutMinError) reasons.push(payoutMinError);
    if (noLinkedSource) reasons.push("Link a bank account first");
    if (insufficientFunds) {
      reasons.push(
        selectedWallet
          ? `Need ${sourceSymbol}${totalCharge.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — wallet has ${sourceSymbol}${Number(selectedWallet.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "Insufficient wallet balance",
      );
    }
    if (fundingSource === "wallet" && !selectedWallet) reasons.push("Select a wallet");
    if (fundingSource === "bank" && !selectedWallet) {
      reasons.push("Select a wallet so we can match the bank deposit");
    }
    if (fundingSource === "interac" && !cadWallet) {
      reasons.push("Create a CAD wallet to pay with Interac e-Transfer");
    }
    if (fundingSource === "card") {
      if (!cardSendEnabled || !cardPayoutCodes.includes(targetCountry.code)) {
        reasons.push(`Card send is not available to ${targetCountry.country}`);
      } else if (availableCardProviders.length === 0 || !cardSendProvider) {
        reasons.push("No card provider available for this corridor");
      } else if (parsedAmount > 0 && parsedAmount < cardSendMinAmount(cardSendProvider, sourceCurrency)) {
        reasons.push(`Minimum card send is ${cardSendMinAmount(cardSendProvider, sourceCurrency)} ${sourceCurrency}`);
      } else if (inlineCardEntry) {
        if (showNewCardForm && !isCardFieldsValid(cardFields)) reasons.push("Complete your card details");
        else if (!showNewCardForm && !activeSavedCard) reasons.push("Select or add a card");
      }
    }

    if (useLink) {
      if (recipientName.trim().length <= 2) reasons.push("Enter the recipient’s name");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) reasons.push("Enter the recipient’s email");
    } else if (isNGNBank) {
      if (!ngnBankCode) reasons.push("Select the recipient’s bank");
      if (ngnAccountNumber.replace(/\D/g, "").length !== 10) reasons.push("Enter a 10-digit account number");
      else if (!ngnResolvedName) reasons.push("Waiting for account name to resolve");
    } else if (isGhanaBank) {
      if (recipientName.trim().length <= 2) reasons.push("Enter the recipient’s name");
      if (!ghBankCode) reasons.push("Select the recipient’s bank");
      if (ghAccountNumber.replace(/\D/g, "").length < 6) reasons.push("Enter the bank account number");
    } else if (isCanadaIntlPayout) {
      if (recipientName.trim().length <= 1) reasons.push("Enter the recipient’s full legal name");
      if (cadPayoutMode === "interac") {
        if (!cadInteracDest?.ok) {
          reasons.push(CAD_INTERAC_MISSING_CONTACT);
        }
      } else {
        if (!/^\d{3}$/.test(caInstitutionNumber.replace(/\D/g, ""))) reasons.push("Enter the 3-digit institution number");
        if (!/^\d{5}$/.test(caTransitNumber.replace(/\D/g, ""))) reasons.push("Enter the 5-digit transit number");
        if (caAccountNumber.replace(/\D/g, "").length < 4) reasons.push("Enter the bank account number");
      }
    } else {
      if (recipientName.trim().length <= 2) reasons.push("Enter the recipient’s name");
      if (recipientPhone.replace(/\D/g, "").length <= 8) reasons.push("Enter the recipient’s phone number");
      if (!effectivePayoutMethod) reasons.push("Select how they receive the money");
    }
    return reasons;
  }, [
    targetCountryId,
    targetCountry.country,
    parsedAmount,
    rateAvailable,
    payoutMinError,
    noLinkedSource,
    insufficientFunds,
    selectedWallet,
    sourceSymbol,
    totalCharge,
    fundingSource,
    cardSendEnabled,
    cardPayoutCodes,
    availableCardProviders.length,
    cardSendProvider,
    sourceCurrency,
    inlineCardEntry,
    showNewCardForm,
    cardFields,
    activeSavedCard,
    useLink,
    recipientName,
    recipientEmail,
    isNGNBank,
    ngnBankCode,
    ngnAccountNumber,
    ngnResolvedName,
    isGhanaBank,
    ghBankCode,
    ghAccountNumber,
    isCanadaIntlPayout,
    cadPayoutMode,
    cadInteracDest,
    caInstitutionNumber,
    caTransitNumber,
    caAccountNumber,
    recipientPhone,
    effectivePayoutMethod,
    cadWallet,
  ]);

  const canContinue = continueBlockers.length === 0;

  const modeParam = searchParams.get('mode');
  const canadaLive = productFeatures.canadaDomestic;
  const activeTab =
    modeParam === 'canada' ? 'canada'
    : modeParam === 'efinmoney' ? 'efinmoney'
    : 'international';
  const cardFundingAvailable = productFeatures.nombaNigeria || productFeatures.lenhubFlutter
    || productFeatures.paytota || productFeatures.swychr || productFeatures.flutterwave;

  const interacFundingAvailable = true;
  const interacUsesFincra = productFeatures.fincraInterac;
  const interacUsesFlovide = !interacUsesFincra && (productFeatures.flovide || productFeatures.flovideInterac);
  const wisePayWallet = wallets?.find((w) => isWisePayCurrency(w.currency_code));

  useEffect(() => {
    if (fundingSource === "interac" && cadWallet && selectedWalletId !== cadWallet.wallet_id) {
      setSelectedWalletId(cadWallet.wallet_id);
    }
  }, [fundingSource, cadWallet, selectedWalletId]);

  const fundingMethodOptions: PaymentMethodOption<FundingSource>[] = [
    ...(cardFundingAvailable
      ? [{ id: "card" as const, label: "Card", sublabel: "Debit or credit", icon: CreditCard, tone: "card" as const }]
      : []),
    { id: "bank" as const, label: "Bank", sublabel: "Transfer from your bank", icon: Landmark, tone: "bank" as const },
    ...(interacFundingAvailable
      ? [{
          id: "interac" as const,
          label: "Interac",
          sublabel: interacUsesFincra
            ? `e-Transfer · ${FINCRA_CAD_INTERAC_ALIAS}`
            : interacUsesFlovide
            ? "Autodeposit · efin@flovide.com"
            : "e-Transfer · CAD",
          icon: Banknote,
          tone: "bank" as const,
        }]
      : []),
    ...(wisePayWallet
      ? [{ id: "wise" as const, label: "Wise", sublabel: "Bank or card via Wise", icon: Wallet, tone: "wise" as const }]
      : []),
    { id: "wallet" as const, label: "Wallet", sublabel: "eFinMoney balance", icon: Wallet, tone: "wallet" as const },
  ];

  const fundingOptions = ([
    { v: "wallet" as const, icon: Wallet, label: "Wallet" },
    ...((productFeatures.nombaNigeria || productFeatures.lenhubFlutter || productFeatures.paytota || productFeatures.swychr || productFeatures.flutterwave)
      ? [{ v: "card" as const, icon: CreditCard, label: "Card" }]
      : []),
  ]);

  useEffect(() => {
    if (fundingSource === "card") {
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
                  "relative grid w-full max-w-lg mx-auto h-11 overflow-hidden bg-transparent p-1",
                  canadaLive ? "grid-cols-3" : "grid-cols-2",
                )}
              >
                {/* Active-cell focus ring */}
                <motion.div
                  className="absolute top-1 bottom-1 rounded-lg border-2 border-white/80 dark:border-white/20 bg-transparent pointer-events-none"
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
                <TabsTrigger value="international" className="relative z-10 gap-1.5 rounded-lg px-2 sm:gap-2 sm:px-3 text-xs sm:text-sm font-medium bg-pay-bank/15 text-pay-bank transition-colors hover:bg-pay-bank/25 data-[state=active]:bg-pay-bank data-[state=active]:text-pay-bank-foreground data-[state=active]:shadow-none">
                  <Globe2 className="h-3.5 w-3.5" aria-hidden />
                  Other
                </TabsTrigger>
                <TabsTrigger value="efinmoney" className="relative z-10 gap-1.5 rounded-lg px-2 sm:gap-2 sm:px-3 text-xs sm:text-sm font-medium bg-pay-wallet/15 text-pay-wallet transition-colors hover:bg-pay-wallet/25 data-[state=active]:bg-pay-wallet data-[state=active]:text-pay-wallet-foreground data-[state=active]:shadow-none">
                  <BrandFlag size="xs" />
                  eFinMoney
                </TabsTrigger>
                {canadaLive && (
                  <TabsTrigger value="canada" className="relative z-10 gap-1.5 rounded-lg px-2 sm:gap-2 sm:px-3 text-xs sm:text-sm font-medium bg-pay-card/15 text-pay-card transition-colors hover:bg-pay-card/25 data-[state=active]:bg-pay-card data-[state=active]:text-pay-card-foreground data-[state=active]:shadow-none">
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
                        <div className="relative max-w-3xl mx-auto">
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
                                  className="max-w-3xl"
                                  steps={[
                                    { n: 1, label: "Details" },
                                    { n: 2, label: "Confirm" },
                                  ]}
                                  currentStep={1}
                                  title="Send money to"
                                  headerRight={
                                    <SendHeaderCountry
                                      value={targetCountryId}
                                      onChange={setTargetCountryId}
                                    />
                                  }

                                  footer={
                                    <div className="space-y-3">
                                      <motion.div
                                        whileTap={canContinue ? { scale: 0.97 } : undefined}
                                        animate={canContinue ? { boxShadow: [
                                          "0 0 0 0 hsl(var(--primary) / 0)",
                                          "0 0 0 6px hsl(var(--primary) / 0.15)",
                                          "0 0 0 0 hsl(var(--primary) / 0)",
                                        ] } : { boxShadow: "0 0 0 0 hsl(var(--primary) / 0)" }}
                                        transition={canContinue ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                                        className="rounded-md"
                                      >
                                        <Button
                                          className="w-full"
                                          size="lg"
                                          onClick={() => {
                                            if (!canContinue) {
                                              toast.error(continueBlockers[0] || "Complete the form to continue");
                                              return;
                                            }
                                            goToStep(3);
                                          }}
                                          disabled={!canContinue}
                                          title={!canContinue ? continueBlockers.join(" · ") : undefined}
                                        >
                                          {canContinue
                                            ? "Continue"
                                            : continueBlockers[0] || "Complete required fields"}
                                        </Button>
                                      </motion.div>
                                      {!canContinue && continueBlockers.length > 1 && (
                                        <ul className="space-y-1 px-1 text-center text-xs text-muted-foreground">
                                          {continueBlockers.slice(1, 4).map((reason) => (
                                            <li key={reason}>{reason}</li>
                                          ))}
                                        </ul>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => navigate('/dashboard')}
                                        className="block mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  }
                                >

                                    {!isLiveSendCountryId(targetCountryId) ? (
                                      <ComingSoon
                                        title={`${targetCountry.country} is coming soon`}
                                        description="Pay-in and payout for this country are not live yet. Live corridors: Ghana, Kenya, Zambia, Nigeria, Canada, and the United States."
                                        backHref=""
                                      />
                                    ) : (
                                    <>
                                    <motion.div custom={0} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                      <RecipientQuickBox
                                        value={recipientName}
                                        onChange={setRecipientName}
                                        onQuickAdd={() => setSaveModalOpen(true)}
                                      />
                                      <div className="flex items-center justify-between gap-3">
                                        <ContactQuickField
                                          label=""
                                          placeholder="Select contact"
                                          valueLabel={pickedBeneficiaryId ? recipientName : null}
                                          onSelect={applyBeneficiary}
                                          onClear={pickedBeneficiaryId ? clearSelectedContact : undefined}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setPickerOpen(true)}
                                          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                                        >
                                          <Users className="w-3.5 h-3.5" /> All contacts
                                        </button>
                                      </div>
                                      {pickedBeneficiaryId && (
                                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                                          <CheckCircle className="w-3.5 h-3.5" /> Contact selected — {recipientName}
                                          {prefillSummary && <span className="text-muted-foreground">· {prefillSummary}</span>}
                                          <button
                                            type="button"
                                            onClick={clearSelectedContact}

                                            aria-label="Clear selected contact"
                                            className="opacity-70 hover:opacity-100"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </p>
                                      )}
                                    </motion.div>

                                    <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="show">
                                      <SectionBoundary name="LiveFxCalculator"><LiveFxCalculator
                                        variant="app"
                                        pairLayout
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
                                            { v: 'mobile', label: 'Phone' },
                                            { v: 'bank',   label: 'Bank' },
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
                                    {!useLink && isCanadaIntlPayout && (
                                      <motion.div custom={1.2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>How should they receive CAD?</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                          {([
                                            { v: "interac" as const, label: "Interac e-Transfer", sub: "Email or Canadian mobile" },
                                            { v: "eft" as const, label: "Bank deposit", sub: "Institution + account" },
                                          ]).map(({ v, label, sub }) => {
                                            const active = cadPayoutMode === v;
                                            return (
                                              <button
                                                key={v}
                                                type="button"
                                                onClick={() => setCadPayoutMode(v)}
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
                                      </motion.div>
                                    )}
                                    {!useLink && availableNetworks && availableNetworks.length > 1 && !isGhanaBank && !isNGNBank && !isCanadaIntlPayout && (
                                      <motion.div custom={1.5} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>Network</Label>
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
                                          <Select
                                            value={ngnBanks.some((b) => b.code === ngnBankCode) ? ngnBankCode : undefined}
                                            onValueChange={setNgnBankCode}
                                          >
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
                                            <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
                                              <LoadingSpinner size={12} />
                                              Verifying account…
                                            </div>
                                          )}
                                          {ngnResolvedName && !ngnResolving && (
                                            <p className="text-sm text-primary inline-flex items-center gap-1">
                                              <CheckCircle className="w-3.5 h-3.5" /> {ngnResolvedName}
                                            </p>
                                          )}
                                          {ngnResolveError && !ngnResolving && (
                                            <p className="text-sm text-amber-600 dark:text-amber-500 inline-flex items-start gap-1">
                                              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                              <span>{ngnResolveError}</span>
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
                                    ) : isCanadaIntlPayout ? (
                                      cadPayoutMode === "interac" ? (
                                        <>
                                        <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                          <Label>Interac email <span className="text-muted-foreground font-normal">(optional if mobile is set)</span></Label>
                                          <Input
                                            type="email"
                                            value={recipientEmail}
                                            onChange={(e) => setRecipientEmail(e.target.value.trimStart().slice(0, 254))}
                                            placeholder="jane@example.com"
                                            maxLength={254}
                                            className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
                                          />
                                        </motion.div>
                                        <motion.div custom={2.2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                          <Label>Mobile number <span className="text-muted-foreground font-normal">(optional if email is set)</span></Label>
                                          <Input
                                            type="tel"
                                            value={recipientPhone}
                                            onChange={(e) => setRecipientPhone(e.target.value.replace(/[^\d+()\-\s]/g, "").slice(0, 20))}
                                            placeholder="(416) 555-0123"
                                            maxLength={20}
                                            className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
                                          />
                                          <p className="text-xs text-muted-foreground">
                                            Canadian Interac e-Transfer needs an email or a 10-digit mobile number — at least one. Email is preferred for Autodeposit. We will not collect payment if both are missing.
                                          </p>
                                        </motion.div>
                                        </>
                                      ) : (
                                        <>
                                          <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                              <Label>Institution #</Label>
                                              <Input
                                                inputMode="numeric"
                                                maxLength={3}
                                                placeholder="001"
                                                value={caInstitutionNumber}
                                                onChange={(e) => setCaInstitutionNumber(e.target.value.replace(/\D/g, "").slice(0, 3))}
                                                className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <Label>Transit #</Label>
                                              <Input
                                                inputMode="numeric"
                                                maxLength={5}
                                                placeholder="12345"
                                                value={caTransitNumber}
                                                onChange={(e) => setCaTransitNumber(e.target.value.replace(/\D/g, "").slice(0, 5))}
                                                className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
                                              />
                                            </div>
                                          </motion.div>
                                          <motion.div custom={2.5} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                            <Label>Account number</Label>
                                            <Input
                                              inputMode="numeric"
                                              placeholder="Recipient bank account number"
                                              value={caAccountNumber}
                                              onChange={(e) => setCaAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 20))}
                                              className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
                                            />
                                          </motion.div>
                                          <motion.div custom={2.6} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                            <Label>Bank name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                            <Input
                                              placeholder="Royal Bank of Canada"
                                              value={caBankName}
                                              onChange={(e) => setCaBankName(e.target.value)}
                                              className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                              Funds deposit directly to their Canadian bank account. Account holder name must match exactly.
                                            </p>
                                          </motion.div>
                                        </>
                                      )
                                    ) : (
                                      <>
                                      <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="space-y-2">
                                        <Label>Phone number</Label>
                                        <Input
                                          placeholder={phonePlaceholder}
                                          value={recipientPhone}
                                          onChange={(e) => setRecipientPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 16))}
                                          maxLength={16}
                                          className="transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
                                        />
                                        <p className="text-sm text-muted-foreground">
                                          {targetCountry.code === "ZMW"
                                            ? `Use 260… or 07… (Airtel 77/97, MTN 76/96, Zamtel 75/95). Sent via ${effectiveMethodLabel}.`
                                            : `Sent via ${effectiveMethodLabel} to this number.`}
                                        </p>
                                      </motion.div>
                                      </>
                                    )}


                                    <motion.div custom={0} variants={fieldVariants} initial="hidden" animate="show">
                                      <div
                                        id="send-pay-with"
                                        className="scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card"
                                      >
                                        <div className="grid min-h-[22rem] sm:grid-cols-[minmax(12.5rem,15rem)_minmax(0,1fr)]">
                                          <aside className="border-b border-border bg-muted/20 sm:border-b-0 sm:border-r">
                                            <PaymentMethodRow
                                              options={fundingMethodOptions}
                                              value={fundingSource}
                                              onChange={(v) => setFundingSource(v)}
                                            />
                                          </aside>
                                          <div className="min-w-0 p-5 sm:p-6">
                                      {fundingSource === "wise" ? (
                                        <SectionBoundary name="WisePayLinkSend">
                                          <WisePayLinkCard
                                            walletId={(selectedWallet && isWisePayCurrency(selectedWallet.currency_code)
                                              ? selectedWallet.wallet_id
                                              : wisePayWallet?.wallet_id) || ""}
                                            walletCurrency={(selectedWallet && isWisePayCurrency(selectedWallet.currency_code)
                                              ? selectedWallet.currency_code
                                              : wisePayWallet?.currency_code) || "CAD"}
                                            initialAmount={totalCharge > 0 ? totalCharge.toFixed(2) : ""}
                                            onComplete={() => setFundingSource("wallet")}
                                          />
                                        </SectionBoundary>
                                      ) : (
                                      <MethodCheckoutPanel
                                        method={fundingSource}
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
                                        bankSources={bankSources.map((s) => ({
                                          id: s.id,
                                          display_name: s.display_name,
                                          institution: s.institution,
                                          last_four: s.last_four,
                                          liveAvailable: "liveAvailable" in s ? (s as { liveAvailable?: number | null }).liveAvailable : null,
                                          liveCurrent: "liveCurrent" in s ? (s as { liveCurrent?: number | null }).liveCurrent : null,
                                          liveCurrency: "liveCurrency" in s ? (s as { liveCurrency?: string | null }).liveCurrency : (s as { currency_code?: string }).currency_code,
                                        }))}
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
                                        onCardChange={(id) => { setSelectedSavedCardId(id); setShowNewCardForm(false); }}
                                        onAddCard={openNewCardForm}

                                        onAddWallet={() => createWalletTriggerRef.current?.click()}
                                        amount={parsedAmount}
                                        fee={fee}
                                        total={totalCharge}
                                        currency={sourceCurrency}
                                        symbol={sourceSymbol}
                                        cardProviderReady={!!cardSendProvider}
                                        cardChargeNote={null}
                                        cardMinNote={
                                          cardSendProvider
                                            ? `Minimum card send is ${cardSendMinAmount(cardSendProvider, sourceCurrency)} ${sourceCurrency}.`
                                            : null
                                        }
                                        inlineEntry={inlineCardEntry}
                                        cardFields={cardFields}
                                        onCardFieldsChange={setCardFields}
                                        showCardForm={showNewCardForm}
                                        onCancelCardForm={() => setShowNewCardForm(false)}

                                        insufficientBalance={insufficientFunds}
                                        onTopUp={() => navigate("/wallet/topup")}
                                      />
                                      )}
                                          </div>
                                        </div>
                                      </div>
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

                                    {payoutMinError && (
                                      <motion.p
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-sm font-medium text-destructive flex items-center justify-center gap-1"
                                      >
                                        <AlertCircle className="w-3.5 h-3.5" /> {payoutMinError}
                                      </motion.p>
                                    )}

                                    {!rateAvailable && (
                                      <p className="text-sm text-center text-muted-foreground">
                                        No FX rate for {sourceCurrency} → {targetCountry.code}. Try another pair or funding source.
                                      </p>
                                    )}
                                    </>
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
                                    { n: 1, label: "Details" },
                                    { n: 2, label: "Confirm" },
                                  ]}
                                  currentStep={2}
                                  title="Confirm"
                                  subtitle="Review the quote, then send"
                                  onStepClick={(n) => {
                                    if (n === 1) {
                                      goToStep(1);
                                      window.setTimeout(() => {
                                        document.getElementById("send-pay-with")?.scrollIntoView({
                                          behavior: "smooth",
                                          block: "center",
                                        });
                                      }, 320);
                                    }
                                  }}
                                  footer={
                                    fundingSource === "card" && inlineCardEntry ? undefined : (
                                      <div className="space-y-3">
                                        <div className="flex gap-3">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="flex-1"
                                            onClick={() => {
                                              goToStep(1);
                                              // Let Details remount, then jump to Pay with so funding can be changed.
                                              window.setTimeout(() => {
                                                document.getElementById("send-pay-with")?.scrollIntoView({
                                                  behavior: "smooth",
                                                  block: "center",
                                                });
                                              }, 320);
                                            }}
                                            disabled={confirming || creatingLink}
                                          >
                                            Back
                                          </Button>
                                          <Button
                                            type="button"
                                            className="flex-1"
                                            onClick={useLink ? handleCreateLink : requestConfirm}
                                            disabled={confirming || creatingLink}
                                          >
                                            {(confirming || creatingLink) ? (
                                              <span className="inline-flex items-center gap-2">
                                                <LoadingSpinner size={16} />
                                                Processing...
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-2">
                                                {fundingSource === "card" ? <CreditCard className="w-4 h-4" /> : fundingSource === "interac" ? <Banknote className="w-4 h-4" /> : fundingSource === "bank" ? <Landmark className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                                                {useLink ? "Send secure link" : fundingSource === "card" ? "Pay with card" : fundingSource === "interac" ? "Pay with Interac" : fundingSource === "bank" ? "Pay from bank" : "Confirm Transfer"}
                                              </span>
                                            )}
                                          </Button>
                                        </div>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                          onClick={() => setCancelOpen(true)}
                                          disabled={confirming}
                                        >
                                          Cancel Transfer
                                        </Button>
                                      </div>
                                    )
                                  }
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
                                      ) : isCanadaIntlPayout ? (
                                        cadPayoutMode === "interac" ? (
                                          <>
                                            {recipientEmail.trim() ? (
                                              <div className="flex justify-between"><span className="text-muted-foreground">Interac email</span><span className="font-medium">{recipientEmail}</span></div>
                                            ) : null}
                                            {recipientPhone.trim() ? (
                                              <div className="flex justify-between"><span className="text-muted-foreground">Mobile</span><span className="font-medium">{recipientPhone}</span></div>
                                            ) : null}
                                            {!recipientEmail.trim() && !recipientPhone.trim() ? (
                                              <div className="flex justify-between"><span className="text-muted-foreground">Interac contact</span><span className="font-medium text-destructive">Missing</span></div>
                                            ) : null}
                                          </>
                                        ) : (
                                          <>
                                            <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">{caInstitutionNumber}-{caTransitNumber}{caBankName ? ` · ${caBankName}` : ""}</span></div>
                                            <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="font-medium">{caAccountNumber}</span></div>
                                          </>
                                        )
                                      ) : (
                                        <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-medium">{recipientPhone}</span></div>
                                      )}
                                      <div className="flex justify-between"><span className="text-muted-foreground">Destination</span><span className="font-medium">{targetCountry.flag} {targetCountry.country}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span className="font-medium">{useLink ? "Secure link (recipient picks)" : isBankPayout ? "Bank Transfer" : isCanadaIntlPayout ? (cadPayoutMode === "interac" ? "Interac e-Transfer" : "Bank deposit (EFT)") : effectiveMethodLabel}</span></div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Funding</span>
                                        <span className="font-medium capitalize">
                                          {fundingSource === "interac"
                                            ? "Interac"
                                            : fundingSource === "card"
                                              ? "Card"
                                              : fundingSource}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
                                      <div className="flex justify-between"><span className="text-muted-foreground">You send</span><span className="font-medium">{sourceSymbol}{parsedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sourceCurrency}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-medium">+{sourceSymbol}{fee.toFixed(2)}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Total to pay</span><span className="font-semibold">{sourceSymbol}{totalCharge.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sourceCurrency}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span className="font-medium">1 {sourceCurrency} = {effectiveRate.toFixed(4)} {targetCountry.code}</span></div>
                                      <div className="flex justify-between text-base pt-2 border-t border-border"><span>They receive</span><span className="font-bold">{targetSymbol} {receivedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                    </div>
                                    {fundingSource === 'bank' && (
                                      <p className="text-xs text-muted-foreground text-center">
                                        Next you’ll pay from your bank app. We collect the amount, then send it to the recipient.
                                      </p>
                                    )}
                                    {fundingSource === "card" && !inlineCardEntry && (
                                      <p className="text-xs text-muted-foreground text-center">
                                        Next you’ll enter card details on our secure page. After payment, we automatically send to your recipient.
                                      </p>
                                    )}
                                    {fundingSource === "card" && inlineCardEntry ? (
                                      <div className="space-y-3">
                                        <SectionBoundary name="FlutterwaveCardForm">
                                          <FlutterwaveCardForm
                                            defaultWalletId={selectedWallet?.wallet_id}
                                            defaultAmount={totalCharge}
                                            lockAmount
                                            hideAmountField
                                            hideBrandHeader
                                            externalCard={cardFields}
                                            summary={
                                              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                                                Paying with {maskedCardLabel(cardFields)}
                                              </div>
                                            }
                                            ctaLabel={`Pay ${sourceSymbol}${totalCharge.toFixed(2)} & send`}
                                            onSuccess={() => { void handleConfirm("wallet"); }}
                                          />
                                        </SectionBoundary>
                                        <div className="flex gap-3">
                                          <Button
                                            variant="outline"
                                            className="flex-1"
                                            onClick={() => {
                                              goToStep(1);
                                              window.setTimeout(() => {
                                                document.getElementById("send-pay-with")?.scrollIntoView({
                                                  behavior: "smooth",
                                                  block: "center",
                                                });
                                              }, 320);
                                            }}
                                            disabled={confirming}
                                          >
                                            Back
                                          </Button>
                                          <Button
                                            variant="outline"
                                            className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => setCancelOpen(true)}
                                            disabled={confirming}
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </div>
                                    ) : null}
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
                                {interacFunding ? (
                                  <SectionBoundary name="InteracSendCheckout">
                                    <WiseInteracInvoiceCheckout
                                      walletId={interacFunding.walletId}
                                      purpose="transfer"
                                      transferId={interacFunding.transferId}
                                      amount={interacFunding.amount}
                                      invoiceId={interacFunding.transferId}
                                      payeeName="eFinMoney"
                                      comment="Thank you for your business"
                                      lineItem={`eFinMoney Transfer${
                                        recipientName ? ` (to ${recipientName})` : ""
                                      }`}
                                      onExit={() => {
                                        setInteracFunding(null);
                                        goToStep(3);
                                      }}
                                      onComplete={() => setInteracFunding(null)}
                                    />
                                  </SectionBoundary>
                                ) : bankCheckoutFunding ? (
                                  <SectionBoundary name="BankSendCheckout">
                                    <div className="space-y-3">
                                      <BankAccountCheckout
                                        purpose="send"
                                        walletId={bankCheckoutFunding.walletId}
                                        currency={bankCheckoutFunding.currency}
                                        amount={bankCheckoutFunding.amount}
                                        transferId={bankCheckoutFunding.transferId}
                                        destLabel={recipientName || "recipient"}
                                        fromBankLabel={
                                          activeSources.find((s) => s.id === selectedSourceId)?.display_name
                                        }
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => {
                                          setBankCheckoutFunding(null);
                                          goToStep(3);
                                        }}
                                      >
                                        Back
                                      </Button>
                                    </div>
                                  </SectionBoundary>
                                ) : linkResult ? (
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
        onSaved={(b) => { applyBeneficiary(b); setSaveModalOpen(false); }}
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
