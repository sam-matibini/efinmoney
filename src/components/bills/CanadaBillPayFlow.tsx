import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, ArrowLeft, ArrowRight, Building2, CheckCircle2, Info, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWallets } from "@/hooks/useWallets";
import { usePinGate } from "@/components/send/usePinGate";
import { invokeEdgeFunction, stringifyErrorValue } from "@/lib/invokeEdgeFunction";
import {
  CA_BILL_CATEGORIES,
  CA_BILL_CATEGORY_LABEL,
  CA_BILL_PAYEE_HINTS,
  type CaBillCategoryId,
} from "@/lib/canadaBillPay";
import { toast } from "sonner";

const STEPS = ["Bill details", "Bank & amount", "Confirm"] as const;

const CanadaBillPayFlow = () => {
  const { data: wallets } = useWallets();
  const { requirePin, pinGate } = usePinGate();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ reference: string; transferId: string } | null>(null);

  const [category, setCategory] = useState<CaBillCategoryId>("utility");
  const [payeeName, setPayeeName] = useState("");
  const [accountReference, setAccountReference] = useState("");
  const [memo, setMemo] = useState("");

  const [institution, setInstitution] = useState("");
  const [transit, setTransit] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");

  const cadWallets = useMemo(
    () => (wallets || []).filter((w) => w.currency_code === "CAD"),
    [wallets],
  );

  const selectedWallet = cadWallets.find((w) => w.wallet_id === walletId) ?? cadWallets[0];

  useEffect(() => {
    if (cadWallets.length && !cadWallets.some((w) => w.wallet_id === walletId)) {
      setWalletId(cadWallets[0].wallet_id);
    }
  }, [cadWallets, walletId]);
  const parsedAmount = Number(amount);
  const categoryMeta = CA_BILL_CATEGORIES.find((c) => c.id === category)!;

  const step1Valid = payeeName.trim().length >= 2 && accountReference.trim().length >= 3;
  const step2Valid =
    /^\d{3}$/.test(institution)
    && /^\d{5}$/.test(transit)
    && accountNumber.replace(/\D/g, "").length >= 5
    && Number.isFinite(parsedAmount)
    && parsedAmount >= 1
    && !!selectedWallet
    && Number(selectedWallet.balance) >= parsedAmount;

  const submitPayment = async () => {
    if (!selectedWallet || !step1Valid || !step2Valid) return;
    setSubmitting(true);
    try {
      const res = await invokeEdgeFunction<{
        success?: boolean;
        reference?: string;
        transfer_id?: string;
        error?: string;
      }>("ca-bill-payment", {
        wallet_id: selectedWallet.wallet_id,
        amount: parsedAmount,
        payee_name: payeeName.trim(),
        category,
        account_reference: accountReference.trim(),
        memo: memo.trim() || undefined,
        institution,
        transit,
        account_number: accountNumber.replace(/\D/g, ""),
      });
      if (!res.reference || !res.transfer_id) throw new Error("Payment could not be completed");
      setSuccess({ reference: res.reference, transferId: res.transfer_id });
      toast.success("Bill payment submitted");
    } catch (e) {
      toast.error(stringifyErrorValue(e) || "Bill payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto text-center space-y-4 p-8 rounded-2xl border border-border bg-card"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-display font-bold">Bill payment submitted</h2>
        <p className="text-sm text-muted-foreground">
          C${parsedAmount.toFixed(2)} to {payeeName} via EFT. Processing usually takes 1–3 business days.
        </p>
        <p className="text-xs font-mono text-muted-foreground">Ref {success.reference}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button asChild variant="outline">
            <Link to="/pay-bills">Back to Pay Bills</Link>
          </Button>
          <Button asChild>
            <Link to={`/transfers/${success.transferId}`}>Track payment</Link>
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-6">
        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Pay Canadian bills by sending an <strong>EFT</strong> to the biller&apos;s bank account.
            Enter the payee name, your account/reference number, and the biller&apos;s institution, transit, and account numbers
            (from your bill or online banking payee setup).
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1 min-w-0">
              <span
                className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
                  i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <span className={`text-xs truncate hidden sm:inline ${i === step ? "font-medium" : "text-muted-foreground"}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border min-w-2" />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Who are you paying?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Bill category</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                      {CA_BILL_CATEGORIES.map((c) => {
                        const Icon = c.icon;
                        const active = category === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setCategory(c.id)}
                            className={`p-3 rounded-xl border text-left transition ${
                              active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <Icon className="w-4 h-4 mb-1" />
                            <span className="text-xs font-medium block leading-tight">{c.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="payee">Payee / biller name</Label>
                    <Input
                      id="payee"
                      list="ca-payee-hints"
                      value={payeeName}
                      onChange={(e) => setPayeeName(e.target.value)}
                      placeholder="e.g. Hydro One, Rogers, CRA"
                    />
                    <datalist id="ca-payee-hints">
                      {CA_BILL_PAYEE_HINTS.map((h) => (
                        <option key={h} value={h} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <Label htmlFor="ref">Your account / customer / reference number</Label>
                    <Input
                      id="ref"
                      value={accountReference}
                      onChange={(e) => setAccountReference(e.target.value)}
                      placeholder="From your bill — account #, customer ID, etc."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      This is sent with the payment so the biller can apply it to your account.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="memo">Note (optional)</Label>
                    <Textarea
                      id="memo"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="Internal note for your records"
                      rows={2}
                    />
                  </div>

                  <Button className="w-full" disabled={!step1Valid} onClick={() => setStep(1)}>
                    Continue <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Biller bank details (EFT)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Find these on your bill or in your online banking when you add this payee as a bill payment recipient.
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Institution</Label>
                      <Input
                        inputMode="numeric"
                        maxLength={3}
                        value={institution}
                        onChange={(e) => setInstitution(e.target.value.replace(/\D/g, "").slice(0, 3))}
                        placeholder="001"
                      />
                    </div>
                    <div>
                      <Label>Transit</Label>
                      <Input
                        inputMode="numeric"
                        maxLength={5}
                        value={transit}
                        onChange={(e) => setTransit(e.target.value.replace(/\D/g, "").slice(0, 5))}
                        placeholder="12345"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <Label>Account #</Label>
                      <Input
                        inputMode="numeric"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                        placeholder="Account number"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Amount (CAD)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={25000}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Min C$1 · Max C$25,000 per payment</p>
                  </div>

                  <div>
                    <Label>Pay from</Label>
                    {cadWallets.length === 0 ? (
                      <p className="text-sm text-amber-600 mt-1">
                        No CAD wallet. <Link to="/wallets" className="underline">Create or top up</Link> first.
                      </p>
                    ) : (
                      <Select
                        value={selectedWallet?.wallet_id || ""}
                        onValueChange={setWalletId}
                      >
                        <SelectTrigger><SelectValue placeholder="CAD wallet" /></SelectTrigger>
                        <SelectContent>
                          {cadWallets.map((w) => (
                            <SelectItem key={w.wallet_id} value={w.wallet_id}>
                              🇨🇦 CAD — {w.symbol}{Number(w.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {parsedAmount > 0 && selectedWallet && Number(selectedWallet.balance) < parsedAmount && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>Insufficient balance. Top up your CAD wallet first.</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setStep(0)}>
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <Button className="flex-1" disabled={!step2Valid} onClick={() => setStep(2)}>
                      Review <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <Card>
                <CardHeader><CardTitle>Confirm bill payment</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Category</dt>
                      <dd className="font-medium text-right">{categoryMeta.label}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Payee</dt>
                      <dd className="font-medium text-right">{payeeName}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Reference</dt>
                      <dd className="font-medium text-right font-mono text-xs">{accountReference}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Bank (EFT)</dt>
                      <dd className="font-medium text-right font-mono text-xs">
                        {institution}-{transit} ····{accountNumber.slice(-4)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t pt-3">
                      <dt className="text-muted-foreground">Amount</dt>
                      <dd className="font-display font-bold text-lg">C${parsedAmount.toFixed(2)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">From wallet</dt>
                      <dd className="font-medium">CAD (C${Number(selectedWallet?.balance ?? 0).toFixed(2)} available)</dd>
                    </div>
                  </dl>

                  <Alert className="bg-muted/40">
                    <AlertDescription className="text-xs">
                      Funds leave your eFinMoney CAD wallet immediately. EFT delivery to the biller typically takes 1–3 business days.
                      {CA_BILL_CATEGORY_LABEL[category] ? ` Category: ${CA_BILL_CATEGORY_LABEL[category]}.` : ""}
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={submitting}
                      onClick={() => requirePin(
                        () => submitPayment(),
                        `C$${parsedAmount.toFixed(2)}`,
                        `Pay ${payeeName}`,
                      )}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing…
                        </>
                      ) : (
                        `Pay C$${parsedAmount.toFixed(2)}`
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {pinGate}
    </>
  );
};

export default CanadaBillPayFlow;
