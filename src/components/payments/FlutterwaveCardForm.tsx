import { useMemo, useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { minAmount, validateMinAmount } from "@/lib/flutterwave";
import { cardBrandClass, cardBrandLabel } from "@/lib/cardBrand";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Lock, ShieldCheck } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CurrencyFlag } from "@/components/ui/FlagImage";

interface Props {
  defaultWalletId?: string;
  defaultAmount?: number;
  lockAmount?: boolean;
  showWalletSelect?: boolean;
  onSuccess?: (info: { amount: number; currency: string; walletId: string }) => void;
  ctaLabel?: string;
}

type Stage = "idle" | "charging" | "auth" | "verifying" | "crediting" | "success";

const STAGE_COPY: Record<Exclude<Stage, "idle" | "success">, { title: string; sub: string }> = {
  charging: { title: "Charging your card…", sub: "Securely processing your payment" },
  auth: { title: "Verifying your identity…", sub: "Please complete the security check" },
  verifying: { title: "Verifying payment…", sub: "Confirming with your bank" },
  crediting: { title: "Crediting your wallet…", sub: "Almost done" },
};

function detectCardBrand(number: string): string | null {
  const cleaned = number.replace(/\s/g, "");
  if (/^4/.test(cleaned)) return "visa";
  if (/^5[1-5]/.test(cleaned)) return "mastercard";
  if (/^3[47]/.test(cleaned)) return "amex";
  if (/^6(?:011|5)/.test(cleaned)) return "discover";
  if (/^506[0-1]|^650[0-3]/.test(cleaned)) return "verve";
  return null;
}

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})(?=.)/g, "$1 ");
}

function FieldShell({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className={`rounded-lg border bg-muted/30 px-3 py-3.5 transition-colors ${error ? "border-destructive" : "border-border"}`}>
        {children}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SuccessView({ success }: { success: { amount: number; currency: string; symbol: string } }) {
  return (
    <div className="space-y-3 py-6 text-center animate-fade-in">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
      </div>
      <h3 className="text-xl font-display font-bold text-foreground">Payment successful!</h3>
      <p className="text-sm text-muted-foreground">
        {success.symbol}{success.amount.toFixed(2)} added to your {success.currency} wallet
      </p>
    </div>
  );
}

function ProcessingOverlay({ stage }: { stage: Exclude<Stage, "idle" | "success"> }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-md bg-background/85 backdrop-blur-sm animate-fade-in">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
        <LoadingSpinner size={48} className="relative" />
      </div>
      <div className="text-center space-y-1 px-6">
        <h4 className="text-base font-display font-semibold text-foreground">{STAGE_COPY[stage].title}</h4>
        <p className="text-xs text-muted-foreground">{STAGE_COPY[stage].sub}</p>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" /> Secured by eFinMoney
      </div>
    </div>
  );
}

function EfinmoneyBranding() {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <div className="h-6 w-6 rounded-md bg-emerald-600 flex items-center justify-center">
        <span className="text-white text-[10px] font-bold">e</span>
      </div>
      <span className="text-xs text-muted-foreground">
        Payment powered by <span className="font-semibold text-emerald-600">eFinMoney</span>
      </span>
    </div>
  );
}

const CHALLENGE_COPY: Record<string, { title: string; sub: string; label: string; placeholder: string; max: number }> = {
  pin: {
    title: "Enter your card PIN",
    sub: "Your bank requires your card PIN to authorise this payment.",
    label: "Card PIN",
    placeholder: "••••",
    max: 6,
  },
  otp: {
    title: "Enter the one-time code",
    sub: "We sent a one-time code to the phone number / email registered with your bank.",
    label: "One-time code (OTP)",
    placeholder: "••••••",
    max: 8,
  },
};

function ChallengePanel({
  mode,
  loading,
  redirectUrl,
  onSubmitCode,
  onOpenRedirect,
  onCancel,
}: {
  mode: string;
  loading: boolean;
  redirectUrl?: string | null;
  onSubmitCode: (code: string) => void;
  onOpenRedirect: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [mode]);

  const copy = CHALLENGE_COPY[mode] ?? CHALLENGE_COPY.otp;
  const isRedirect = mode === "redirect";

  return (
    <div
      ref={ref}
      className="space-y-4 p-4 rounded-xl border-2 border-amber-500/60 bg-amber-500/5 animate-fade-in"
    >
      <div className="flex items-start gap-2">
        <ShieldCheck className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">Action required — security check</p>
          <p className="text-xs text-muted-foreground">
            {isRedirect
              ? "Complete 3-D Secure verification in the window from your bank. If it didn't open, use the button below."
              : copy.sub}
          </p>
        </div>
      </div>

      {isRedirect ? (
        <Button type="button" size="lg" className="w-full" onClick={onOpenRedirect} disabled={!redirectUrl}>
          Open verification window
        </Button>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-xs">{copy.label}</Label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={copy.max}
              placeholder={copy.placeholder}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-12 text-center text-lg tracking-widest"
              autoFocus
            />
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={code.length < 4 || loading}
            onClick={() => onSubmitCode(code)}
          >
            {loading ? <><LoadingSpinner size={16} className="mr-2" /> Verifying…</> : "Verify & Pay"}
          </Button>
        </>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="w-full text-xs text-muted-foreground underline underline-offset-2"
      >
        Cancel and edit payment details
      </button>
    </div>
  );
}


export default function FlutterwaveCardForm({
  defaultWalletId,
  defaultAmount,
  lockAmount,
  showWalletSelect,
  onSuccess,
  ctaLabel,
}: Props) {
  const queryClient = useQueryClient();
  const { data: wallets } = useWallets();
  const { data: profile } = useProfile();

  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(defaultWalletId);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [billingLine1, setBillingLine1] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [success, setSuccess] = useState<{ amount: number; currency: string; symbol: string } | null>(null);

  // Auth state
  const [authMode, setAuthMode] = useState<string | null>(null);
  const [authRedirect, setAuthRedirect] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingChargeId, setPendingChargeId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (defaultAmount !== undefined) setAmount(String(defaultAmount));
  }, [defaultAmount]);

  useEffect(() => {
    if (defaultWalletId) setSelectedWalletId(defaultWalletId);
  }, [defaultWalletId]);

  useEffect(() => {
    if (!cardholderName && profile?.full_name) setCardholderName(profile.full_name.toUpperCase());
  }, [profile?.full_name, cardholderName]);

  const openRedirectPopup = () => {
    if (!authRedirect) return;
    const width = 500; const height = 620;
    const left = (screen.width - width) / 2; const top = (screen.height - height) / 2;
    const popup = window.open(authRedirect, "flw_auth", `width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) {
      toast.error("Pop-up blocked — use the 'Open verification window' button to continue");
      return;
    }
    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval);
        setStage("verifying");
        verifyAndCredit().finally(() => setStage("idle"));
      }
    }, 500);
  };

  useEffect(() => {
    if (authMode === "redirect" && authRedirect) openRedirectPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, authRedirect]);


  const wallet = wallets?.find((w) => w.wallet_id === (selectedWalletId ?? defaultWalletId)) ?? wallets?.[0];
  const currency = wallet?.currency_code ?? "USD";
  const symbol = wallet?.symbol ?? "$";
  const amountNum = parseFloat(amount) || 0;

  const parsedExpiry = useMemo(() => {
    const raw = expiry.replace(/\D/g, "").slice(0, 4);
    if (raw.length >= 3) return { month: raw.slice(0, 2), year: raw.slice(2) };
    if (raw.length === 2) {
      const m = parseInt(raw);
      if (m > 12) return { month: raw.slice(0, 1), year: raw.slice(1) };
      return { month: raw, year: "" };
    }
    return { month: raw, year: "" };
  }, [expiry]);

  const cardBrand = detectCardBrand(cardNumber);
  const cardValid = cardNumber.replace(/\s/g, "").length >= 13 && parsedExpiry.month.length === 2 && cvc.length >= 3;

  const formatExpiryDisplay = (val: string) => {
    const d = val.replace(/\D/g, "").slice(0, 4);
    if (d.length >= 3) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return d;
  };

  const buildChargePayload = () => ({
    card_number: cardNumber.replace(/\s/g, ""),
    cvv: cvc,
    expiry_month: parsedExpiry.month,
    expiry_year: parsedExpiry.year,
    amount: amountNum,
    currency,
    fullname: cardholderName.trim(),
    wallet_id: wallet?.wallet_id ?? "",
    billing_address: billingLine1.trim() || undefined,
    billing_city: billingCity.trim() || undefined,
    billing_zip: billingZip.trim() || undefined,
    redirect_url: `${window.location.origin}/payment-callback?type=flw_card`,
  });

  const applyAuthResponse = (data: any) => {
    const am = String(data?.auth?.mode || "otp");
    const cid = data?.charge_id ? String(data.charge_id) : null;
    if (cid) setPendingChargeId(cid);
    if (am === "redirect" && data?.auth?.redirect) setAuthRedirect(String(data.auth.redirect));
    setAuthMode(am);
    setStage("auth");
  };

  const verifyAndCredit = async () => {
    if (!lastPayload && !pendingChargeId) return;
    try {
      // Confirm the existing charge rather than re-posting card data (avoids a second charge).
      const body: Record<string, unknown> = pendingChargeId
        ? {
            charge_id: pendingChargeId,
            amount: amountNum,
            currency,
            wallet_id: wallet?.wallet_id ?? "",
          }
        : { ...(lastPayload as Record<string, unknown>) };
      const { data, error } = await supabase.functions.invoke("flw-card-charge", { body });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Payment failed");
      if (data?.requires_auth) {
        applyAuthResponse(data);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      await queryClient.invalidateQueries({ queryKey: ["ledger-deposits"] });
      setAuthMode(null);
      setSuccess({ amount: amountNum, currency, symbol });
      onSuccess?.({ amount: amountNum, currency, walletId: wallet?.wallet_id ?? "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    }
  };


  const handleCharge = async (extraPayload?: Record<string, unknown>) => {
    const payload = extraPayload || buildChargePayload();

    try {
      setAuthLoading(true);
      const { data, error } = await supabase.functions.invoke("flw-card-charge", { body: payload });
      if (error) throw new Error(error.message);
      if (!data?.success) {
        const msg = data?.error || "Payment failed";
        if (data?.code === "error" && msg.toLowerCase().includes("pin")) {
          setLastPayload({ ...payload, pin: undefined });
          setAuthMode("pin");
          setStage("auth");
          return;
        }
        throw new Error(msg);
      }

      setLastPayload(payload);

      if (data?.requires_auth) {
        applyAuthResponse(data);
        return;
      }

      setAuthMode(null);


      // Direct success
      setStage("crediting");
      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      await queryClient.invalidateQueries({ queryKey: ["ledger-deposits"] });
      setSuccess({ amount: amountNum, currency, symbol });
      onSuccess?.({ amount: amountNum, currency, walletId: wallet?.wallet_id ?? "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
      setStage("idle");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleChallengeSubmit = (code: string) => {
    if (!lastPayload) return;
    const mode = authMode === "pin" ? "pin" : "otp";
    const auth = mode === "pin" ? { mode: "pin", pin: code } : { mode: "otp", otp: code };
    handleCharge({
      ...lastPayload,
      authorization: auth,
      ...(pendingChargeId ? { charge_id: pendingChargeId } : {}),
    });
  };

  const cancelChallenge = () => {
    setAuthMode(null);
    setAuthRedirect(null);
    setPendingChargeId(null);
    setStage("idle");
  };


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (amountNum <= 0) { toast.error("Enter a valid amount"); return; }
    if (!cardNumber.replace(/\s/g, "")) { toast.error("Enter a card number"); return; }
    if (cardNumber.replace(/\s/g, "").length < 13) { toast.error("Card number is too short"); return; }
    if (!parsedExpiry.month || !parsedExpiry.year) { toast.error("Enter expiry date"); return; }
    if (!cvc || cvc.length < 3) { toast.error("Enter CVC"); return; }
    if (!cardholderName.trim()) { toast.error("Cardholder name is required"); return; }
    if (!wallet?.wallet_id) { toast.error("Select a wallet"); return; }
    const minErr = validateMinAmount(currency, amountNum);
    if (minErr) { toast.error(minErr); return; }

    setStage("charging");
    setLastPayload(buildChargePayload());
    handleCharge();
  };

  if (success) return <SuccessView success={success} />;

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="space-y-4">
        {showWalletSelect && wallets && wallets.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Deposit into wallet</Label>
            <Select value={wallet?.wallet_id} onValueChange={setSelectedWalletId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.wallet_id} value={w.wallet_id}>
                    <span className="inline-flex items-center gap-2"><CurrencyFlag code={w.currency_code} size="sm" />{w.currency_code} — {w.symbol}{Number(w.balance).toFixed(2)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs">Amount ({currency})</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            disabled={lockAmount}
            className="h-12 text-lg"
          />
          <p className="text-xs text-muted-foreground">Minimum: {minAmount(currency)} {currency}</p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Cardholder name</Label>
          <Input
            placeholder="JOHN DOE"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
            maxLength={50}
            autoComplete="cc-name"
          />
        </div>

        <FieldShell label="Card number">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                type="text"
                inputMode="numeric"
                value={cardNumber}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 16);
                  const formatted = digits.replace(/(.{4})(?=.)/g, "$1 ");
                  setCardNumber(formatted);
                }}
                placeholder="0000 0000 0000 0000"
                autoComplete="cc-number"
                className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            {cardBrand ? (
              <div className={`h-5 w-8 rounded bg-gradient-to-br ${cardBrandClass(cardBrand)} shrink-0`} />
            ) : (
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </div>
        </FieldShell>

        <div className="grid grid-cols-2 gap-3">
          <FieldShell label="Expiry (MM/YY)">
            <input
              type="text"
              inputMode="numeric"
              value={formatExpiryDisplay(expiry)}
              onChange={(e) => setExpiry(e.target.value)}
              placeholder="MM/YY"
              autoComplete="cc-exp"
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
            />
          </FieldShell>
          <FieldShell label="CVC">
            <input
              type="text"
              inputMode="numeric"
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="•••"
              autoComplete="cc-csc"
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
            />
          </FieldShell>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Billing street <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            placeholder="123 Main St"
            value={billingLine1}
            onChange={(e) => setBillingLine1(e.target.value)}
            autoComplete="address-line1"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">City <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              placeholder="City"
              value={billingCity}
              onChange={(e) => setBillingCity(e.target.value)}
              autoComplete="address-level2"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">ZIP <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              placeholder="10001"
              value={billingZip}
              onChange={(e) => setBillingZip(e.target.value.toUpperCase())}
              maxLength={10}
              autoComplete="postal-code"
            />
          </div>
        </div>

        {authMode && (
          <ChallengePanel
            mode={authMode}
            loading={authLoading}
            redirectUrl={authRedirect}
            onSubmitCode={handleChallengeSubmit}
            onOpenRedirect={openRedirectPopup}
            onCancel={cancelChallenge}
          />
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={stage !== "idle" || !!authMode}
        >
          {stage === "charging" ? (
            <><LoadingSpinner size={16} className="mr-2" /> Processing…</>
          ) : (
            ctaLabel ?? `Pay ${symbol}${amountNum.toFixed(2)} ${currency}`
          )}
        </Button>


        <EfinmoneyBranding />
      </form>

      {stage !== "idle" && stage !== "success" && <ProcessingOverlay stage={stage as Exclude<Stage, "idle" | "success">} />}
    </div>
  );
}
