import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Zap, Info } from "lucide-react";
import { tokenizeDebitCard } from "@/lib/stripePayouts";
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

// Shared Stripe Elements styling so sender + recipient card forms look identical.
export function useStripeElementStyle() {
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

export const elementWrapperClass =
  "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2";

// Recipient card section runs in its OWN <Elements> provider so it can host
// a second CardNumberElement alongside the sender card. Exposes tokenize() via ref.
export type RecipientCardHandle = {
  tokenize: (recipientName: string) => Promise<{ token: string; last4: string; brand: string }>;
  isComplete: () => boolean;
};

type RecipientCardProps = {
  onValidityChange: (v: boolean) => void;
  elementStyle: any;
  // ISO currency for the recipient card (lowercase). Defaults to CAD for the
  // Canadian domestic flow; international corridors pass usd/gbp/eur/etc.
  currency?: string;
};

const RecipientCardInner = forwardRef<RecipientCardHandle, RecipientCardProps>(
  ({ onValidityChange, elementStyle, currency = "cad" }, ref) => {
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
        return tokenizeDebitCard(stripe, cardEl, { name: recipientName || "Recipient", currency });
      },
    }), [stripe, elements, num, exp, cvc, currency]);

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
          Debit cards only (Visa Debit, Debit Mastercard) issued in supported corridors (CA, US, UK, EU).
        </p>
      </div>
    );
  }
);
RecipientCardInner.displayName = "RecipientCardInner";

export const RecipientCardSection = forwardRef<RecipientCardHandle, RecipientCardProps>(
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
