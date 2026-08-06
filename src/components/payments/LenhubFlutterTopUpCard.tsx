import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currencySymbol } from "@/lib/currency";
import { useAuth } from "@/hooks/useAuth";
import { Building2, Check, Copy, CreditCard, Loader2 } from "lucide-react";

const looseDb = supabase as unknown as { from: (t: string) => any };

type Step = "details" | "pin" | "otp" | "avs" | "done";

interface Props {
  initialAmount?: string;
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
  /** Prefill amount (e.g. card-funded Send). */
  fixedAmount?: number;
  /** Lock the amount field when set with fixedAmount. */
  amountReadOnly?: boolean;
  /** Fired when wallet is credited (card or VA). */
  onCredited?: (info: { localId: string; chargeId: string | null }) => void;
}

type VaDetails = {
  account_number: string;
  account_name: string | null;
  bank_name: string | null;
  amount: number;
  currency: string;
  order_ref: string | null;
  expiry: string | null;
};

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function defaultCountry(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "NGN") return "NG";
  if (c === "CAD") return "CA";
  if (c === "USD") return "US";
  if (c === "GBP") return "GB";
  if (c === "GHS") return "GH";
  if (c === "KES") return "KE";
  return "";
}

/**
 * Lenhub Flutter collect — card (all collect currencies) + NGN bank transfer (VA).
 * Card data is posted only to our edge function (never stored in DB).
 */
export default function LenhubFlutterTopUpCard({
  walletId,
  walletCurrency,
  onComplete,
  initialAmount,
  fixedAmount,
  amountReadOnly,
  onCredited,
}: Props) {
  const { user } = useAuth();
  const currency = walletCurrency.toUpperCase();
  const sym = currencySymbol(currency);
  const supportsBank = currency === "NGN";

  const [payMode, setPayMode] = useState<"card" | "bank">(supportsBank ? "card" : "card");
  const [step, setStep] = useState<Step>("details");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(
    fixedAmount != null && fixedAmount > 0 ? String(fixedAmount) : (initialAmount ?? ""),
  );
  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);
  const [email, setEmail] = useState(user?.email ?? "");
  const [localId, setLocalId] = useState<string | null>(null);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState(defaultCountry(currency));
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [postal, setPostal] = useState("");
  const [state, setState] = useState("");
  const [va, setVa] = useState<VaDetails | null>(null);
  const [copied, setCopied] = useState(false);
  const [vaCredited, setVaCredited] = useState(false);
  const creditedNotifiedRef = useRef(false);

  useEffect(() => {
    if (!email && user?.email) setEmail(user.email);
  }, [user?.email, email]);

  useEffect(() => {
    if (fixedAmount != null && fixedAmount > 0) {
      setAmount(String(fixedAmount));
    }
  }, [fixedAmount]);

  const notifyCredited = (lid?: string | null, cid?: string | null) => {
    if (creditedNotifiedRef.current) return;
    creditedNotifiedRef.current = true;
    const id = (lid || localId || "").trim();
    if (id) {
      onCredited?.({ localId: id, chargeId: (cid ?? chargeId) || null });
    }
    onComplete?.();
  };

  // Poll charge row while waiting for bank transfer confirmation
  useEffect(() => {
    if (!va || !localId || vaCredited) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await looseDb
          .from("lenhub_flutter_charges")
          .select("status, credited_at, amount, currency_code")
          .eq("id", localId)
          .maybeSingle();
        if (cancelled || !data) return;
        if (data.credited_at || data.status === "credited") {
          setVaCredited(true);
          toast.success(
            `${data.currency_code || currency} ${Number(data.amount).toLocaleString()} credited to your wallet`,
          );
          notifyCredited(localId, chargeId);
        }
      } catch {
        /* ignore poll errors */
      }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [va, localId, vaCredited, currency, chargeId]);

  useEffect(() => {
    setCountry(defaultCountry(currency));
  }, [currency]);

  const payAmount = Number(amount);
  const amountOk = Number.isFinite(payAmount) && payAmount > 0;
  const minHint = currency === "NGN" ? "Min ~₦100" : null;

  const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("lenhub-flutter", {
      body: { action, wallet_id: walletId, ...extra },
    });

    let body = (data ?? null) as Record<string, unknown> | null;
    if (error) {
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          body = (await ctx.json()) as Record<string, unknown>;
        }
      } catch { /* ignore */ }
      const msg = String(body?.error || body?.message || error.message || "Request failed");
      throw new Error(msg);
    }
    if (body?.error) throw new Error(String(body.error));
    if (body?.success === false) throw new Error(String(body.message || "Request failed"));
    return body;
  };

  const copyAccount = async () => {
    if (!va?.account_number) return;
    try {
      await navigator.clipboard.writeText(va.account_number);
      setCopied(true);
      toast.success("Account number copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  const submitBank = async () => {
    if (!amountOk) {
      toast.error("Enter how much you want to add");
      return;
    }
    if (currency === "NGN" && payAmount < 100) {
      toast.error("Minimum top-up is ₦100");
      return;
    }
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    setBusy(true);
    try {
      const data = await invoke("virtual_account", {
        currency,
        amount: payAmount,
        email: email.trim(),
        narration: `eFin NGN top-up`,
      });
      const raw = data?.virtual_account as Record<string, unknown> | null | undefined;
      if (!raw?.account_number) {
        throw new Error(String(data?.message || "No account details returned"));
      }
      setLocalId(data?.local_id ? String(data.local_id) : null);
      setChargeId(data?.charge_id ? String(data.charge_id) : null);
      setVaCredited(false);
      setVa({
        account_number: String(raw.account_number),
        account_name: raw.account_name != null ? String(raw.account_name) : null,
        bank_name: raw.bank_name != null ? String(raw.bank_name) : null,
        amount: Number(raw.amount ?? payAmount),
        currency: String(raw.currency || currency),
        order_ref: raw.order_ref != null ? String(raw.order_ref) : null,
        expiry: raw.expiry != null ? String(raw.expiry) : null,
      });
      toast.success("Transfer details ready — pay from your bank app");
      onComplete?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create transfer account");
    } finally {
      setBusy(false);
    }
  };

  /** Lenhub often never sends VA success webhooks — let the payer confirm after transfer. */
  const confirmPaid = async () => {
    if (!localId && !chargeId && !va?.account_number) {
      toast.error("Missing payment reference — create a new transfer account.");
      return;
    }
    setBusy(true);
    try {
      const data = await invoke("settle_va", {
        local_id: localId,
        charge_id: chargeId || va?.order_ref,
        account_number: va?.account_number,
      });
      if (data?.credited || data?.already_credited) {
        setVaCredited(true);
        toast.success(
          `${data?.currency || currency} ${Number(data?.amount || va?.amount || 0).toLocaleString()} credited to your wallet`,
        );
        notifyCredited(localId, chargeId);
      } else {
        throw new Error(String(data?.message || data?.reason || "Could not credit wallet"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm payment");
    } finally {
      setBusy(false);
    }
  };

  const digRedirect = (obj: unknown): string | null => {
    if (!obj || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = digRedirect(item);
        if (found) return found;
      }
      return null;
    }
    const rec = obj as Record<string, unknown>;
    for (const k of ["url", "redirect_url", "redirectUrl", "authurl", "authUrl"]) {
      const v = rec[k];
      if (v != null && String(v).trim().startsWith("http")) return String(v).trim();
    }
    for (const nest of ["message", "data", "status", "provider"]) {
      const found = digRedirect(rec[nest]);
      if (found) return found;
    }
    return null;
  };

  const digNextType = (obj: unknown): string | null => {
    const known = new Set([
      "pin",
      "otp",
      "redirect",
      "avs",
      "additional_fields",
      "send_pin",
      "send_otp",
      "validateotp",
      "validate_otp",
    ]);
    const walk = (node: unknown): string | null => {
      if (!node || typeof node !== "object") return null;
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = walk(item);
          if (found) return found;
        }
        return null;
      }
      const rec = node as Record<string, unknown>;
      if (rec.type != null) {
        const t = String(rec.type).trim().toLowerCase();
        if (known.has(t) || t.includes("redirect") || t.includes("3ds")) return t;
      }
      for (const nest of ["message", "data", "status", "provider"]) {
        const found = walk(rec[nest]);
        if (found) return found;
      }
      return null;
    };
    return walk(obj);
  };

  /** Map provider hints to a known step. Avoid naive includes("otp") — it matched "pin_or_otp_or_avs". */
  const normalizeAuthHint = (raw: string): "redirect" | "otp" | "pin" | "avs" | "" => {
    const n = raw.toLowerCase().trim();
    if (!n || n === "pin_or_otp_or_avs" || n === "pin_or_otp") return "";
    if (n === "redirect" || n.includes("redirect") || n.includes("3ds")) return "redirect";
    if (n === "otp" || n === "send_otp" || n === "validateotp" || n === "validate_otp") return "otp";
    if (n === "pin" || n === "send_pin") return "pin";
    if (n === "avs" || n === "additional_fields" || n.includes("additional")) return "avs";
    return "";
  };

  const followNextAction = (
    nextRaw: string,
    redirectRaw: string,
    provider: unknown,
    fallback: Step,
  ) => {
    const next = normalizeAuthHint(nextRaw || digNextType(provider) || "");
    const redirectUrl = (redirectRaw || digRedirect(provider) || "").trim();
    if ((next === "redirect" || Boolean(redirectUrl)) && redirectUrl.startsWith("http")) {
      toast.success("Redirecting to your bank to authorize…");
      window.location.assign(redirectUrl);
      return;
    }
    if (next === "redirect" && !redirectUrl) {
      toast.error("Bank redirect required, but no URL came back. Try again or use bank transfer.");
      setStep("details");
      return;
    }
    if (next === "avs") {
      setStep("avs");
      toast.success("Enter billing address to continue");
      return;
    }
    if (next === "otp") {
      setStep("otp");
      toast.message("Enter the OTP only if your bank/SMS sent one");
      return;
    }
    if (next === "pin") {
      setStep("pin");
      toast.success("Enter your card PIN");
      return;
    }
    // No clear next step from Lenhub — don't invent OTP (users never get an SMS).
    if (fallback === "otp") {
      toast.message(
        "Bank did not ask for an OTP. If a code arrives, enter it below; otherwise tap Skip or use bank transfer.",
      );
      setStep("otp");
      return;
    }
    setStep(fallback);
  };

  const submitCard = async () => {
    if (!amountOk) {
      toast.error("Enter how much you want to add");
      return;
    }
    if (currency === "NGN" && payAmount < 100) {
      toast.error("Minimum top-up is ₦100");
      return;
    }
    const pan = cardNumber.replace(/\s+/g, "");
    if (pan.length < 12) {
      toast.error("Enter a valid card number");
      return;
    }
    if (!expMonth || !expYear || !cvv) {
      toast.error("Enter expiry and CVV");
      return;
    }
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    setBusy(true);
    try {
      const data = await invoke("card_create", {
        currency,
        amount: payAmount,
        email: email.trim(),
        card_number: pan,
        expiry_date_month: expMonth.padStart(2, "0"),
        expiry_date_year: expYear,
        cvv,
      });
      const nextChargeId = String(
        data?.charge_id ||
          data?.chargeId ||
          "",
      ).trim() || null;

      const provider = data?.provider as Record<string, unknown> | undefined;
      const dig = (obj: unknown): string | null => {
        if (!obj || typeof obj !== "object") return null;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = dig(item);
            if (found) return found;
          }
          return null;
        }
        const rec = obj as Record<string, unknown>;
        for (const k of ["chargeId", "charge_id", "id"]) {
          if (rec[k] != null && String(rec[k]).trim()) return String(rec[k]).trim();
        }
        for (const nest of ["message", "data", "status"]) {
          const found = dig(rec[nest]);
          if (found) return found;
        }
        return null;
      };
      const deepId = nextChargeId || dig(provider);

      setLocalId(data?.local_id ? String(data.local_id) : null);
      setChargeId(deepId);
      setCardNumber("");
      setCvv("");

      if (!deepId) {
        toast.error(
          "Card was submitted but no charge ID came back. Try Skip to continue, or retry with another card.",
        );
        setStep("avs");
        return;
      }

      const next = String(data?.next_action || "").toLowerCase();
      const redirectUrl = String(data?.redirect_url || "").trim();
      followNextAction(next, redirectUrl, provider ?? data, "pin");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Card charge failed");
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async () => {
    if (!chargeId) {
      toast.error("Missing charge ID — use Skip, or go back and retry the card.");
      return;
    }
    if (!pin.trim()) {
      toast.error("Enter your card PIN");
      return;
    }
    setBusy(true);
    try {
      const data = await invoke("card_pin", { charge_id: chargeId, local_id: localId, pin });
      setPin("");
      followNextAction(
        String(data?.next_action || ""),
        String(data?.redirect_url || ""),
        data?.provider ?? data,
        "otp",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PIN failed");
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async () => {
    if (!chargeId) {
      toast.error("Missing charge ID — use Skip, or retry the card.");
      return;
    }
    if (!otp.trim()) {
      toast.error("Enter the OTP");
      return;
    }
    setBusy(true);
    try {
      const data = await invoke("card_otp", { charge_id: chargeId, local_id: localId, otp });
      setOtp("");
      followNextAction(
        String(data?.next_action || ""),
        String(data?.redirect_url || ""),
        data?.provider ?? data,
        "avs",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OTP failed");
    } finally {
      setBusy(false);
    }
  };

  const submitAvs = async () => {
    if (!chargeId) {
      toast.error("Missing charge ID — go back and pay with the card again.");
      return;
    }
    if (!line1.trim() || !city.trim() || !country.trim() || !postal.trim() || !state.trim()) {
      toast.error("Fill in street, city, state, postal code, and country");
      return;
    }
    setBusy(true);
    try {
      const data = await invoke("card_confirm", {
        charge_id: chargeId,
        local_id: localId,
        city: city.trim(),
        country: country.trim().toUpperCase(),
        line1: line1.trim(),
        line2: line2.trim() || "",
        postal_code: postal.trim(),
        state: state.trim(),
      });
      const redirect = String(data?.redirect_url || "").trim();
      if (redirect.startsWith("http")) {
        followNextAction(String(data?.next_action || ""), redirect, data?.provider ?? data, "done");
        return;
      }
      setStep("done");
      toast.success("Payment submitted — wallet updates when confirmed");
      // Credit notify via poll below (webhook may lag)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  };

  // After card auth completes, poll until wallet credited (for Send resume / onCredited)
  useEffect(() => {
    if (step !== "done" || !localId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await looseDb
          .from("lenhub_flutter_charges")
          .select("status, credited_at, amount, currency_code")
          .eq("id", localId)
          .maybeSingle();
        if (cancelled || !data) return;
        if (data.credited_at || data.status === "credited") {
          toast.success(
            `${data.currency_code || currency} ${Number(data.amount).toLocaleString()} credited to your wallet`,
          );
          notifyCredited(localId, chargeId);
          cancelled = true;
        }
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, localId, chargeId, currency]);

  const title = currency === "NGN" ? "NGN card or bank" : "Card (direct)";
  const description =
    currency === "NGN"
      ? "Pay with your Nigerian card or transfer from any bank app. Wallet updates when payment confirms."
      : `Pay in ${currency}. Enter the amount to add to your wallet, then your card details.`;

  const hideAmountField = Boolean(initialAmount);
  const amountEmailFields = (
    <div className={hideAmountField ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
      {!hideAmountField && (
      <div className="space-y-2">
        <Label htmlFor="lf-amount">Amount ({currency})</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {sym}
          </span>
          <Input
            id="lf-amount"
            className="pl-9"
            inputMode="decimal"
            placeholder={currency === "NGN" ? "1000" : "0.00"}
            value={amount}
            readOnly={Boolean(amountReadOnly && fixedAmount != null)}
            onChange={(e) => {
              if (amountReadOnly && fixedAmount != null) return;
              setAmount(e.target.value.replace(/[^\d.]/g, ""));
            }}
          />
        </div>
        {minHint && <p className="text-xs text-muted-foreground">{minHint}</p>}
      </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="lf-email">Email</Label>
        <Input
          id="lf-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {supportsBank && step === "details" && !va && (
          <Tabs value={payMode} onValueChange={(v) => setPayMode(v as "card" | "bank")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="card" className="gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                Card
              </TabsTrigger>
              <TabsTrigger value="bank" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Bank transfer
              </TabsTrigger>
            </TabsList>

            <TabsContent value="card" className="mt-4 space-y-5">
              {amountEmailFields}
              <div className="space-y-2">
                <Label htmlFor="lf-pan">Card number</Label>
                <Input
                  id="lf-pan"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="5399 … or your Naira card"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lf-mm">Month</Label>
                  <Input
                    id="lf-mm"
                    inputMode="numeric"
                    placeholder="MM"
                    maxLength={2}
                    value={expMonth}
                    onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lf-yy">Year</Label>
                  <Input
                    id="lf-yy"
                    inputMode="numeric"
                    placeholder="YY"
                    maxLength={4}
                    value={expYear}
                    onChange={(e) => setExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lf-cvv">CVV</Label>
                  <Input
                    id="lf-cvv"
                    type="password"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="•••"
                    maxLength={4}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </div>
              </div>
              <Button className="w-full" size="lg" disabled={busy || !amountOk} onClick={submitCard}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : amountOk ? (
                  `Pay ${sym}${payAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ) : (
                  "Enter amount to continue"
                )}
              </Button>
            </TabsContent>

            <TabsContent value="bank" className="mt-4 space-y-5">
              {amountEmailFields}
              <p className="text-sm text-muted-foreground">
                We create a one-time Naira account. Transfer the exact amount from your bank app — wallet credits after confirmation.
              </p>
              <Button className="w-full" size="lg" disabled={busy || !amountOk} onClick={submitBank}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : amountOk ? (
                  `Get account for ${sym}${payAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ) : (
                  "Enter amount to continue"
                )}
              </Button>
            </TabsContent>
          </Tabs>
        )}

        {supportsBank && va && (
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium">Transfer exactly this amount</p>
            <div className="text-2xl font-semibold tracking-tight">
              {sym}
              {Number(va.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-base font-normal text-muted-foreground">{va.currency}</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-muted-foreground">Account number</p>
                  <p className="font-mono text-base font-semibold tracking-wide">{va.account_number}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={copyAccount}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div>
                <p className="text-muted-foreground">Bank</p>
                <p className="font-medium">{va.bank_name || "Check your bank app after pasting the account number"}</p>
              </div>
              {va.account_name && !/^please make a bank transfer/i.test(va.account_name) && (
                <div>
                  <p className="text-muted-foreground">Account name</p>
                  <p className="font-medium">{va.account_name}</p>
                </div>
              )}
              {(va.order_ref || localId) && (
                <div>
                  <p className="text-muted-foreground">Reference</p>
                  <p className="font-mono text-xs">{va.order_ref || localId}</p>
                </div>
              )}
              {va.expiry && (
                <p className="text-xs text-amber-700">
                  Expires: {Number.isNaN(Date.parse(va.expiry)) ? va.expiry : new Date(va.expiry).toLocaleString()}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {vaCredited
                ? "Payment confirmed — your NGN wallet has been credited."
                : "Transfer the exact amount to this account at the bank shown. Your bank app may display a Flutterwave / merchant name — that is normal. After you pay, tap I’ve paid below (Lenhub often does not send the automatic webhook)."}
            </p>
            {vaCredited && (
              <p className="text-sm font-medium text-emerald-700">Wallet credited successfully</p>
            )}
            {!vaCredited && (
              <Button className="w-full" size="lg" disabled={busy} onClick={confirmPaid}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "I’ve paid — credit my wallet"}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setVa(null);
                setAmount("");
                setVaCredited(false);
              }}
            >
              New amount
            </Button>
          </div>
        )}

        {!supportsBank && step === "details" && (
          <>
            {amountEmailFields}
            <div className="space-y-2">
              <Label htmlFor="lf-pan">Card number</Label>
              <Input
                id="lf-pan"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="lf-mm">Month</Label>
                <Input
                  id="lf-mm"
                  inputMode="numeric"
                  placeholder="MM"
                  maxLength={2}
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lf-yy">Year</Label>
                <Input
                  id="lf-yy"
                  inputMode="numeric"
                  placeholder="YY"
                  maxLength={4}
                  value={expYear}
                  onChange={(e) => setExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lf-cvv">CVV</Label>
                <Input
                  id="lf-cvv"
                  type="password"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="•••"
                  maxLength={4}
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
            </div>
            <Button className="w-full" size="lg" disabled={busy || !amountOk} onClick={submitCard}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : amountOk ? (
                `Pay ${sym}${payAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                "Enter amount to continue"
              )}
            </Button>
          </>
        )}

        {step === "pin" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paying {sym}{payAmount.toLocaleString()} {currency}. Enter your card PIN if your bank asks for it.
            </p>
            {!chargeId && (
              <p className="text-sm text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                No charge ID from the provider — PIN cannot be submitted. Use Skip, or refresh and try again.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="lf-pin">Card PIN</Label>
              <Input
                id="lf-pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy || !pin || !chargeId} onClick={submitPin}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit PIN"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  toast.message("If your bank uses a web page to authorize, cancel and retry the card — we should redirect automatically.");
                  setStep("avs");
                }}
              >
                Skip
              </Button>
            </div>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Only enter a code if your bank actually sent one by SMS. Many cards authorize on a bank web page instead — if you got no SMS, tap Skip or switch to bank transfer.
            </p>
            <div className="space-y-2">
              <Label htmlFor="lf-otp">One-time code (OTP)</Label>
              <Input
                id="lf-otp"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy || !otp} onClick={submitOtp}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit OTP"}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setStep("avs")}>
                Skip
              </Button>
            </div>
          </div>
        )}

        {step === "avs" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Billing address for card verification (AVS). Matches Lenhub confirm_payment fields.
            </p>
            <div className="space-y-2">
              <Label htmlFor="lf-line1">Street address</Label>
              <Input id="lf-line1" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="178 Brookfield Crescent" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lf-line2">Address line 2 (optional)</Label>
              <Input id="lf-line2" value={line2} onChange={(e) => setLine2(e.target.value)} placeholder="Apt, suite, unit…" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lf-city">City</Label>
                <Input id="lf-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lf-state">State / province</Label>
                <Input id="lf-state" value={state} onChange={(e) => setState(e.target.value)} placeholder="Manitoba" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lf-postal">Postal code</Label>
                <Input id="lf-postal" value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="R3Y 0L7" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lf-country">Country (ISO)</Label>
                <Input
                  id="lf-country"
                  placeholder={currency === "NGN" ? "NG" : "CA"}
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                />
              </div>
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={busy || !line1 || !city || !country || !postal || !state}
              onClick={submitAvs}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm payment"}
            </Button>
          </div>
        )}

        {step === "done" && (
          <p className="text-sm text-muted-foreground">
            Payment submitted for {sym}{payAmount.toLocaleString()} {currency}. Your wallet will update once the provider confirms.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
