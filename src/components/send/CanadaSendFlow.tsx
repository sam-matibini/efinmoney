import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallets } from "@/hooks/useWallets";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import {
  useBeneficiaries,
  recordTransferRecipient,
  isCanadaBeneficiary,
  type Beneficiary,
} from "@/hooks/useBeneficiaries";
import PayeePicker from "@/components/PayeePicker";
import ContactsPickerModal from "@/components/modals/ContactsPickerModal";
import AddBeneficiaryModal from "@/components/modals/AddBeneficiaryModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadTransferReceipt } from "@/lib/receipt";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, Landmark, AlertCircle, Info, CreditCard, Wallet, Zap, Check, Building2, Link2, Copy, Share2, X, Users, UserPlus, ArrowRight, ChevronRight } from "lucide-react";
import { useStripeConnectedAccount, isConnectReady, getConnectReadiness } from "@/hooks/useStripeConnectedAccount";
import { tokenizeDebitCard } from "@/lib/stripePayouts";
import { usePinGate } from "@/components/send/usePinGate";
import { RevokePaymentLinkDialog } from "@/components/payment-links/RevokePaymentLinkDialog";
import { getStripe } from "@/lib/stripe";
import type { Stripe } from "@stripe/stripe-js";
import RecipientStripeKycFields, { buildRecipientKycPayload, isRecipientKycValid } from "@/components/send/RecipientStripeKycFields";
import {
  INTERAC_ETRANSFER_ENABLED,
  PAYSAFE_PAYOUTS_ENABLED,
  STRIPE_CANADA_RAILS_NOTE,
} from "@/lib/canadaPayoutRails";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

function resolveCssColor(value: string, fallback: string): string {
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

function useStripeElementStyle() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return {
        base: {
          color: "rgb(15, 23, 42)",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          fontSize: "16px",
          "::placeholder": { color: "rgb(107, 114, 128)" },
          iconColor: "rgb(107, 114, 128)",
        },
        invalid: { color: "rgb(220, 38, 38)", iconColor: "rgb(220, 38, 38)" },
      };
    }
    const styles = getComputedStyle(document.documentElement);
    const fg = styles.getPropertyValue("--foreground").trim();
    const muted = styles.getPropertyValue("--muted-foreground").trim();
    const danger = styles.getPropertyValue("--destructive").trim();
    const text = resolveCssColor(fg ? `hsl(${fg})` : "", "rgb(15, 23, 42)");
    const placeholder = resolveCssColor(muted ? `hsl(${muted})` : "", "rgb(107, 114, 128)");
    const invalid = resolveCssColor(danger ? `hsl(${danger})` : "", "rgb(220, 38, 38)");
    return {
      base: {
        color: text,
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        fontSize: "16px",
        "::placeholder": { color: placeholder },
        iconColor: placeholder,
      },
      invalid: { color: invalid, iconColor: invalid },
    };
  }, []);
}

const elementWrapperClass =
  "w-full rounded-md border border-input bg-background px-3 py-3.5 min-h-[44px] text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 [&_.StripeElement]:w-full [&_.StripeElement]:min-h-[1.25rem]";

type DeliveryMethod = "interac" | "eft" | "card_push" | "stripe_connect" | "paylink";
type FundingSource = "wallet" | "card";

const DELIVERY_FEES: Record<DeliveryMethod, number> = { interac: 0.5, eft: 0, card_push: 1.0, stripe_connect: 1.0, paylink: 0 };
const CARD_PROCESSING_FEE = 1.5;

const FLOW_STEPS = [
  { num: 1, label: "Amount" },
  { num: 2, label: "Recipient" },
  { num: 3, label: "Confirm" },
] as const;

type DeliveryOption = {
  id: DeliveryMethod;
  title: string;
  subtitle: string;
  feeLabel: string;
  icon: typeof Landmark;
  badge?: string;
  disabled?: boolean;
};

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-md mx-auto">
      {FLOW_STEPS.map((s, i) => {
        const done = step > s.num;
        const active = step === s.num;
        return (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 min-w-[72px]">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  done ? "bg-primary text-primary-foreground"
                    : active ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : s.num}
              </div>
              <span className={`text-[11px] font-medium ${active || done ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-5 rounded-full ${step > s.num ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

// Sender funding card — own <Elements> provider (must not nest inside another Elements).
type SenderCardHandle = {
  tokenize: (name: string) => Promise<{ token: string; last4: string; brand: string }>;
  isComplete: () => boolean;
  clear: () => void;
};

const SenderCardInner = forwardRef<SenderCardHandle, { onValidityChange: (v: boolean) => void; elementStyle: any }>(
  ({ onValidityChange, elementStyle }, ref) => {
    const stripe = useStripe();
    const elements = useElements();
    const [num, setNum] = useState(false);
    const [exp, setExp] = useState(false);
    const [cvc, setCvc] = useState(false);

    useEffect(() => { onValidityChange(num && exp && cvc); }, [num, exp, cvc, onValidityChange]);

    useImperativeHandle(ref, () => ({
      isComplete: () => num && exp && cvc,
      tokenize: async (name: string) => {
        if (!stripe || !elements) throw new Error("Card form not ready");
        const cardEl = elements.getElement(CardNumberElement);
        if (!cardEl) throw new Error("Card form not ready");
        return tokenizeDebitCard(stripe, cardEl, { name: name || "Cardholder" });
      },
      clear: () => {
        elements?.getElement(CardNumberElement)?.clear();
        elements?.getElement(CardExpiryElement)?.clear();
        elements?.getElement(CardCvcElement)?.clear();
      },
    }), [stripe, elements, num, exp, cvc]);

    return (
      <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="w-4 h-4" /> Your card (funds this transfer)
        </div>
        <div className="space-y-2">
          <Label>Card Number</Label>
          <div className={elementWrapperClass}>
            <CardNumberElement
              options={{ style: elementStyle, showIcon: true, placeholder: "1234 1234 1234 1234" }}
              onChange={(e) => setNum(e.complete)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Expiry (MM / YY)</Label>
            <div className={elementWrapperClass}>
              <CardExpiryElement options={{ style: elementStyle }} onChange={(e) => setExp(e.complete)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>CVC</Label>
            <div className={elementWrapperClass}>
              <CardCvcElement options={{ style: elementStyle }} onChange={(e) => setCvc(e.complete)} />
            </div>
          </div>
        </div>
      </div>
    );
  }
);
SenderCardInner.displayName = "SenderCardInner";

const SenderCardSection = forwardRef<SenderCardHandle, { onValidityChange: (v: boolean) => void; elementStyle: any; totalCharged: number }>(
  ({ onValidityChange, elementStyle, totalCharged }, ref) => {
    const [stripeP] = useState<Promise<Stripe | null>>(() => getStripe());
    const [ready, setReady] = useState<boolean | null>(null);
    useEffect(() => {
      let alive = true;
      stripeP.then((s) => { if (alive) setReady(!!s); });
      return () => { alive = false; };
    }, [stripeP]);

    if (ready === false) {
      return (
        <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
          <strong>Card payments are temporarily unavailable.</strong>
          <p className="mt-1 text-destructive/90">
            The Stripe publishable key is missing or invalid. Please contact support
            or pay from your CAD wallet instead.
          </p>
        </div>
      );
    }
    if (ready === null) {
      return (
        <div className="p-4 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
          Loading secure card form…
        </div>
      );
    }
    return (
      <Elements stripe={stripeP} key="sender-card-elements">
        <SenderCardInner ref={ref} onValidityChange={onValidityChange} elementStyle={elementStyle} />
        <p className="text-[11px] text-muted-foreground px-4 pb-1 -mt-2">
          Charged for C${totalCharged.toFixed(2)}. Your card details never touch our servers — secured by Stripe.
        </p>
      </Elements>
    );
  }
);
SenderCardSection.displayName = "SenderCardSection";

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
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Expiry (MM / YY)</Label>
            <div className={elementWrapperClass}>
              <CardExpiryElement options={{ style: elementStyle }} onChange={(e) => setExp(e.complete)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>CVC</Label>
            <div className={elementWrapperClass}>
              <CardCvcElement options={{ style: elementStyle }} onChange={(e) => setCvc(e.complete)} />
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
    const [stripeP] = useState<Promise<Stripe | null>>(() => getStripe());
    const [ready, setReady] = useState<boolean | null>(null);
    useEffect(() => {
      let alive = true;
      stripeP.then((s) => { if (alive) setReady(!!s); });
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
  const elementStyle = useStripeElementStyle();
  const navigate = useNavigate();
  const { requirePin, pinGate } = usePinGate();
  const { data: profile } = useProfile();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: beneficiaries } = useBeneficiaries();

  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<DeliveryMethod>(PAYSAFE_PAYOUTS_ENABLED ? "eft" : "card_push");
  const [funding, setFunding] = useState<FundingSource>("wallet");
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [pickedBeneficiaryId, setPickedBeneficiaryId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
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
  // Recipient — Stripe card-push KYC
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [addrLine1, setAddrLine1] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrPostal, setAddrPostal] = useState("");
  const [recipientTosAccepted, setRecipientTosAccepted] = useState(false);
  // Sender card (Stripe Elements completion state)
  const [cardNumComplete, setCardNumComplete] = useState(false);
  const [cardExpComplete, setCardExpComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  const [cardSubmitting, setCardSubmitting] = useState(false);

  // Sender / recipient debit cards — each in its own Stripe Elements scope
  const senderCardRef = useRef<SenderCardHandle>(null);
  const recipientCardRef = useRef<RecipientCardHandle>(null);
  const [recipientCardComplete, setRecipientCardComplete] = useState(false);
  const cardPanelRef = useRef<HTMLDivElement | null>(null);

  const [lastTransferId, setLastTransferId] = useState<string | null>(null);
  const [security, setSecurity] = useState<{ question: string; answer: string } | null>(null);
  const [paylinkResult, setPaylinkResult] = useState<{ url: string; code: string; expires_at: string; amount: number } | null>(null);
  const [paylinkRevoked, setPaylinkRevoked] = useState(false);
  const [paylinkRevokeOpen, setPaylinkRevokeOpen] = useState(false);
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

  // Paysafe rails off during provider test — default to Stripe card push.
  useEffect(() => {
    if (!PAYSAFE_PAYOUTS_ENABLED && (method === "eft" || method === "interac")) {
      setMethod("card_push");
    }
  }, [method]);

  const applyCanadaBeneficiary = (b: Beneficiary) => {
    setPickedBeneficiaryId(b.id);
    setRecipientName(b.eft_account_holder || b.name);
    setRecipientEmail(b.interac_email || b.email || "");
    if (b.eft_institution) setInstitutionNumber(b.eft_institution);
    if (b.eft_transit) setTransitNumber(b.eft_transit);
    if (b.eft_account) setAccountNumber(b.eft_account);
    if (b.bank_name) setBankName(b.bank_name);
    if (b.payout_method === "eft" && b.eft_account) setMethod("eft");
    else if (b.payout_method === "interac" && b.interac_email) setMethod("interac");
    else if (b.eft_account) setMethod("eft");
    else if (b.interac_email) setMethod("interac");
  };

  const clearSelectedContact = () => {
    setPickedBeneficiaryId(null);
    setRecipientName("");
    setRecipientEmail("");
    setInstitutionNumber("");
    setTransitNumber("");
    setAccountNumber("");
    setBankName("");
  };

  useEffect(() => {
    const bid = searchParams.get("beneficiaryId");
    if (!bid || !beneficiaries?.length) return;
    const b = beneficiaries.find((x) => x.id === bid);
    if (b && isCanadaBeneficiary(b)) {
      applyCanadaBeneficiary(b);
      setStep(2);
      searchParams.delete("beneficiaryId");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beneficiaries]);

  const defaultAddMethod = method === "interac" ? "interac" as const
    : method === "eft" ? "eft" as const
    : "none" as const;

  const deliveryOptions: DeliveryOption[] = useMemo(() => [
    {
      id: "eft",
      title: "Bank transfer",
      subtitle: PAYSAFE_PAYOUTS_ENABLED ? "Direct deposit · 1–3 business days" : "Paysafe · unavailable in test",
      feeLabel: "Free",
      icon: Landmark,
      disabled: !PAYSAFE_PAYOUTS_ENABLED,
      badge: PAYSAFE_PAYOUTS_ENABLED ? undefined : "Paysafe test",
    },
    ...(INTERAC_ETRANSFER_ENABLED ? [{
      id: "interac" as const,
      title: "Interac e-Transfer",
      subtitle: "Email deposit · minutes",
      feeLabel: "C$0.50",
      icon: Zap,
      badge: "Beta",
    }] : []),
    {
      id: "card_push",
      title: "Instant to debit card",
      subtitle: "Visa Direct · seconds",
      feeLabel: "C$1.00",
      icon: CreditCard,
      badge: "Stripe",
    },
    {
      id: "stripe_connect",
      title: "My Stripe account",
      subtitle: connectReady ? "Instant payout to your card" : "Finish setup at /stripe-connect",
      feeLabel: "C$1.00",
      icon: Building2,
      badge: connectReady ? "Stripe" : "Setup",
    },
    {
      id: "paylink",
      title: "Payment link",
      subtitle: "Recipient chooses how to claim",
      feeLabel: "Free",
      icon: Link2,
      badge: "Stripe",
    },
  ], [connectReady]);

  const handleDeliverySelect = (opt: DeliveryOption) => {
    if (opt.id === "stripe_connect" && !connectReady) {
      navigate("/stripe-connect");
      return;
    }
    if (opt.disabled) {
      toast.info("Bank transfer and Interac need Paysafe, which is still in test. Use a Stripe option instead.");
      return;
    }
    setMethod(opt.id);
  };

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

  // Step 1: amount + delivery method
  const isStep1Valid = parsedAmount > 0;

  const interacQAValid = method !== "interac"
    ? true
    : (!securityQuestion && !securityAnswer)
      || (securityQuestion.trim().length >= 4 && securityAnswer.trim().length >= 3);

  const recipientValid = method === "stripe_connect"
    ? !!connectAcct
    : method === "paylink"
      ? true  // recipient details optional for paylink (sender just generates a link)
      : method === "card_push"
        ? recipientName.trim().length > 1
            && recipientCardComplete
            && isRecipientKycValid("CAD", {
              dobDay,
              dobMonth,
              dobYear,
              phone: recipientPhone,
              addrLine1,
              addrCity,
              addrState,
              addrPostal,
              tosAccepted: recipientTosAccepted,
            })
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

  const isStep2Valid = recipientValid;

  const isStep3Valid = method === "paylink"
    ? !!selectedWallet && !insufficient
    : (funding === "card" || (!!selectedWallet && !insufficient)) && cardFieldsValid;

  const methodLabel = method === "eft" ? "Bank transfer (EFT)"
    : method === "interac" ? "Interac e-Transfer"
    : method === "card_push" ? "Instant to debit card"
    : method === "stripe_connect" ? "Stripe Connect"
    : "Payment link";

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
        setPaylinkResult({ url: data.url, code: data.code, expires_at: data.expires_at, amount: parsedAmount });
        setStep(4);
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
        if (!senderCardRef.current?.isComplete()) {
          toast.error("Please complete your card details");
          return;
        }
        setCardSubmitting(true);
        try {
          tokenized = await senderCardRef.current.tokenize(profile?.full_name || profile?.email || "Cardholder");
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
          body.recipient_kyc = buildRecipientKycPayload("CAD", {
            dobDay,
            dobMonth,
            dobYear,
            phone: recipientPhone,
            addrLine1,
            addrCity,
            addrState,
            addrPostal,
          });
          body.recipient_tos = { accepted: recipientTosAccepted };
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
      setStep(4);
      setCardSubmitting(false);
      toast.success("Canadian transfer initiated");

      if (user && !pickedBeneficiaryId) {
        try {
          const { isNew } = await recordTransferRecipient({
            user_id: user.id,
            name: recipientName,
            country_code: "CAD",
            currency_code: "CAD",
            payout_method: method,
            email: recipientEmail || null,
            eft_institution: method === "eft" ? institutionNumber : null,
            eft_transit: method === "eft" ? transitNumber : null,
            eft_account: method === "eft" ? accountNumber : null,
            eft_account_holder: method === "eft" ? recipientName : null,
            interac_email: method === "interac" ? recipientEmail : null,
          });
          if (isNew) setSavePromptOpen(true);
        } catch { /* non-fatal */ }
      } else if (user && pickedBeneficiaryId) {
        try {
          await recordTransferRecipient({
            user_id: user.id,
            name: recipientName,
            country_code: "CAD",
            currency_code: "CAD",
            payout_method: method,
            email: recipientEmail || null,
            eft_institution: method === "eft" ? institutionNumber : null,
            eft_transit: method === "eft" ? transitNumber : null,
            eft_account: method === "eft" ? accountNumber : null,
            eft_account_holder: method === "eft" ? recipientName : null,
            interac_email: method === "interac" ? recipientEmail : null,
          });
        } catch { /* non-fatal */ }
      }
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
    setPaylinkResult(null);
    setPaylinkRevoked(false);
    setPaylinkRevokeOpen(false);
    setSecurity(null);
    setPickedBeneficiaryId(null);
    setSavePromptOpen(false);
    setSaveModalOpen(false);
    senderCardRef.current?.clear();
  };

  const handleRevokePaylink = async () => {
    if (!paylinkResult?.code) return;
    setPaylinkSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("payment-link-revoke", {
        body: { code: paylinkResult.code },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPaylinkRevokeOpen(false);
      setPaylinkRevoked(true);
      toast.success("Link revoked — funds returned to wallet");
    } catch (e: any) {
      toast.error(e?.message || "Failed to revoke link");
    } finally {
      setPaylinkSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {step <= 3 && <StepIndicator step={step} />}

      {step === 1 && (
        <Card className="border-border/80 shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/60 bg-muted/20">
            <CardTitle className="text-xl font-display">How much are you sending?</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Same-currency CAD transfer within Canada.</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {noCadWallet ? (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  No CAD wallet yet — you can still send by card on the confirm step, or{" "}
                  <Link to="/wallet/topup" className="text-primary underline">top up CAD</Link> first.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>From wallet</Label>
                <Select value={walletId || selectedWallet?.wallet_id} onValueChange={setWalletId}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select CAD wallet" /></SelectTrigger>
                  <SelectContent>
                    {cadWallets.map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        🇨🇦 CAD — C${Number(w.balance).toFixed(2)} available
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Amount</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-medium text-muted-foreground">C$</span>
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
                  className="pl-14 text-3xl font-display font-bold h-16 tracking-tight"
                />
              </div>
              {selectedWallet && parsedAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Wallet balance: C${Number(selectedWallet.balance).toFixed(2)}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Label>How should they receive it?</Label>
              {STRIPE_CANADA_RAILS_NOTE && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                  <span>{STRIPE_CANADA_RAILS_NOTE}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {deliveryOptions.map((opt) => {
                  const Icon = opt.icon;
                  const active = method === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => handleDeliverySelect(opt)}
                      className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/40 bg-card"
                      } ${opt.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      {opt.badge && (
                        <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {opt.badge}
                        </span>
                      )}
                      {active && (
                        <span className="absolute top-2 left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                      <div className="flex items-start gap-3 pl-6">
                        <div className={`p-2 rounded-lg ${active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{opt.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.subtitle}</p>
                          <p className="text-[11px] font-medium text-primary mt-1.5">{opt.feeLabel}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {(!connectReady || !connectState.hasAccount) && (
                <p className="text-[11px] text-muted-foreground">
                  {!connectState.hasAccount
                    ? "Pay yourself via Stripe Connect — one-time setup required."
                    : connectState.message || "Stripe Connect needs a status sync."}{" "}
                  {connectAcct ? (
                    <>
                      <button type="button" onClick={handleManualRefresh} disabled={refreshingConnect} className="underline">
                        {refreshingConnect ? "Refreshing…" : "Refresh"}
                      </button>
                      {" · "}
                      <Link to="/stripe-connect" className="underline">Open setup</Link>
                    </>
                  ) : (
                    <Link to="/stripe-connect" className="underline">Set up Stripe Connect</Link>
                  )}
                </p>
              )}
            </div>

            <div className="rounded-xl bg-gradient-to-br from-primary/8 via-background to-primary/5 border border-primary/20 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Recipient receives</p>
              <p className="text-3xl font-display font-bold tabular-nums">
                C${receivedAmount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Delivery fee C${deliveryFee.toFixed(2)} · {methodLabel}
              </p>
            </div>

            <Button className="w-full h-12 text-base gap-2" size="lg" onClick={() => setStep(2)} disabled={!isStep1Valid}>
              Continue to recipient <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-border/80 shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/60 bg-muted/20">
            <CardTitle className="text-xl font-display">Who are you sending to?</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              C${parsedAmount.toFixed(2)} via {methodLabel.toLowerCase()}
            </p>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {method !== "stripe_connect" && method !== "paylink" && (
              <div className="space-y-3 p-4 rounded-xl border border-primary/20 bg-primary/[0.03]">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold">Saved contacts</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setAddContactOpen(true)}>
                    <UserPlus className="w-3.5 h-3.5" /> Add new
                  </Button>
                </div>
                <PayeePicker
                  filterCanada
                  placeholder="Search Canadian contacts…"
                  onSelect={applyCanadaBeneficiary}
                  onAddNew={() => setAddContactOpen(true)}
                />
                <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setPickerOpen(true)}>
                  <Users className="w-4 h-4" /> Browse all contacts
                </Button>
                {pickedBeneficiaryId && (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/25">
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                      {recipientName || "Contact selected"}
                    </span>
                    <button type="button" onClick={clearSelectedContact} className="text-muted-foreground hover:text-foreground" aria-label="Clear contact">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              {method !== "stripe_connect" && (
                <div className="space-y-2">
                  <Label>Full name {method === "paylink" && <span className="text-xs text-muted-foreground">(optional)</span>}</Label>
                  <Input
                    value={recipientName}
                    onChange={(e) => { setRecipientName(e.target.value); setPickedBeneficiaryId(null); }}
                    placeholder={method === "paylink" ? "Anyone with the link" : "Jane Doe"}
                  />
                </div>
              )}

              {method === "paylink" && (
                <>
                  <div className="space-y-2">
                    <Label>Note for recipient (optional)</Label>
                    <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Thanks for lunch 🍕" rows={2} />
                  </div>
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/25 text-sm flex items-start gap-3">
                    <Link2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-1 text-muted-foreground">
                      <p>We hold C${parsedAmount.toFixed(2)} in escrow and give you a shareable link. The recipient picks debit card (Stripe){PAYSAFE_PAYOUTS_ENABLED ? ", Interac, or EFT" : ""} when they claim.</p>
                      <p className="text-xs">Expires in 7 days · revocable anytime before claim</p>
                    </div>
                  </div>
                </>
              )}

              {method === "stripe_connect" && (
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    <Building2 className="w-4 h-4" /> Your Stripe connected account
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Recipient: <strong>{recipientName || profile?.full_name || profile?.email || "You"}</strong></p>
                    <p>Account: <span className="font-mono text-xs">{connectAcct?.stripe_account_id}</span></p>
                    {connectState.message && <p className="text-xs">{connectState.message}</p>}
                  </div>
                </div>
              )}

              {method === "eft" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Institution #</Label>
                      <Input inputMode="numeric" maxLength={3} value={institutionNumber} onChange={(e) => { setInstitutionNumber(e.target.value.replace(/\D/g, "")); setPickedBeneficiaryId(null); }} placeholder="001" />
                    </div>
                    <div className="space-y-2">
                      <Label>Transit #</Label>
                      <Input inputMode="numeric" maxLength={5} value={transitNumber} onChange={(e) => { setTransitNumber(e.target.value.replace(/\D/g, "")); setPickedBeneficiaryId(null); }} placeholder="12345" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Account number</Label>
                    <Input inputMode="numeric" value={accountNumber} onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "")); setPickedBeneficiaryId(null); }} placeholder="1234567" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bank name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Royal Bank of Canada" />
                  </div>
                </>
              )}

              {method === "interac" && (
                <>
                  <div className="space-y-2">
                    <Label>Interac email</Label>
                    <Input type="email" value={recipientEmail} onChange={(e) => { setRecipientEmail(e.target.value); setPickedBeneficiaryId(null); }} placeholder="jane@example.com" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Security question <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input value={securityQuestion} onChange={(e) => setSecurityQuestion(e.target.value)} placeholder="Favourite city?" />
                    </div>
                    <div className="space-y-2">
                      <Label>Answer</Label>
                      <Input value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)} placeholder="Lowercase, no spaces" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Message <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Birthday gift 🎁" rows={2} />
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Interac is in <strong>beta</strong> — use EFT or instant card if it fails.</span>
                  </div>
                </>
              )}

              {method === "card_push" && (
                <>
                  <div className="space-y-2">
                    <Label>Email for receipt <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="jane@example.com" />
                  </div>
                  <RecipientCardSection ref={recipientCardRef} onValidityChange={setRecipientCardComplete} elementStyle={elementStyle} />
                  <RecipientStripeKycFields
                    currency="CAD"
                    dobDay={dobDay}
                    dobMonth={dobMonth}
                    dobYear={dobYear}
                    phone={recipientPhone}
                    addrLine1={addrLine1}
                    addrCity={addrCity}
                    addrState={addrState}
                    addrPostal={addrPostal}
                    tosAccepted={recipientTosAccepted}
                    onDobDay={setDobDay}
                    onDobMonth={setDobMonth}
                    onDobYear={setDobYear}
                    onPhone={setRecipientPhone}
                    onAddrLine1={setAddrLine1}
                    onAddrCity={setAddrCity}
                    onAddrState={setAddrState}
                    onAddrPostal={setAddrPostal}
                    onTosAccepted={setRecipientTosAccepted}
                  />
                </>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
              <Button className="flex-1 gap-2" onClick={() => setStep(3)} disabled={!isStep2Valid}>
                Review & confirm <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="border-border/80 shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/60 bg-muted/20">
            <CardTitle className="text-xl font-display">Review & confirm</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Check the details before you send.</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="rounded-xl border border-border bg-card p-4">
              <ReviewRow label="Recipient" value={recipientName || (method === "paylink" ? "Anyone with link" : "—")} />
              <ReviewRow label="Delivery" value={methodLabel} />
              <ReviewRow label="They receive" value={`C$${receivedAmount.toFixed(2)}`} />
              <ReviewRow label="Delivery fee" value={`C$${deliveryFee.toFixed(2)}`} />
              {method === "eft" && institutionNumber && (
                <ReviewRow label="Bank" value={`${institutionNumber}-${transitNumber} ····${accountNumber.slice(-4)}`} />
              )}
              {method === "interac" && recipientEmail && (
                <ReviewRow label="Interac email" value={recipientEmail} />
              )}
            </div>

            {method !== "paylink" && (
              <div className="space-y-3">
                <Label>Pay with</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFunding("wallet")}
                    disabled={noCadWallet}
                    className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                      funding === "wallet" ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/40"
                    } ${noCadWallet ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    {funding === "wallet" && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="w-5 h-5 text-primary" />
                      <span className="font-medium text-sm">CAD wallet</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {noCadWallet ? "Unavailable" : `Balance C$${Number(selectedWallet?.balance || 0).toFixed(2)}`}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFunding("card");
                      setTimeout(() => cardPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
                    }}
                    className={`relative text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      funding === "card" ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    {funding === "card" && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard className="w-5 h-5 text-primary" />
                      <span className="font-medium text-sm">Debit / credit card</span>
                      <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted">+C$1.50</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Secured by Stripe</p>
                  </button>
                </div>
                {insufficient && funding === "wallet" && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Insufficient wallet balance — pay by card or top up
                  </p>
                )}
              </div>
            )}

            {method !== "paylink" && funding === "card" && (
              <div ref={cardPanelRef}>
                <SenderCardSection
                  ref={senderCardRef}
                  onValidityChange={(v) => { setCardNumComplete(v); setCardExpComplete(v); setCardCvcComplete(v); }}
                  elementStyle={elementStyle}
                  totalCharged={totalCharged}
                />
              </div>
            )}

            <div className="rounded-xl bg-muted/40 border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total {funding === "card" ? "charged" : "debited"}</span>
                <span className="text-2xl font-display font-bold tabular-nums">C${totalCharged.toFixed(2)}</span>
              </div>
              {cardFee > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Includes C${cardFee.toFixed(2)} card processing fee</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Back</Button>
              <Button
                className="flex-1"
                onClick={() => method === "paylink" ? handleSubmit() : requirePin(handleSubmit, `C$${parsedAmount.toFixed(2)}`)}
                disabled={!isStep3Valid || createTransfer.isPending || cardSubmitting || paylinkSubmitting}
              >
                {(createTransfer.isPending || cardSubmitting || paylinkSubmitting)
                  ? "Processing…"
                  : method === "paylink"
                    ? `Create link · C$${parsedAmount.toFixed(2)}`
                    : `Send C$${parsedAmount.toFixed(2)}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && method === "paylink" && paylinkResult && (
        <Card>
          <CardContent className="py-10 text-center space-y-5">
            {paylinkRevoked ? (
              <>
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center"
                >
                  <X className="w-10 h-10 text-muted-foreground" />
                </motion.div>
                <div>
                  <h3 className="text-2xl font-display font-bold mb-1">Link revoked</h3>
                  <p className="text-sm text-muted-foreground">
                    C${paylinkResult.amount.toFixed(2)} was returned to your wallet. The claim link no longer works.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button onClick={reset}>Create another link</Button>
                  <Button variant="outline" asChild>
                    <Link to="/payment-links">All payment links</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="w-20 h-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center"
            >
              <Link2 className="w-10 h-10 text-primary" />
            </motion.div>
            <div>
              <h3 className="text-2xl font-display font-bold mb-1">Payment link ready</h3>
              <p className="text-sm text-muted-foreground">
                C${paylinkResult.amount.toFixed(2)} is held in escrow. Share the link below.
              </p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/40 text-left">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Claim link</p>
              <code className="block text-sm break-all">{paylinkResult.url}</code>
              <p className="text-[11px] text-muted-foreground mt-2">
                Expires {new Date(paylinkResult.expires_at).toLocaleString()} · single use
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Changed your mind?{" "}
              <button
                type="button"
                className="text-destructive underline underline-offset-2 hover:no-underline disabled:opacity-50"
                disabled={paylinkSubmitting}
                onClick={() => setPaylinkRevokeOpen(true)}
              >
                Revoke link and return funds to wallet
              </button>
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button onClick={async () => { await navigator.clipboard.writeText(paylinkResult.url); toast.success("Link copied"); }}>
                <Copy className="w-4 h-4 mr-2" /> Copy link
              </Button>
              {typeof navigator !== "undefined" && (navigator as any).share && (
                <Button variant="outline" onClick={() => (navigator as any).share({ title: "Payment for you", text: `${recipientName || "Hey"}, claim your C$${paylinkResult.amount.toFixed(2)} here:`, url: paylinkResult.url })}>
                  <Share2 className="w-4 h-4 mr-2" /> Share
                </Button>
              )}
              <Button variant="outline" asChild>
                <a href={`mailto:${recipientEmail || ""}?subject=${encodeURIComponent("You've got a payment")}&body=${encodeURIComponent(`Claim your C$${paylinkResult.amount.toFixed(2)} here: ${paylinkResult.url}`)}`}>Email it</a>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/payment-links">Manage links</Link>
              </Button>
              <Button variant="outline" onClick={reset}>Done</Button>
            </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 4 && method !== "paylink" && (
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
      {paylinkResult && (
        <RevokePaymentLinkDialog
          open={paylinkRevokeOpen}
          onOpenChange={(open) => { if (!open && !paylinkSubmitting) setPaylinkRevokeOpen(open); }}
          shortCode={paylinkResult.code}
          amount={paylinkResult.amount}
          currency="CAD"
          recipientLabel={recipientName || null}
          busy={paylinkSubmitting}
          onConfirm={handleRevokePaylink}
        />
      )}
      {pinGate}

      <ContactsPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        filterCanada
        onSelect={applyCanadaBeneficiary}
        onAddNew={() => setAddContactOpen(true)}
      />

      <AddBeneficiaryModal
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        defaultMethod={defaultAddMethod}
        onSaved={(b) => { applyCanadaBeneficiary(b); toast.success("Contact saved"); }}
      />

      <AddBeneficiaryModal
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        defaultMethod={defaultAddMethod}
        editing={{
          id: "",
          user_id: user?.id || "",
          name: recipientName,
          phone: null,
          country_code: "CAD",
          payout_method: method === "eft" ? "eft" : method === "interac" ? "interac" : null,
          network: null,
          bank_name: bankName || null,
          bank_code: null,
          bank_account: null,
          currency_code: "CAD",
          nickname: null,
          avatar_initials: null,
          transfer_count: 0,
          last_sent_at: null,
          created_at: "",
          updated_at: "",
          category: "person",
          email: recipientEmail || null,
          eft_institution: method === "eft" ? institutionNumber : null,
          eft_transit: method === "eft" ? transitNumber : null,
          eft_account: method === "eft" ? accountNumber : null,
          eft_account_holder: method === "eft" ? recipientName : null,
          interac_email: method === "interac" ? recipientEmail : null,
          notes: null,
          tags: [],
        }}
      />

      <AlertDialog open={savePromptOpen} onOpenChange={setSavePromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save {recipientName || "this recipient"} as a contact?</AlertDialogTitle>
            <AlertDialogDescription>
              Save their details for faster domestic sends next time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No thanks</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setSavePromptOpen(false); setSaveModalOpen(true); }}>
              Save contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CanadaSendFlow;
