import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Phone, Wifi, Zap, Tv, Droplet } from "lucide-react";

interface Biller { biller_code: string; name: string; amount?: number; biller_name?: string; label_name?: string; item_code?: string; }

const CATEGORIES = [
  { key: "airtime", label: "Airtime", icon: Phone },
  { key: "data", label: "Data", icon: Wifi },
  { key: "electricity", label: "Electricity", icon: Zap },
  { key: "cable", label: "Cable TV", icon: Tv },
  { key: "water", label: "Water", icon: Droplet },
];

const COUNTRIES = ["NG", "KE", "GH", "ZA", "UG"];

const PayBillsPage = () => {
  const [country, setCountry] = useState("NG");
  const [category, setCategory] = useState<string | null>(null);
  const [billers, setBillers] = useState<Biller[]>([]);
  const [loadingBillers, setLoadingBillers] = useState(false);
  const [billerCode, setBillerCode] = useState("");
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!category) { setBillers([]); return; }
    (async () => {
      setLoadingBillers(true);
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flw-get-billers?country=${country}&category=${category}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
        const json = await res.json();
        setBillers(Array.isArray(json?.billers) ? json.billers : []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load billers");
      } finally { setLoadingBillers(false); }
    })();
  }, [category, country]);

  const handlePay = async () => {
    const amt = Number(amount);
    if (!billerCode || !customer || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Fill all fields"); return;
    }
    setSubmitting(true);
    try {
      const biller = billers.find((b) => (b.biller_code || b.item_code) === billerCode);
      const { data, error } = await supabase.functions.invoke("flw-bill-payment", {
        body: { country, category, billerCode, billerName: biller?.name || biller?.biller_name, customerIdentifier: customer, amount: amt, currency: country === "NG" ? "NGN" : country === "KE" ? "KES" : country === "GH" ? "GHS" : country === "ZA" ? "ZAR" : "UGX" },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("Bill payment submitted");
      setAmount(""); setCustomer("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      <main className="container px-4 py-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-display font-bold">Pay Bills</h1>
            <p className="text-muted-foreground">Airtime, data, electricity, cable TV and more.</p>
          </div>

          <Card>
            <CardHeader><CardTitle>Choose category</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Country</Label>
                <Select value={country} onValueChange={(v) => { setCountry(v); setCategory(null); setBillerCode(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const active = category === c.key;
                  return (
                    <button key={c.key} onClick={() => { setCategory(c.key); setBillerCode(""); }}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                      <Icon className="w-5 h-5" />
                      <span className="text-xs">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {category && (
            <Card>
              <CardHeader><CardTitle>Payment details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Biller</Label>
                  <Select value={billerCode} onValueChange={setBillerCode} disabled={loadingBillers || billers.length === 0}>
                    <SelectTrigger><SelectValue placeholder={loadingBillers ? "Loading..." : billers.length === 0 ? "No billers found" : "Select biller"} /></SelectTrigger>
                    <SelectContent>
                      {billers.slice(0, 100).map((b, i) => {
                        const code = b.biller_code || b.item_code || `${i}`;
                        const name = b.name || b.biller_name || b.label_name || code;
                        return <SelectItem key={code + i} value={code}>{name}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Customer ID (phone, meter or smartcard number)</Label>
                  <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                </div>
                <Button className="w-full" onClick={handlePay} disabled={submitting}>
                  {submitting ? "Processing..." : "Pay now"}
                </Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </main>
      <MobileNav />
    </div>
  );
};

export default PayBillsPage;
