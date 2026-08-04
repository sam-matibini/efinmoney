import { useEffect, useMemo, useState } from "react";
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeElementChangeEvent } from "@stripe/stripe-js";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { useSavedCards, type SavedCard } from "@/hooks/useSavedCards";
import { getStripe, getStripeLoadError } from "@/lib/stripe";
import { STRIPE_PAYMENTS_ENABLED, STRIPE_DISABLED_MESSAGE } from "@/lib/stripeDisabled";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import {
  billingCountryForWalletCurrency,
  formatStripePaymentError,
  isStripeTestMode,
  STRIPE_TEST_CARD_HINT,
  STRIPE_VIRTUAL_CARD_HINT,
} from "@/lib/stripeBilling";
import { cardBrandClass, cardBrandLabel } from "@/lib/cardBrand";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, CreditCard, Lock, Plus } from "lucide-react";
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

type ProcessingStage = "auth" | "charge" | "credit" | null;

const STAGE_COPY: Record<Exclude<ProcessingStage, null>, { title: string; sub: string }> = {
  auth: { title: "Authorizing your card…", sub: "Securely contacting your bank" },
  charge: { title: "Processing payment…", sub: "Confirming with your card issuer" },
  credit: { title: "Crediting your wallet…", sub: "Almost done" },
};

function resolveCssColor(value: string, fallback: string) {
  if (typeof window === "undefined" || !value) return fallback;
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color || fallback;
  document.body.removeChild(probe);
  return resolved;
}

function getThemeColors() {
  if (typeof window === "undefined") {
    return { text: "rgb(15, 23, 42)", placeholder: "rgb(148, 163, 184)" };
  }
  const styles = getComputedStyle(document.documentElement);
  const fg = styles.getPropertyValue("--foreground").trim();
  const muted = styles.getPropertyValue("--muted-foreground").trim();
  return {
    text: resolveCssColor(fg ? `hsl(${fg})` : "", "rgb(15, 23, 42)"),
    placeholder: resolveCssColor(muted ? `hsl(${muted})` : "", "rgb(148, 163, 184)"),
  };
}

function buildElementOptions() {
  const { text, placeholder } = getThemeColors();
  return {
    style: {
      base: {
        color: text,
        fontSize: "16px",
        fontFamily: "Inter, system-ui, sans-serif",
        "::placeholder": { color: placeholder },
        iconColor: text,
      },
      invalid: { color: "#ef4444", iconColor: "#ef4444" },
    },
  } as const;
}

function FieldShell({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div
        className={`rounded-lg border bg-muted/30 px-3 py-3.5 transition-colors ${
          error ? "border-destructive" : "border-border"
        }`}
      >
        {children}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SuccessView({
  success,
}: {
  success: { amount: number; currency: string; symbol: string };
}) {
  return (
    <div className="space-y-3 py-6 text-center animate-fade-in">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-xl font-display font-bold text-foreground">Payment successful!</h3>
      <p className="text-sm text-muted-foreground">
        {success.symbol}{success.amount.toFixed(2)} added to your {success.currency} wallet
      </p>
    </div>
  );
}

function ProcessingOverlay({ stage }: { stage: Exclude<ProcessingStage, null> }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-md bg-background/85 backdrop-blur-sm animate-fade-in">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
        <LoadingSpinner size={48} className="relative" />
      </div>
      <div className="text-center space-y-1 px-6">
        <h4 className="text-base font-display font-semibold text-foreground">{STAGE_COPY[stage].title}</h4>
        <p className="text-xs text-muted-foreground">{STAGE_COPY[stage].sub}</p>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" /> Please do not close this window
      </div>
    </div>
  );
}

function SavedCardPicker({
  cards,
  selectedId,
  onSelect,
}: {
  cards: SavedCard[];
  selectedId: string;
  onSelect: (pmId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Select a saved card</Label>
      {cards.map((c) => {
        const id = c.stripe_payment_method_id;
        const checked = selectedId === id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(id)}
            className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition ${
              checked ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/40"
            }`}
          >
            <div
              className={`w-12 h-8 rounded-md bg-gradient-to-br ${cardBrandClass(c.card_brand)} flex items-center justify-center text-white text-[10px] font-bold uppercase tracking-wider shrink-0`}
            >
              {cardBrandLabel(c.card_brand).slice(0, 4)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {cardBrandLabel(c.card_brand)} •••• {c.last_four}
                {c.is_default && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">Default</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.cardholder_name ? `${c.cardholder_name} • ` : ""}
                Exp {String(c.exp_month ?? "").padStart(2, "0")}/{String(c.exp_year ?? "").slice(-2)}
                {c.currency_code ? ` • ${c.currency_code}` : ""}
              </p>
            </div>
            {checked && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

function SavedCardTopUp({
  wallets,
  savedCards,
  defaultWalletId,
  defaultAmount,
  lockAmount,
  showWalletSelect,
  onSuccess,
  ctaLabel,
}: Props & { wallets: ReturnType<typeof useWallets>["data"]; savedCards: SavedCard[] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(defaultWalletId);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [selectedPmId, setSelectedPmId] = useState("");
  const [showNewCard, setShowNewCard] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>(null);
  const [success, setSuccess] = useState<{ amount: number; currency: string; symbol: string } | null>(null);

  useEffect(() => {
    if (defaultAmount !== undefined) setAmount(String(defaultAmount));
  }, [defaultAmount]);

  useEffect(() => {
    if (defaultWalletId) setSelectedWalletId(defaultWalletId);
  }, [defaultWalletId]);

  useEffect(() => {
    if (selectedPmId) return;
    const def =
      savedCards.find((c) => c.is_default)?.stripe_payment_method_id
      ?? savedCards[0]?.stripe_payment_method_id;
    if (def) setSelectedPmId(def);
  }, [savedCards, selectedPmId]);

  const wallet = wallets?.find((item) => item.wallet_id === (selectedWalletId ?? defaultWalletId)) ?? wallets?.[0];
  const currency = wallet?.currency_code ?? "USD";
  const symbol = wallet?.symbol ?? "$";
  const amountNum = parseFloat(amount) || 0;

  const chargeSavedCard = async () => {
    if (!wallet?.wallet_id) return toast.error("Please select a wallet");
    if (amountNum <= 0) return toast.error("Enter a valid amount");
    if (!selectedPmId) return toast.error("Select a saved card");

    setProcessing(true);
    setProcessingStage("charge");

    try {
      const { data, error } = await supabase.functions.invoke("stripe-charge-saved-card", {
        body: {
          payment_method_id: selectedPmId,
          amount: amountNum,
          currency,
          wallet_id: wallet.wallet_id,
          purpose: "wallet_topup",
        },
      });

      if (error) {
        let serverMsg = error.message || "Card charge failed";
        try {
          const ctx: unknown = (error as { context?: unknown }).context;
          if (ctx && typeof ctx === "object" && ctx !== null && "json" in ctx) {
            const j = await (ctx as { json: () => Promise<{ error?: string }> }).json();
            serverMsg = j?.error || serverMsg;
          }
        } catch {
          /* ignore */
        }
        throw new Error(serverMsg);
      }

      if (!data?.success) {
        const code = data?.code as string | undefined;
        const friendly: Record<string, string> = {
          insufficient_funds: "Your card has insufficient funds.",
          card_declined: "Your bank declined this charge.",
          expired_card: "This card has expired. Link a new one on the Cards page.",
        };
        throw new Error(friendly[code ?? ""] || data?.error || "Card charge failed");
      }

      setProcessingStage("credit");
      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      await queryClient.invalidateQueries({ queryKey: ["ledger-deposits"] });

      const result = { amount: amountNum, currency, walletId: wallet.wallet_id };
      setSuccess({ amount: amountNum, currency, symbol });
      onSuccess?.(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setProcessing(false);
      setProcessingStage(null);
    }
  };

  if (success) return <SuccessView success={success} />;

  return (
    <div className="relative space-y-4">
      {showWalletSelect && wallets && wallets.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Deposit into wallet</Label>
          <Select value={wallet?.wallet_id} onValueChange={setSelectedWalletId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {wallets.map((item) => (
                <SelectItem key={item.wallet_id} value={item.wallet_id}>
                  <span className="inline-flex items-center gap-2"><CurrencyFlag code={item.currency_code} size="sm" />{item.currency_code} — {item.symbol}{Number(item.balance).toFixed(2)}</span>
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
          pattern="[0-9]*\.?[0-9]*"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          disabled={lockAmount}
          className="h-12 text-lg"
        />
      </div>

      <SavedCardPicker cards={savedCards} selectedId={selectedPmId} onSelect={setSelectedPmId} />

      <div className="sticky bottom-0 -mx-1 px-1 pt-3 pb-1 bg-background/95 backdrop-blur-sm space-y-2 border-t border-border/40">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={processing || amountNum <= 0 || !selectedPmId || !wallet?.wallet_id}
          onClick={chargeSavedCard}
        >
          {processing ? (
            <><LoadingSpinner size={16} className="mr-2" /> Processing…</>
          ) : (
            ctaLabel ?? `Pay ${symbol}${amountNum.toFixed(2)} ${currency}`
          )}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" /> Charged via your linked card on file
        </p>
      </div>

      <div className="pt-1 space-y-2">
        <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setShowNewCard((v) => !v)}>
          {showNewCard ? "Hide new card form" : "Pay with a different card instead"}
        </Button>
        {showNewCard && (
          <NewCardTopUp
            wallets={wallets}
            defaultWalletId={wallet?.wallet_id}
            defaultAmount={amountNum > 0 ? amountNum : undefined}
            lockAmount={lockAmount && amountNum > 0}
            showWalletSelect={false}
            onSuccess={onSuccess}
            embedded
          />
        )}
      </div>

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => navigate("/cards?link=1")}>
        <Plus className="w-4 h-4 mr-2" /> Link another card
      </Button>

      {processing && processingStage && <ProcessingOverlay stage={processingStage} />}
    </div>
  );
}

function NewCardTopUp({
  wallets,
  defaultWalletId,
  defaultAmount,
  lockAmount,
  showWalletSelect,
  onSuccess,
  ctaLabel,
  embedded = false,
}: Props & { wallets: ReturnType<typeof useWallets>["data"]; embedded?: boolean }) {
  const stripe = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const elementOptions = useMemo(() => buildElementOptions(), []);

  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(defaultWalletId);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [cardholderName, setCardholderName] = useState("");
  const [billingLine1, setBillingLine1] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [numberState, setNumberState] = useState<StripeElementChangeEvent | null>(null);
  const [expiryState, setExpiryState] = useState<StripeElementChangeEvent | null>(null);
  const [cvcState, setCvcState] = useState<StripeElementChangeEvent | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>(null);
  const [success, setSuccess] = useState<{ amount: number; currency: string; symbol: string } | null>(null);

  useEffect(() => {
    if (defaultAmount !== undefined) setAmount(String(defaultAmount));
  }, [defaultAmount]);

  useEffect(() => {
    if (defaultWalletId) setSelectedWalletId(defaultWalletId);
  }, [defaultWalletId]);

  useEffect(() => {
    if (!cardholderName && profile?.full_name) setCardholderName(profile.full_name.toUpperCase());
  }, [profile?.full_name, cardholderName]);

  const wallet = wallets?.find((item) => item.wallet_id === (selectedWalletId ?? defaultWalletId)) ?? wallets?.[0];
  const currency = wallet?.currency_code ?? "USD";
  const symbol = wallet?.symbol ?? "$";
  const amountNum = parseFloat(amount) || 0;
  const cardComplete = !!numberState?.complete && !!expiryState?.complete && !!cvcState?.complete;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stripe || !elements) return toast.error("Secure payment form is still loading");
    if (!wallet?.wallet_id) return toast.error("Please select a wallet");
    if (amountNum <= 0) return toast.error("Enter a valid amount");
    if (!cardholderName.trim()) return toast.error("Cardholder name is required");

    const cardNumber = elements.getElement(CardNumberElement);
    if (!cardNumber) return toast.error("Card field not ready");

    setProcessing(true);
    setProcessingStage("auth");

    try {
      const createData = await invokeEdgeFunction<{ clientSecret?: string }>("stripe-payment-intent", {
        action: "create",
        walletId: wallet.wallet_id,
        amount: amountNum,
        currency,
      });
      if (!createData?.clientSecret) {
        throw new Error("Failed to initialize payment");
      }

      setProcessingStage("charge");
      const billingCountry = billingCountryForWalletCurrency(currency);
      const clientSecret = createData.clientSecret;
      let { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardNumber,
          billing_details: {
            name: cardholderName.trim(),
            email: profile?.email || undefined,
            address: {
              line1: billingLine1.trim() || undefined,
              country: billingCountry,
              postal_code: postalCode.trim() || undefined,
            },
          },
        },
      });

      // Some virtual cards return requires_action — run 3DS step explicitly.
      if (!confirmError && paymentIntent?.status === "requires_action" && clientSecret) {
        const step = await stripe.confirmCardPayment(clientSecret);
        confirmError = step.error;
        paymentIntent = step.paymentIntent;
      }

      if (confirmError) throw new Error(formatStripePaymentError(confirmError));
      if (paymentIntent?.status !== "succeeded") {
        const lpe = paymentIntent?.last_payment_error;
        throw new Error(
          lpe ? formatStripePaymentError(lpe) : `Payment ${paymentIntent?.status ?? "not completed"}`,
        );
      }

      setProcessingStage("credit");
      const data = await invokeEdgeFunction<{ success?: boolean }>("stripe-payment-intent", {
        action: "confirm",
        paymentIntentId: paymentIntent.id,
      });
      if (!data?.success) {
        throw new Error("Failed to credit wallet");
      }

      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      await queryClient.invalidateQueries({ queryKey: ["ledger-deposits"] });

      setSuccess({ amount: amountNum, currency, symbol });
      onSuccess?.({ amount: amountNum, currency, walletId: wallet.wallet_id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setProcessing(false);
      setProcessingStage(null);
    }
  };

  if (success) return <SuccessView success={success} />;

  const canSubmit =
    !!stripe && !!elements && cardComplete && !processing && amountNum > 0 && !!wallet?.wallet_id && cardholderName.trim().length > 0;

  return (
    <div className={`relative ${embedded ? "rounded-xl border border-border p-4 bg-muted/20" : ""}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {showWalletSelect && wallets && wallets.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Deposit into wallet</Label>
            <Select value={wallet?.wallet_id} onValueChange={setSelectedWalletId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {wallets.map((item) => (
                  <SelectItem key={item.wallet_id} value={item.wallet_id}>
                    <span className="inline-flex items-center gap-2"><CurrencyFlag code={item.currency_code} size="sm" />{item.currency_code} — {item.symbol}{Number(item.balance).toFixed(2)}</span>
                  </SelectItem>

                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!embedded && (
        <div className="space-y-2">
          <Label className="text-xs">Amount ({currency})</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            disabled={lockAmount}
            className="h-12 text-lg"
          />
        </div>
        )}

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

        <FieldShell label="Card number" error={numberState?.error?.message}>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <CardNumberElement options={elementOptions} onChange={setNumberState} />
            </div>
            <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </FieldShell>

        <div className="grid grid-cols-2 gap-3">
          <FieldShell label="Expiry (MM/YY)" error={expiryState?.error?.message}>
            <CardExpiryElement options={elementOptions} onChange={setExpiryState} />
          </FieldShell>
          <FieldShell label="CVC" error={cvcState?.error?.message}>
            <CardCvcElement options={elementOptions} onChange={setCvcState} />
          </FieldShell>
        </div>

        {!isStripeTestMode() && (
          <div className="p-3 rounded-lg bg-muted/60 border border-border text-xs text-muted-foreground">
            {STRIPE_VIRTUAL_CARD_HINT}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs">Billing street address <span className="text-muted-foreground">(recommended for virtual cards)</span></Label>
          <Input
            placeholder={currency === "USD" ? "651 N Broad St" : "123 Main St"}
            value={billingLine1}
            onChange={(e) => setBillingLine1(e.target.value)}
            autoComplete="address-line1"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Postal / ZIP code <span className="text-muted-foreground">(recommended)</span></Label>
          <Input
            placeholder={currency === "USD" ? "10001" : currency === "CAD" ? "A1A 1A1" : "Postal code"}
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value.toUpperCase())}
            maxLength={10}
            autoComplete="postal-code"
          />
          <p className="text-[11px] text-muted-foreground">
            Billing country sent to your bank: {billingCountryForWalletCurrency(currency)} (matches {currency} wallet).
          </p>
        </div>

        {isStripeTestMode() && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200">
            {STRIPE_TEST_CARD_HINT}
          </div>
        )}

          <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
            {processing ? (
              <><LoadingSpinner size={16} className="mr-2" /> Processing…</>
            ) : (
              ctaLabel ?? `Pay ${symbol}${amountNum.toFixed(2)} ${currency}`
            )}
          </Button>
      </form>

      {processing && processingStage && <ProcessingOverlay stage={processingStage} />}
    </div>
  );
}

function CardPaymentFormInner(props: Props) {
  const { data: wallets } = useWallets();
  const { data: savedCards = [], isLoading: cardsLoading } = useSavedCards();
  const navigate = useNavigate();

  if (cardsLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <LoadingSpinner size={16} className="mr-2" /> Loading your cards…
          </div>
    );
  }

  if (savedCards.length === 0) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-dashed border-border bg-muted/40 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No linked payment cards yet</p>
              <p className="text-xs text-muted-foreground">
                Link a debit or credit card on the Cards page (Link existing tab). Issued eFin virtual cards spend from your wallet — they cannot top up a wallet.
              </p>
          </div>
          </div>
          <Button type="button" className="w-full" onClick={() => navigate("/cards?link=1")}>
            <CreditCard className="w-4 h-4 mr-2" /> Link a card on Cards page
          </Button>
        </div>
        <p className="text-xs text-center text-muted-foreground">Or pay once with a new card below</p>
        <NewCardTopUp {...props} wallets={wallets} />
    </div>
  );
  }

  return <SavedCardTopUp {...props} wallets={wallets} savedCards={savedCards} />;
}

export default function CardPaymentForm(props: Props) {
  if (!STRIPE_PAYMENTS_ENABLED) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {STRIPE_DISABLED_MESSAGE}
      </div>
    );
  }
  return <CardPaymentFormStripe {...props} />;
}

function CardPaymentFormStripe(props: Props) {
  const [stripeReady, setStripeReady] = useState<Awaited<ReturnType<typeof getStripe>> | null>(null);
  const [stripeFailed, setStripeFailed] = useState(false);

  useEffect(() => {
    getStripe().then((stripe) => {
      setStripeReady(stripe);
      if (!stripe) setStripeFailed(true);
    });
  }, []);

  const elementsOptions = useMemo(() => {
    const { text } = getThemeColors();
    return {
      appearance: {
        theme: "stripe" as const,
        variables: { colorText: text, fontFamily: "Inter, system-ui, sans-serif" },
      },
    };
  }, []);

  if (stripeFailed && !stripeReady) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Stripe payments are unavailable right now.
        {getStripeLoadError() ? ` ${getStripeLoadError()}` : ""}
      </div>
    );
  }

  if (!stripeReady) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <LoadingSpinner size={16} className="mr-2" /> Loading secure form…
      </div>
    );
  }

  return (
    <Elements stripe={stripeReady} options={elementsOptions}>
      <CardPaymentFormInner {...props} />
    </Elements>
  );
}
