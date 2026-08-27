import { SYSTEM_DEFAULT_CURRENCY } from '@/lib/systemDefaults';
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import BackToDashboard from "@/components/layout/BackToDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
import { CheckCircle2, XCircle } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useAuth } from "@/hooks/useAuth";
import ElicateTopUpCard from "@/components/payments/ElicateTopUpCard";
import WiseTopUpCard from "@/components/payments/WiseTopUpCard";
import WisePayLinkCard from "@/components/payments/WisePayLinkCard";
import { isWisePayCurrency } from "@/lib/wisePayLink";
import {
  activeRailSetFromPartners,
  collectMethodForPartner,
  collectPayMethodIds,
  defaultCollectPartner,
  resolveCollectMethodPreference,
} from "@/lib/corridorRails";
import { usePaymentPartners } from "@/hooks/usePartnerNetwork";
import CadCollectionPanel from "@/components/topup/CadCollectionPanel";
import WiseInteracInvoiceCheckout from "@/components/payments/WiseInteracInvoiceCheckout";

import GhanaTopUpCard from "@/components/payments/GhanaTopUpCard";
import NombaTopUpCard from "@/components/payments/NombaTopUpCard";
import LenhubFlutterTopUpCard from "@/components/payments/LenhubFlutterTopUpCard";
import PaytotaTopUpCard from "@/components/payments/PaytotaTopUpCard";
import DodoTopUpCard from "@/components/payments/DodoTopUpCard";
import SquareTopUpCard, { verifySquareCheckout } from "@/components/payments/SquareTopUpCard";
import BamboraTopUpCard from "@/components/payments/BamboraTopUpCard";
import BamboraEftTopUpCard from "@/components/payments/BamboraEftTopUpCard";
import PayPalTopUpCard from "@/components/payments/PayPalTopUpCard";
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
  pickBestIntlTopupMethod,
  pickBestAfricaTopupMethod,
  isFincraTopupCurrency,
  isNombaTopupLive,
  fincraGatewayLabel,

} from "@/lib/walletTopupGateway";
import { clearPendingSwychrTxn } from "@/lib/swychrPay";
import FlutterwaveWesternTopUpHints from "@/components/wallets/FlutterwaveWesternTopUpHints";
import BankVirtualAccountCard from "@/components/payments/BankVirtualAccountCard";
import { buildFincraTopupRedirectUrl, parseFincraReturnReference, isFincraCheckoutCurrency } from "@/lib/fincraTopup";
import { clearPendingNombaTxn, readPendingNombaTxn } from "@/lib/nombaPay";
import { clearPendingPaytotaTxn, confirmPaytotaPayment, readPendingPaytotaTxn } from "@/lib/paytotaPay";
import {
  clearPendingDodoRef,
  readPendingDodoRef,
  verifyDodoPayment,
} from "@/lib/dodoPayments";
import { quoteCadNombaTopup } from "@/lib/nombaTopupQuote";
import { useFxRates } from "@/hooks/useFxRates";
import ComingSoon from "@/components/common/ComingSoon";
import { isLiveTopupCurrency, productFeatures } from "@/lib/productFeatures";
import AppPage from "@/components/layout/AppPage";
import { SectionBoundary } from "@/components/common/SectionBoundary";
import { currencySymbol } from "@/lib/currency";
import MoneyFlowShell from "@/components/money/MoneyFlowShell";
import CheckoutShell from "@/components/money/CheckoutShell";
import CheckoutMethodList, { type CheckoutMethod } from "@/components/money/CheckoutMethodList";
import PaymentMethodRow, { type PaymentMethodOption, type PayTone } from "@/components/money/PaymentMethodRow";
import { CreditCard as PayCardIcon, Landmark as PayBankIcon, Smartphone as PayMobileIcon, Wallet as PayWalletIcon } from "lucide-react";
import { CurrencyFlag } from "@/components/ui/FlagImage";

const MM_BY_CCY = Object.fromEntries(MM_COUNTRIES.map((c) => [c.currency, c]));

type Gateway = WalletTopupGateway;

function availableIntlMethods(currency: string): IntlTopupMethod[] {
  const c = currency.toUpperCase();
  const methods: IntlTopupMethod[] = [];
  if (MULTI_RAIL_TOPUP_CURRENCIES.includes(c)) {
    // Nomba CAD first when live (charges USD → credits CAD)
    if (productFeatures.nombaNigeria && isNombaTopupLive(c)) methods.push("nomba");
    if (productFeatures.fincra && ["EUR", "GBP"].includes(c)) methods.push("fincra");
    if (productFeatures.paytota) methods.push("paytota");
    if (productFeatures.dodo) methods.push("dodo");
    if (productFeatures.square) methods.push("square");
    if (productFeatures.paypal) methods.push("paypal");
    if (
      c === "CAD" &&
      (productFeatures.plaid ||
        productFeatures.fincraInterac ||
        productFeatures.flovideInterac ||
        productFeatures.flovide)
    ) {
      methods.push("interac");
    }
    if (productFeatures.wise) methods.push("wise");
    if (productFeatures.flutterwave && FLW_WESTERN_TOPUP_CURRENCIES.includes(c) && c !== "CAD") {
      methods.push("flutterwave");
    }
    return methods;
  }
  // NGN: Nomba primary → Flutterwave → Fincra failover
  if (c === "NGN") {
    if (productFeatures.nombaNigeria && isNombaTopupLive("NGN")) methods.push("nomba");
    if (productFeatures.flutterwave) methods.push("flutterwave");
    if (productFeatures.fincra) methods.push("fincra");
    if (productFeatures.wise) methods.push("wise");
    return methods;
  }
  if (AFRICA_MOMO_MULTI_RAIL_CURRENCIES.includes(c)) {
    return methods;
  }
  // Other wallet currencies: Wise bank deposit when feature is on (API rejects if no ACTIVE details)
  if (productFeatures.wise) methods.push("wise");
  return methods;
}

function availableAfricaMomoMethods(currency: string): AfricaMomoTopupMethod[] {
  const c = currency.toUpperCase();
  if (!AFRICA_MOMO_MULTI_RAIL_CURRENCIES.includes(c)) return [];
  const methods: AfricaMomoTopupMethod[] = [];
  if (productFeatures.fincra && FINCRA_AFRICA_TOPUP_CURRENCIES.includes(c)) methods.push("fincra");
  if (productFeatures.flutterwave && FLW_AFRICA_TOPUP_CURRENCIES.includes(c) && c !== "NGN") {
    methods.push("flutterwave");
  }
  if (productFeatures.paytota && PAYTOTA_AFRICA_TOPUP_CURRENCIES.includes(c)) methods.push("paytota");
  if (productFeatures.swychr && SWYCHR_TOPUP_CURRENCIES.includes(c)) methods.push("swychr");
  if (c === "ZMW" && productFeatures.elicate) methods.push("elicate");
  if (productFeatures.wise) methods.push("wise");
  return methods;
}

/** Deep-link override for staff/ops; otherwise priority auto-pick. */
function initialIntlMethod(params: URLSearchParams, currency: string): IntlTopupMethod | null {
  const methods = availableIntlMethods(currency);
  if (methods.length === 0) return null;
  const fromQuery = params.get("method")?.toLowerCase() || params.get("provider")?.toLowerCase() || params.get("rail")?.toLowerCase();
  if (fromQuery === "interac" && methods.includes("interac")) return "interac";
  if ((fromQuery === "wise" || fromQuery === "bank-transfer") && methods.includes("wise")) return "wise";
  if ((fromQuery === "fincra" || fromQuery === "bank") && methods.includes("fincra")) return "fincra";
  if ((fromQuery === "paytota" || fromQuery === "invoice") && methods.includes("paytota")) return "paytota";
  if ((fromQuery === "dodo" || fromQuery === "global") && methods.includes("dodo")) return "dodo";
  if ((fromQuery === "square" || fromQuery === "sq") && methods.includes("square")) return "square";
  if ((fromQuery === "paypal" || fromQuery === "pp") && methods.includes("paypal")) return "paypal";
  if ((fromQuery === "nomba" || fromQuery === "card" || fromQuery === "express") && methods.includes("nomba")) return "nomba";
  if (
    (fromQuery === "flutterwave" || fromQuery === "flw" || fromQuery === "company") &&
    methods.includes("flutterwave")
  ) {
    return "flutterwave";
  }
  return pickBestIntlTopupMethod(currency, methods);
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
  if ((fromQuery === "wise" || fromQuery === "bank-transfer") && methods.includes("wise")) return "wise";
  return pickBestAfricaTopupMethod(currency, methods);
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

const TopUpPage = () => {
  const [params, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: wallets, isLoading: walletsLoading } = useWallets();
  const { data: fxRates = [] } = useFxRates();
  const { data: paymentPartners = [] } = usePaymentPartners();
  const activeRails = useMemo(
    () => activeRailSetFromPartners(paymentPartners),
    [paymentPartners],
  );

  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FlwMethod>("card");
  const [network, setNetwork] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [westernCardRail, setWesternCardRail] = useState<"square" | "paypal">("square");
  const [africaBackupId, setAfricaBackupId] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");

  const [westernProvider, setWesternProvider] = useState<WesternTopupProvider>(() => initialWesternProvider(params));
  const [africanProvider, setAfricanProvider] = useState<AfricanTopupProvider>(() => initialAfricanProvider(params));
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

  useEffect(() => {
    setWesternCardRail("square");
    setAfricaBackupId(null);
  }, [currency]);
  const intlMethods = useMemo(() => availableIntlMethods(currency), [currency]);
  const africaMomoMethods = useMemo(() => availableAfricaMomoMethods(currency), [currency]);
  const [policyIntlOverride, setPolicyIntlOverride] = useState<IntlTopupMethod | null>(null);
  const [policyAfricaOverride, setPolicyAfricaOverride] = useState<AfricaMomoTopupMethod | null>(null);
  const [policyFailoverPartners, setPolicyFailoverPartners] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setPolicyIntlOverride(null);
    setPolicyAfricaOverride(null);
    setPolicyFailoverPartners([]);
    setSelectedMethodId("");
    const fromQuery = params.get("method") || params.get("provider") || params.get("rail");
    if (fromQuery) return;
    void (async () => {
      try {
        const pref = await resolveCollectMethodPreference(currency);
        if (cancelled) return;
        // Hard preference: Nomba Card for CAD + NGN (ignore stale Fincra/Worldline/Bambora policies).
        const ccy = currency.toUpperCase();
        if (productFeatures.nombaNigeria && isNombaTopupLive(ccy) && intlMethods.includes("nomba")) {
          setPolicyIntlOverride("nomba");
          setPolicyFailoverPartners(
            (pref.rails || [])
              .map((r) => r.toLowerCase())
              .filter((r) => r && r !== "nomba" && r !== "bambora" && r !== "worldline")
              .slice(0, 3),
          );
          setSelectedMethodId("nomba");
          return;
        }
        if (!pref.method) return;
        const m = pref.method as string;
        if (intlMethods.includes(m as IntlTopupMethod)) {
          setPolicyIntlOverride(m as IntlTopupMethod);
        }
        const africa = availableAfricaMomoMethods(currency);
        if (africa.includes(m as AfricaMomoTopupMethod)) {
          setPolicyAfricaOverride(m as AfricaMomoTopupMethod);
        }
        setPolicyFailoverPartners(pref.rails.slice(1));
        if (m === "paypal") setWesternCardRail("paypal");
        else setWesternCardRail("square");
      } catch {
        /* keep auto-pick */
      }
    })();
    return () => { cancelled = true; };
  }, [currency, intlMethods, params]);

  const intlMethod = useMemo(() => {
    if (intlMethods.length === 0) return null;
    if (policyIntlOverride && intlMethods.includes(policyIntlOverride)) return policyIntlOverride;
    return initialIntlMethod(params, currency);
  }, [currency, intlMethods, params, policyIntlOverride]);
  const africaMomoMethod = useMemo(() => {
    if (africaMomoMethods.length === 0) return null;
    if (policyAfricaOverride && africaMomoMethods.includes(policyAfricaOverride)) {
      return policyAfricaOverride;
    }
    return initialAfricaMomoMethod(params, currency);
  }, [currency, africaMomoMethods, params, policyAfricaOverride]);

  // Rare dual-provider corridors: prefer Fincra over Flutterwave when collect is live
  useEffect(() => {
    if (supportsWesternProviderChoice(currency)) {
      const c = currency.toUpperCase();
      const useFincra = isFincraTopupCurrency(c) && c !== "USD" && c !== "CAD";
      setWesternProvider(useFincra ? "fincra" : "flutterwave");
    }
    if (supportsAfricanProviderChoice(currency)) {
      setAfricanProvider(isFincraTopupCurrency(currency) ? "fincra" : "flutterwave");
    }
  }, [currency]);

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
  const preferWise = intlMethod === "wise" || africaMomoMethod === "wise";
  const preferFincra = intlMethod === "fincra" || africaMomoMethod === "fincra";
  const preferLenhubFlutter = intlMethod === "lenhub" || africaMomoMethod === "lenhub";
  const preferDodo = intlMethod === "dodo";
  const preferSquare = intlMethod === "square";
  const preferPaypal = intlMethod === "paypal";
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
    preferWise,
    preferSquare,
    preferPaypal,
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
    // Nomba may return to the app with orderReference/orderId (legacy callbackUrl) — reconcile.
    const nombaOrderRef = params.get("orderReference") || params.get("order_reference") || params.get("reference");
    const nombaOrderId = params.get("orderId") || params.get("order_id");
    const pendingNomba = readPendingNombaTxn();
    if (nombaOrderRef || nombaOrderId || pendingNomba) {
      void (async () => {
        try {
          setVerifyState({ status: "verifying", message: "Confirming card payment…" });
          const { data, error } = await supabase.functions.invoke("nomba-verify-payment", {
            body: {
              transaction_id: pendingNomba || undefined,
              reference: nombaOrderRef || undefined,
              order_id: nombaOrderId || undefined,
            },
          });
          if (error) throw error;
          if (data?.verified || data?.already_completed || data?.credited) {
            clearPendingNombaTxn();
            setVerifyState({ status: "success", message: "Payment received — wallet updated." });
            toast.success("Top-up complete");
            void queryClient.invalidateQueries({ queryKey: ["wallets"] });
          } else {
            setVerifyState({
              status: "failed",
              message: data?.error || "Payment not confirmed yet. If you were charged, contact support.",
            });
          }
        } catch (e) {
          setVerifyState({
            status: "failed",
            message: e instanceof Error ? e.message : "Could not confirm Nomba payment",
          });
        }
      })();
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

    const squareFlag = params.get("square");
    const squareOrderId =
      params.get("orderId") ||
      params.get("order_id") ||
      (() => {
        try { return sessionStorage.getItem("efm_square_pending_order"); } catch { return null; }
      })();
    if (squareFlag === "1") {
      if (squareOrderId) {
        setVerifyState({ status: "verifying", message: "Confirming your payment…" });
        (async () => {
          try {
            const result = await verifySquareCheckout(squareOrderId);
            if (result.success) {
              try {
                sessionStorage.removeItem("efm_square_pending_order");
                sessionStorage.removeItem("efm_square_pending_intent");
              } catch { /* ignore */ }
              setVerifyState({
                status: "success",
                message: result.already
                  ? "Payment already credited."
                  : "Payment received — your wallet has been updated.",
              });
              toast.success("Top-up complete");
              void queryClient.invalidateQueries({ queryKey: ["wallets"] });
            } else {
              setVerifyState({
                status: "verifying",
                message: result.message || "Waiting for payment confirmation…",
              });
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
      setVerifyState({
        status: "failed",
        message: "Missing payment reference — if you paid, contact support with your receipt.",
      });
      return;
    }

    if (dodoFlag === "1" || dodoRef || dodoPaymentId) {
      setVerifyState({ status: "verifying", message: "Confirming your payment…" });
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
                  ? "Payment succeeded — finalizing wallet credit…"
                  : "Waiting for confirmation — this can take a few seconds."),
            });
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
      const flwMethods = FLW_METHODS_BY_CCY[currency] || ["card"];
      const hosted = flwMethods.filter((m) => ["card", "banktransfer", "ussd"].includes(m));
      const fromPolicy = policyFailoverPartners
        .map((p) => collectPayMethodIds(collectMethodForPartner(p) || p)[0])
        .find((id) => id && id !== "fincra");
      const backup =
        fromPolicy
        || (productFeatures.flutterwave && hosted.length > 0 && "flw_hosted")
        || (productFeatures.flutterwave && (flwMethods.includes("mobilemoney") || currency === "TZS") && "flw_momo")
        || (productFeatures.nombaNigeria && isNombaTopupLive(currency) && intlMethods.includes("nomba") && "nomba")
        || (productFeatures.paytota && (intlMethods.includes("paytota") || africaMomoMethods.includes("paytota")) && "paytota")
        || (productFeatures.swychr && africaMomoMethods.includes("swychr") && "swychr")
        || (productFeatures.ghanaPay && africaMomoMethods.includes("ghana") && "ghana")
        || (productFeatures.elicate && africaMomoMethods.includes("elicate") && "elicate")
        || (productFeatures.wise && (intlMethods.includes("wise") || africaMomoMethods.includes("wise")) && "wise")
        || null;
      if (backup) {
        toast.message("Card checkout is busy — try the option below.");
        setAfricaBackupId(backup);
        setSelectedMethodId(backup);
      } else {
        toast.error(e instanceof Error ? e.message : "Could not start checkout");
      }
    } finally {
      setLoading(false);
    }
  };

  const amountNum = Number(amount);
  const amountValid =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    !validateMinAmount(currency, amountNum);

  const invalidateWallets = () => {
    void queryClient.invalidateQueries({ queryKey: ["wallets"] });
  };

  type PayMethod = CheckoutMethod & { tone: PayTone };
  const payMethods: PayMethod[] = [];

  if (selectedWallet && liveTopup) {
    const walletId = selectedWallet.wallet_id;
    const rails = new Set<string>([...intlMethods, ...africaMomoMethods]);
    const ccyUpper = currency.toUpperCase();
    const forceNombaCard =
      productFeatures.nombaNigeria
      && isNombaTopupLive(ccyUpper)
      && (ccyUpper === "CAD" || ccyUpper === "NGN");
    const defaultRail = forceNombaCard ? "nomba" : defaultCollectPartner(ccyUpper);
    const collectPrimary =
      (forceNombaCard && "nomba")
      || (policyIntlOverride && intlMethods.includes(policyIntlOverride) && policyIntlOverride)
      || (policyAfricaOverride && africaMomoMethods.includes(policyAfricaOverride) && policyAfricaOverride)
      || (defaultRail && (forceNombaCard || activeRails.has(defaultRail)) ? defaultRail : null)
      || null;
    const primaryIds = collectPrimary ? collectPayMethodIds(collectPrimary) : [];
    const showRail = (id: string) => {
      if (id === "bank_va" && (ccyUpper === "NGN" || ccyUpper === "GHS") && productFeatures.flutterwave) return true;
      // Always offer Wise as its own top-level rail when the feature is on.
      if ((id === "wise" || id === "wise_link") && productFeatures.wise) return true;
      if (africaBackupId) {
        return id === africaBackupId || id === "interac" || id === "plaid";
      }
      if (primaryIds.length === 0) return true;
      if (primaryIds.includes(id)) return true;
      // CAD: keep Interac on the Bank tab even when Nomba/card is primary.
      if (ccyUpper === "CAD" && (id === "interac" || id === "plaid") && !primaryIds.includes("interac")) {
        return true;
      }
      // CAD/NGN: always allow Nomba card rail when live.
      if (forceNombaCard && id === "nomba") return true;
      return false;
    };

    // link_bank (Plaid / manual save) temporarily hidden — it only stores a funding
    // source, it does not collect into the wallet on this page.
    if (showRail("bank_va") && productFeatures.flutterwave && (ccyUpper === "NGN" || ccyUpper === "GHS")) {
      payMethods.push({
        id: "bank_va",
        tone: "bank",
        label: "Your bank account number",
        description: `Permanent ${ccyUpper} account for bank transfers`,
        content: (
          <SectionBoundary name="BankVirtualAccount">
            <div className="rounded-xl border p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Generate a permanent {ccyUpper} account. Send from any bank — funds credit this wallet.
              </p>
              <BankVirtualAccountCard lockedCurrency={ccyUpper} compact />
            </div>
          </SectionBoundary>
        ),
      });
    }

    const usePaypalCard =
      westernCardRail === "paypal"
      || (!productFeatures.square && productFeatures.paypal && rails.has("paypal"));

    // Nomba Card first for CAD + NGN (hosted Checkout — not Worldline/Fincra).
    if (forceNombaCard) {
      payMethods.push({
        id: "nomba",
        tone: "card",
        label: "Card",
        description:
          ccyUpper === "CAD"
            ? "Visa / Mastercard — secure checkout"
            : "Card or bank transfer",
        content: (
          <SectionBoundary name="NombaTopUp">
            <NombaTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} embedded onComplete={invalidateWallets} />
          </SectionBoundary>
        ),
      });
    }

    // Bambora/Worldline: USD only when Nomba is not the CAD card rail.
    if (
      ccyUpper === "USD" &&
      (showRail("square") || showRail("card") || showRail("bambora")) &&
      productFeatures.bambora
    ) {
      payMethods.push({
        id: "bambora",
        tone: "card",
        label: "Card",
        description: "Visa / Mastercard — Worldline",
        content: (
          <SectionBoundary name="BamboraTopUp">
            <BamboraTopUpCard
              walletId={walletId}
              walletCurrency={currency}
              initialAmount={amount}
              embedded
              onComplete={invalidateWallets}
            />
          </SectionBoundary>
        ),
      });
    }

    if (showRail("square") && (productFeatures.square || productFeatures.paypal) && ccyUpper !== "CAD" && ccyUpper !== "NGN" && !(ccyUpper === "USD" && productFeatures.bambora)) {
      payMethods.push({
        id: "square",
        tone: "card",
        label: "Card",
        description: "Visa, Mastercard, Amex",
        content: usePaypalCard && productFeatures.paypal ? (
          <SectionBoundary name="PayPalTopUp">
            <PayPalTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} embedded onComplete={invalidateWallets} />
          </SectionBoundary>
        ) : (
          <SectionBoundary name="SquareTopUp">
            <SquareTopUpCard
              walletId={walletId}
              walletCurrency={currency}
              initialAmount={amount}
              embedded
              onComplete={invalidateWallets}
              onCheckoutUnavailable={() => {
                const next = policyFailoverPartners
                  .map((p) => (collectMethodForPartner(p) || p).toLowerCase())
                  .find((m) => m === "paypal" || m === "dodo" || m === "paytota" || m === "fincra");
                if (next === "paypal" || (!next && productFeatures.paypal)) {
                  toast.message("Card checkout is busy — try the option below.");
                  setWesternCardRail("paypal");
                } else if (next) {
                  toast.message("Card checkout is busy — try the option below.");
                  setAfricaBackupId(collectPayMethodIds(next)[0] || next);
                  setSelectedMethodId(collectPayMethodIds(next)[0] || next);
                } else {
                  toast.error("Card checkout is unavailable right now.");
                }
              }}
            />
          </SectionBoundary>
        ),
      });
    }

    if (productFeatures.flutterwave && rails.has("flutterwave")) {
      const hosted = availableFlwMethods.filter((m) => ["card", "banktransfer", "ussd"].includes(m));
      if (showRail("flw_hosted") && hosted.length > 0) {
        payMethods.push({
          id: "flw_hosted",
          tone: hosted.includes("card") ? "card" : "bank",
          label: hosted.includes("card") ? "Card" : "Bank transfer",
          description: "Pay on a secure checkout page",
          content: (
            <SectionBoundary name="FlutterwaveHostedTopUp">
              <FlutterwaveHostedTopUpCard
                walletId={walletId}
                walletCurrency={currency}
                methods={hosted}
                initialAmount={amount}
                embedded
                onComplete={invalidateWallets}
              />
            </SectionBoundary>
          ),
        });
      }
      if (showRail("flw_momo") && (availableFlwMethods.includes("mobilemoney") || currency === "TZS")) {
        payMethods.push({
          id: "flw_momo",
          tone: "mobile",
          label: "Mobile money",
          description: "Pay with mobile money",
          content: (
            <SectionBoundary name="FlutterwaveMomoTopUp">
              <FlutterwaveMomoTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} onComplete={invalidateWallets} />
            </SectionBoundary>
          ),
        });
      }
    }

    if (showRail("swychr") && productFeatures.swychr && rails.has("swychr")) {
      payMethods.push({
        id: "swychr",
        tone: "mobile",
        label: "Mobile money & card",
        description: "Pay with mobile money or card",
        content: (
          <SectionBoundary name="SwychrTopUp">
            <SwychrTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} onComplete={invalidateWallets} />
          </SectionBoundary>
        ),
      });
    }

    if (showRail("paytota") && productFeatures.paytota && rails.has("paytota")) {
      const africaMomo = PAYTOTA_AFRICA_TOPUP_CURRENCIES.includes(currency.toUpperCase());
      payMethods.push({
        id: "paytota",
        tone: africaMomo ? "mobile" : "card",
        label: africaMomo ? "Mobile money" : "Card or hosted invoice",
        description: africaMomo ? "Pay with mobile money" : "Pay from a secure invoice link",
        content: (
          <SectionBoundary name="PaytotaTopUp">
            <PaytotaTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} onComplete={invalidateWallets} />
          </SectionBoundary>
        ),
      });
    }

    if (showRail("dodo") && productFeatures.dodo && rails.has("dodo")) {
      payMethods.push({
        id: "dodo",
        tone: "card",
        label: "Card",
        description: "Visa, Mastercard, Amex",
        content: (
          <SectionBoundary name="DodoTopUp">
            <DodoTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} embedded onComplete={invalidateWallets} />
          </SectionBoundary>
        ),
      });
    }

    if (showRail("nomba") && !forceNombaCard && productFeatures.nombaNigeria && isNombaTopupLive(currency)) {
      payMethods.push({
        id: "nomba",
        tone: "card",
        label: "Card",
        description:
          currency.toUpperCase() === "CAD"
            ? "Visa / Mastercard — secure checkout"
            : "Card or bank transfer",
        content: (
          <SectionBoundary name="NombaTopUp">
            <NombaTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} embedded onComplete={invalidateWallets} />
          </SectionBoundary>
        ),
      });
    }

    if (showRail("lenhub") && false && rails.has("lenhub")) {
      payMethods.push({
        id: "lenhub",
        tone: "card",
        label: "Card or bank transfer",
        description: "Pay with card or bank transfer",
        content: (
          <SectionBoundary name="LenhubTopUp">
            <LenhubFlutterTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} onComplete={invalidateWallets} />
          </SectionBoundary>
        ),
      });
    }

    const isCadWallet = currency.toUpperCase() === "CAD";

    if (showRail("plaid") && isCadWallet && productFeatures.plaid) {
      payMethods.push({
        id: "plaid",
        tone: "bank",
        label: "Interac",
        description: "Use bank account to make instant payments",
        content: (
          <SectionBoundary name="CadCollection">
            <CadCollectionPanel
              walletId={walletId}
              walletCurrency={currency}
              initialAmount={amount}
              onComplete={invalidateWallets}
              onExit={() => setSelectedMethodId("")}
            />
          </SectionBoundary>
        ),
      });
    }

    if (isCadWallet && productFeatures.bambora) {
      payMethods.push({
        id: "bambora_eft",
        tone: "bank",
        label: "Bank debit (EFT)",
        description: "Canadian bank account · 3–5 business days",
        content: (
          <SectionBoundary name="BamboraEftTopUp">
            <BamboraEftTopUpCard
              walletId={walletId}
              walletCurrency={currency}
              initialAmount={amount}
              embedded
              onComplete={invalidateWallets}
            />
          </SectionBoundary>
        ),
      });
    }

    if (
      showRail("interac") &&
      isCadWallet &&
      !productFeatures.plaid &&
      (rails.has("interac") ||
        productFeatures.fincraInterac ||
        productFeatures.flovideInterac ||
        productFeatures.flovide)
    ) {
      // Fallback when Plaid is off — Flovide/Fincra via CadCollectionPanel, or invoice shell when amount set
      const interacAmount = Number(amount);
      const useFlovide =
        productFeatures.flovide || productFeatures.flovideInterac || productFeatures.fincraInterac;
      payMethods.push({
        id: "interac",
        tone: "bank",
        label: "Interac",
        description: "Use bank account to make instant payments",
        content: (
          <SectionBoundary name="CadInteracTopUp">
            {useFlovide || !(Number.isFinite(interacAmount) && interacAmount >= 1) ? (
              <CadCollectionPanel
                walletId={walletId}
                walletCurrency={currency}
                initialAmount={amount}
                onComplete={invalidateWallets}
                onExit={() => setSelectedMethodId("")}
              />
            ) : (
              <WiseInteracInvoiceCheckout
                walletId={walletId}
                purpose="topup"
                amount={interacAmount}
                lineItem="eFinMoney CAD wallet top-up"
                onComplete={invalidateWallets}
                onExit={() => setSelectedMethodId("")}
              />
            )}
          </SectionBoundary>
        ),
      });
    }


    if (showRail("fincra") && productFeatures.fincra && rails.has("fincra") && !forceNombaCard) {
      const isCadViaUsd = currency.toUpperCase() === "CAD";
      const cadQuote = isCadViaUsd ? quoteCadNombaTopup(amountNum || 0, fxRates) : null;
      const fincraTone: PayTone =
        ["KES", "UGX", "TZS", "XAF", "XOF", "MWK", "GHS", "ZMW"].includes(currency.toUpperCase())
          ? "mobile"
          : "card";
      payMethods.push({
        id: "fincra",
        tone: isCadViaUsd ? "bank" : fincraTone,
        label: fincraGatewayLabel(currency),
        description: "Pay on a secure checkout page",
        content: (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You’ll be redirected to a secure checkout to complete this payment.
            </p>
            {isCadViaUsd && amountNum > 0 && (
              cadQuote ? (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Wallet credit</span>
                    <span className="font-medium tabular-nums">{"C$"}{cadQuote.creditAmount.toFixed(2)} CAD</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">You pay (approx.)</span>
                    <span className="font-semibold tabular-nums">{"$"}{cadQuote.checkoutAmount.toFixed(2)} USD</span>
                  </div>
                  {cadQuote.fxRate && (
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Rate: 1 CAD ≈ {cadQuote.fxRate.toFixed(4)} USD · fee included
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  CAD/USD rate loading — try again in a moment.
                </p>
              )
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={() => void handleFincraTopUp()}
              disabled={loading || !amountValid || (isCadViaUsd && !cadQuote)}
            >
              {loading ? "Opening checkout…" : "Continue to checkout"}
            </Button>
          </div>
        ),
      });
    }

    // Wise — own top-level category (CAD/USD/EUR/GBP pay link; bank deposit elsewhere)
    if (showRail("wise_link") && productFeatures.wise && isWisePayCurrency(currency)) {
      payMethods.push({
        id: "wise_link",
        tone: "wise",
        label: "Wise",
        description: "Bank transfer or card via Wise",
        content: (
          <SectionBoundary name="WisePayLink">
            <WisePayLinkCard walletId={walletId} walletCurrency={currency} initialAmount={amount} onComplete={invalidateWallets} />
          </SectionBoundary>
        ),
      });
    } else if (showRail("wise") && productFeatures.wise && rails.has("wise") && !isCadWallet) {
      payMethods.push({
        id: "wise",
        tone: "wise",
        label: "Wise",
        description: "Bank transfer with your payment reference",
        content: (
          <SectionBoundary name="WiseTopUp">
            <WiseTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} onComplete={invalidateWallets} />
          </SectionBoundary>
        ),
      });
    }

    if (showRail("ghana") && false && productFeatures.ghanaPay && rails.has("ghana")) {
      payMethods.push({
        id: "ghana",
        tone: "mobile",
        label: "Mobile money",
        description: "MTN, Telecel, AirtelTigo",
        content: (
          <SectionBoundary name="GhanaTopUp">
            <GhanaTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} />
          </SectionBoundary>
        ),
      });
    }

    if (showRail("elicate") && productFeatures.elicate && rails.has("elicate")) {
      payMethods.push({
        id: "elicate",
        tone: "card",
        label: "Card",
        description: "Pay with card",
        content: (
          <SectionBoundary name="ElicateTopUp">
            <ElicateTopUpCard walletId={walletId} walletCurrency={currency} initialAmount={amount} />
          </SectionBoundary>
        ),
      });
    }
  }

  /** The auto-routed gateway is only the default selection now. */
  const GATEWAY_DEFAULT_METHOD: Partial<Record<Gateway, string>> = {
    flutterwave: availableFlwMethods.includes("mobilemoney") ? "flw_momo" : "flw_hosted",
    swychr_pay: "swychr",
    paytota_pay: "paytota",
    dodo_pay: "dodo",
    square_pay: "square",
    paypal_pay: "square",
    nomba_pay: "nomba",
    lenhub_flutter: "lenhub",
    fincra_interac: "interac",
    fincra: "fincra",
    wise_pay: isWisePayCurrency(currency) ? "wise_link" : "wise",
    ghana_pay: "ghana",
    elicate: "elicate",
  };
  const forceNombaForWallet =
    productFeatures.nombaNigeria
    && isNombaTopupLive(currency.toUpperCase())
    && (currency.toUpperCase() === "CAD" || currency.toUpperCase() === "NGN");
  const defaultRail = forceNombaForWallet
    ? "nomba"
    : defaultCollectPartner(currency);
  const collectPrimaryIds = collectPayMethodIds(
    (forceNombaForWallet && "nomba")
    || policyIntlOverride
    || policyAfricaOverride
    || (defaultRail && (forceNombaForWallet || activeRails.has(defaultRail)) ? defaultRail : "")
    || "",
  );
  const defaultMethodId =
    (forceNombaForWallet && payMethods.some((m) => m.id === "nomba") && "nomba")
    || payMethods.find((m) => collectPrimaryIds.includes(m.id))?.id
    || payMethods.find((m) => m.id === GATEWAY_DEFAULT_METHOD[gateway])?.id
    || payMethods[0]?.id
    || "";

  const payCategoryMeta: Record<PayTone, { label: string; sublabel: string; icon: typeof PayCardIcon }> = {
    card: { label: "Card", sublabel: "Debit or credit", icon: PayCardIcon },
    bank: { label: "Bank", sublabel: "Transfer or Interac", icon: PayBankIcon },
    mobile: { label: "Mobile", sublabel: "Mobile money", icon: PayMobileIcon },
    wallet: { label: "Wallet", sublabel: "Other methods", icon: PayWalletIcon },
    wise: { label: "Wise", sublabel: "Bank or card", icon: PayWalletIcon },
  };
  const payCategories: PaymentMethodOption<PayTone>[] = (["card", "bank", "wise", "mobile", "wallet"] as PayTone[])
    .filter((tone) => payMethods.some((m) => m.tone === tone))
    .map((tone) => ({ id: tone, tone, ...payCategoryMeta[tone] }));

  const activeMethodId =
    payMethods.some((m) => m.id === selectedMethodId) ? selectedMethodId : defaultMethodId;
  const activeCategory: PayTone =
    payMethods.find((m) => m.id === activeMethodId)?.tone ?? "card";
  const visibleMethods = payCategories.length > 1
    ? payMethods.filter((m) => m.tone === activeCategory)
    : payMethods;




  return (
    <AppPage width="default">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <BackToDashboard />

        {gateway === "flutterwave" && (currency === "USD" || currency === "CAD") && (
          <SectionBoundary name="FlutterwaveWesternTopUpHints">
            <FlutterwaveWesternTopUpHints currency={currency} />
          </SectionBoundary>
        )}

        {verifyState && (
          <SectionBoundary name="VerifyState">
            <Card
              className={
                verifyState.status === "failed"
                  ? "border-destructive/50 bg-destructive/5"
                  : verifyState.status === "success"
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : undefined
              }
            >
              <CardContent className="pt-6 flex items-center gap-3">
                {verifyState.status === "success" ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                ) : verifyState.status === "failed" ? (
                  <XCircle className="w-6 h-6 text-destructive shrink-0" />
                ) : (
                  <LoadingSpinner size={24} />
                )}
                <div>
                  <p className="font-medium">
                    {verifyState.status === "failed"
                      ? "Payment failed"
                      : verifyState.status === "success"
                        ? "Payment successful"
                        : "Confirming payment"}
                  </p>
                  <p className="text-sm text-muted-foreground">{verifyState.message}</p>
                </div>
              </CardContent>
            </Card>
          </SectionBoundary>
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

        {!selectedWallet || !liveTopup ? (
          <MoneyFlowShell
            steps={[{ n: 1, label: "Amount" }]}
            currentStep={1}
            title="Add Money"
            subtitle="Pick a wallet, then enter the amount to fund it."
          >
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Wallet</Label>
                {walletsLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : !wallets || wallets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No wallets available. Create one first.</p>
                ) : (
                  <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((w) => (
                        <SelectItem key={w.wallet_id} value={w.wallet_id}>
                          <span className="inline-flex items-center gap-2"><CurrencyFlag code={w.currency_code} size="sm" />{w.currency_code} - {w.symbol}{Number(w.balance).toLocaleString()}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {!liveTopup && selectedWallet && (
                <ComingSoon
                  title="Top-up not available for this currency"
                  description={
                    currency +
                    " wallet funding is coming soon. Live top-up currencies: NGN, GHS, KES, ZMW, CAD, and USD."
                  }
                  backHref="/wallets"
                  backLabel="View wallets"
                />
              )}
            </div>
          </MoneyFlowShell>
        ) : (
          <CheckoutShell
            payTo={`Add money to your ${currency} wallet`}
            amount={`${currencySymbol(currency)}${(amountNum || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            amountNote={`${currency} wallet · ${selectedWallet.symbol}${Number(selectedWallet.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available`}
            lines={[
              { label: "Wallet top-up", sublabel: `${currency} balance credit`, value: `${currencySymbol(currency)}${(amountNum || 0).toFixed(2)}` },
              { label: "Provider fees", sublabel: "Charged by the payment method", value: "At checkout", muted: true },
            ]}
            totals={[
              { label: "Total to pay", value: `${currencySymbol(currency)}${(amountNum || 0).toFixed(2)}`, emphasis: true },
            ]}
            contactEmail={user?.email || null}
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Wallet</Label>
                  {walletsLoading ? (
                    <Skeleton className="h-12 w-full" />
                  ) : (
                    <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select wallet" />
                      </SelectTrigger>
                      <SelectContent>
                        {(wallets ?? []).map((w) => (
                          <SelectItem key={w.wallet_id} value={w.wallet_id}>
                            <span className="inline-flex items-center gap-2"><CurrencyFlag code={w.currency_code} size="sm" />{w.currency_code} - {w.symbol}{Number(w.balance).toLocaleString()}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Amount ({currency})</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-12 text-lg"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum: {minAmount(currency)} {currency}
                  </p>
                </div>
              </div>

              {!amountValid && (
                <p className="text-xs text-muted-foreground">
                  You can set up a payment method now — enter an amount above to complete the payment.
                </p>
              )}


              {payMethods.length > 1 && payCategories.length > 1 && (
                <PaymentMethodRow
                  options={payCategories}
                  value={activeCategory}
                  onChange={(tone) => {
                    const first = payMethods.find((m) => m.tone === tone);
                    if (first) setSelectedMethodId(first.id);
                  }}
                />
              )}

              {payMethods.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      No payment method is available for <strong>{currency}</strong> right now. Please contact support.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <CheckoutMethodList
                  methods={visibleMethods}
                  value={activeMethodId}
                  onChange={setSelectedMethodId}
                />

              )}
            </div>
          </CheckoutShell>
        )}

      </motion.div>
    </AppPage>
  );
};

export default TopUpPage;
