import { useEffect, useMemo, useState } from "react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStripe } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";

interface Props {
  onSuccess?: () => void;
  onCancel?: () => void;
  ctaLabel?: string;
}

function resolveCssColor(value: string, fallback: string) {
  if (typeof window === "undefined" || !value) return fallback;
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color || fallback;
  document.body.removeChild(probe);
  return resolved;
}

function getThemeColors() {
  if (typeof window === "undefined") return { text: "#fff", placeholder: "#94a3b8" };
  const styles = getComputedStyle(document.documentElement);
  const fg = styles.getPropertyValue("--foreground").trim();
  const muted = styles.getPropertyValue("--muted-foreground").trim();
  return {
    text: resolveCssColor(fg ? `hsl(${fg})` : "", "#fff"),
    placeholder: resolveCssColor(muted ? `hsl(${muted})` : "", "#94a3b8"),
  };
}

function buildCardOptions() {
  const { text, placeholder } = getThemeColors();
  return {
    hidePostalCode: true,
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

function InnerForm({ onSuccess, onCancel, ctaLabel }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const [name, setName] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const cardOptions = useMemo(() => buildCardOptions(), []);

  useEffect(() => {
    if (!name && profile?.full_name) setName(profile.full_name.toUpperCase());
  }, [profile?.full_name]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return toast.error("Stripe not ready");
    if (!name.trim()) return toast.error("Cardholder name is required");
    const card = elements.getElement(CardElement);
    if (!card) return toast.error("Card field not ready");

    setSaving(true);
    try {
      const { data: setup, error: setupErr } = await supabase.functions.invoke("stripe-save-card", {
        body: {},
      });
      if (setupErr || !setup?.clientSecret) {
        throw new Error(setupErr?.message || setup?.error || "Failed to start card setup");
      }

      const { error: confirmErr, setupIntent } = await stripe.confirmCardSetup(setup.clientSecret, {
        payment_method: { card, billing_details: { name: name.trim() } },
      });
      if (confirmErr) throw new Error(confirmErr.message);
      if (!setupIntent || setupIntent.status !== "succeeded") {
        throw new Error(`Card setup ${setupIntent?.status ?? "failed"}`);
      }

      const { data: saved, error: saveErr } = await supabase.functions.invoke("stripe-save-card-confirm", {
        body: { setup_intent_id: setupIntent.id },
      });
      if (saveErr || !saved?.success) {
        throw new Error(saveErr?.message || saved?.error || "Failed to save card");
      }

      await qc.invalidateQueries({ queryKey: ["saved-cards", user?.id] });
      toast.success("Card saved securely");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save card");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <span>Card details are tokenized by Stripe — they never touch our servers.</span>
      </div>

      <div className="space-y-2">
        <Label>Cardholder Name</Label>
        <Input
          placeholder="JOHN DOE"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          maxLength={50}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Card details</span>
          {!cardReady && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </span>
          )}
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-3.5">
          <CardElement options={cardOptions} onReady={() => setCardReady(true)} />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={!stripe || !cardReady || saving}>
          {saving ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
          ) : (
            ctaLabel ?? "Save Card"
          )}
        </Button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" /> Secured by Stripe
      </p>
    </form>
  );
}

export default function SaveCardForm(props: Props) {
  const [stripeReady, setStripeReady] = useState<Awaited<ReturnType<typeof getStripe>> | null>(null);

  useEffect(() => { getStripe().then(setStripeReady); }, []);

  if (!stripeReady) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading secure form…
      </div>
    );
  }

  return (
    <Elements stripe={stripeReady}>
      <InnerForm {...props} />
    </Elements>
  );
}
