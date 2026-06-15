import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { useProfile } from "@/hooks/useProfile";
import { downloadTransferReceipt } from "@/lib/receipt";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, Landmark, AlertCircle, Info, CreditCard, Wallet, Zap, Check, Building2, Link2, Copy, Share2 } from "lucide-react";
import { useStripeConnectedAccount, isConnectReady, getConnectReadiness } from "@/hooks/useStripeConnectedAccount";
import { tokenizeDebitCard } from "@/lib/stripePayouts";
import { usePinGate } from "@/components/send/usePinGate";
import { getStripe, getStripeSecondary } from "@/lib/stripe";
import type { Stripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

function readHslVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
}

function useStripeElementStyle() {
  return useMemo(() => {
    const fg = readHslVar("--foreground", "#0a0a0a");
    const muted = readHslVar("--muted-foreground", "#6b7280");
    const danger = readHslVar("--destructive", "#dc2626");
    return {
      base: {
        color: fg,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontSize: "15px",
        "::placeholder": { color: muted },
        iconColor: muted,
      },
      invalid: { color: danger, iconColor: danger },
    };
  }, []);
}

const elementWrapperClass =
  "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2";

type DeliveryMethod = "interac" | "eft" | "card_push" | "stripe_connect" | "paylink";
type FundingSource = "wallet" | "card";

// Feature flag: flip to false instantly if Paysafe Interac e-Transfer is unavailable.
const INTERAC_ETRANSFER_ENABLED = true;

const DELIVERY_FEES: Record<DeliveryMethod, number> = { interac: 0.5, eft: 0, card_push: 1.0, stripe_connect: 1.0, paylink: 0 };
const CARD_PROCESSING_FEE = 1.5;

// Recipient card section runs in its OWN <Elements> provider so it can host
// a second CardNumberElement alongside the sender card. Exposes tokenize() via ref.
type RecipientCardHandle = {
  tokenize: (recipientName: string) => Promise<{ token: string; last4: string; brand: string }>;
  isComplete: () => boolean;
};

const RecipientCardInner = forwardRef<RecipientCardHandle, { onValidityChange: (v: boolean) => void; elementStyle: any }>(
  ({ onValidityChange, elementStyle }, ref) => {
    const stripe = useStripe();
    const elements = useElements();
    const [num, setNum] = useState(false);
    const [exp, setExp] = useState(false);
    const [cvc, setCvc] = useState(false);
    const [numReady, setNumReady] = useState(false);

    useEffect(() => { onValidityChange(num && exp && cvc); }, [num, exp, cvc, onValidityChange]);

    // Once the card number iframe is ready, focus it briefly to confirm it's
    // interactive. If focus() throws, surface a console warning so we can spot
    // dead iframes during QA.
    useEffect(() => {
      if (!numReady || !elements) return;
      const el = elements.getElement(CardNumberElement);
      if (!el) return;
      try { el.focus(); el.blur(); } catch (e) {
        console.warn("[RecipientCard] CardNumberElement not focusable:", e);
      }
    }, [numReady, elements]);

    useImperativeHandle(ref, () => ({
      isComplete: () => num && exp && cvc,
      tokenize: async (recipientName: string) => {
        if (!stripe || !elements) throw new Error("Recipient card form not ready");
        const cardEl = elements.getElement(CardNumberElement);
        if (!cardEl) throw new Error("Recipient card form not ready");
        return tokenizeDebitCard(stripe, cardEl, { name: recipientName || "Recipient", currency: "cad" });
      },
    }), [stripe, elements, num, exp, cvc]);

    return (
      <div className="space-y-4 p-4 rounded-lg border border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Zap className="w-4 h-4" /> Recipient's debit card (where funds land instantly)
        </div>
        <div className="p-2 rounded bg-muted/40 text-[11px] text-muted-foreground flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Visa Direct / Mastercard Send pushes funds directly to this debit card.
            <strong> You (the sender) must enter it</strong> — the recipient does not get a separate page to fill in.
          </span>
        </div>
        <div className="space-y-2">
          <Label>Card Number</Label>
          <div className={elementWrapperClass}>
            <CardNumberElement
              options={{ style: elementStyle, showIcon: true, placeholder: "Recipient debit card" }}
              onChange={(e) => setNum(e.complete)}
              onReady={() => setNumReady(true)}
              className="w-full"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Expiry (MM / YY)</Label>
            <div className={elementWrapperClass}>
              <CardExpiryElement options={{ style: elementStyle }} onChange={(e) => setExp(e.complete)} className="w-full" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>CVC</Label>
            <div className={elementWrapperClass}>
              <CardCvcElement options={{ style: elementStyle }} onChange={(e) => setCvc(e.complete)} className="w-full" />
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Canadian debit cards only (Visa Debit, Debit Mastercard, Interac).
        </p>
      </div>
    );
  }
);
RecipientCardInner.displayName = "RecipientCardInner";


const RecipientCardSection = forwardRef<RecipientCardHandle, { onValidityChange: (v: boolean) => void; elementStyle: any }>(
  (props, ref) => {
    // Use a SEPARATE Stripe instance from the page-level one so two
    // CardNumberElements (sender + recipient) can coexist. If the secondary
    // fails to load, fall back to the primary instance so the form is at
    // least degraded-working rather than dead.
    const [stripeP, setStripeP] = useState<Promise<Stripe | null>>(() => getStripeSecondary());
    const [ready, setReady] = useState<boolean | null>(null);
    useEffect(() => {
      let alive = true;
      stripeP.then((s) => {
        if (!alive) return;
        if (s) { setReady(true); return; }
        console.warn("[RecipientCard] secondary Stripe instance failed; falling back to primary");
        const fallback = getStripe();
        setStripeP(fallback);
        fallback.then((s2) => { if (alive) setReady(!!s2); });
      });
      return () => { alive = false; };
    }, [stripeP]);

    if (ready === false) {
      return (
        <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
          Recipient card form unavailable — Stripe failed to load. Please refresh.
        </div>
      );
    }
    if (ready === null) {
      return (
        <div className="p-4 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
          Loading recipient card form…
        </div>
      );
    }
    return (
      <Elements stripe={stripeP} key="recipient-card-elements">
        <RecipientCardInner {...props} ref={ref} />
      </Elements>
    );
  }
);
RecipientCardSection.displayName = "RecipientCardSection";

const CanadaSendFlow = () => {
  const [stripeP] = useState<Promise<Stripe | null>>(() => getStripe());
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  useEffect(() => {
    let ok = true;
    stripeP.then((s) => { if (ok) setStripeReady(!!s); });
    return () => { ok = false; };
  }, [stripeP]);
  return (
    <Elements stripe={stripeP} key="sender-card-elements">
      <CanadaSendFlowInner stripeReady={stripeReady} />
    </Elements>
  );
};

const CanadaSendFlowInner = ({ stripeReady }: { stripeReady: boolean | null }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { requirePin, pinGate } = usePinGate();
  const elementStyle = useStripeElementStyle();
  const { data: profile } = useProfile();

  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<DeliveryMethod>("eft");
  const [funding, setFunding] = useState<FundingSource>("wallet");
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  // Recipient — Interac
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  // Recipient — EFT
  const [institutionNumber, setInstitutionNumber] = useState("");
  const [transitNumber, setTransitNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  // Sender card (Stripe Elements completion state)
  const [cardNumComplete, setCardNumComplete] = useState(false);
  const [cardExpComplete, setCardExpComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  const [cardSubmitting, setCardSubmitting] = useState(false);

  // Recipient debit card (separate Stripe Elements scope, only for card_push)
  const recipientCardRef = useRef<RecipientCardHandle>(null);
  const [recipientCardComplete, setRecipientCardComplete] = useState(false);
  const cardPanelRef = useRef<HTMLDivElement | null>(null);

  const [lastTransferId, setLastTransferId] = useState<string | null>(null);
  const [security, setSecurity] = useState<{ question: string; answer: string } | null>(null);
  const [paylinkResult, setPaylinkResult] = useState<{ url: string; code: string; expires_at: string } | null>(null);
  const [paylinkSubmitting, setPaylinkSubmitting] = useState(false);

  const { data: wallets } = useWallets();
  const createTransfer = useCreateTransfer();
  const { data: connectAcct, refresh: refreshConnect } = useStripeConnectedAccount();
  const connectReady = isConnectReady(connectAcct);
  const connectState = getConnectReadiness(connectAcct);
  const [refreshingConnect, setRefreshingConnect] = useState(false);

  // Self-heal: if a connected account row exists but isn't 'active', auto-refresh once from Stripe.
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (didAutoRefresh.current) return;
    if (connectAcct && !connectReady) {
      didAutoRefresh.current = true;
      refreshConnect();
    }
  }, [connectAcct, connectReady, refreshConnect]);

  const handleManualRefresh = async () => {
    setRefreshingConnect(true);
    try { await refreshConnect(); } finally { setRefreshingConnect(false); }
  };

  const cadWallets = (wallets || []).filter((w) => w.currency_code === "CAD");
  const selectedWallet = cadWallets.find((w) => w.wallet_id === walletId) || cadWallets[0];
  const noCadWallet = cadWallets.length === 0;
  // Auto-switch to card funding if user has no CAD wallet
  useEffect(() => { if (noCadWallet && funding === "wallet") setFunding("card"); }, [noCadWallet, funding]);

  // Auto-fill recipient = self when paying to your own connected account
  useEffect(() => {
    if (method === "stripe_connect") {
      if (profile?.full_name && !recipientName) setRecipientName(profile.full_name);
      if (profile?.email && !recipientEmail) setRecipientEmail(profile.email);
    }
  }, [method, profile?.full_name, profile?.email]);

  // Paylink only supports wallet funding (escrow). Switch funding back to wallet when picked.
  useEffect(() => {
    if (method === "paylink" && funding !== "wallet") setFunding("wallet");
  }, [method, funding]);

  // Any wallet to satisfy the NOT NULL FK on transfers.sender_wallet_id when paying by card
  const fallbackWallet = (wallets || [])[0];

  const parsedAmount = Math.max(0, parseFloat(amount) || 0);
  const deliveryFee = parsedAmount > 0 ? DELIVERY_FEES[method] : 0;
  const cardFee = parsedAmount > 0 && funding === "card" ? CARD_PROCESSING_FEE : 0;
  const totalFee = deliveryFee + cardFee;
  const receivedAmount = Math.max(0, parsedAmount - deliveryFee);
  const totalCharged = parsedAmount + cardFee;
  const insufficient = funding === "wallet" && !!selectedWallet && parsedAmount > 0
    && (parsedAmount + totalFee) > Number(selectedWallet.balance);

  // Step 1: amount, wallet (only required if funding=wallet), delivery method
  const isStep1Valid = parsedAmount > 0
    && (funding === "card" || (!!selectedWallet && !insufficient));

  const interacQAValid = method !== "interac"
    ? true
    : (!securityQuestion && !securityAnswer)
      || (securityQuestion.trim().length >= 4 && securityAnswer.trim().length >= 3);

  const recipientValid = method === "stripe_connect"
    ? !!connectAcct
    : method === "paylink"
      ? true  // recipient details optional for paylink (sender just generates a link)
      : method === "card_push"
        ? recipientName.trim().length > 1 && recipientCardComplete
        : method === "interac"
          ? recipientName.trim().length > 1
              && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)
              && interacQAValid
          : recipientName.trim().length > 1
              && /^\d{3}$/.test(institutionNumber)
              && /^\d{5}$/.test(transitNumber)
              && accountNumber.trim().length >= 4;

  const cardFieldsValid = funding === "wallet"
    ? true
    : cardNumComplete && cardExpComplete && cardCvcComplete;

  const isStep2Valid = recipientValid && cardFieldsValid;

  const handleSubmit = async () => {
    if (funding === "wallet" && !selectedWallet) return;

    // Payment Link branch — escrow funds and generate a claim link.
    if (method === "paylink") {
      if (!selectedWallet) { toast.error("Select a CAD wallet"); return; }
      setPaylinkSubmitting(true);
      try {
        const { data, error } = await supabase.functions.invoke("payment-link-create", {
          body: {
            amount: parsedAmount,
            currency: "CAD",
            sender_wallet_id: selectedWallet.wallet_id,
            recipient_name: recipientName || null,
            recipient_note: message || null,
            source: "send",
            base_url: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Could not create payment link");
        setPaylinkResult({ url: data.url, code: data.code, expires_at: data.expires_at });
        setStep(3);
        toast.success("Payment link created");
      } catch (e: any) {
        toast.error(e?.message || "Could not create payment link");
      } finally {
        setPaylinkSubmitting(false);
      }
      return;
    }

    try {
      if (method === "stripe_connect") {
        setRefreshingConnect(true);
        const latest = (await refreshConnect()) ?? connectAcct ?? null;
        setRefreshingConnect(false);
        const latestState = getConnectReadiness(latest);
        if (!latestState.hasAccount) {
          toast.error("No connected account found. Open /stripe-connect first.");
          return;
        }
        if (!latestState.ready) {
          toast.error(latestState.message || "Your connected account is not ready for payouts yet.");
          return;
        }
      }

      // Tokenize sender card if card-funded
      let tokenized: { token: string; last4: string; brand: string } | null = null;
      if (funding === "card") {
        if (!stripe || !elements) {
          toast.error("Card form is still loading — please wait a moment");
          return;
        }
        const cardEl = elements.getElement(CardNumberElement);
        if (!cardEl) {
          toast.error("Card form not ready");
          return;
        }
        setCardSubmitting(true);
        try {
          tokenized = await tokenizeDebitCard(stripe, cardEl, {
            name: profile?.full_name || profile?.email || "Cardholder",
          });
        } catch (e: any) {
          setCardSubmitting(false);
          toast.error(e?.message || "Couldn't tokenize card");
          return;
        }
      }

      // Tokenize recipient debit card if instant card_push delivery
      let recipientTok: { token: string; last4: string; brand: string } | null = null;
      if (method === "card_push") {
        if (!recipientCardRef.current?.isComplete()) {
          toast.error("Please complete the recipient's card details");
          return;
        }
        setCardSubmitting(true);
        try {
          recipientTok = await recipientCardRef.current.tokenize(recipientName);
        } catch (e: any) {
          setCardSubmitting(false);
          toast.error(e?.message || "Couldn't tokenize recipient card");
          return;
        }
      }

      const transfer = await createTransfer.mutateAsync({
        sender_wallet_id: (funding === "wallet" ? selectedWallet?.wallet_id : (selectedWallet?.wallet_id || fallbackWallet?.wallet_id))!,
        recipient_name: recipientName,
        recipient_account: method === "eft"
          ? `${institutionNumber}-${transitNumber}-${accountNumber}`
          : method === "card_push"
            ? (recipientEmail || `card-${recipientTok?.last4 || "xxxx"}`)
            : method === "stripe_connect"
              ? (connectAcct?.stripe_account_id || recipientEmail || "stripe_connect")
              : recipientEmail,
        recipient_country: "CA",
        transfer_type: "domestic_canada",
        payout_method: method,
        funding_source: funding,
        source_currency: "CAD",
        target_currency: "CAD",
        source_amount: parsedAmount,
        target_amount: receivedAmount,
        exchange_rate: 1,
        fee_amount: totalFee,
        ...(method === "interac" && securityQuestion && securityAnswer
          ? { interac_security_question: securityQuestion.trim(), interac_security_answer: securityAnswer.trim() }
          : {}),
      } as any);

      try {
        const body: Record<string, unknown> = {
          transfer_id: transfer.id,
          funding_source: funding,
        };
        if (funding === "card" && tokenized) {
          body.card_token = tokenized.token;
          body.last4 = tokenized.last4;
          body.brand = tokenized.brand;
        }
        if (method === "card_push" && recipientTok) {
          body.recipient_card_token = recipientTok.token;
          body.recipient_last4 = recipientTok.last4;
          body.recipient_brand = recipientTok.brand;
          body.recipient_email = recipientEmail || null;
        }
        const { data: execData } = await supabase.functions.invoke("execute-transfer", { body });
        if (execData?.success === false) {
          throw new Error(execData?.error || "Transfer failed");
        }
        const sec = execData?.payout?.security;
        if (sec?.question && sec?.answer) setSecurity({ question: sec.question, answer: sec.answer });
      } catch (e: any) {
        setCardSubmitting(false);
        toast.error(e?.message || "Transfer could not be completed");
        return;
      }

      setLastTransferId(transfer.id);
      setStep(3);
      setCardSubmitting(false);
      toast.success("Canadian transfer initiated");
    } catch (e: any) {
      setCardSubmitting(false);
      toast.error(e?.message || "Transfer failed");
    }
  };

  const reset = () => {
    setStep(1);
    setAmount("");
    setRecipientName(""); setRecipientEmail(""); setMessage("");
    setSecurityQuestion(""); setSecurityAnswer("");
    setInstitutionNumber(""); setTransitNumber(""); setAccountNumber(""); setBankName("");
    setCardNumComplete(false); setCardExpComplete(false); setCardCvcComplete(false);
    setRecipientCardComplete(false);
    setMethod("eft");
    setFunding("wallet");
    setLastTransferId(null);
    setSecurity(null);
    elements?.getElement(CardNumberElement)?.clear();
    elements?.getElement(CardExpiryElement)?.clear();
    elements?.getElement(CardCvcElement)?.clear();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {step > s ? <CheckCircle className="w-4 h-4" /> : s}
            </div>
            {s < 3 && <div className={`w-12 h-0.5 ${step > s ? "bg-primary" : "bg-muted"}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Amount & Delivery</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {noCadWallet && funding === "wallet" ? (
              <div className="p-3 rounded-lg border border-dashed border-border bg-muted/40 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  You don't have a CAD wallet. Create one from the Wallets page, or pay by card on the next step.
                </p>
              </div>
            ) : funding === "wallet" ? (
              <div className="space-y-2">
                <Label>From CAD Wallet</Label>
                <Select value={walletId || selectedWallet?.wallet_id} onValueChange={setWalletId}>
                  <SelectTrigger><SelectValue placeholder="Select CAD wallet" /></SelectTrigger>
                  <SelectContent>
                    {cadWallets.map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        🇨🇦 CAD — C${Number(w.balance).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Amount (CAD)</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">C$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || parseFloat(v) >= 0) setAmount(v);
                  }}
                  className="pl-12 text-2xl h-14"
                />
              </div>
              {funding === "wallet" && selectedWallet && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Available: C${Number(selectedWallet.balance).toFixed(2)}</p>
                  {insufficient && (
                    <p className="text-sm font-medium text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Insufficient CAD balance
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Delivery Method (how recipient receives)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <Button
                  type="button"
                  variant={method === "eft" ? "default" : "outline"}
                  className="flex flex-col items-center gap-1 h-auto py-3"
                  onClick={() => setMethod("eft")}
                >
                  <Landmark className="w-5 h-5" />
                  <span className="text-xs">Bank (EFT)</span>
                  <span className="text-[10px] opacity-70">Free · 1–3 days</span>
                </Button>
                {INTERAC_ETRANSFER_ENABLED && (
                  <Button
                    type="button"
                    variant={method === "interac" ? "default" : "outline"}
                    className="relative flex flex-col items-center gap-1 h-auto py-3"
                    onClick={() => setMethod("interac")}
                  >
                    <span className="absolute top-1 right-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                      BETA
                    </span>
                    <Zap className="w-5 h-5" />
                    <span className="text-xs">Interac e-Transfer</span>
                    <span className="text-[10px] opacity-70">C$0.50 · minutes</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant={method === "card_push" ? "default" : "outline"}
                  className="flex flex-col items-center gap-1 h-auto py-3"
                  onClick={() => setMethod("card_push")}
                >
                  <Zap className="w-5 h-5" />
                  <span className="text-xs">Instant to Card</span>
                  <span className="text-[10px] opacity-70">C$1.00 · seconds</span>
                </Button>
                <Button
                  type="button"
                  variant={method === "stripe_connect" ? "default" : "outline"}
                  className="relative flex flex-col items-center gap-1 h-auto py-3"
                  onClick={() => setMethod("stripe_connect")}
                  disabled={!connectState.hasAccount}
                  title={connectState.hasAccount ? "Send to your Stripe connected account" : "Finish setup at /stripe-connect first"}
                >
                  <span className="absolute top-1 right-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    TEST
                  </span>
                  <Building2 className="w-5 h-5" />
                  <span className="text-xs">Stripe Connect</span>
                  <span className="text-[10px] opacity-70">C$1.00 · instant</span>
                </Button>
                <Button
                  type="button"
                  variant={method === "paylink" ? "default" : "outline"}
                  className="flex flex-col items-center gap-1 h-auto py-3"
                  onClick={() => setMethod("paylink")}
                  title="Generate a one-time link the recipient opens to choose how they get paid"
                >
                  <Link2 className="w-5 h-5" />
                  <span className="text-xs">Payment Link</span>
                  <span className="text-[10px] opacity-70">Free · 7-day expiry</span>
                </Button>
              </div>
              {(!connectReady || !connectState.hasAccount) && (
                <p className="text-[11px] text-muted-foreground">
                  {connectState.hasAccount ? "Stripe Connect needs one more status sync before sending." : "Stripe Connect option is disabled."}{" "}
                  {connectAcct ? (
                    <>
                      Just finished onboarding?{" "}
                      <button type="button" onClick={handleManualRefresh} disabled={refreshingConnect} className="underline">
                        {refreshingConnect ? "Refreshing…" : "Refresh status"}
                      </button>
                      {" "}or <Link to="/stripe-connect" className="underline">open setup</Link>.
                    </>
                  ) : (
                    <><Link to="/stripe-connect" className="underline">Finish onboarding</Link> to enable instant payouts to your own connected account.</>
                  )}
                </p>
              )}
              {connectState.hasAccount && connectState.message && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">{connectState.message}</p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-muted">
              <p className="text-sm text-muted-foreground mb-1">Recipient gets</p>
              <p className="text-3xl font-display font-bold text-foreground">
                C${receivedAmount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Delivery fee: C${deliveryFee.toFixed(2)} · Same-currency CAD → CAD
              </p>
            </div>

            <Button className="w-full" size="lg" onClick={() => setStep(2)} disabled={!isStep1Valid}>
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Recipient & Payment</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {/* Recipient details */}
            <div className="space-y-4">
              {method !== "stripe_connect" && (
                <div className="space-y-2">
                  <Label>Recipient Full Name {method === "paylink" && <span className="text-xs text-muted-foreground">(optional)</span>}</Label>
                  <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder={method === "paylink" ? "Anyone with the link" : "Jane Doe"} />
                </div>
              )}

              {method === "paylink" && (
                <>
                  <div className="space-y-2">
                    <Label>Note for recipient (optional)</Label>
                    <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Thanks for lunch 🍕" rows={2} />
                  </div>
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/30 text-xs text-foreground flex items-start gap-2">
                    <Link2 className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    <div className="space-y-1">
                      <p><strong>How it works:</strong> we hold C${parsedAmount.toFixed(2)} from your CAD wallet, then send you a one-time link. The recipient opens it, picks Interac / EFT / debit card, and the funds are released.</p>
                      <p>The link expires in 7 days. You can revoke it anytime before it's claimed and the funds return to your wallet.</p>
                    </div>
                  </div>
                </>
              )}

              {method === "stripe_connect" && (
                <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    <Building2 className="w-4 h-4" /> Sending to your Stripe Connected Account
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      Recipient: <strong>{recipientName || profile?.full_name || profile?.email || "You"}</strong>
                    </p>
                    <p>
                      Account: <span className="font-mono">{connectAcct?.stripe_account_id}</span> · {connectAcct?.country?.toUpperCase()} · status: {connectState.status}
                    </p>
                    {connectState.message && <p>{connectState.message}</p>}
                    <p>
                      Funds land on your connected account's Stripe balance, then an <strong>instant payout</strong> is fired to your external debit card / bank. If instant isn't available yet, we fall back to a standard payout automatically.
                    </p>
                  </div>
                </div>
              )}


              {method === "eft" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Institution # (3 digits)</Label>
                      <Input inputMode="numeric" maxLength={3} value={institutionNumber} onChange={(e) => setInstitutionNumber(e.target.value.replace(/\D/g, ""))} placeholder="001" />
                    </div>
                    <div className="space-y-2">
                      <Label>Transit / Branch # (5 digits)</Label>
                      <Input inputMode="numeric" maxLength={5} value={transitNumber} onChange={(e) => setTransitNumber(e.target.value.replace(/\D/g, ""))} placeholder="12345" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} placeholder="1234567" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bank Name (optional)</Label>
                    <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Royal Bank of Canada" />
                  </div>
                </>
              )}

              {method === "interac" && (
                <>
                  <div className="space-y-2">
                    <Label>Recipient Email</Label>
                    <Input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="jane@example.com"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Security Question (optional)</Label>
                      <Input
                        value={securityQuestion}
                        onChange={(e) => setSecurityQuestion(e.target.value)}
                        placeholder="What's our favourite city?"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Security Answer (optional)</Label>
                      <Input
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        placeholder="Lowercase, no spaces"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Message (optional)</Label>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Birthday gift 🎁"
                      rows={2}
                    />
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      Interac e-Transfer is currently in <strong>beta</strong> while our payout provider finalises activation. Transfers may fail until enabled — use EFT or Instant to Card in the meantime.
                    </span>
                  </div>
                </>
              )}

              {method === "card_push" && (
                <>
                  <div className="space-y-2">
                    <Label>Recipient Email (optional, for receipt)</Label>
                    <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="jane@example.com" />
                  </div>
                  <RecipientCardSection
                    ref={recipientCardRef}
                    onValidityChange={setRecipientCardComplete}
                    elementStyle={elementStyle}
                  />
                </>
              )}
            </div>

            {/* Funding source — hidden for paylink (always wallet escrow) */}
            {method !== "paylink" && (
            <div className="space-y-3 pt-2 border-t border-border">
              <Label>How are you paying?</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFunding("wallet")}
                  disabled={noCadWallet}
                  className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                    funding === "wallet"
                      ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                      : "border-border hover:border-primary/40"
                  } ${noCadWallet ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  {funding === "wallet" && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="w-5 h-5 text-primary" />
                    <span className="font-medium text-sm">Pay from CAD wallet</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {noCadWallet ? "No CAD wallet available" : "Instant · no extra fee"}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFunding("card");
                    setTimeout(() => cardPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
                  }}
                  className={`relative text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    funding === "card"
                      ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  {funding === "card" && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <span className="font-medium text-sm">Pay with card</span>
                    <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      +C$1.50
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Visa, Mastercard, Amex · secured by Stripe</p>
                </button>
              </div>
            </div>
            )}

            {method !== "paylink" && (
            <div ref={cardPanelRef}>
            {funding === "card" && stripeReady === false && (
              <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
                <strong>Card payments are temporarily unavailable.</strong>
                <p className="mt-1 text-destructive/90">
                  The Stripe publishable key is missing or invalid. Please contact support
                  or pay from your CAD wallet instead.
                </p>
              </div>
            )}
            {funding === "card" && stripeReady === null && (
              <div className="p-4 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
                Loading secure card form…
              </div>
            )}
            {funding === "card" && stripeReady === true && (
              <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="w-4 h-4" /> Your card (funds this transfer)
                </div>
                <div className="space-y-2">
                  <Label>Card Number</Label>
                  <div className={elementWrapperClass}>
                    <CardNumberElement
                      options={{ style: elementStyle, showIcon: true, placeholder: "1234 1234 1234 1234" }}
                      onChange={(e) => setCardNumComplete(e.complete)}
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Expiry (MM / YY)</Label>
                    <div className={elementWrapperClass}>
                      <CardExpiryElement
                        options={{ style: elementStyle }}
                        onChange={(e) => setCardExpComplete(e.complete)}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>CVC</Label>
                    <div className={elementWrapperClass}>
                      <CardCvcElement
                        options={{ style: elementStyle }}
                        onChange={(e) => setCardCvcComplete(e.complete)}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Charged for C${totalCharged.toFixed(2)}. Your card details never touch our servers — secured by Stripe.
                </p>
              </div>
            )}
            </div>
            )}



            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
              <Button
                className="flex-1"
                onClick={() => method === "paylink" ? handleSubmit() : requirePin(handleSubmit, `C$${parsedAmount.toFixed(2)}`)}
                disabled={!isStep2Valid || createTransfer.isPending || cardSubmitting || paylinkSubmitting}
              >
                {(createTransfer.isPending || cardSubmitting || paylinkSubmitting)
                  ? "Processing..."
                  : method === "paylink"
                    ? `Create C$${parsedAmount.toFixed(2)} Payment Link`
                    : `Send C$${parsedAmount.toFixed(2)} via ${
                        method === "eft" ? "Bank Transfer"
                          : method === "interac" ? "Interac e-Transfer"
                          : method === "stripe_connect" ? "Stripe Connect"
                          : "Visa Direct"
                      }`}
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <strong>Summary:</strong>{" "}
                  Recipient gets C${receivedAmount.toFixed(2)} ·
                  Delivery fee C${deliveryFee.toFixed(2)}
                  {cardFee > 0 ? ` · Card fee C$${cardFee.toFixed(2)}` : ""} ·
                  {" "}<strong>Total {funding === "card" ? "charged to card" : "from wallet"}: C${totalCharged.toFixed(2)}</strong>
                </p>
                <p>
                  Delivery: {
                    method === "eft" ? "Bank Transfer (EFT)"
                      : method === "interac" ? "Interac e-Transfer (email)"
                      : method === "stripe_connect" ? "Stripe Connect — instant payout to your connected account"
                      : "Instant to debit card (Visa Direct)"
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && method === "paylink" && paylinkResult && (
        <Card>
          <CardContent className="py-10 text-center space-y-5">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="w-20 h-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center"
            >
              <Link2 className="w-10 h-10 text-primary" />
            </motion.div>
            <div>
              <h3 className="text-2xl font-display font-bold mb-1">Payment link ready</h3>
              <p className="text-sm text-muted-foreground">
                C${parsedAmount.toFixed(2)} is held in escrow. Share the link below.
              </p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/40 text-left">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Claim link</p>
              <code className="block text-sm break-all">{paylinkResult.url}</code>
              <p className="text-[11px] text-muted-foreground mt-2">
                Expires {new Date(paylinkResult.expires_at).toLocaleString()} · single use
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button onClick={async () => { await navigator.clipboard.writeText(paylinkResult.url); toast.success("Link copied"); }}>
                <Copy className="w-4 h-4 mr-2" /> Copy link
              </Button>
              {typeof navigator !== "undefined" && (navigator as any).share && (
                <Button variant="outline" onClick={() => (navigator as any).share({ title: "Payment for you", text: `${recipientName || "Hey"}, claim your C$${parsedAmount.toFixed(2)} here:`, url: paylinkResult.url })}>
                  <Share2 className="w-4 h-4 mr-2" /> Share
                </Button>
              )}
              <Button variant="outline" asChild>
                <a href={`mailto:${recipientEmail || ""}?subject=${encodeURIComponent("You've got a payment")}&body=${encodeURIComponent(`Claim your C$${parsedAmount.toFixed(2)} here: ${paylinkResult.url}`)}`}>Email it</a>
              </Button>
              <Button variant="outline" onClick={reset}>Done</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && method !== "paylink" && (
        <Card>
          <CardContent className="py-12 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-20 h-20 mx-auto mb-6 rounded-full bg-indigo-500/20 flex items-center justify-center"
            >
              <CheckCircle className="w-10 h-10 text-indigo-500" />
            </motion.div>
            <h3 className="text-2xl font-display font-bold mb-2">Transfer sent!</h3>
            <p className="text-muted-foreground mb-2">
              C${parsedAmount.toFixed(2)} is on its way to {recipientName}
            </p>
            {method === "eft" && (
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Funds will arrive in the recipient's bank account within 1–3 business days.
              </p>
            )}
            {method === "interac" && (
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Interac sent {recipientEmail} an email with a deposit link. Funds typically arrive within minutes once they accept.
                {security && (
                  <span className="block mt-2 text-xs">
                    Security Q: <strong>{security.question}</strong> · A: <strong>{security.answer}</strong>
                  </span>
                )}
              </p>
            )}
            {method === "card_push" && (
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Funds are being pushed to {recipientName}'s debit card via Visa Direct and typically arrive within seconds.
              </p>
            )}
            {method === "stripe_connect" && (
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Funds were transferred to your Stripe connected account <span className="font-mono">{connectAcct?.stripe_account_id}</span> and an instant payout was triggered to your external debit card / bank.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {lastTransferId && (
                <Button asChild>
                  <Link to={`/transfers/${lastTransferId}`}>Track your transfer</Link>
                </Button>
              )}
              {lastTransferId && (
                <Button variant="outline" onClick={() => downloadTransferReceipt(lastTransferId)}>
                  Download Receipt
                </Button>
              )}
              <Button variant="outline" onClick={reset}>Send Another</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {pinGate}
    </div>
  );
};

export default CanadaSendFlow;
