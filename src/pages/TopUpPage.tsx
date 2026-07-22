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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, XCircle, CreditCard, Smartphone, Building2, Globe, Wallet, FileText, Landmark } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useAuth } from "@/hooks/useAuth";
import ElicateTopUpCard from "@/components/payments/ElicateTopUpCard";
import CadInteracTopUpCard from "@/components/payments/CadInteracTopUpCard";
import GhanaTopUpCard from "@/components/payments/GhanaTopUpCard";
import NombaTopUpCard from "@/components/payments/NombaTopUpCard";
import LenhubFlutterTopUpCard from "@/components/payments/LenhubFlutterTopUpCard";
import PaytotaTopUpCard from "@/components/payments/PaytotaTopUpCard";
import SwychrTopUpCard from "@/components/payments/SwychrTopUpCard";
import { validateMinAmount, minAmount, type FlwMethod } from "@/lib/flutterwave";
import LoadingSpinner from "@/components/LoadingSpinner";
import FlutterwaveCardForm from "@/components/payments/FlutterwaveCardForm";
import FlutterwaveMomoTopUpCard from "@/components/payments/FlutterwaveMomoTopUpCard";
import { MM_COUNTRIES } from "@/lib/mobileMoneyNetworks";
import {
  routeWalletTopupGateway,
  supportsWesternProviderChoice,
  supportsAfricanProviderChoice,
  type WesternTopupProvider,
  type AfricanTopupProvider,
  LENHUB_FLUTTER_TOPUP_CURRENCIES,
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
  africaMomoMethodLabel,
  africaMomoMethodDescription,
} from "@/lib/walletTopupGateway";
import { clearPendingSwychrTxn } from "@/lib/swychrPay";
import FlutterwaveWesternTopUpHints from "@/components/wallets/FlutterwaveWesternTopUpHints";
import { buildFincraTopupRedirectUrl, parseFincraReturnReference, isFincraCheckoutCurrency } from "@/lib/fincraTopup";
import { clearPendingNombaTxn } from "@/lib/nombaPay";
import { clearPendingPaytotaTxn, confirmPaytotaPayment, readPendingPaytotaTxn } from "@/lib/paytotaPay";
import { quoteCadNombaTopup } from "@/lib/nombaTopupQuote";
import { useFxRates } from "@/hooks/useFxRates";
import { cn } from "@/lib/utils";
import ComingSoon from "@/components/common/ComingSoon";
import { isLiveTopupCurrency, productFeatures } from "@/lib/productFeatures";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import { currencySymbol } from "@/lib/currency";

const MM_BY_CCY = Object.fromEntries(MM_COUNTRIES.map((c) => [c.currency, c]));

type Gateway = WalletTopupGateway;

function availableIntlMethods(currency: string): IntlTopupMethod[] {
  const c = currency.toUpperCase();
  const methods: IntlTopupMethod[] = [];
  // Western multi-rail (USD/EUR/GBP/CAD)
  if (MULTI_RAIL_TOPUP_CURRENCIES.includes(c)) {
    if (productFeatures.nombaNigeria) methods.push("nomba");
    if (productFeatures.fincra && ["USD", "EUR", "GBP", "CAD"].includes(c)) methods.push("fincra");
    if (productFeatures.paytota) methods.push("paytota");
    if (c === "CAD" && productFeatures.fincraInterac) methods.push("interac");
    if (productFeatures.lenhubFlutter) methods.push("lenhub");
    return methods;
  }
  // NGN: Nomba express + optional direct card
  if (c === "NGN") {
    if (productFeatures.nombaNigeria) methods.push("nomba");
    if (productFeatures.lenhubFlutter) methods.push("lenhub");
    return methods;
  }
  // Other Africa wallets: direct card as an optional extra rail (query ?method=lenhub)
  if (productFeatures.lenhubFlutter && LENHUB_FLUTTER_TOPUP_CURRENCIES.includes(c)) {
    methods.push("lenhub");
  }
  return methods;
}

function availableAfricaMomoMethods(currency: string): AfricaMomoTopupMethod[] {
  const c = currency.toUpperCase();
  if (!AFRICA_MOMO_MULTI_RAIL_CURRENCIES.includes(c)) return [];
  const methods: AfricaMomoTopupMethod[] = [];
  if (productFeatures.swychr && SWYCHR_TOPUP_CURRENCIES.includes(c)) methods.push("swychr");
  if (productFeatures.paytota && PAYTOTA_AFRICA_TOPUP_CURRENCIES.includes(c)) methods.push("paytota");
  // Flutterwave V4 MoMo — live on this merchant for KES/UGX (TZS currently maintenance).
  if (productFeatures.flutterwave && ["KES", "UGX", "RWF"].includes(c)) methods.push("flutterwave");
  return methods;
}

function initialIntlMethod(params: URLSearchParams, currency: string): IntlTopupMethod | null {
  const methods = availableIntlMethods(currency);
  if (methods.length === 0) return null;
  const fromQuery = params.get("method")?.toLowerCase() || params.get("provider")?.toLowerCase() || params.get("rail")?.toLowerCase();
  if (fromQuery === "interac" && methods.includes("interac")) return "interac";
  if ((fromQuery === "fincra" || fromQuery === "bank") && methods.includes("fincra")) return "fincra";
  if ((fromQuery === "paytota" || fromQuery === "invoice") && methods.includes("paytota")) return "paytota";
  if ((fromQuery === "nomba" || fromQuery === "card" || fromQuery === "express") && methods.includes("nomba")) return "nomba";
  if ((fromQuery === "lenhub" || fromQuery === "flutter" || fromQuery === "direct") && methods.includes("lenhub")) return "lenhub";
  return methods[0];
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
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
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
  const currency = selectedWallet?.currency_code || "USD";
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
    const ccy = currency.toUpperCase();
    const onlyLenhubExtra = intlMethods.length === 1 && intlMethods[0] === "lenhub"
      && !MULTI_RAIL_TOPUP_CURRENCIES.includes(ccy)
      && ccy !== "NGN";
    if (onlyLenhubExtra) {
      const q = (params.get("method") || params.get("provider") || params.get("rail") || "").toLowerCase();
      setIntlMethod(q === "lenhub" || q === "flutter" || q === "direct" ? "lenhub" : null);
      return;
    }
    const preferred = initialIntlMethod(params, currency);
    setIntlMethod((prev) => {
      if (prev && intlMethods.includes(prev)) return prev;
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
  const preferFlutterwave = africaMomoMethod === "flutterwave";
  const preferInterac = intlMethod === "interac";
  const preferFincra = intlMethod === "fincra";
  const preferLenhubFlutter = intlMethod === "lenhub";
  const gateway: Gateway = routeWalletTopupGateway(
    currency,
    westernProvider,
    africanProvider,
    preferSwychr,
    preferPaytota,
    preferInterac,
    preferFincra,
    preferFlutterwave,
    preferLenhubFlutter,
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

    const paytotaStatus = params.get("paytota");
    if (paytotaStatus === "success") {
      setVerifyState({ status: "verifying", message: "Confirming your card payment…" });
      (async () => {
        try {
          const pendingId = readPendingPaytotaTxn();
          const purchaseId = params.get("purchase_id") || params.get("purchaseId") || undefined;
          const result = await confirmPaytotaPayment({
            transaction_id: pendingId || undefined,
            purchase_id: purchaseId,
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
    if (gateway === "nomba_pay") return { label: nombaGatewayLabel(currency), icon: CreditCard, color: "bg-green-600/10 text-green-700 border-green-600/30" };
    if (gateway === "lenhub_flutter") return { label: "Card (direct)", icon: CreditCard, color: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30" };
    if (gateway === "ghana_pay") return { label: "Mobile money", icon: Smartphone, color: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30" };
    if (gateway === "elicate") return { label: "Mobile Money", icon: Smartphone, color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
    if (gateway === "fincra_interac") return { label: "Interac e-Transfer", icon: Landmark, color: "bg-red-500/10 text-red-700 border-red-500/30" };
    if (gateway === "fincra") return { label: fincraGatewayLabel(currency), icon: Building2, color: "bg-teal-500/10 text-teal-600 border-teal-500/30" };
    if (gateway === "flutterwave") return { label: "Card", icon: CreditCard, color: "bg-orange-500/10 text-orange-500 border-orange-500/30" };
    return { label: "Unavailable", icon: XCircle, color: "bg-muted text-muted-foreground" };
  }, [gateway, currency]);

  return (
    <AppPage width="default">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-display font-bold">Add Money</h1>
            <p className="text-muted-foreground">Top up your wallet using the best route for your currency.</p>
          </div>

          <PageHeroBanner
            icon={Wallet}
            label={selectedWallet ? `${currency} wallet balance` : "Wallet top-up"}
            value={
              selectedWallet
                ? `${currencySymbol(currency)}${Number(selectedWallet.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
                : "Select a wallet to fund"
            }
            meta={[
              { icon: CreditCard, text: liveTopup ? `${nombaGatewayLabel(currency)} · card & bank routes` : "Choose a supported currency" },
              { icon: Globe, text: `${wallets?.length ?? 0} wallets available` },
            ]}
            variant="emerald"
          />

          {gateway === "flutterwave" && (currency === "USD" || currency === "CAD") && (
            <FlutterwaveWesternTopUpHints currency={currency} />
          )}

          {verifyState && (
            <Card>
              <CardContent className="pt-6 flex items-center gap-3">
                {verifyState.status === "success" ? <CheckCircle2 className="w-6 h-6 text-primary" /> :
                 verifyState.status === "failed" ? <XCircle className="w-6 h-6 text-destructive" /> :
                 <LoadingSpinner size={24} />}
                <p>{verifyState.message}</p>
              </CardContent>
            </Card>
          )}

          {/* Wallet selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Choose wallet to top up</CardTitle>
            </CardHeader>
            <CardContent>
              {walletsLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : !wallets || wallets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No wallets available. Create one first.</p>
              ) : (
                <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
                  <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
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
                  <span className="text-xs text-muted-foreground">Payment via</span>
                  <Badge variant="outline" className={gatewayBadge.color}>
                    <gatewayBadge.icon className="w-3 h-3 mr-1" />
                    {gatewayBadge.label}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {showWesternProviderChoice && selectedWallet && productFeatures.flutterwave && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Choose how to pay</CardTitle>
                <CardDescription>
                  Pick a payment method for your {currency} wallet.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setWesternProvider("flutterwave")}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    westernProvider === "flutterwave"
                      ? "border-orange-500 bg-orange-500/10 ring-1 ring-orange-500/40"
                      : "border-border hover:border-orange-500/40",
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <CreditCard className="h-4 w-4 text-orange-500" />
                    Card
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Enter card details in-app. Canadian/US debit and credit cards.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setWesternProvider("fincra")}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    westernProvider === "fincra"
                      ? "border-teal-500 bg-teal-500/10 ring-1 ring-teal-500/40"
                      : "border-border hover:border-teal-500/40",
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Globe className="h-4 w-4 text-teal-600" />
                    Bank or card
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Hosted checkout for {currency} — card and bank transfer where supported.
                  </p>
                </button>
              </CardContent>
            </Card>
          )}

          {showAfricanProviderChoice && selectedWallet && productFeatures.flutterwave && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Choose how to pay</CardTitle>
                <CardDescription>
                  Pick a payment method for your {currency} wallet.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setAfricanProvider("flutterwave")}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    africanProvider === "flutterwave"
                      ? "border-orange-500 bg-orange-500/10 ring-1 ring-orange-500/40"
                      : "border-border hover:border-orange-500/40",
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <CreditCard className="h-4 w-4 text-orange-500" />
                    Card
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Card, bank transfer, USSD, or mobile money where supported.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setAfricanProvider("fincra")}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    africanProvider === "fincra"
                      ? "border-teal-500 bg-teal-500/10 ring-1 ring-teal-500/40"
                      : "border-border hover:border-teal-500/40",
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Building2 className="h-4 w-4 text-teal-600" />
                    Card or bank transfer
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Hosted checkout — card, bank transfer, mobile money by corridor.
                  </p>
                </button>
              </CardContent>
            </Card>
          )}

          {showIntlMethodChoice && selectedWallet && liveTopup && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Choose how to pay</CardTitle>
                <CardDescription>
                  Multiple ways to fund your {currency} wallet — pick one.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {intlMethods.map((m) => {
                  const Icon = m === "paytota" ? FileText : m === "interac" ? Landmark : m === "fincra" ? Building2 : CreditCard;
                  const selected = intlMethod === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setIntlMethod(m)}
                      className={cn(
                        "rounded-lg border p-4 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <Icon className="h-4 w-4 text-primary" />
                        {intlMethodLabel(m)}
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {intlMethodDescription(m, currency)}
                      </p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {showAfricaMomoChoice && selectedWallet && liveTopup && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Choose mobile money rail</CardTitle>
                <CardDescription>
                  Multiple ways to fund your {currency} wallet — pick one.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {africaMomoMethods.map((m) => {
                  const Icon = m === "paytota" ? FileText : Smartphone;
                  const selected = africaMomoMethod === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAfricaMomoMethod(m)}
                      className={cn(
                        "rounded-lg border p-4 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <Icon className="h-4 w-4 text-primary" />
                        {africaMomoMethodLabel(m)}
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {africaMomoMethodDescription(m, currency)}
                      </p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {!liveTopup && selectedWallet && (
            <ComingSoon
              title="Top-up not available for this currency"
              description={`${currency} wallet funding is not available. Try NGN, GHS, ZMW, KES, UGX, RWF, TZS, USD, EUR, GBP, or CAD.`}
              backHref="/wallets"
              backLabel="View wallets"
            />
          )}

          {liveTopup && gateway === "unsupported" && selectedWallet && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Top-up for <strong>{currency}</strong> is not yet available. Please contact support.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Flutterwave route — MoMo (V4) + card (legacy V3 form when available) */}
          {productFeatures.flutterwave && gateway === "flutterwave" && selectedWallet && liveTopup && (
            <div className="space-y-4">
              {(availableFlwMethods.includes("mobilemoney") || currency === "TZS") && (
                <FlutterwaveMomoTopUpCard
                  walletId={selectedWallet.wallet_id}
                  walletCurrency={currency}
                  onComplete={() => {
                    void queryClient.invalidateQueries({ queryKey: ["wallets"] });
                  }}
                />
              )}
              {availableFlwMethods.includes("card") && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {showWesternProviderChoice || showAfricanProviderChoice ? "3. Pay with card" : "Or pay with card"}
                    </CardTitle>
                    <CardDescription>
                      Debit or credit card. Card on V4 is rolling out — MoMo is preferred for African wallets.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FlutterwaveCardForm
                      defaultWalletId={selectedWalletId}
                      showWalletSelect
                      onSuccess={() => {
                        void queryClient.invalidateQueries({ queryKey: ["wallets"] });
                      }}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Card or bank transfer (Fincra hosted) — always available when selected, not gated on Flutterwave */}
          {gateway === "fincra" && selectedWallet && liveTopup && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {showIntlMethodChoice || showAfricanProviderChoice || showWesternProviderChoice
                    ? "3. Enter amount"
                    : "2. Enter amount"}
                </CardTitle>
                <CardDescription>
                  {currency.toUpperCase() === "CAD"
                    ? "Enter CAD to credit. You’ll pay the USD equivalent by card at checkout (Canadian cards welcome)."
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
          )}

          {/* Swychr — secondary hosted checkout (feature-flagged) */}
          {liveTopup && gateway === "swychr_pay" && selectedWallet && (
            <SwychrTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            />
          )}

          {/* Pay by invoice */}
          {liveTopup && gateway === "paytota_pay" && selectedWallet && (
            <PaytotaTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            />
          )}

          {/* Card checkout (Nomba) */}
          {liveTopup && gateway === "nomba_pay" && selectedWallet && (
            <NombaTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            />
          )}

          {/* Lenhub Flutter direct card — USD/CAD/EUR/GBP + Africa wallets */}
          {liveTopup && gateway === "lenhub_flutter" && selectedWallet && (
            <LenhubFlutterTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            />
          )}

          {/* CAD Interac e-Transfer */}
          {productFeatures.fincraInterac && liveTopup && gateway === "fincra_interac" && selectedWallet && (
            <CadInteracTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            />
          )}

          {/* Ghana Pay — direct MoMo collection for GHS */}
          {liveTopup && gateway === "ghana_pay" && selectedWallet && (
            <GhanaTopUpCard walletId={selectedWallet.wallet_id} walletCurrency={currency} />
          )}

          {/* Zambia MoMo top-up */}
          {productFeatures.elicate && liveTopup && gateway === "elicate" && selectedWallet && (
            <ElicateTopUpCard walletId={selectedWallet.wallet_id} walletCurrency={currency} />
          )}
        </motion.div>
    </AppPage>
  );
};

export default TopUpPage;
