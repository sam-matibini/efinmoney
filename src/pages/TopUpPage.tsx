import { SYSTEM_DEFAULT_CURRENCY } from '@/lib/systemDefaults';
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import BackToDashboard from "@/components/layout/BackToDashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, XCircle, CreditCard, Smartphone, Building2, Globe, Wallet, FileText, Landmark } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import ElicateTopUpCard from "@/components/payments/ElicateTopUpCard";
import CadInteracTopUpCard from "@/components/payments/CadInteracTopUpCard";
import GhanaTopUpCard from "@/components/payments/GhanaTopUpCard";
import NombaTopUpCard from "@/components/payments/NombaTopUpCard";
import LenhubFlutterTopUpCard from "@/components/payments/LenhubFlutterTopUpCard";
import PaytotaTopUpCard from "@/components/payments/PaytotaTopUpCard";
import DodoTopUpCard from "@/components/payments/DodoTopUpCard";
import SwychrTopUpCard from "@/components/payments/SwychrTopUpCard";
import { validateMinAmount, minAmount, type FlwMethod } from "@/lib/flutterwave";
import LoadingSpinner from "@/components/LoadingSpinner";
import FlutterwaveHostedTopUpCard from "@/components/payments/FlutterwaveHostedTopUpCard";
import FlutterwaveMomoTopUpCard from "@/components/payments/FlutterwaveMomoTopUpCard";
import { MM_COUNTRIES } from "@/lib/mobileMoneyNetworks";
import {
  routeWalletTopupGateway,
  supportsWesternProviderChoice,
  supportsAfricanProviderChoice,
  type WesternTopupProvider,
  type AfricanTopupProvider,
  LENHUB_FLUTTER_TOPUP_CURRENCIES,
  FLW_WESTERN_TOPUP_CURRENCIES,
  FLW_AFRICA_TOPUP_CURRENCIES,
  FINCRA_AFRICA_TOPUP_CURRENCIES,
  type IntlTopupMethod,
  type AfricaMomoTopupMethod,
  type WalletTopupGateway,
  MULTI_RAIL_TOPUP_CURRENCIES,
  AFRICA_MOMO_MULTI_RAIL_CURRENCIES,
  PAYTOTA_AFRICA_TOPUP_CURRENCIES,
  SWYCHR_TOPUP_CURRENCIES,
  nombaGatewayLabel,
  paytotaGatewayLabel,
  fincraGatewayLabel,
  swychrGatewayLabel,
  intlMethodLabel,
  intlMethodDescription,
  intlMethodBenefit,
  intlMethodProvider,
  africaMomoMethodLabel,
  africaMomoMethodDescription,
  africaMomoMethodBenefit,
  africaMomoMethodProvider,
  gatewayProviderLabel,
  isNombaTopupComingSoon,
} from "@/lib/walletTopupGateway";
import { clearPendingSwychrTxn } from "@/lib/swychrPay";
import FlutterwaveWesternTopUpHints from "@/components/wallets/FlutterwaveWesternTopUpHints";
import TopUpMethodPicker from "@/components/payments/TopUpMethodPicker";
import { buildFincraTopupRedirectUrl, parseFincraReturnReference, isFincraCheckoutCurrency } from "@/lib/fincraTopup";
import { clearPendingNombaTxn } from "@/lib/nombaPay";
import { clearPendingPaytotaTxn, confirmPaytotaPayment, readPendingPaytotaTxn } from "@/lib/paytotaPay";
import {
  clearPendingDodoRef,
  readPendingDodoRef,
  verifyDodoPayment,
} from "@/lib/dodoPayments";
import { quoteCadNombaTopup } from "@/lib/nombaTopupQuote";
import { useFxRates } from "@/hooks/useFxRates";
import { cn } from "@/lib/utils";
import ComingSoon from "@/components/common/ComingSoon";
import { isLiveTopupCurrency, productFeatures } from "@/lib/productFeatures";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import { SectionBoundary } from "@/components/common/SectionBoundary";
import { currencySymbol } from "@/lib/currency";

const MM_BY_CCY = Object.fromEntries(MM_COUNTRIES.map((c) => [c.currency, c]));

type Gateway = WalletTopupGateway;

function availableIntlMethods(currency: string): IntlTopupMethod[] {
  const c = currency.toUpperCase();
  const methods: IntlTopupMethod[] = [];
  // Western multi-rail (USD/EUR/GBP/CAD) — Nomba Express card shown but Coming soon
  if (MULTI_RAIL_TOPUP_CURRENCIES.includes(c)) {
    if (productFeatures.nombaNigeria) methods.push("nomba");
    if (productFeatures.fincra && ["USD", "EUR", "GBP", "CAD"].includes(c)) methods.push("fincra");
    if (productFeatures.paytota) methods.push("paytota");
    if (productFeatures.dodo) methods.push("dodo");
    if (c === "CAD" && productFeatures.fincraInterac) methods.push("interac");
    if (productFeatures.flutterwave && FLW_WESTERN_TOPUP_CURRENCIES.includes(c)) {
      methods.push("flutterwave");
    }
    if (productFeatures.lenhubFlutter) methods.push("lenhub");
    return methods;
  }
  // NGN: Nomba primary, then Lenhub + Fincra + company Flutterwave
  if (c === "NGN") {
    if (productFeatures.nombaNigeria) methods.push("nomba");
    if (productFeatures.lenhubFlutter) methods.push("lenhub");
    if (productFeatures.fincra) methods.push("fincra");
    if (productFeatures.flutterwave) methods.push("flutterwave");
    return methods;
  }
  // Africa collect: Lenhub Card (direct) is offered in the Africa MoMo chooser
  if (AFRICA_MOMO_MULTI_RAIL_CURRENCIES.includes(c)) {
    return methods;
  }
  if (productFeatures.lenhubFlutter && LENHUB_FLUTTER_TOPUP_CURRENCIES.includes(c)) {
    methods.push("lenhub");
  }
  return methods;
}

function availableAfricaMomoMethods(currency: string): AfricaMomoTopupMethod[] {
  const c = currency.toUpperCase();
  if (!AFRICA_MOMO_MULTI_RAIL_CURRENCIES.includes(c)) return [];
  const methods: AfricaMomoTopupMethod[] = [];
  // Primary / existing rails first
  if (c === "GHS" && productFeatures.ghanaPay) methods.push("ghana");
  if (c === "ZMW" && productFeatures.elicate) methods.push("elicate");
  // Paytota first for East Africa MoMo (UGX/KES/RWF) so Top Up defaults to it
  if (productFeatures.paytota && PAYTOTA_AFRICA_TOPUP_CURRENCIES.includes(c)) methods.push("paytota");
  if (productFeatures.swychr && SWYCHR_TOPUP_CURRENCIES.includes(c)) methods.push("swychr");
  // Company Flutterwave — Africa card / MoMo (NGN is on the intl NGN picker)
  if (productFeatures.flutterwave && FLW_AFRICA_TOPUP_CURRENCIES.includes(c) && c !== "NGN") {
    methods.push("flutterwave");
  }
  // Fincra as extra hosted checkout where merchant collect works
  if (productFeatures.fincra && FINCRA_AFRICA_TOPUP_CURRENCIES.includes(c)) methods.push("fincra");
  // Lenhub Card (direct) — always visible for GHS/KES/UGX/RWF/TZS when feature on
  if (productFeatures.lenhubFlutter && LENHUB_FLUTTER_TOPUP_CURRENCIES.includes(c)) {
    methods.push("lenhub");
  }
  return methods;
}

function initialIntlMethod(params: URLSearchParams, currency: string): IntlTopupMethod | null {
  const methods = availableIntlMethods(currency);
  if (methods.length === 0) return null;
  const selectable = methods.filter((m) => !(m === "nomba" && isNombaTopupComingSoon(currency)));
  const pool = selectable.length > 0 ? selectable : methods;
  const fromQuery = params.get("method")?.toLowerCase() || params.get("provider")?.toLowerCase() || params.get("rail")?.toLowerCase();
  if (fromQuery === "interac" && pool.includes("interac")) return "interac";
  if ((fromQuery === "fincra" || fromQuery === "bank") && pool.includes("fincra")) return "fincra";
  if (fromQuery === "bank" && pool.includes("lenhub") && currency.toUpperCase() === "NGN") return "lenhub";
  if ((fromQuery === "paytota" || fromQuery === "invoice") && pool.includes("paytota")) return "paytota";
  if ((fromQuery === "dodo" || fromQuery === "global") && pool.includes("dodo")) return "dodo";
  if ((fromQuery === "nomba" || fromQuery === "card" || fromQuery === "express") && pool.includes("nomba")) return "nomba";
  if ((fromQuery === "lenhub" || fromQuery === "direct" || fromQuery === "ngn") && pool.includes("lenhub")) return "lenhub";
  if (
    (fromQuery === "flutterwave" || fromQuery === "flw" || fromQuery === "company") &&
    pool.includes("flutterwave")
  ) {
    return "flutterwave";
  }
  return pool[0];
}

function initialAfricaMomoMethod(params: URLSearchParams, currency: string): AfricaMomoTopupMethod | null {
  const methods = availableAfricaMomoMethods(currency);
  if (methods.length === 0) return null;
  const fromQuery = params.get("method")?.toLowerCase() || params.get("provider")?.toLowerCase() || params.get("rail")?.toLowerCase();
  if ((fromQuery === "paytota" || fromQuery === "invoice" || fromQuery === "momo-checkout") && methods.includes("paytota")) {
    return "paytota";
  }
  if ((fromQuery === "swychr" || fromQuery === "mobile") && methods.includes("swychr")) return "swychr";
  if ((fromQuery === "flutterwave" || fromQuery === "flw") && methods.includes("flutterwave")) return "flutterwave";
  if ((fromQuery === "fincra" || fromQuery === "bank") && methods.includes("fincra")) return "fincra";
  if ((fromQuery === "ghana" || fromQuery === "ghana_pay") && methods.includes("ghana")) return "ghana";
  if ((fromQuery === "elicate" || fromQuery === "zambia") && methods.includes("elicate")) return "elicate";
  if ((fromQuery === "lenhub" || fromQuery === "direct" || fromQuery === "card") && methods.includes("lenhub")) {
    return "lenhub";
  }
  return methods[0];
}

function initialWesternProvider(params: URLSearchParams): WesternTopupProvider {
  const fromQuery = params.get("provider")?.toLowerCase();
  if (fromQuery === "fincra") return "fincra";
  if (fromQuery === "flutterwave" || fromQuery === "flw") return "flutterwave";
  if (params.get("flw") === "1") return "flutterwave";
  if (import.meta.env.VITE_FINCRA_TOPUP === "true") return "fincra";
  return "flutterwave";
}

function initialAfricanProvider(params: URLSearchParams): AfricanTopupProvider {
  const fromQuery = params.get("provider")?.toLowerCase();
  if (fromQuery === "fincra") return "fincra";
  if (fromQuery === "flutterwave" || fromQuery === "flw") return "flutterwave";
  if (import.meta.env.VITE_FINCRA_TOPUP === "true") return "fincra";
  return "flutterwave";
}

// Per-gateway available methods
const FLW_METHODS_BY_CCY: Record<string, FlwMethod[]> = {
  NGN: ["card", "banktransfer", "ussd"],
  KES: ["card", "mobilemoney"],
  UGX: ["card", "mobilemoney"],
  GHS: ["card", "mobilemoney"],
  ZMW: ["card", "mobilemoney"],
  RWF: ["card", "mobilemoney"],
  TZS: ["card", "mobilemoney"],
  USD: ["card"],
  CAD: ["card", "banktransfer"],
};

const METHOD_LABEL: Record<FlwMethod, string> = {
  card: "Card",
  banktransfer: "Bank Transfer",
  ussd: "USSD",
  mobilemoney: "Mobile Money",
};

const METHOD_ICON: Record<FlwMethod, typeof CreditCard> = {
  card: CreditCard,
  banktransfer: Building2,
  ussd: Smartphone,
  mobilemoney: Smartphone,
};

const TopUpPage = () => {
  const [params, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, isFinance, isCompliance } = useUserRoles();
  const showStaffRails = isAdmin || isFinance || isCompliance;
  const { data: wallets, isLoading: walletsLoading } = useWallets();
  const { data: fxRates = [] } = useFxRates();

  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FlwMethod>("card");
  const [network, setNetwork] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [westernProvider, setWesternProvider] = useState<WesternTopupProvider>(() => initialWesternProvider(params));
  const [africanProvider, setAfricanProvider] = useState<AfricanTopupProvider>(() => initialAfricanProvider(params));
  const [intlMethod, setIntlMethod] = useState<IntlTopupMethod | null>(null);
  const [africaMomoMethod, setAfricaMomoMethod] = useState<AfricaMomoTopupMethod | null>(null);
  const [verifyState, setVerifyState] = useState<{ status: "verifying" | "success" | "failed"; message: string } | null>(null);
  const [resultDialog, setResultDialog] = useState<{
    open: boolean;
    status: "success" | "failed" | "pending";
    title: string;
    message: string;
  }>({ open: false, status: "failed", title: "", message: "" });

  const clearLenhubReturnParams = () => {
    const next = new URLSearchParams(params);
    let changed = false;
    for (const k of ["lenhub", "msg", "charge_id", "chargeId"]) {
      if (next.has(k)) {
        next.delete(k);
        changed = true;
      }
    }
    if (changed) setSearchParams(next, { replace: true });
  };

  // Initialize wallet from URL or default
  useEffect(() => {
    if (!wallets?.length) return;
    const fromUrl = params.get("walletId");
    if (fromUrl && wallets.some((w) => w.wallet_id === fromUrl)) {
      setSelectedWalletId(fromUrl);
      return;
    }
    const preferCurrency = (params.get("currency") || "").toUpperCase();
    if (preferCurrency && wallets.some((w) => w.currency_code === preferCurrency)) {
      const match = wallets.find((w) => w.currency_code === preferCurrency);
      if (match) {
        setSelectedWalletId(match.wallet_id);
        return;
      }
    }
    if (!selectedWalletId) {
      const def = wallets.find((w) => w.is_default) || wallets[0];
      setSelectedWalletId(def.wallet_id);
    }
  }, [wallets, params, selectedWalletId]);

  const selectedWallet = wallets?.find((w) => w.wallet_id === selectedWalletId);
  const currency = selectedWallet?.currency_code || SYSTEM_DEFAULT_CURRENCY;
  const showWesternProviderChoice = supportsWesternProviderChoice(currency);
  const showAfricanProviderChoice = supportsAfricanProviderChoice(currency);
  const intlMethods = useMemo(() => availableIntlMethods(currency), [currency]);
  const showIntlMethodChoice = intlMethods.length > 1;
  const africaMomoMethods = useMemo(() => availableAfricaMomoMethods(currency), [currency]);
  const showAfricaMomoChoice = africaMomoMethods.length > 1;

  // Keep intl method valid when wallet/currency changes
  useEffect(() => {
    if (intlMethods.length === 0) {
      setIntlMethod(null);
      return;
    }
    const preferred = initialIntlMethod(params, currency);
    setIntlMethod((prev) => {
      if (prev && intlMethods.includes(prev) && !(prev === "nomba" && isNombaTopupComingSoon(currency))) {
        return prev;
      }
      return preferred;
    });
  }, [currency, intlMethods, params]);

  useEffect(() => {
    if (africaMomoMethods.length === 0) {
      setAfricaMomoMethod(null);
      return;
    }
    const preferred = initialAfricaMomoMethod(params, currency);
    setAfricaMomoMethod((prev) => {
      if (prev && africaMomoMethods.includes(prev)) return prev;
      return preferred;
    });
  }, [currency, africaMomoMethods, params]);

  // Paytota: Western invoice + East Africa MoMo. Nomba: NGN + intl. Swychr: XAF/KES/XOF/UGX. Ghana: GHS.
  const ccy = currency.toUpperCase();
  const preferSwychr =
    africaMomoMethod === "swychr"
    || (
      !africaMomoMethod
      && productFeatures.swychr
      && SWYCHR_TOPUP_CURRENCIES.includes(ccy)
      && !PAYTOTA_AFRICA_TOPUP_CURRENCIES.includes(ccy)
    )
    || (
      (params.get("provider")?.toLowerCase() === "swychr" || params.get("rail")?.toLowerCase() === "swychr")
      && ["XAF", "XOF"].includes(ccy)
    );
  const preferPaytota =
    intlMethod === "paytota"
    || africaMomoMethod === "paytota"
    || (
      !africaMomoMethod
      && productFeatures.paytota
      && PAYTOTA_AFRICA_TOPUP_CURRENCIES.includes(ccy)
      && !productFeatures.swychr
    );
  const preferFlutterwave =
    africaMomoMethod === "flutterwave" || intlMethod === "flutterwave";
  const preferInterac = intlMethod === "interac";
  const preferFincra = intlMethod === "fincra" || africaMomoMethod === "fincra";
  const preferLenhubFlutter = intlMethod === "lenhub" || africaMomoMethod === "lenhub";
  const preferDodo = intlMethod === "dodo";
  const preferSwychrResolved =
    africaMomoMethod === "swychr"
    || (
      preferSwychr
      && africaMomoMethod !== "fincra"
      && africaMomoMethod !== "paytota"
      && africaMomoMethod !== "flutterwave"
      && africaMomoMethod !== "ghana"
      && africaMomoMethod !== "elicate"
      && africaMomoMethod !== "lenhub"
    );
  const preferPaytotaResolved =
    intlMethod === "paytota"
    || africaMomoMethod === "paytota"
    || (
      preferPaytota
      && africaMomoMethod !== "fincra"
      && africaMomoMethod !== "swychr"
      && africaMomoMethod !== "flutterwave"
      && africaMomoMethod !== "lenhub"
    );
  const gateway: Gateway = routeWalletTopupGateway(
    currency,
    westernProvider,
    africanProvider,
    preferSwychrResolved,
    preferPaytotaResolved,
    preferInterac,
    preferFincra,
    preferFlutterwave,
    preferLenhubFlutter,
    preferDodo,
  );
  const liveTopup = isLiveTopupCurrency(currency);
  const availableFlwMethods = FLW_METHODS_BY_CCY[currency] || ["card"];
  const mmCountry = method === "mobilemoney" ? MM_BY_CCY[currency] : undefined;

  // Reset method when wallet changes
  useEffect(() => {
    if (gateway === "flutterwave" && !availableFlwMethods.includes(method)) {
      setMethod(availableFlwMethods[0]);
    }
  }, [currency, gateway, availableFlwMethods, method]);

  useEffect(() => {
    if (mmCountry && !mmCountry.networks.find((n) => n.value === network)) {
      setNetwork(mmCountry.networks[0]?.value || "");
    }
  }, [mmCountry, network]);

  // Verify Stripe / Flutterwave / Nomba return callbacks
  useEffect(() => {
    const swychrStatus = params.get("swychr");
    if (swychrStatus === "success") {
      clearPendingSwychrTxn();
      setVerifyState({ status: "success", message: "Payment received — your wallet should update shortly." });
      toast.success("Top-up complete");
      void queryClient.invalidateQueries({ queryKey: ["wallets"] });
      return;
    }
    if (swychrStatus === "failed") {
      clearPendingSwychrTxn();
      setVerifyState({ status: "failed", message: "Payment could not be completed." });
      return;
    }

    const nombaStatus = params.get("nomba");
    if (nombaStatus === "success") {
      clearPendingNombaTxn();
      setVerifyState({ status: "success", message: "Payment received — your wallet should update shortly." });
      toast.success("Top-up complete");
      void queryClient.invalidateQueries({ queryKey: ["wallets"] });
      return;
    }
    if (nombaStatus === "failed") {
      clearPendingNombaTxn();
      setVerifyState({ status: "failed", message: "Payment could not be completed." });
      return;
    }

    const lenhubStatus = params.get("lenhub");
    if (lenhubStatus === "success") {
      const message = "Payment received — your wallet should update shortly.";
      setVerifyState({ status: "success", message });
      setResultDialog({
        open: true,
        status: "success",
        title: "Top-up successful",
        message,
      });
      toast.success("Top-up complete");
      void queryClient.invalidateQueries({ queryKey: ["wallets"] });
      clearLenhubReturnParams();
      return;
    }
    if (lenhubStatus === "failed") {
      const msg = params.get("msg") || "Card payment could not be completed.";
      const message = msg.includes("Policy error")
        ? `${msg} Your bank declined this card charge — try another card or NGN bank transfer.`
        : msg;
      setVerifyState({ status: "failed", message });
      setResultDialog({
        open: true,
        status: "failed",
        title: "Payment failed",
        message,
      });
      toast.error(message);
      clearLenhubReturnParams();
      return;
    }
    if (lenhubStatus === "pending") {
      const message = "Payment submitted — waiting for confirmation…";
      setVerifyState({ status: "verifying", message });
      setResultDialog({
        open: true,
        status: "pending",
        title: "Payment pending",
        message,
      });
      clearLenhubReturnParams();
      return;
    }

    const dodoFlag = params.get("dodo");
    const dodoRef = params.get("ref") || readPendingDodoRef();
    const dodoPaymentId = params.get("payment_id") || undefined;
    const dodoStatus = params.get("status");
    if (dodoFlag === "1" || dodoRef || dodoPaymentId) {
      setVerifyState({ status: "verifying", message: "Confirming your Dodo payment…" });
      (async () => {
        try {
          const result = await verifyDodoPayment({
            reference: dodoRef || undefined,
            payment_id: dodoPaymentId,
          });
          if (result.success) {
            clearPendingDodoRef();
            const message = result.already
              ? "Payment already credited."
              : "Payment received — your wallet has been updated.";
            setVerifyState({ status: "success", message });
            toast.success("Top-up complete");
            void queryClient.invalidateQueries({ queryKey: ["wallets"] });
          } else {
            setVerifyState({
              status: "verifying",
              message:
                result.message ||
                (dodoStatus === "succeeded"
                  ? "Payment succeeded at Dodo — finalizing wallet credit…"
                  : "Waiting for Dodo confirmation — this can take a few seconds."),
            });
          }
        } catch (e) {
          setVerifyState({
            status: "failed",
            message: e instanceof Error ? e.message : "Could not confirm Dodo payment",
          });
        }
      })();
      return;
    }

    const paytotaStatus = params.get("paytota");
    if (paytotaStatus === "success") {
      setVerifyState({ status: "verifying", message: "Confirming your mobile money payment…" });
      (async () => {
        try {
          const pendingId = readPendingPaytotaTxn();
          const purchaseId = params.get("purchase_id") || params.get("purchaseId") || undefined;
          const txnFromUrl = params.get("transaction_id") || params.get("transactionId") || undefined;
          const walletFromUrl = params.get("walletId") || params.get("wallet_id") || undefined;
          const result = await confirmPaytotaPayment({
            transaction_id: txnFromUrl || pendingId || undefined,
            purchase_id: purchaseId,
            wallet_id: walletFromUrl || undefined,
          });
          if (result.status === "completed") {
            clearPendingPaytotaTxn();
            setVerifyState({ status: "success", message: "Payment received — your wallet has been credited." });
            toast.success("Top-up complete");
            void queryClient.invalidateQueries({ queryKey: ["wallets"] });
          } else if (result.status === "failed") {
            clearPendingPaytotaTxn();
            setVerifyState({ status: "failed", message: result.error || "Payment could not be completed." });
          } else {
            setVerifyState({
              status: "success",
              message: "Payment submitted — your wallet should update shortly.",
            });
            toast.success("Payment received");
            void queryClient.invalidateQueries({ queryKey: ["wallets"] });
          }
        } catch (e) {
          setVerifyState({
            status: "failed",
            message: e instanceof Error ? e.message : "Could not confirm payment",
          });
        }
      })();
      return;
    }
    if (paytotaStatus === "failed") {
      clearPendingPaytotaTxn();
      setVerifyState({ status: "failed", message: "Payment could not be completed." });
      return;
    }

    const fincraRef = parseFincraReturnReference(window.location.search);
    if (fincraRef && (fincraRef.startsWith("topup-fincra-") || fincraRef.startsWith("efm_fincra_"))) {
      setVerifyState({ status: "verifying", message: "Verifying your payment…" });
      (async () => {
        const session = (await supabase.auth.getSession()).data.session;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fincra-verify-payment?reference=${encodeURIComponent(fincraRef)}`;
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
          const json = await res.json();
          if (json?.verified) {
            setVerifyState({ status: "success", message: `Wallet credited with ${json.currency} ${json.amount}` });
            toast.success("Top-up complete");
          } else {
            setVerifyState({ status: "failed", message: json?.error || "Payment could not be verified" });
          }
        } catch (e) {
          setVerifyState({ status: "failed", message: e instanceof Error ? e.message : "Verification error" });
        }
      })();
      return;
    }

    const tx = params.get("transaction_id");
    const ref = params.get("tx_ref");
    const flwStatus = params.get("status");
    if (!tx) return;
    if (flwStatus === "cancelled") {
      setVerifyState({ status: "failed", message: "Payment cancelled" });
      return;
    }
    setVerifyState({ status: "verifying", message: "Verifying your payment..." });
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flw-verify-payment?transaction_id=${tx}&tx_ref=${ref || ""}`;
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
        const json = await res.json();
        if (json?.verified) {
          setVerifyState({ status: "success", message: `Wallet credited with ${json.currency} ${json.amount}` });
          toast.success("Top-up complete");
        } else {
          setVerifyState({ status: "failed", message: json?.error || "Payment could not be verified" });
        }
      } catch (e) {
        setVerifyState({ status: "failed", message: e instanceof Error ? e.message : "Verification error" });
      }
    })();
  }, [params, gateway, africanProvider, queryClient]);

  const handleFincraTopUp = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    const minErr = validateMinAmount(currency, amt);
    if (minErr) { toast.error(minErr); return; }

    const isCadViaUsd = currency.toUpperCase() === "CAD";
    let chargeAmount = amt;
    let chargeCurrency = currency.toUpperCase();
    let creditAmount = amt;
    let creditCurrency = currency.toUpperCase();

    if (isCadViaUsd) {
      const quote = quoteCadNombaTopup(amt, fxRates);
      if (!quote) {
        toast.error("CAD/USD rate unavailable — try again shortly");
        return;
      }
      chargeAmount = quote.checkoutAmount;
      chargeCurrency = "USD";
      creditAmount = quote.creditAmount;
      creditCurrency = "CAD";
    } else if (!isFincraCheckoutCurrency(currency)) {
      toast.error(`This checkout does not support ${currency}. Try another payment method.`);
      return;
    }

    setLoading(true);
    try {
      const { url: redirectUrl, usesProductionReturn } = buildFincraTopupRedirectUrl();
      if (usesProductionReturn) {
        toast.info("After payment, you will return to efin.money (required for checkout).");
      }
      const reference = `topup-fincra-${user?.id || "anon"}-${selectedWalletId.slice(0, 8)}-${Date.now()}`;
      const { data, error } = await supabase.functions.invoke("fincra-initialize-checkout", {
        body: {
          amount: chargeAmount,
          currency: chargeCurrency,
          charge_amount: chargeAmount,
          charge_currency: chargeCurrency,
          credit_amount: creditAmount,
          credit_currency: creditCurrency,
          redirectUrl,
          reference,
          walletId: selectedWalletId,
        },
      });
      if (error) throw error;
      const link = (data as { payment_link?: string; error?: string })?.payment_link;
      if ((data as { error?: string })?.error || !link) {
        throw new Error((data as { error?: string })?.error || "No payment link");
      }
      if (isCadViaUsd) {
        toast.message("Opening checkout", {
          description: `Pay $${chargeAmount.toFixed(2)} USD — CAD ${creditAmount.toFixed(2)} credits after payment.`,
        });
      }
      window.location.href = link;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    } finally {
      setLoading(false);
    }
  };

  const gatewayBadge = useMemo(() => {
    if (gateway === "swychr_pay") return { label: swychrGatewayLabel(currency), icon: Globe, color: "bg-violet-500/10 text-violet-700 border-violet-500/30" };
    if (gateway === "paytota_pay") return { label: paytotaGatewayLabel(currency), icon: FileText, color: "bg-sky-500/10 text-sky-700 border-sky-500/30" };
    if (gateway === "dodo_pay") return { label: "Global card checkout", icon: Globe, color: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/30" };
    if (gateway === "nomba_pay") return { label: nombaGatewayLabel(currency), icon: CreditCard, color: "bg-green-600/10 text-green-700 border-green-600/30" };
    if (gateway === "lenhub_flutter") {
      return {
        label: currency === "NGN" ? "NGN card or bank" : "Card (direct)",
        icon: CreditCard,
        color: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
      };
    }
    if (gateway === "ghana_pay") return { label: "Mobile money", icon: Smartphone, color: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30" };
    if (gateway === "elicate") return { label: "Mobile money", icon: Smartphone, color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
    if (gateway === "fincra_interac") return { label: "Interac e-Transfer", icon: Landmark, color: "bg-red-500/10 text-red-700 border-red-500/30" };
    if (gateway === "fincra") return { label: fincraGatewayLabel(currency), icon: Building2, color: "bg-teal-500/10 text-teal-600 border-teal-500/30" };
    if (gateway === "flutterwave") {
      return {
        label: currency === "NGN" ? "Card, bank or USSD" : "Card checkout",
        icon: CreditCard,
        color: "bg-orange-500/10 text-orange-500 border-orange-500/30",
      };
    }
    return { label: "Unavailable", icon: XCircle, color: "bg-muted text-muted-foreground" };
  }, [gateway, currency]);

  const intlPickerOptions = useMemo(
    () =>
      intlMethods.map((m) => {
        const Icon =
          m === "paytota" ? FileText
          : m === "dodo" ? Globe
          : m === "interac" ? Landmark
          : m === "fincra" ? Building2
          : CreditCard;
        return {
          id: m,
          title: intlMethodLabel(m, currency),
          description: intlMethodDescription(m, currency),
          benefit: intlMethodBenefit(m),
          provider: intlMethodProvider(m),
          comingSoon: m === "nomba" && isNombaTopupComingSoon(currency),
          icon: Icon,
        };
      }),
    [intlMethods, currency],
  );

  const africaPickerOptions = useMemo(
    () =>
      africaMomoMethods.map((m) => {
        const Icon =
          m === "paytota" ? FileText
          : m === "fincra" ? Building2
          : m === "lenhub" ? CreditCard
          : Smartphone;
        return {
          id: m,
          title: m === "fincra" ? fincraGatewayLabel(currency) : africaMomoMethodLabel(m),
          description: africaMomoMethodDescription(m, currency),
          benefit: africaMomoMethodBenefit(m),
          provider: africaMomoMethodProvider(m),
          icon: Icon,
        };
      }),
    [africaMomoMethods, currency],
  );

  const staffGatewayProvider = showStaffRails ? gatewayProviderLabel(gateway) : null;

  return (
    <AppPage width="default">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">Add Money</h1>
            <p className="text-muted-foreground text-sm sm:text-base mt-1">
              Pick a wallet, choose how to pay, then enter the amount.
            </p>
          </div>

          <SectionBoundary name="TopUpHero"><PageHeroBanner
            icon={Wallet}
            label={selectedWallet ? `${currency} wallet balance` : "Wallet top-up"}
            value={
              selectedWallet
                ? `${currencySymbol(currency)}${Number(selectedWallet.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
                : "Select a wallet to fund"
            }
            meta={[
              { icon: CreditCard, text: liveTopup ? "Secure checkout for your currency" : "Choose a supported currency" },
              { icon: Globe, text: `${wallets?.length ?? 0} wallets available` },
            ]}
            variant="emerald"
          /></SectionBoundary>

          {gateway === "flutterwave" && (currency === "USD" || currency === "CAD") && (
            <SectionBoundary name="FlutterwaveWesternTopUpHints"><FlutterwaveWesternTopUpHints currency={currency} /></SectionBoundary>
          )}

          {verifyState && (
            <SectionBoundary name="VerifyState"><Card className={
              verifyState.status === "failed"
                ? "border-destructive/50 bg-destructive/5"
                : verifyState.status === "success"
                ? "border-emerald-500/40 bg-emerald-500/5"
                : undefined
            }>
              <CardContent className="pt-6 flex items-center gap-3">
                {verifyState.status === "success" ? <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" /> :
                 verifyState.status === "failed" ? <XCircle className="w-6 h-6 text-destructive shrink-0" /> :
                 <LoadingSpinner size={24} />}
                <div>
                  <p className="font-medium">
                    {verifyState.status === "failed" ? "Payment failed" :
                     verifyState.status === "success" ? "Payment successful" :
                     "Confirming payment"}
                  </p>
                  <p className="text-sm text-muted-foreground">{verifyState.message}</p>
                </div>
              </CardContent>
            </Card></SectionBoundary>
          )}

          <AlertDialog
            open={resultDialog.open}
            onOpenChange={(open) => setResultDialog((prev) => ({ ...prev, open }))}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  {resultDialog.status === "success" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : resultDialog.status === "failed" ? (
                    <XCircle className="w-5 h-5 text-destructive" />
                  ) : null}
                  {resultDialog.title}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-left">
                  {resultDialog.message}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction>
                  {resultDialog.status === "failed" ? "Try again" : "OK"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Checkout shell */}
          <div className="rounded-2xl border border-border bg-gradient-to-b from-muted/40 to-background p-1 sm:p-1.5 space-y-1.5 sm:space-y-2">
          {/* Wallet selector */}
          <SectionBoundary name="WalletSelector"><section className="rounded-xl border border-border bg-card overflow-hidden">
            <header className="px-4 sm:px-5 py-4 border-b border-border bg-muted/30">
              <h2 className="text-base font-semibold tracking-tight">1. Choose wallet to top up</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Funds credit the wallet you select here.</p>
            </header>
            <div className="p-4 sm:p-5">
              {walletsLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : !wallets || wallets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No wallets available. Create one first.</p>
              ) : (
                <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select wallet" /></SelectTrigger>
                  <SelectContent>
                    {wallets.map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {selectedWallet && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Selected method</span>
                  <Badge variant="outline" className={gatewayBadge.color}>
                    <gatewayBadge.icon className="w-3 h-3 mr-1" />
                    {gatewayBadge.label}
                  </Badge>
                  {staffGatewayProvider ? (
                    <Badge variant="outline" className="border-dashed border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[10px] uppercase tracking-wide">
                      {staffGatewayProvider}
                    </Badge>
                  ) : null}
                </div>
              )}
            </div>
          </section></SectionBoundary>

          {showWesternProviderChoice && selectedWallet && productFeatures.flutterwave && (
            <SectionBoundary name="WesternProviderPicker"><TopUpMethodPicker
              showProvider={showStaffRails}
              description={`Choose the experience that fits your ${currency} wallet.`}
              value={westernProvider}
              onChange={(id) => setWesternProvider(id as WesternTopupProvider)}
              options={[
                {
                  id: "flutterwave",
                  title: "Card checkout",
                  description: `Complete card payment on a secure page for ${currency}.`,
                  benefit: "Hosted",
                  provider: "Flutterwave",
                  icon: CreditCard,
                },
                {
                  id: "fincra",
                  title: "Bank or card",
                  description: `Pay with card or bank transfer on a secure page for ${currency}.`,
                  benefit: "Flexible",
                  provider: "Fincra",
                  icon: Globe,
                },
              ]}
            /></SectionBoundary>
          )}

          {showAfricanProviderChoice && selectedWallet && productFeatures.flutterwave && (
            <SectionBoundary name="AfricanProviderPicker"><TopUpMethodPicker
              showProvider={showStaffRails}
              description={`Choose the experience that fits your ${currency} wallet.`}
              value={africanProvider}
              onChange={(id) => setAfricanProvider(id as AfricanTopupProvider)}
              options={[
                {
                  id: "flutterwave",
                  title: "Card checkout",
                  description: `Card, bank, USSD, or mobile money where supported for ${currency}.`,
                  benefit: "Hosted",
                  provider: "Flutterwave",
                  icon: CreditCard,
                },
                {
                  id: "fincra",
                  title: fincraGatewayLabel(currency),
                  description: `Card, bank transfer, or mobile money on a secure page for ${currency}.`,
                  benefit: "Flexible",
                  provider: "Fincra",
                  icon: Building2,
                },
              ]}
            /></SectionBoundary>
          )}

          {showIntlMethodChoice && selectedWallet && liveTopup && (
            <SectionBoundary name="IntlMethodPicker"><TopUpMethodPicker
              showProvider={showStaffRails}
              description={`Pick the option that works best for funding your ${currency} wallet.`}
              value={intlMethod}
              onChange={(id) => setIntlMethod(id as IntlTopupMethod)}
              options={intlPickerOptions}
            /></SectionBoundary>
          )}

          {showAfricaMomoChoice && selectedWallet && liveTopup && (
            <SectionBoundary name="AfricaMomoPicker"><TopUpMethodPicker
              showProvider={showStaffRails}
              description={`Pick the option that works best for funding your ${currency} wallet.`}
              value={africaMomoMethod}
              onChange={(id) => setAfricaMomoMethod(id as AfricaMomoTopupMethod)}
              options={africaPickerOptions}
            /></SectionBoundary>
          )}
          </div>

          {!liveTopup && selectedWallet && (
            <SectionBoundary name="ComingSoon"><ComingSoon
              title="Top-up not available for this currency"
              description={`${currency} wallet funding is not available. Try NGN, GHS, ZMW, KES, UGX, RWF, TZS, ZAR, XAF, XOF, MWK, USD, EUR, GBP, or CAD.`}
              backHref="/wallets"
              backLabel="View wallets"
            /></SectionBoundary>
          )}

          {liveTopup && gateway === "unsupported" && selectedWallet && (
            <SectionBoundary name="Unsupported"><Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Top-up for <strong>{currency}</strong> is not yet available. Please contact support.
                </p>
              </CardContent>
            </Card></SectionBoundary>
          )}

          {/* Flutterwave — MoMo (V4) + card/bank hosted Standard checkout (redirect, no PCI) */}
          {productFeatures.flutterwave && gateway === "flutterwave" && selectedWallet && liveTopup && (
            <div className="space-y-4">
              {(availableFlwMethods.includes("mobilemoney") || currency === "TZS") && (
                <SectionBoundary name="FlutterwaveMomoTopUp"><FlutterwaveMomoTopUpCard
                  walletId={selectedWallet.wallet_id}
                  walletCurrency={currency}
                  onComplete={() => {
                    void queryClient.invalidateQueries({ queryKey: ["wallets"] });
                  }}
                /></SectionBoundary>
              )}
              {(availableFlwMethods.includes("card") ||
                availableFlwMethods.includes("banktransfer") ||
                availableFlwMethods.includes("ussd")) && (
                <SectionBoundary name="FlutterwaveHostedTopUp"><FlutterwaveHostedTopUpCard
                  walletId={selectedWallet.wallet_id}
                  walletCurrency={currency}
                  methods={availableFlwMethods.filter((m) =>
                    ["card", "banktransfer", "ussd"].includes(m),
                  )}
                  onComplete={() => {
                    void queryClient.invalidateQueries({ queryKey: ["wallets"] });
                  }}
                /></SectionBoundary>
              )}
            </div>
          )}

          {/* Card or bank transfer (Fincra hosted) — always available when selected, not gated on Flutterwave */}
          <SectionBoundary name="FincraTopUp">{gateway === "fincra" && selectedWallet && liveTopup && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {showIntlMethodChoice || showAfricanProviderChoice || showWesternProviderChoice || showAfricaMomoChoice
                    ? "3. Enter amount"
                    : "2. Enter amount"}
                </CardTitle>
                <CardDescription>
                  {currency.toUpperCase() === "CAD"
                    ? "Enter CAD to credit. You’ll pay the USD equivalent by card at checkout (Canadian cards welcome)."
                    : ["KES", "UGX", "TZS", "XAF", "XOF", "MWK"].includes(currency.toUpperCase())
                    ? "Continue to a secure page to pay with mobile money."
                    : ["GHS", "ZMW"].includes(currency.toUpperCase())
                    ? "Continue to a secure page to pay with card or mobile money."
                    : currency.toUpperCase() === "NGN"
                    ? "Continue to a secure page to pay with Naira card or bank transfer."
                    : "Continue to a secure page to pay by card or bank transfer."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Amount ({currency})</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-12 text-lg"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Minimum: {minAmount(currency)} {currency}</p>
                </div>

                {currency.toUpperCase() === "CAD" && Number(amount) > 0 && (() => {
                  const quote = quoteCadNombaTopup(Number(amount), fxRates);
                  if (!quote) {
                    return (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        CAD/USD rate loading… try again in a moment.
                      </p>
                    );
                  }
                  return (
                    <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Wallet credit</span>
                        <span className="font-medium tabular-nums">C${quote.creditAmount.toFixed(2)} CAD</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">You pay (approx.)</span>
                        <span className="font-semibold tabular-nums">${quote.checkoutAmount.toFixed(2)} USD</span>
                      </div>
                      {quote.fxRate && (
                        <p className="text-[11px] text-muted-foreground pt-1">
                          Rate: 1 CAD ≈ {quote.fxRate.toFixed(4)} USD · fee included
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/20">
                  <p className="text-xs text-foreground">
                    {currency.toUpperCase() === "CAD"
                      ? "You’ll pay in USD at checkout; your CAD wallet is credited after payment succeeds."
                      : "You will be redirected to complete payment. Your wallet credits when the payment succeeds."}
                  </p>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleFincraTopUp}
                  disabled={loading || (currency.toUpperCase() === "CAD" && !quoteCadNombaTopup(Number(amount) || 0, fxRates))}
                >
                  {loading
                    ? "Opening checkout…"
                    : currency.toUpperCase() === "CAD"
                      ? "Continue — pay with card (USD)"
                      : "Continue — card or bank transfer"}
                </Button>
              </CardContent>
            </Card>
          )}</SectionBoundary>

          {/* Swychr — secondary hosted checkout (feature-flagged) */}
          {liveTopup && gateway === "swychr_pay" && selectedWallet && (
            <SectionBoundary name="SwychrTopUp"><SwychrTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            /></SectionBoundary>
          )}

          {/* Pay by invoice */}
          {liveTopup && gateway === "paytota_pay" && selectedWallet && (
            <SectionBoundary name="PaytotaTopUp"><PaytotaTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            /></SectionBoundary>
          )}

          {/* Dodo Payments MoR checkout */}
          {liveTopup && gateway === "dodo_pay" && selectedWallet && (
            <SectionBoundary name="DodoTopUp"><DodoTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            /></SectionBoundary>
          )}

          {/* Card checkout (Nomba) */}
          {liveTopup && gateway === "nomba_pay" && selectedWallet && (
            <SectionBoundary name="NombaTopUp"><NombaTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            /></SectionBoundary>
          )}

          {/* Lenhub Flutter — card (+ NGN bank transfer VA) */}
          {liveTopup && gateway === "lenhub_flutter" && selectedWallet && (
            <SectionBoundary name="LenhubTopUp"><LenhubFlutterTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            /></SectionBoundary>
          )}

          {/* CAD Interac e-Transfer */}
          {productFeatures.fincraInterac && liveTopup && gateway === "fincra_interac" && selectedWallet && (
            <SectionBoundary name="CadInteracTopUp"><CadInteracTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            /></SectionBoundary>
          )}

          {/* Ghana Pay — direct MoMo collection for GHS */}
          {liveTopup && gateway === "ghana_pay" && selectedWallet && (
            <SectionBoundary name="GhanaTopUp"><GhanaTopUpCard walletId={selectedWallet.wallet_id} walletCurrency={currency} /></SectionBoundary>
          )}

          {/* Zambia MoMo top-up */}
          {productFeatures.elicate && liveTopup && gateway === "elicate" && selectedWallet && (
            <SectionBoundary name="ElicateTopUp"><ElicateTopUpCard walletId={selectedWallet.wallet_id} walletCurrency={currency} /></SectionBoundary>
          )}
        </motion.div>
    </AppPage>
  );
};

export default TopUpPage;
