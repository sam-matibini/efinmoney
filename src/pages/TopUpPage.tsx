import { useEffect, useMemo, useState } from "react";
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
import { CheckCircle2, XCircle, CreditCard, Smartphone, Building2, Globe, Info } from "lucide-react";
import { useWallets } from "@/hooks/useWallets";
import { useAuth } from "@/hooks/useAuth";
import CardPaymentForm from "@/components/modals/CardPaymentForm";
import AdyenTopUpCard from "@/components/payments/AdyenTopUpCard";
import ElicateTopUpCard from "@/components/payments/ElicateTopUpCard";
import { validateMinAmount, friendlyFlwError, minAmount, type FlwMethod } from "@/lib/flutterwave";
import LoadingSpinner from "@/components/LoadingSpinner";
import { MM_COUNTRIES } from "@/lib/mobileMoneyNetworks";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { isStripeTestMode, STRIPE_TEST_CARD_HINT, STRIPE_VIRTUAL_CARD_HINT } from "@/lib/stripeBilling";

const MM_BY_CCY = Object.fromEntries(MM_COUNTRIES.map((c) => [c.currency, c]));

// Smart Gateway Routing
// ZMW deliberately omitted: ZMW uses Elicate (mobile money) directly via
// ElicateTopUpCard, not Flutterwave's hosted checkout.
const FLUTTERWAVE_CURRENCIES = ["NGN", "KES", "UGX", "RWF", "GHS", "TZS"];
const STRIPE_CURRENCIES = ["USD", "CAD", "EUR", "GBP"];
const ELICATE_CURRENCIES = ["ZMW"];

type Gateway = "flutterwave" | "stripe" | "elicate" | "unsupported";
const routeGateway = (currency: string): Gateway => {
  if (ELICATE_CURRENCIES.includes(currency)) return "elicate";
  if (FLUTTERWAVE_CURRENCIES.includes(currency)) return "flutterwave";
  if (STRIPE_CURRENCIES.includes(currency)) return "stripe";
  return "unsupported";
};

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
  const { user } = useAuth();
  const { data: wallets, isLoading: walletsLoading } = useWallets();

  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FlwMethod>("card");
  const [network, setNetwork] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [verifyState, setVerifyState] = useState<{ status: "verifying" | "success" | "failed"; message: string } | null>(null);

  // Initialize wallet from URL or default
  useEffect(() => {
    if (!wallets?.length) return;
    const fromUrl = params.get("walletId");
    if (fromUrl && wallets.some((w) => w.wallet_id === fromUrl)) {
      setSelectedWalletId(fromUrl);
      return;
    }
    const flwTest = params.get("flw") === "1" || import.meta.env.VITE_FLW_WESTERN_TOPUP === "true";
    const preferCurrency = (params.get("currency") || (flwTest ? "CAD" : "")).toUpperCase();
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
  /** ?flw=1 or VITE_FLW_WESTERN_TOPUP=true — test USD/CAD collect via Flutterwave instead of Stripe */
  const flwWesternTest =
    params.get("flw") === "1" || import.meta.env.VITE_FLW_WESTERN_TOPUP === "true";
  const gateway: Gateway =
    flwWesternTest && (currency === "USD" || currency === "CAD")
      ? "flutterwave"
      : routeGateway(currency);
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

  // Default small test amount when opening the Flutterwave western test link
  useEffect(() => {
    if (!flwWesternTest || (currency !== "USD" && currency !== "CAD")) return;
    if (!amount) setAmount(currency === "CAD" ? "10" : "5");
  }, [flwWesternTest, currency, amount]);

  // Verify Stripe / Flutterwave return callbacks
  useEffect(() => {
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
  }, [params]);

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

  const gatewayBadge = useMemo(() => {
    if (gateway === "elicate") return { label: "Mobile Money", icon: Smartphone, color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
    if (gateway === "flutterwave") return { label: "Flutterwave", icon: Globe, color: "bg-orange-500/10 text-orange-500 border-orange-500/30" };
    if (gateway === "stripe") return { label: "Stripe", icon: CreditCard, color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/30" };
    return { label: "Unavailable", icon: XCircle, color: "bg-muted text-muted-foreground" };
  }, [gateway]);

  return (
    <main className="container px-4 py-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto space-y-6">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-display font-bold">
              {flwWesternTest ? "Wallet top-up test" : "Add Money"}
            </h1>
            <p className="text-muted-foreground">
              {flwWesternTest
                ? "We are testing whether Canadian/US cards can add money through Flutterwave."
                : "Top up your wallet using the best route for your currency."}
            </p>
          </div>

          {flwWesternTest && (currency === "USD" || currency === "CAD") && (
            <Card className="border-orange-500/40 bg-orange-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-5 w-5 text-orange-600 shrink-0" />
                  {currency === "CAD" ? "Instructions for Canada (CAD test)" : "Instructions for USD card test"}
                </CardTitle>
                <CardDescription>
                  Please read before paying. This uses a <strong>live</strong> payment — your card will be charged the amount you enter.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <ol className="list-decimal list-inside space-y-2.5 text-foreground leading-relaxed">
                  {currency === "CAD" ? (
                    <>
                      <li>Select your <strong>CAD wallet</strong> in step 1 below (🇨🇦 Canadian Dollar).</li>
                      <li>Enter a <strong>small test amount</strong> — we suggest <strong>$10 CAD</strong>.</li>
                      <li>Click <strong>Proceed to Payment</strong>. You will leave eFinMoney and go to <strong>Flutterwave</strong> (secure checkout).</li>
                      <li>Pay with your <strong>Canadian debit or credit card</strong> (Interac debit cards with Visa/Mastercard logo usually work).</li>
                      <li>
                        If Flutterwave asks for <strong>billing address</strong> on the next screen:
                        <ul className="list-disc list-inside ml-4 mt-1.5 space-y-1 text-muted-foreground">
                          <li>Name — exactly as it appears on your card</li>
                          <li>Address, city, province — your real Canadian address</li>
                          <li>Country — <strong>Canada</strong></li>
                          <li>Postal code — your real Canadian postal code (e.g. M5H 2N2)</li>
                        </ul>
                      </li>
                      <li>Complete payment. You will be returned to eFinMoney automatically.</li>
                      <li>Your <strong>CAD wallet balance</strong> should increase within a minute if successful.</li>
                    </>
                  ) : (
                    <>
                      <li>Select your <strong>USD wallet</strong> in step 1 below.</li>
                      <li>Enter a small test amount — we suggest <strong>$5 USD</strong>.</li>
                      <li>Click <strong>Proceed to Payment</strong> and pay on Flutterwave checkout.</li>
                      <li>If billing address is requested, use details that match your card (US address for US cards).</li>
                      <li>Some virtual cards (e.g. Grey) may be declined by the bank — that is a card restriction, not an app error.</li>
                    </>
                  )}
                </ol>
                <div className="rounded-lg border border-orange-500/25 bg-background/80 p-3 text-xs text-muted-foreground">
                  <strong className="text-foreground">Not Stripe:</strong> this test deliberately uses Flutterwave instead of our usual card processor.
                  If payment fails, note the exact error message and send a screenshot to the eFinMoney team.
                </div>
              </CardContent>
            </Card>
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
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Routed via</span>
                  <Badge variant="outline" className={gatewayBadge.color}>
                    <gatewayBadge.icon className="w-3 h-3 mr-1" />
                    {gatewayBadge.label}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

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
                  <CardTitle className="text-base">Recommended: Stripe Checkout</CardTitle>
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
                <CardTitle className="text-base">2. Enter amount</CardTitle>
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
                    {flwWesternTest
                      ? "Click the button below to open Flutterwave checkout in a new secure page. Use the steps above before you pay."
                      : "You will be redirected to Flutterwave's secure checkout to complete your payment via Card, Bank Transfer, Mobile Money, or USSD."}
                  </p>
                </div>

                <Button className="w-full" size="lg" onClick={handleFlutterwaveTopUp} disabled={loading}>
                  {loading ? "Opening Flutterwave…" : flwWesternTest ? "Continue to Flutterwave checkout" : "Proceed to Payment"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Elicate route — direct mobile-money top-up for Zambia (ZMW) */}
          {selectedWallet && currency === "ZMW" && (
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
