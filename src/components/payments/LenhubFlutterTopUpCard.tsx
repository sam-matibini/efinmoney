import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currencySymbol } from "@/lib/currency";
import { useAuth } from "@/hooks/useAuth";
import { CreditCard, Loader2 } from "lucide-react";

type Step = "details" | "pin" | "otp" | "avs" | "done";

interface Props {
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/**
 * Lenhub Flutter card collect — USD/CAD/EUR/GBP + African wallet currencies.
 * Card data is posted only to our edge function (never stored in DB).
 */
export default function LenhubFlutterTopUpCard({ walletId, walletCurrency, onComplete }: Props) {
  const { user } = useAuth();
  const currency = walletCurrency.toUpperCase();
  const sym = currencySymbol(currency);

  const [step, setStep] = useState<Step>("details");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
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
  const [country, setCountry] = useState(currency === "CAD" ? "CA" : currency === "USD" ? "US" : "");
  const [line1, setLine1] = useState("");
  const [postal, setPostal] = useState("");
  const [state, setState] = useState("");

  useEffect(() => {
    if (!email && user?.email) setEmail(user.email);
  }, [user?.email, email]);

  const payAmount = Number(amount);
  const amountOk = Number.isFinite(payAmount) && payAmount > 0;

  const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("lenhub-flutter", {
      body: { action, wallet_id: walletId, ...extra },
    });

    // Supabase puts non-2xx bodies in error.context; data may still hold JSON
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

  const submitCard = async () => {
    if (!amountOk) {
      toast.error("Enter how much you want to add");
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
          (data?.provider as Record<string, unknown> | undefined)?.charge_id ||
          "",
      ).trim() || null;
      // Dig deeper into provider payload if needed
      const provider = data?.provider as Record<string, unknown> | undefined;
      const deepId =
        nextChargeId ||
        String(
          (provider?.message as Record<string, unknown> | undefined)?.id ||
            (provider?.data as Record<string, unknown> | undefined)?.id ||
            (provider?.data as Record<string, unknown> | undefined)?.chargeId ||
            "",
        ).trim() ||
        null;

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
      setStep("pin");
      toast.success("Card accepted — enter PIN if asked, or skip");
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
      await invoke("card_pin", { charge_id: chargeId, local_id: localId, pin });
      setPin("");
      setStep("otp");
      toast.success("PIN sent — enter OTP if required");
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
      await invoke("card_otp", { charge_id: chargeId, local_id: localId, otp });
      setOtp("");
      setStep("avs");
      toast.success("OTP accepted — confirm billing address");
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
    setBusy(true);
    try {
      await invoke("card_confirm", {
        charge_id: chargeId,
        local_id: localId,
        city,
        country,
        line1,
        postal_code: postal,
        state,
      });
      setStep("done");
      toast.success("Payment submitted — wallet updates when confirmed");
      onComplete?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          Card (direct)
        </CardTitle>
        <CardDescription>
          Pay in {currency}. Enter the amount to add to your wallet, then your card details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {step === "details" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
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
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  />
                </div>
              </div>
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
              <Button variant="outline" disabled={busy} onClick={() => setStep("otp")}>
                Skip
              </Button>
            </div>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4">
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
            <p className="text-sm text-muted-foreground">Billing address for card verification.</p>
            <div className="space-y-2">
              <Label htmlFor="lf-line1">Street address</Label>
              <Input id="lf-line1" value={line1} onChange={(e) => setLine1(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lf-city">City</Label>
                <Input id="lf-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lf-state">State / province</Label>
                <Input id="lf-state" value={state} onChange={(e) => setState(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lf-postal">Postal code</Label>
                <Input id="lf-postal" value={postal} onChange={(e) => setPostal(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lf-country">Country</Label>
                <Input
                  id="lf-country"
                  placeholder="CA"
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
