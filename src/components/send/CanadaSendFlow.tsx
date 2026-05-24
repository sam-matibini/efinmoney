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
import { CheckCircle, Landmark, AlertCircle, Info, CreditCard, Wallet, Zap, Check } from "lucide-react";
import { tokenizeDebitCard } from "@/lib/stripePayouts";
import { getStripe } from "@/lib/stripe";
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

type DeliveryMethod = "interac" | "eft" | "card_push";
type FundingSource = "wallet" | "card";

const DELIVERY_FEES: Record<DeliveryMethod, number> = { interac: 0.5, eft: 0, card_push: 1.0 };
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

    useEffect(() => { onValidityChange(num && exp && cvc); }, [num, exp, cvc, onValidityChange]);

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
      <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Zap className="w-4 h-4" /> Recipient's debit card (where funds land instantly)
        </div>
        <div className="space-y-2">
          <Label>Card Number</Label>
          <div className={elementWrapperClass}>
            <CardNumberElement
              options={{ style: elementStyle, showIcon: true, placeholder: "Recipient debit card" }}
              onChange={(e) => setNum(e.complete)}
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
          Visa Direct / Mastercard Send instant payout. Canadian debit cards only.
        </p>
      </div>
    );
  }
);
RecipientCardInner.displayName = "RecipientCardInner";

const RecipientCardSection = forwardRef<RecipientCardHandle, { onValidityChange: (v: boolean) => void; elementStyle: any }>(
  (props, ref) => {
    const [stripeP] = useState<Promise<Stripe | null>>(() => getStripe());
    return (
      <Elements stripe={stripeP}>
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
    <Elements stripe={stripeP}>
      <CanadaSendFlowInner stripeReady={stripeReady} />
    </Elements>
  );
};

const CanadaSendFlowInner = ({ stripeReady }: { stripeReady: boolean | null }) => {
  const stripe = useStripe();
  const elements = useElements();
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

  const { data: wallets } = useWallets();
  const createTransfer = useCreateTransfer();

  const cadWallets = (wallets || []).filter((w) => w.currency_code === "CAD");
  const selectedWallet = cadWallets.find((w) => w.wallet_id === walletId) || cadWallets[0];
  const noCadWallet = cadWallets.length === 0;
  // Auto-switch to card funding if user has no CAD wallet
  useEffect(() => { if (noCadWallet && funding === "wallet") setFunding("card"); }, [noCadWallet, funding]);
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

  const recipientValid = method === "interac"
    ? recipientName.trim().length > 1 && /\S+@\S+\.\S+/.test(recipientEmail) && interacQAValid
    : method === "card_push"
      ? recipientName.trim().length > 1 && recipientCardComplete
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
    try {
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
    setMethod("interac");
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
              <div className="grid grid-cols-2 gap-2">
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
              </div>
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
              <div className="space-y-2">
                <Label>Recipient Full Name</Label>
                <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Jane Doe" />
              </div>


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

            {/* Funding source */}
            <div className="space-y-2 pt-2 border-t border-border">
              <Label>How are you paying?</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={funding === "wallet" ? "default" : "outline"}
                  className="flex items-center justify-center gap-2 h-auto py-3"
                  onClick={() => setFunding("wallet")}
                  disabled={noCadWallet}
                >
                  <Wallet className="w-4 h-4" />
                  <span className="text-xs">Pay from CAD wallet</span>
                </Button>
                <Button
                  type="button"
                  variant={funding === "card" ? "default" : "outline"}
                  className="flex items-center justify-center gap-2 h-auto py-3"
                  onClick={() => setFunding("card")}
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="text-xs">Pay with card (+C$1.50)</span>
                </Button>
              </div>
            </div>

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
                  <CreditCard className="w-4 h-4" /> Your card details
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

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={!isStep2Valid || createTransfer.isPending || cardSubmitting}
              >
                {createTransfer.isPending || cardSubmitting
                  ? "Processing..."
                  : `Send C$${parsedAmount.toFixed(2)} via ${method === "interac" ? "Interac" : method === "eft" ? "Bank Transfer" : "Visa Direct"}`}
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
                  Delivery: {method === "interac" ? "Interac e-Transfer (email)" : method === "eft" ? "Bank Transfer (EFT)" : "Instant to debit card (Visa Direct)"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="py-12 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
            >
              <CheckCircle className="w-10 h-10 text-green-500" />
            </motion.div>
            <h3 className="text-2xl font-display font-bold mb-2">Transfer sent!</h3>
            <p className="text-muted-foreground mb-2">
              C${parsedAmount.toFixed(2)} is on its way to {recipientName}
            </p>
            {method === "interac" && (
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Interac e-Transfer will be sent within 30 minutes. {recipientName} will receive an email from eFinMoney at <strong>{recipientEmail}</strong>.
              </p>
            )}
            {method === "eft" && (
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Funds will arrive in the recipient's bank account within 1–3 business days.
              </p>
            )}
            {method === "card_push" && (
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Funds are being pushed to {recipientName}'s debit card via Visa Direct and typically arrive within seconds.
              </p>
            )}
            {security && method === "interac" && (
              <div className="max-w-md mx-auto mb-6 p-4 rounded-xl border border-border bg-muted/40 text-left">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Security details — share with recipient</p>
                <p className="text-sm"><span className="text-muted-foreground">Question:</span> <strong>{security.question}</strong></p>
                <p className="text-sm mt-1"><span className="text-muted-foreground">Answer:</span> <strong className="font-mono">{security.answer}</strong></p>
                <button
                  type="button"
                  className="mt-3 text-xs text-primary hover:underline"
                  onClick={() => {
                    navigator.clipboard.writeText(`Q: ${security.question}\nA: ${security.answer}`);
                    toast.success("Copied to clipboard");
                  }}
                >Copy Q&amp;A</button>
              </div>
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
    </div>
  );
};

export default CanadaSendFlow;
