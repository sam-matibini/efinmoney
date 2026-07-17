import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CreditCard, Droplet, Phone, Receipt, Tv, Wifi, Zap,
  Loader2, CheckCircle2, AlertCircle, ArrowRight, Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CountryPicker from "@/components/ui/CountryPicker";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { findCountryById } from "@/lib/countries";
import { BILL_PAYMENT_COUNTRIES, getCountryIso2 } from "@/lib/countryIso";
import { productFeatures } from "@/lib/productFeatures";
import SwychrAirtimePanel from "@/components/bills/SwychrAirtimePanel";
import { useWallets } from "@/hooks/useWallets";
import type { LucideIcon } from "lucide-react";

interface BillCategory {
  id?: number;
  name: string;
  code: string;
  description?: string;
  country_code?: string;
}

interface Biller {
  biller_code?: string;
  name?: string;
  biller_name?: string;
  label_name?: string;
  item_code?: string;
  short_name?: string;
  amount?: number;
  fee?: number;
  code?: string;
}

interface ValidationResult {
  name?: string;
  minimum?: number;
  maximum?: number;
  fee?: number;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  AIRTIME: Phone,
  MOBILEDATA: Wifi,
  DATABUNDLE: Wifi,
  DATA: Wifi,
  CABLEBILLS: Tv,
  CABLE: Tv,
  DSTV: Tv,
  GOTV: Tv,
  UTILITYBILLS: Zap,
  INTSERV: Wifi,
  TAX: Receipt,
  WATER: Droplet,
};

const iconForCategory = (code: string): LucideIcon => {
  const u = code.toUpperCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (u.includes(key)) return icon;
  }
  return CreditCard;
};

const PayBillsPage = () => {
  const [countryId, setCountryId] = useState("Nigeria");
  const [categories, setCategories] = useState<BillCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoriesSupported, setCategoriesSupported] = useState(true);
  const [categoryCode, setCategoryCode] = useState<string | null>(null);
  const [billers, setBillers] = useState<Biller[]>([]);
  const [loadingBillers, setLoadingBillers] = useState(false);
  const [billerKey, setBillerKey] = useState("");
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const navigate = useNavigate();
  const { data: wallets } = useWallets();
  const country = findCountryById(countryId);
  const countryIso = getCountryIso2(countryId);
  const currency = country?.code || "NGN";

  const matchingWallets = useMemo(
    () => (wallets || []).filter((w) => w.currency_code === currency),
    [wallets, currency],
  );
  const [walletId, setWalletId] = useState("");

  useEffect(() => {
    if (matchingWallets.length && !matchingWallets.some((w) => w.wallet_id === walletId)) {
      setWalletId(matchingWallets[0].wallet_id);
    }
  }, [matchingWallets, walletId]);

  const fetchCategories = useCallback(async (iso: string) => {
    setLoadingCategories(true);
    setCategoryCode(null);
    setBillers([]);
    setBillerKey("");
    setValidation(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flw-get-billers?country=${iso}&list=categories`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not load categories");
      const list = Array.isArray(json?.categories) ? json.categories : [];
      setCategories(list);
      setCategoriesSupported(json?.supported !== false && list.length > 0);
    } catch (e) {
      setCategories([]);
      setCategoriesSupported(false);
      toast.error(e instanceof Error ? e.message : "Could not load bill categories");
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  const isCanada = countryId === "Canada";
  const isWesternUnsupported = !categoriesSupported && countryIso && !isCanada;

  useEffect(() => {
    if (!countryIso || isCanada) {
      if (isCanada) {
        setCategories([]);
        setCategoriesSupported(true);
        setLoadingCategories(false);
      }
      return;
    }
    fetchCategories(countryIso);
  }, [countryIso, isCanada, fetchCategories]);

  useEffect(() => {
    if (!categoryCode || !countryIso) {
      setBillers([]);
      return;
    }
    (async () => {
      setLoadingBillers(true);
      setBillerKey("");
      setValidation(null);
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flw-get-billers?country=${countryIso}&category=${encodeURIComponent(categoryCode)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Could not load billers");
        setBillers(Array.isArray(json?.billers) ? json.billers : []);
      } catch (e) {
        setBillers([]);
        toast.error(e instanceof Error ? e.message : "Could not load billers");
      } finally {
        setLoadingBillers(false);
      }
    })();
  }, [categoryCode, countryIso]);

  useEffect(() => {
    if (!paymentSuccess) return;
    const t = setTimeout(() => navigate("/dashboard"), 2500);
    return () => clearTimeout(t);
  }, [paymentSuccess, navigate]);

  const selectedBiller = useMemo(() => {
    if (!billerKey) return null;
    return billers.find((b, i) => {
      const code = b.biller_code || b.code || b.item_code || `${i}`;
      return `${code}::${i}` === billerKey;
    }) ?? null;
  }, [billers, billerKey]);

  const customerLabel = selectedBiller?.label_name
    || (categoryCode?.includes("AIRTIME") ? "Mobile number" : "Customer ID (phone, meter or smartcard)");

  const billerOptions = useMemo(
    () => billers.map((b, i) => {
      const code = b.biller_code || b.code || b.item_code || `${i}`;
      const name = b.name || b.short_name || b.biller_name || b.label_name || code;
      return {
        value: `${code}::${i}`,
        label: name,
        keywords: `${name} ${code} ${b.item_code || ""} ${b.biller_name || ""}`,
      };
    }),
    [billers],
  );

  const validateCustomer = async () => {
    if (!selectedBiller || !customer.trim()) return;
    const itemCode = selectedBiller.item_code;
    const billerCode = selectedBiller.biller_code || selectedBiller.code;
    if (!itemCode || !billerCode) return;

    setValidating(true);
    setValidation(null);
    try {
      const { data, error } = await supabase.functions.invoke("flw-validate-bill", {
        body: { itemCode, billerCode, customer: customer.trim() },
      });
      if (error) throw error;
      if ((data as { valid?: boolean })?.valid === false) {
        throw new Error((data as { error?: string })?.error || "Invalid customer ID");
      }
      const v = (data as { data?: ValidationResult })?.data;
      setValidation(v || { name: "Validated" });
      toast.success(v?.name ? `Verified: ${v.name}` : "Customer ID verified");
      if (v?.minimum && !amount) setAmount(String(v.minimum));
    } catch (e) {
      setValidation(null);
      toast.error(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const handlePay = async () => {
    const amt = Number(amount);
    if (!countryIso || !categoryCode || !selectedBiller || !customer.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Fill all required fields");
      return;
    }
    const billerCode = selectedBiller.biller_code || selectedBiller.code;
    if (!billerCode) {
      toast.error("Invalid biller selection");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("flw-bill-payment", {
        body: {
          country: countryIso,
          category: categoryCode,
          billerCode,
          itemCode: selectedBiller.item_code || undefined,
          billerName: selectedBiller.name || selectedBiller.short_name || selectedBiller.biller_name,
          customerIdentifier: customer.trim(),
          amount: amt,
          currency,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      if ((data as { success?: boolean })?.success === false) {
        throw new Error((data as { error?: string })?.error || "Payment failed");
      }
      setAmount("");
      setCustomer("");
      setValidation(null);
      setBillerKey("");
      setPaymentSuccess(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (paymentSuccess) {
    return (
      <main className="container px-4 py-6 min-h-[80vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center space-y-4 p-8 rounded-2xl border border-border bg-card"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 16, delay: 0.1 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10"
          >
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </motion.div>
          <h1 className="text-2xl font-display font-bold text-foreground">Bill payment successful!</h1>
          <p className="text-sm text-muted-foreground">Redirecting to your dashboard…</p>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="container px-4 py-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Pay Bills</h1>
          <p className="text-muted-foreground">Airtime, data, electricity, cable TV and more — powered by Flutterwave.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Choose country & category</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Country</Label>
              <CountryPicker
                value={countryId}
                showMethod={false}
                countries={BILL_PAYMENT_COUNTRIES}
                onChange={(c) => {
                  setCountryId(c.id);
                  setCategoryCode(null);
                  setBillerKey("");
                  setCustomer("");
                  setAmount("");
                  setValidation(null);
                }}
              />
            </div>

            {isCanada ? (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <Building2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Canada — pay by EFT</p>
                    <p className="text-sm text-muted-foreground">
                      Pay utilities, telecom, insurance, tax, and other Canadian billers from your CAD wallet.
                      Enter the biller&apos;s bank details from your invoice or online banking payee setup.
                    </p>
                  </div>
                </div>
                <Button asChild className="w-full sm:w-auto">
                  <Link to="/pay-bills/canada">
                    Pay a Canadian bill
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            ) : loadingCategories ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading bill categories…
              </div>
            ) : isWesternUnsupported ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  Instant bill catalog is not available for {country?.country || "this country"} yet.
                  {countryId === "United States" || countryId === "United Kingdom"
                    ? " US/UK bill pay is not available."
                    : " Try Nigeria, Kenya, Ghana, South Africa, Uganda, or Canada (EFT)."}
                </p>
              </div>
            ) : !categoriesSupported ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>Bill payments are not available for {country?.country || "this country"} yet. Try Nigeria, Kenya, Ghana, South Africa, or Uganda.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {categories.map((c) => {
                  const Icon = iconForCategory(c.code);
                  const active = categoryCode === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        setCategoryCode(c.code);
                        setBillerKey("");
                        setCustomer("");
                        setAmount("");
                        setValidation(null);
                      }}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition text-center ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium leading-tight">{c.name || c.description || c.code}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {categoryCode && (
          <Card>
            <CardHeader><CardTitle>Payment details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Biller</Label>
                <SearchableSelect
                  value={billerKey}
                  onValueChange={(v) => {
                    setBillerKey(v);
                    setValidation(null);
                  }}
                  options={billerOptions}
                  disabled={loadingBillers || billers.length === 0}
                  placeholder={loadingBillers ? "Loading billers…" : billers.length === 0 ? "No billers found" : "Search biller…"}
                  searchPlaceholder="Search provider…"
                  emptyText="No billers match your search."
                />
              </div>

              <div>
                <Label>{customerLabel}</Label>
                <div className="flex gap-2">
                  <Input
                    value={customer}
                    onChange={(e) => { setCustomer(e.target.value); setValidation(null); }}
                    placeholder={customerLabel}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={validateCustomer}
                    disabled={validating || !customer.trim() || !selectedBiller?.item_code}
                  >
                    {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                  </Button>
                </div>
                {validation?.name && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {validation.name}
                    {validation.minimum != null && validation.maximum != null && validation.maximum > 0 && (
                      <span className="text-muted-foreground"> · {validation.minimum}–{validation.maximum} {currency}</span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <Label>Pay from ({currency})</Label>
                {matchingWallets.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    No {currency} wallet found. <a href="/wallets" className="text-primary underline">Create one</a> or top up first.
                  </p>
                ) : (
                  <Select value={walletId} onValueChange={setWalletId}>
                    <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                    <SelectContent>
                      {matchingWallets.map((w) => (
                        <SelectItem key={w.wallet_id} value={w.wallet_id}>
                          {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label>Amount ({currency})</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min={validation?.minimum || undefined}
                  max={validation?.maximum || undefined}
                />
                {selectedBiller?.amount != null && selectedBiller.amount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Fixed amount: {selectedBiller.amount} {currency}</p>
                )}
              </div>

              <Button
                className="w-full"
                onClick={handlePay}
                disabled={submitting || matchingWallets.length === 0}
              >
                {submitting ? "Processing…" : `Pay ${amount ? `${currency} ${amount}` : "now"}`}
              </Button>
            </CardContent>
          </Card>
        )}

        {productFeatures.swychr && !isCanada && (
          <SwychrAirtimePanel countryId={countryId} currency={currency} />
        )}
      </motion.div>
    </main>
  );
};

export default PayBillsPage;
