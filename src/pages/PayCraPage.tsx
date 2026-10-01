import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, ArrowLeft, Building2, CheckCircle2, Landmark, Loader2, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { usePinGate } from "@/components/send/usePinGate";
import { invokeEdgeFunction, stringifyErrorValue } from "@/lib/invokeEdgeFunction";
import { supabase } from "@/integrations/supabase/client";
import {
  CRA_KYC_THRESHOLD,
  CRA_MAX_AMOUNT,
  CRA_MIN_AMOUNT,
  CRA_PAYMENT_TYPES,
  craPaymentType,
  isValidBn9,
  isValidSin,
  normalizeDigits,
  validatePeriod,
  type CraTaxpayerType,
} from "@/lib/craPayment";
import { toast } from "sonner";

interface CraPaymentRow {
  id: string;
  reference: string;
  taxpayer_name: string;
  payment_type: string;
  period: string;
  amount: number;
  status: string;
  bank_confirmation: string | null;
  failure_reason: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  queued: { label: "Queued for CRA", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  remitted: { label: "Sent to CRA", className: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  confirmed: { label: "Received by CRA", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  refunded: { label: "Refunded", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const thisYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => String(thisYear + 1 - i));

function periodLabel(kind: "year" | "month" | "date", program?: string) {
  if (kind === "year") return "Tax year";
  if (kind === "month") return "Remittance period (month)";
  return program === "RC" ? "Tax year end date" : "Reporting period end date";
}

function useCraPayments() {
  return useQuery({
    queryKey: ["cra-payments"],
    queryFn: async (): Promise<CraPaymentRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cra_payments")
        .select("id, reference, taxpayer_name, payment_type, period, amount, status, bank_confirmation, failure_reason, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

const PayCraPage = () => {
  const queryClient = useQueryClient();
  const { data: wallets } = useWallets();
  const { data: payments = [], isLoading: loadingPayments } = useCraPayments();
  const { requirePin, pinGate } = usePinGate();

  const [taxpayer, setTaxpayer] = useState<CraTaxpayerType>("individual");
  const [paymentTypeId, setPaymentTypeId] = useState("t1_balance");
  const [taxpayerName, setTaxpayerName] = useState("");
  const [sin, setSin] = useState("");
  const [bn, setBn] = useState("");
  const [programSuffix, setProgramSuffix] = useState("0001");
  const [period, setPeriod] = useState(String(thisYear - 1));
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const type = craPaymentType(paymentTypeId)!;
  const typesForTaxpayer = CRA_PAYMENT_TYPES.filter((t) => t.taxpayer === taxpayer);
  const cadWallets = useMemo(() => (wallets || []).filter((w) => w.currency_code === "CAD"), [wallets]);
  const selectedWallet = cadWallets.find((w) => w.wallet_id === walletId) ?? cadWallets[0];

  useEffect(() => {
    if (cadWallets.length && !cadWallets.some((w) => w.wallet_id === walletId)) setWalletId(cadWallets[0].wallet_id);
  }, [cadWallets, walletId]);

  const chooseTaxpayer = (t: CraTaxpayerType) => {
    setTaxpayer(t);
    const first = CRA_PAYMENT_TYPES.find((p) => p.taxpayer === t)!;
    choosePaymentType(first.id);
  };

  const choosePaymentType = (id: string) => {
    const next = craPaymentType(id)!;
    setPaymentTypeId(id);
    setPeriod(next.period === "year" ? String(thisYear - 1) : "");
    setConfirmed(false);
  };

  const parsedAmount = Number(amount);
  const programAccount = type.program ? `${type.program}${programSuffix}` : "";
  const identifierValid = taxpayer === "individual"
    ? isValidSin(sin)
    : isValidBn9(bn) && /^\d{4}$/.test(programSuffix);
  const periodValid = !!validatePeriod(type.period, period);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= CRA_MIN_AMOUNT && parsedAmount <= CRA_MAX_AMOUNT;
  const hasBalance = !!selectedWallet && Number(selectedWallet.balance) >= parsedAmount;
  const canSubmit = taxpayerName.trim().length >= 2 && identifierValid && periodValid && amountValid && hasBalance && confirmed;

  const sinDigits = normalizeDigits(sin);
  const showSinError = sinDigits.length === 9 && !isValidSin(sinDigits);

  const submit = async () => {
    if (!canSubmit || !selectedWallet) return;
    setSubmitting(true);
    try {
      await invokeEdgeFunction("cra-payment", {
        action: "create",
        wallet_id: selectedWallet.wallet_id,
        payment_type: type.id,
        taxpayer_name: taxpayerName.trim(),
        ...(taxpayer === "individual"
          ? { sin: sinDigits }
          : { business_number: normalizeDigits(bn), program_account: programAccount }),
        period,
        amount: parsedAmount,
      });
      toast.success("CRA payment submitted");
      setAmount("");
      setConfirmed(false);
      void queryClient.invalidateQueries({ queryKey: ["cra-payments"] });
      void queryClient.invalidateQueries({ queryKey: ["wallets"] });
    } catch (e) {
      toast.error(stringifyErrorValue(e) || "CRA payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: string) => {
    setCancellingId(id);
    try {
      await invokeEdgeFunction("cra-payment", { action: "cancel", id });
      toast.success("Cancelled — funds returned to your CAD wallet");
      void queryClient.invalidateQueries({ queryKey: ["cra-payments"] });
      void queryClient.invalidateQueries({ queryKey: ["wallets"] });
    } catch (e) {
      toast.error(stringifyErrorValue(e) || "Could not cancel");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <main className="container px-4 py-6 min-h-[80vh]">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" asChild>
            <Link to="/pay-bills" aria-label="Back to Pay Bills"><ArrowLeft className="w-5 h-5" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold">Pay CRA taxes</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Pay the Canada Revenue Agency from your CAD wallet — personal tax, corporate tax, payroll, and GST/HST.
            </p>
          </div>
        </div>

        <Alert className="border-primary/30 bg-primary/5">
          <Landmark className="h-4 w-4" />
          <AlertDescription className="text-sm">
            We send your payment to CRA through online-banking bill pay on the next business day, with your SIN or business number attached.
            CRA usually shows it in your account 2–3 business days later. <strong>Submit at least 3 business days before your due date</strong> —
            CRA charges interest on late payments.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader><CardTitle>Payment details</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "individual", label: "Individual", hint: "Paid with your SIN", icon: User },
                { id: "business", label: "Business", hint: "Paid with a business number", icon: Building2 },
              ] as const).map((t) => {
                const Icon = t.icon;
                const active = taxpayer === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => chooseTaxpayer(t.id)}
                    className={`p-3 rounded-xl border text-left transition ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span className="text-sm font-medium block">{t.label}</span>
                    <span className="text-xs text-muted-foreground">{t.hint}</span>
                  </button>
                );
              })}
            </div>

            <div>
              <Label>What are you paying?</Label>
              <Select value={paymentTypeId} onValueChange={choosePaymentType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typesForTaxpayer.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="cra-name">{taxpayer === "individual" ? "Taxpayer's full name" : "Business legal name"}</Label>
              <Input id="cra-name" className="mt-1" value={taxpayerName} onChange={(e) => setTaxpayerName(e.target.value)} placeholder="As registered with CRA" />
            </div>

            {taxpayer === "individual" ? (
              <div>
                <Label htmlFor="cra-sin">Social Insurance Number (SIN)</Label>
                <Input
                  id="cra-sin"
                  className="mt-1 font-mono tracking-wider"
                  inputMode="numeric"
                  autoComplete="off"
                  value={sin}
                  onChange={(e) => setSin(normalizeDigits(e.target.value).slice(0, 9))}
                  placeholder="9 digits"
                />
                {showSinError ? (
                  <p className="text-xs text-destructive mt-1">That SIN doesn&apos;t pass CRA&apos;s check. Re-check each digit.</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">CRA applies the payment to whoever this SIN belongs to — a wrong digit sends it to the wrong account.</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="cra-bn">Business number (BN)</Label>
                  <Input
                    id="cra-bn"
                    className="mt-1 font-mono tracking-wider"
                    inputMode="numeric"
                    value={bn}
                    onChange={(e) => setBn(normalizeDigits(e.target.value).slice(0, 9))}
                    placeholder="123456789"
                  />
                </div>
                <div>
                  <Label htmlFor="cra-program">Program account</Label>
                  <div className="mt-1 flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                    <span className="pl-3 font-mono text-sm text-muted-foreground">{type.program}</span>
                    <input
                      id="cra-program"
                      className="w-full bg-transparent px-1 py-2 font-mono text-sm outline-none"
                      inputMode="numeric"
                      value={programSuffix}
                      onChange={(e) => setProgramSuffix(normalizeDigits(e.target.value).slice(0, 4))}
                    />
                  </div>
                </div>
                <p className="col-span-3 text-xs text-muted-foreground -mt-1">
                  Full account: <span className="font-mono">{normalizeDigits(bn) || "123456789"}{programAccount}</span>. Find it on your CRA notice or remittance voucher.
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="cra-period">{periodLabel(type.period, type.program)}</Label>
              {type.period === "year" ? (
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger id="cra-period" className="mt-1"><SelectValue placeholder="Select year" /></SelectTrigger>
                  <SelectContent>{YEAR_OPTIONS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input
                  id="cra-period"
                  className="mt-1"
                  type={type.period === "month" ? "month" : "date"}
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cra-amount">Amount (CAD)</Label>
                <Input
                  id="cra-amount"
                  className="mt-1"
                  type="number"
                  inputMode="decimal"
                  min={CRA_MIN_AMOUNT}
                  max={CRA_MAX_AMOUNT}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Pay from</Label>
                {cadWallets.length === 0 ? (
                  <p className="text-sm text-amber-600 mt-2">No CAD wallet. <Link to="/wallets" className="underline">Create or top up</Link> first.</p>
                ) : (
                  <Select value={selectedWallet?.wallet_id || ""} onValueChange={setWalletId}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cadWallets.map((w) => (
                        <SelectItem key={w.wallet_id} value={w.wallet_id}>
                          CAD — C${Number(w.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {parsedAmount > 0 && selectedWallet && !hasBalance && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Insufficient balance. Top up your CAD wallet first.</AlertDescription>
              </Alert>
            )}
            {parsedAmount >= CRA_KYC_THRESHOLD && (
              <p className="text-xs text-muted-foreground">Payments of C$1,000 or more require a verified identity.</p>
            )}

            <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
              <span className="text-sm">
                I confirm the {taxpayer === "individual" ? "SIN" : "business number and program account"}, payment type and period are correct.
                CRA applies payments using these details, and I&apos;m responsible for paying by the due date.
              </span>
            </label>

            <Button
              className="w-full"
              disabled={!canSubmit || submitting}
              onClick={() => requirePin(() => submit(), `C$${parsedAmount.toFixed(2)}`, "Pay CRA")}
            >
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : `Pay C$${amountValid ? parsedAmount.toFixed(2) : "0.00"} to CRA`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Your CRA payments</CardTitle></CardHeader>
          <CardContent>
            {loadingPayments ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
            ) : payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No CRA payments yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {payments.map((p) => {
                  const meta = STATUS_META[p.status] ?? { label: p.status, className: "" };
                  return (
                    <li key={p.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{craPaymentType(p.payment_type)?.label ?? p.payment_type}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.taxpayer_name} · {p.period} · {format(new Date(p.created_at), "MMM d, yyyy")}
                        </p>
                        {p.bank_confirmation && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Bank confirmation <span className="font-mono">{p.bank_confirmation}</span>
                          </p>
                        )}
                        {p.failure_reason && p.status !== "cancelled" && (
                          <p className="text-xs text-destructive mt-0.5">{p.failure_reason}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <p className="text-sm font-semibold">C${Number(p.amount).toFixed(2)}</p>
                        <Badge className={meta.className}>{meta.label}</Badge>
                        {p.status === "queued" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs block ml-auto"
                            disabled={cancellingId === p.id}
                            onClick={() => cancel(p.id)}
                          >
                            {cancellingId === p.id ? "Cancelling…" : "Cancel"}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {pinGate}
    </main>
  );
};

export default PayCraPage;
