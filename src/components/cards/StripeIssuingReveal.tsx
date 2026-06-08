import { useEffect, useState } from "react";
import { Elements, IssuingCardNumberDisplayElement, IssuingCardCvcDisplayElement, IssuingCardExpiryDisplayElement } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props { cardId: string; last4?: string | null }

// Stripe Issuing Elements: mounts Stripe-hosted iframes that display the real
// PAN/CVV/expiry without us ever touching the values.
const StripeIssuingReveal = ({ cardId, last4 }: Props) => {
  const [state, setState] = useState<{
    stripe: any;
    nonce: string;
    ephemeralKeySecret: string;
    issuingCardId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stripe: any = await getStripe();
        if (!stripe) throw new Error("Stripe failed to load");
        // 1. Client-side nonce
        const { nonce, error: nErr } = await stripe.createEphemeralKeyNonce({ issuingCard: cardId });
        if (nErr) throw new Error(nErr.message || "Failed to create nonce");
        // 2. Server-side ephemeral key bound to that nonce
        const { data, error: fnErr } = await supabase.functions.invoke("stripe-issuing-card-details", {
          body: { card_id: cardId, nonce },
        });
        if (fnErr) throw fnErr;
        if ((data as any)?.sandbox) {
          throw new Error("This card is a legacy sandbox card and has no real PAN.");
        }
        if (!(data as any)?.ephemeralKeySecret) throw new Error("Missing ephemeral key");
        if (!cancelled) setState({
          stripe,
          nonce,
          ephemeralKeySecret: (data as any).ephemeralKeySecret,
          issuingCardId: (data as any).issuingCardId,
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load card details");
      }
    })();
    return () => { cancelled = true; };
  }, [cardId]);

  if (error) return <div className="text-sm text-destructive p-3 rounded-lg bg-destructive/10">{error}</div>;
  if (!state) return <Skeleton className="h-28 w-full" />;

  const elementsOpts: any = { mode: "issuing" };
  const elemOpts = {
    issuingCard: state.issuingCardId,
    nonce: state.nonce,
    ephemeralKeySecret: state.ephemeralKeySecret,
    style: { base: { fontSize: "16px", color: "#fff", fontFamily: "ui-monospace, SFMono-Regular, monospace" } },
  } as any;

  const copy = async (label: string) => {
    // Stripe iframes block reading the value directly; offer a hint.
    toast.info(`${label} is displayed in a secure Stripe iframe — select and copy manually.`);
  };

  return (
    <Elements stripe={state.stripe} options={elementsOpts}>
      <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-700 space-y-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Card number</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 rounded bg-slate-800">
              <IssuingCardNumberDisplayElement options={elemOpts} />
            </div>
            <Button size="icon" variant="ghost" onClick={() => copy("Card number")}><Copy className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Expiry</div>
            <div className="px-3 py-2 rounded bg-slate-800">
              <IssuingCardExpiryDisplayElement options={elemOpts} />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">CVC</div>
            <div className="px-3 py-2 rounded bg-slate-800">
              <IssuingCardCvcDisplayElement options={elemOpts} />
            </div>
          </div>
        </div>
        {last4 && <p className="text-[11px] text-slate-500">Card ending in {last4}</p>}
      </div>
    </Elements>
  );
};

export default StripeIssuingReveal;
