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
import { CheckCircle2, XCircle, CreditCard, Smartphone, Building2, Globe } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useAuth } from "@/hooks/useAuth";
import CardPaymentForm from "@/components/modals/CardPaymentForm";
import AdyenTopUpCard from "@/components/payments/AdyenTopUpCard";
import ElicateTopUpCard from "@/components/payments/ElicateTopUpCard";
import GhanaTopUpCard from "@/components/payments/GhanaTopUpCard";
import NombaTopUpCard from "@/components/payments/NombaTopUpCard";
import { validateMinAmount, friendlyFlwError, minAmount, type FlwMethod } from "@/lib/flutterwave";
import LoadingSpinner from "@/components/LoadingSpinner";
import { MM_COUNTRIES } from "@/lib/mobileMoneyNetworks";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { isStripeTestMode, STRIPE_TEST_CARD_HINT, STRIPE_VIRTUAL_CARD_HINT } from "@/lib/stripeBilling";
import {
  routeWalletTopupGateway,
  supportsWesternProviderChoice,
  supportsAfricanProviderChoice,
  type WesternTopupProvider,
  type AfricanTopupProvider,
  nombaGatewayLabel,
} from "@/lib/walletTopupGateway";
import FlutterwaveWesternTopUpHints from "@/components/wallets/FlutterwaveWesternTopUpHints";
import { buildFincraTopupRedirectUrl, parseFincraReturnReference, isFincraCheckoutCurrency } from "@/lib/fincraTopup";
import { clearPendingNombaTxn } from "@/lib/nombaPay";
import { cn } from "@/lib/utils";

const MM_BY_CCY = Object.fromEntries(MM_COUNTRIES.map((c) => [c.currency, c]));

type Gateway = "flutterwave" | "stripe" | "elicate" | "fincra" | "ghana_pay" | "nomba_pay" | "unsupported";

function initialWesternProvider(params: URLSearchParams): WesternTopupProvider {
  const fromQuery = params.get("provider")?.toLowerCase();
  if (fromQuery === "fincra") return "fincra";
  if (fromQuery === "flutterwave" || fromQuery === "flw") return "flutterwave";
  if (fromQuery === "stripe") return "stripe";
  if (params.get("flw") === "1") return "flutterwave";
  if (import.meta.env.VITE_FINCRA_TOPUP === "true") return "fincra";
  if (import.meta.env.VITE_FLW_WESTERN_TOPUP === "true") return "flutterwave";
  return "stripe";
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

  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FlwMethod>("card");
  const [network, setNetwork] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [westernProvider, setWesternProvider] = useState<WesternTopupProvider>(() => initialWesternProvider(params));
  const [africanProvider, setAfricanProvider] = useState<AfricanTopupProvider>(() => initialAfricanProvider(params));
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
  const gateway: Gateway = routeWalletTopupGateway(currency, westernProvider, africanProvider);
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
    const nombaStatus = params.get("nomba");
    if (nombaStatus === "success") {
      clearPendingNombaTxn();
      setVerifyState({ status: "success", message: "Nomba payment received — your wallet should update shortly." });
      toast.success("Nomba top-up complete");
      void queryClient.invalidateQueries({ queryKey: ["wallets"] });
      return;
    }
    if (nombaStatus === "failed") {
      clearPendingNombaTxn();
      setVerifyState({ status: "failed", message: "Nomba payment could not be completed." });
      return;
    }

    const stripeStatus = params.get("stripe");
    const stripeSessionId = params.get("session_id");

    if (stripeStatus === "success") {
      setVerifyState({ status: "verifying", message: "Confirming your Stripe payment…" });
      let cancelled = false;
      let attempts = 0;

      const pollStripeSession = async () => {
        if (cancelled) return;
        if (stripeSessionId) {
          const { data, error } = await supabase
            .from("stripe_payin_sessions")
            .select("status, credit_amount, credit_currency, failure_reason")
            .eq("stripe_session_id", stripeSessionId)
            .maybeSingle();

          if (!cancelled && !error && data?.status === "succeeded") {
            const amt = Number(data.credit_amount);
            const ccy = data.credit_currency ?? "USD";
            setVerifyState({
              status: "success",
              message: `Wallet credited with ${ccy} ${Number.isFinite(amt) ? amt.toFixed(2) : data.credit_amount}`,
            });
            toast.success("Stripe top-up complete");
            return;
          }
          if (!cancelled && data?.status === "failed") {
            setVerifyState({
              status: "failed",
              message: data.failure_reason || "Stripe payment could not be completed",
            });
            return;
          }
        }

        attempts += 1;
        if (attempts < 20 && !cancelled) {
          window.setTimeout(pollStripeSession, 2000);
          return;
        }

        if (!cancelled) {
          setVerifyState({
            status: "success",
            message: "Payment received. Your wallet should update within a minute.",
          });
          toast.success("Stripe payment received");
        }
      };

      void pollStripeSession();
      return () => {
        cancelled = true;
      };
    }
    if (stripeStatus === "cancelled") {
      setVerifyState({ status: "failed", message: "Stripe payment was cancelled" });
      return;
    }

    const fincraRef = parseFincraReturnReference(window.location.search);
    if (fincraRef && (fincraRef.startsWith("topup-fincra-") || fincraRef.startsWith("efm_fincra_"))) {
      setVerifyState({ status: "verifying", message: "Verifying your Fincra payment…" });
      (async () => {
        const session = (await supabase.auth.getSession()).data.session;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fincra-verify-payment?reference=${encodeURIComponent(fincraRef)}`;
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
          const json = await res.json();
          if (json?.verified) {
            setVerifyState({ status: "success", message: `Wallet credited with ${json.currency} ${json.amount}` });
            toast.success("Fincra top-up complete");
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

  const handleFlutterwaveTopUp = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    const minErr = validateMinAmount(currency, amt);
    if (minErr) { toast.error(minErr); return; }
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/wallet/topup`;
      const txRef = `topup-${user?.id || "anon"}-${selectedWalletId.slice(0, 8)}-${Date.now()}`;
      // Use hosted checkout — let Flutterwave present all locally-available
      // methods (Card, Bank Transfer, USSD, Mobile Money) for the corridor.
      const { data, error } = await supabase.functions.invoke("flw-initialize-payment", {
        body: {
          amount: amt,
          currency,
          paymentMethod: "card",
          redirectUrl,
          tx_ref: txRef,
          type: "wallet_topup",
          walletId: selectedWalletId,
        },
      });
      if (error) throw error;
      const link = (data as { payment_link?: string; error?: string })?.payment_link;
      if ((data as { error?: string })?.error || !link) throw new Error((data as { error?: string })?.error || "No payment link");
      window.location.href = link;
    } catch (e) {
      toast.error(friendlyFlwError(e, currency));
    } finally {
      setLoading(false);
    }
  };

  const handleFincraTopUp = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    const minErr = validateMinAmount(currency, amt);
    if (minErr) { toast.error(minErr); return; }
    if (!isFincraCheckoutCurrency(currency)) {
      toast.error(`Fincra checkout does not support ${currency}. Use Stripe or Flutterwave for this wallet.`);
      return;
    }
    setLoading(true);
    try {
      const { url: redirectUrl, usesProductionReturn } = buildFincraTopupRedirectUrl();
      if (usesProductionReturn) {
        toast.info("After payment, Fincra will return you to efin.money (required for sandbox checkout).");
      }
      const reference = `topup-fincra-${user?.id || "anon"}-${selectedWalletId.slice(0, 8)}-${Date.now()}`;
      const { data, error } = await supabase.functions.invoke("fincra-initialize-checkout", {
        body: {
          amount: amt,
          currency,
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
      window.location.href = link;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start Fincra checkout");
    } finally {
      setLoading(false);
    }
  };

  const gatewayBadge = useMemo(() => {
    if (gateway === "nomba_pay") return { label: nombaGatewayLabel(currency), icon: CreditCard, color: "bg-green-600/10 text-green-700 border-green-600/30" };
    if (gateway === "ghana_pay") return { label: "Ghana MoMo", icon: Smartphone, color: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30" };
    if (gateway === "elicate") return { label: "Mobile Money", icon: Smartphone, color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
    if (gateway === "fincra") return { label: "Fincra", icon: Globe, color: "bg-teal-500/10 text-teal-600 border-teal-500/30" };
    if (gateway === "flutterwave") return { label: "Flutterwave", icon: Globe, color: "bg-orange-500/10 text-orange-500 border-orange-500/30" };
    if (gateway === "stripe") return { label: "Stripe", icon: CreditCard, color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/30" };
    return { label: "Unavailable", icon: XCircle, color: "bg-muted text-muted-foreground" };
  }, [gateway]);

  return (
    <main className="container px-4 py-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto space-y-6">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-display font-bold">Add Money</h1>
            <p className="text-muted-foreground">Top up your wallet using the best route for your currency.</p>
          </div>

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

          {showWesternProviderChoice && selectedWallet && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Choose how to pay</CardTitle>
                <CardDescription>
                  Stripe is best for virtual cards (Grey, Wise). Flutterwave and Fincra offer hosted checkout for US/Canadian cards — Fincra is experimental for USD/CAD.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setWesternProvider("stripe")}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    westernProvider === "stripe"
                      ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/40"
                      : "border-border hover:border-indigo-500/40",
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <CreditCard className="h-4 w-4 text-indigo-500" />
                    Stripe
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Checkout or card on this page. Best for virtual cards and 3-D Secure.
                  </p>
                </button>
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
                    <Globe className="h-4 w-4 text-orange-500" />
                    Flutterwave
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Secure hosted checkout. Canadian/US debit and credit cards.
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
                    Fincra
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Sandbox Fincra checkout for {currency} — card (and bank transfer where supported).
                  </p>
                </button>
              </CardContent>
            </Card>
          )}

          {showAfricanProviderChoice && selectedWallet && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Choose how to pay</CardTitle>
                <CardDescription>
                  Flutterwave and Fincra both offer hosted checkout for African wallets — card, bank transfer, and mobile money where supported.
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
                    <Globe className="h-4 w-4 text-orange-500" />
                    Flutterwave
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Existing African rails — card, bank transfer, USSD, mobile money.
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
                    <Globe className="h-4 w-4 text-teal-600" />
                    Fincra
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Sandbox/live Fincra checkout — card, bank transfer, mobile money by corridor.
                  </p>
                </button>
              </CardContent>
            </Card>
          )}

          {gateway === "unsupported" && selectedWallet && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Top-up for <strong>{currency}</strong> is not yet available. Please contact support.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Stripe route */}
          {gateway === "stripe" && selectedWallet && (
            <>
              {isStripeTestMode() ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-800 dark:text-amber-200">
                  {STRIPE_TEST_CARD_HINT}
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-muted/60 border border-border text-sm text-muted-foreground">
                  {STRIPE_VIRTUAL_CARD_HINT}
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {showWesternProviderChoice ? "3. Pay with Stripe" : "Recommended: Stripe Checkout"}
                  </CardTitle>
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Min: 5 {currency} · Max: 5,000 {currency} · Fee: 1.9% + 0.30 {currency}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
                    <p className="text-xs text-foreground">
                      Best for Grey, Wise, and other virtual cards — Stripe handles 3-D Secure and bank approval in a hosted flow.
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={loading || !Number.isFinite(Number(amount)) || Number(amount) < 5}
                    onClick={async () => {
                      const amt = Number(amount);
                      if (!Number.isFinite(amt) || amt < 5) { toast.error("Minimum 5"); return; }
                      setLoading(true);
                      try {
                        const data = await invokeEdgeFunction<{ url?: string }>(
                          "stripe-create-checkout-session",
                          { wallet_id: selectedWallet.wallet_id, amount: amt, currency },
                        );
                        if (!data.url) throw new Error("No checkout URL returned");
                        window.location.href = data.url;
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Could not start checkout");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    {loading ? "Redirecting…" : "Pay with Stripe Checkout"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Or pay with card on this page</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardPaymentForm
                    defaultWalletId={selectedWallet.wallet_id}
                    showWalletSelect={false}
                    onSuccess={() => toast.success("Top-up successful")}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {/* Flutterwave route — hosted checkout (Card, Bank Transfer, USSD, Mobile Money) */}
          {gateway === "flutterwave" && selectedWallet && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {showWesternProviderChoice || showAfricanProviderChoice ? "3. Pay with Flutterwave" : "2. Enter amount"}
                </CardTitle>
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

                <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
                  <p className="text-xs text-foreground">
                    You will be redirected to Flutterwave&apos;s secure checkout to pay by card
                    {currency === "CAD" ? " (Canadian cards)" : currency === "USD" ? " (US cards)" : ""}.
                  </p>
                </div>

                <Button className="w-full" size="lg" onClick={handleFlutterwaveTopUp} disabled={loading}>
                  {loading ? "Opening Flutterwave…" : "Continue to Flutterwave checkout"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Fincra route — hosted checkout */}
          {gateway === "fincra" && selectedWallet && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {(showAfricanProviderChoice || showWesternProviderChoice) ? "3. Pay with Fincra" : "2. Enter amount"}
                </CardTitle>
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

                <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/20">
                  <p className="text-xs text-foreground">
                    {currency === "USD" || currency === "CAD"
                      ? `Experimental: Fincra ${currency} checkout. If it fails, switch back to Stripe or Flutterwave.`
                      : "You will be redirected to Fincra's secure sandbox checkout. Use Fincra test cards or bank transfer where available."}
                  </p>
                </div>

                <Button className="w-full" size="lg" onClick={handleFincraTopUp} disabled={loading}>
                  {loading ? "Opening Fincra…" : "Continue to Fincra checkout"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Nomba — NGN hosted card checkout */}
          {gateway === "nomba_pay" && selectedWallet && (
            <NombaTopUpCard
              walletId={selectedWallet.wallet_id}
              walletCurrency={currency}
              onComplete={() => {
                void queryClient.invalidateQueries({ queryKey: ["wallets"] });
              }}
            />
          )}

          {/* Ghana Pay — direct MoMo collection for GHS */}
          {gateway === "ghana_pay" && selectedWallet && (
            <GhanaTopUpCard walletId={selectedWallet.wallet_id} walletCurrency={currency} />
          )}

          {/* Elicate route — direct mobile-money top-up for Zambia (ZMW) */}
          {gateway === "elicate" && selectedWallet && (
            <ElicateTopUpCard walletId={selectedWallet.wallet_id} walletCurrency={currency} />
          )}

          {/* Adyen route — available for all currencies as alternative */}
          {selectedWallet && gateway !== "unsupported" && (
            <AdyenTopUpCard walletId={selectedWallet.wallet_id} walletCurrency={currency} />
          )}
        </motion.div>
      </main>
  );
};

export default TopUpPage;
