import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { ALLOWED_TOPUP_CURRENCIES, validateMinAmount, friendlyFlwError, minAmount, type FlwMethod } from "@/lib/flutterwave";
import { MM_COUNTRIES } from "@/lib/mobileMoneyNetworks";

const MM_BY_CCY = Object.fromEntries(MM_COUNTRIES.map((c) => [c.currency, c]));

const METHODS: { value: FlwMethod; label: string }[] = [
  { value: "card", label: "Card" },
  { value: "banktransfer", label: "Bank Transfer" },
  { value: "ussd", label: "USSD" },
  { value: "mobilemoney", label: "Mobile Money" },
];

const TopUpPage = () => {
  const [params] = useSearchParams();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FlwMethod>("card");
  const [currency, setCurrency] = useState<string>(ALLOWED_TOPUP_CURRENCIES.card[0]);
  const [loading, setLoading] = useState(false);
  const [verifyState, setVerifyState] = useState<{ status: "verifying" | "success" | "failed"; message: string } | null>(null);
  const [network, setNetwork] = useState<string>("");
  const [phone, setPhone] = useState<string>("");

  const mmCountry = method === "mobilemoney" ? MM_BY_CCY[currency] : undefined;

  // Keep currency valid for the chosen method
  useEffect(() => {
    const allowed = ALLOWED_TOPUP_CURRENCIES[method];
    if (!allowed.includes(currency)) setCurrency(allowed[0]);
  }, [method, currency]);

  // Default the network when the mobile-money country changes
  useEffect(() => {
    if (mmCountry && !mmCountry.networks.find((n) => n.value === network)) {
      setNetwork(mmCountry.networks[0]?.value || "");
    }
  }, [mmCountry, network]);

  useEffect(() => {
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

  const handleTopUp = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!ALLOWED_TOPUP_CURRENCIES[method].includes(currency)) {
      toast.error(`${currency} is not supported for ${method}. Please choose a different currency.`);
      return;
    }
    const minErr = validateMinAmount(currency, amt);
    if (minErr) { toast.error(minErr); return; }
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/wallet/topup`;
      const { data, error } = await supabase.functions.invoke("flw-initialize-payment", {
        body: { amount: amt, currency, paymentMethod: method, redirectUrl },
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

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      <main className="container px-4 py-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-display font-bold">Add Money</h1>
            <p className="text-muted-foreground">Top up your wallet via card, bank, USSD, or mobile money.</p>
          </div>

          {verifyState && (
            <Card>
              <CardContent className="pt-6 flex items-center gap-3">
                {verifyState.status === "success" ? <CheckCircle2 className="w-6 h-6 text-primary" /> :
                 verifyState.status === "failed" ? <XCircle className="w-6 h-6 text-destructive" /> :
                 <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                <p>{verifyState.message}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Top up wallet</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Payment method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as FlwMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALLOWED_TOPUP_CURRENCIES[method].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Minimum: {minAmount(currency)} {currency}</p>
              </div>
              <div>
                <Label>Amount</Label>
                <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <Button className="w-full" onClick={handleTopUp} disabled={loading}>
                {loading ? "Redirecting..." : "Continue to payment"}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </main>
      <MobileNav />
    </div>
  );
};

export default TopUpPage;
