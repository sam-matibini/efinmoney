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

const CURRENCIES = ["NGN", "KES", "GHS", "ZAR", "UGX", "TZS", "ZMW", "RWF", "USD"];
const METHODS: { value: string; label: string }[] = [
  { value: "card", label: "Card" },
  { value: "banktransfer", label: "Bank Transfer" },
  { value: "ussd", label: "USSD" },
  { value: "mobilemoney", label: "Mobile Money" },
];

const TopUpPage = () => {
  const [params] = useSearchParams();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [method, setMethod] = useState("card");
  const [loading, setLoading] = useState(false);
  const [verifyState, setVerifyState] = useState<{ status: "verifying" | "success" | "failed"; message: string } | null>(null);

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
      const { data, error } = await supabase.functions.invoke("flw-verify-payment", {
        method: "GET",
        body: undefined,
        headers: {},
        // invoke does not handle GET query: use raw fetch fallback
      } as { method: string });
      // fallback: use fetch with auth
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
      void data; void error;
    })();
  }, [params]);

  const handleTopUp = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
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
      toast.error(e instanceof Error ? e.message : "Could not start top-up");
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
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount</Label>
                <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>Payment method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
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
