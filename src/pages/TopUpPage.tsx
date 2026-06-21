import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import BackToDashboard from "@/components/layout/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { validateMinAmount, friendlyFlwError, minAmount, type FlwMethod } from "@/lib/flutterwave";
import LoadingSpinner from "@/components/LoadingSpinner";
import { MM_COUNTRIES } from "@/lib/mobileMoneyNetworks";

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
    if (!selectedWalletId) {
      const def = wallets.find((w) => w.is_default) || wallets[0];
      setSelectedWalletId(def.wallet_id);
    }
  }, [wallets, params, selectedWalletId]);

  const selectedWallet = wallets?.find((w) => w.wallet_id === selectedWalletId);
  const currency = selectedWallet?.currency_code || "USD";
  const gateway = routeGateway(currency);
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

  // Verify FLW return callback
  useEffect(() => {
    const stripeStatus = params.get("stripe");
    if (stripeStatus === "success") {
      setVerifyState({ status: "success", message: "Payment received. Your wallet will be credited within a few seconds." });
      toast.success("Stripe top-up received");
      return;
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
            <h1 className="text-2xl font-display font-bold">Add Money</h1>
            <p className="text-muted-foreground">Top up your wallet using the best route for your currency.</p>
          </div>


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
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">2. Pay with saved card</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardPaymentForm
                    defaultWalletId={selectedWallet.wallet_id}
                    showWalletSelect={false}
                    onSuccess={() => toast.success("Top-up successful")}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Or pay Internationally</CardTitle>
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
                      Redirects to Stripe Checkout. Pay with Apple Pay, Google Pay, Link, or local methods (iDEAL, Bancontact, SEPA, BACS, cards).
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    variant="outline"
                    disabled={loading || !Number.isFinite(Number(amount)) || Number(amount) < 5}
                    onClick={async () => {
                      const amt = Number(amount);
                      if (!Number.isFinite(amt) || amt < 5) { toast.error("Minimum 5"); return; }
                      setLoading(true);
                      try {
                        const { data, error } = await supabase.functions.invoke(
                          "stripe-create-checkout-session",
                          { body: { wallet_id: selectedWallet.wallet_id, amount: amt, currency } },
                        );
                        if (error) throw error;
                        const url = (data as { url?: string; error?: string })?.url;
                        if (!url) throw new Error((data as { error?: string })?.error || "No checkout URL");
                        window.location.href = url;
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
                    You will be redirected to Flutterwave's secure checkout to complete your payment via Card, Bank Transfer, Mobile Money, or USSD.
                  </p>
                </div>

                <Button className="w-full" size="lg" onClick={handleFlutterwaveTopUp} disabled={loading}>
                  {loading ? "Redirecting..." : "Proceed to Payment"}
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
