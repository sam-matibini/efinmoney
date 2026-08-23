/**
 * CAD wallet top-up via Bambora Custom Checkout (tokenize in browser → charge on edge).
 */
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  walletId: string;
  walletCurrency: string;
  initialAmount?: string;
  embedded?: boolean;
  onComplete?: () => void;
};

declare global {
  interface Window {
    customcheckout?: () => BamboraCheckout;
  }
}

type BamboraCheckout = {
  create: (field: string, opts?: Record<string, unknown>) => BamboraField;
  createToken: (cb: (result: { error?: { message?: string }; token?: string }) => void) => void;
};

type BamboraField = {
  mount: (selector: string) => void;
  on: (event: string, cb: (data: { empty?: boolean; error?: { message?: string } }) => void) => void;
};

const SCRIPT_URL = "https://libs.na.bambora.com/customcheckout/1/customcheckout.js";

function loadScript(): Promise<void> {
  if (window.customcheckout) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      if (window.customcheckout) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Bambora checkout"));
    document.head.appendChild(s);
  });
}

export default function BamboraTopUpCard({
  walletId,
  walletCurrency,
  initialAmount = "",
  embedded = false,
  onComplete,
}: Props) {
  const ccy = walletCurrency.toUpperCase();
  const [amount, setAmount] = useState(initialAmount);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [merchantId, setMerchantId] = useState("");
  const [fieldError, setFieldError] = useState("");
  const checkoutRef = useRef<BamboraCheckout | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("bambora-config", { body: {} });
        if (error) throw error;
        const mid = String((data as { merchant_id?: string })?.merchant_id || "");
        if (!mid || !(data as { ready?: boolean })?.ready) {
          throw new Error("Bambora card collect is not ready yet");
        }
        if (cancelled) return;
        setMerchantId(mid);
        await loadScript();
        if (cancelled || !window.customcheckout) throw new Error("Bambora script missing");

        const cc = window.customcheckout();
        checkoutRef.current = cc;
        if (!mountedRef.current) {
          const style = {
            base: {
              fontSize: "16px",
              color: "#0f172a",
              fontFamily: "Inter, system-ui, sans-serif",
            },
            error: { color: "#b91c1c" },
          };
          cc.create("card-number", { style, placeholder: "Card number" }).mount("#bambora-card-number");
          cc.create("expiry", { style, placeholder: "MM / YY" }).mount("#bambora-expiry");
          cc.create("cvv", { style, placeholder: "CVV" }).mount("#bambora-cvv");
          mountedRef.current = true;
        }
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setFieldError(e instanceof Error ? e.message : "Bambora unavailable");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (ccy !== "CAD") {
    return <p className="text-sm text-destructive">Bambora card top-up is CAD only for now.</p>;
  }

  const pay = async () => {
    const amt = Number(String(amount).replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error("Enter at least C$1.00");
      return;
    }
    if (!name.trim()) {
      toast.error("Enter the name on the card");
      return;
    }
    if (!checkoutRef.current) {
      toast.error("Card form is still loading");
      return;
    }

    setBusy(true);
    setFieldError("");
    try {
      const token = await new Promise<string>((resolve, reject) => {
        checkoutRef.current!.createToken((result) => {
          if (result.error || !result.token) {
            reject(new Error(result.error?.message || "Could not tokenize card"));
            return;
          }
          resolve(result.token);
        });
      });

      const { data, error } = await supabase.functions.invoke("bambora-create-payment", {
        body: {
          token,
          name: name.trim(),
          amount: amt,
          currency: "CAD",
          walletId,
        },
      });
      const errMsg =
        (data as { error?: string } | null)?.error
        || (typeof data === "string" ? data : null)
        || error?.message;
      if (error || (data as { error?: string } | null)?.error) {
        throw new Error(errMsg || "Payment failed");
      }

      toast.success(`C$${Number((data as { amount?: number }).amount ?? amt).toFixed(2)} added to your wallet`);
      onComplete?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      setFieldError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="space-y-4">
      {!embedded && (
        <div className="space-y-2">
          <Label>Amount (CAD)</Label>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100.00"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label>Name on card</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="As printed on card" autoComplete="cc-name" />
      </div>
      <div className="space-y-2">
        <Label>Card number</Label>
        <div id="bambora-card-number" className="h-10 rounded-md border bg-background px-3 py-2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Expiry</Label>
          <div id="bambora-expiry" className="h-10 rounded-md border bg-background px-3 py-2" />
        </div>
        <div className="space-y-2">
          <Label>CVV</Label>
          <div id="bambora-cvv" className="h-10 rounded-md border bg-background px-3 py-2" />
        </div>
      </div>
      {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
      <Button className="w-full" disabled={busy || !ready} onClick={() => void pay()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
        {busy ? "Processing…" : `Pay C$${Number(amount || 0).toFixed(2) || "—"}`}
      </Button>
      {merchantId && (
        <p className="text-[11px] text-muted-foreground text-center">
          Secured by Worldline · Merchant {merchantId}
        </p>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Card top-up (CAD)</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
