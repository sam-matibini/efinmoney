/**
 * Wallet top-up via Bambora Custom Checkout (CAD / USD).
 * Supports one-shot charge, save card, and charge saved profile cards.
 */
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBamboraMethods, useChargeBamboraSaved } from "@/hooks/useBamboraMethods";
import { useQueryClient } from "@tanstack/react-query";

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
  createToken: (cb: (result: {
    error?: { message?: string; type?: string };
    token?: string;
    last4?: string;
  }) => void) => void;
  on: (event: string, cb: (data: { field?: string; message?: string; empty?: boolean; error?: { message?: string } }) => void) => void;
};

type BamboraField = {
  mount: (selector: string) => void;
  on: (event: string, cb: (data: { empty?: boolean; error?: { message?: string } }) => void) => void;
};

const SCRIPT_URL = "https://libs.na.bambora.com/customcheckout/1/customcheckout.js";
const SUPPORTED = new Set(["CAD", "USD"]);

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

function moneyPrefix(ccy: string) {
  return ccy === "USD" ? "$" : "C$";
}

export default function BamboraTopUpCard({
  walletId,
  walletCurrency,
  initialAmount = "",
  embedded = false,
  onComplete,
}: Props) {
  const ccy = walletCurrency.toUpperCase();
  const qc = useQueryClient();
  const { data: methods = [] } = useBamboraMethods();
  const chargeSaved = useChargeBamboraSaved();
  const savedCards = methods.filter((m) => m.method_type === "card" && m.currency_code === ccy);

  const [amount, setAmount] = useState(initialAmount);
  const [name, setName] = useState("");
  const [saveCard, setSaveCard] = useState(true);
  const [selectedSavedId, setSelectedSavedId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [merchantId, setMerchantId] = useState("");
  const [fieldError, setFieldError] = useState("");
  const checkoutRef = useRef<BamboraCheckout | null>(null);
  const mountedRef = useRef(false);
  const mountSuffix = useRef(`b${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);

  useEffect(() => {
    if (savedCards.length && !selectedSavedId) {
      const def = savedCards.find((c) => c.is_default) || savedCards[0];
      setSelectedSavedId(def.id);
    } else if (!savedCards.length) {
      setSelectedSavedId("__new__");
    }
  }, [savedCards, selectedSavedId]);

  const usingNew = selectedSavedId === "__new__" || !savedCards.length;

  useEffect(() => {
    if (!SUPPORTED.has(ccy) || !usingNew) {
      checkoutRef.current = null;
      mountedRef.current = false;
      setReady(false);
      return;
    }
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

        // Small delay so mount targets exist in DOM after radio selection.
        await new Promise((r) => setTimeout(r, 50));
        if (cancelled) return;

        const cc = window.customcheckout();
        checkoutRef.current = cc;
        cc.on("error", (event: { field?: string; message?: string }) => {
          if (event?.message) setFieldError(event.message);
        });
        if (!mountedRef.current) {
          const style = {
            base: {
              fontSize: "16px",
              color: "#0f172a",
              fontFamily: "Inter, system-ui, sans-serif",
            },
            error: { color: "#b91c1c" },
          };
          cc.create("card-number", { style, placeholder: "Card number", brands: ["visa", "mastercard"] })
            .mount(`#bambora-card-number-${mountSuffix}`);
          cc.create("expiry", { style, placeholder: "MM / YY" }).mount(`#bambora-expiry-${mountSuffix}`);
          cc.create("cvv", { style, placeholder: "CVV" }).mount(`#bambora-cvv-${mountSuffix}`);
          mountedRef.current = true;
        }
        setReady(true);
        setFieldError("");
      } catch (e) {
        if (!cancelled) {
          setFieldError(e instanceof Error ? e.message : "Bambora unavailable");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ccy, mountSuffix, usingNew]);

  if (!SUPPORTED.has(ccy)) {
    return <p className="text-sm text-destructive">Bambora card top-up supports CAD and USD.</p>;
  }

  const prefix = moneyPrefix(ccy);

  const paySaved = async (amt: number) => {
    if (!selectedSavedId) {
      toast.error("Select a saved card");
      return;
    }
    setBusy(true);
    setFieldError("");
    try {
      const data = await chargeSaved.mutateAsync({
        methodId: selectedSavedId,
        amount: amt,
        currency: ccy,
        walletId,
      });
      toast.success(`${prefix}${Number(data.amount ?? amt).toFixed(2)} added to your wallet`);
      onComplete?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      setFieldError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const payNew = async (amt: number) => {
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
            const msg = result.error?.message || "Could not tokenize card";
            if (/timeout|no response|TokenizationNoResponse/i.test(msg + (result.error?.type || ""))) {
              reject(new Error("Bambora could not reach Worldline — try again, disable ad blockers, or use CAD if USD is not enabled on the merchant."));
              return;
            }
            reject(new Error(msg));
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
          currency: ccy,
          walletId,
          saveCard,
        },
      });
      const errMsg =
        (data as { error?: string } | null)?.error
        || (typeof data === "string" ? data : null)
        || error?.message;
      if (error || (data as { error?: string } | null)?.error) {
        throw new Error(errMsg || "Payment failed");
      }

      if (saveCard) qc.invalidateQueries({ queryKey: ["bambora-methods"] });
      toast.success(`${prefix}${Number((data as { amount?: number }).amount ?? amt).toFixed(2)} added to your wallet`);
      onComplete?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      setFieldError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    const amt = Number(String(amount).replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error(`Enter at least ${prefix}1.00`);
      return;
    }
    if (usingNew) {
      await payNew(amt);
    } else {
      await paySaved(amt);
    }
  };

  const body = (
    <div className="space-y-4">
      {!embedded && (
        <div className="space-y-2">
          <Label>Amount ({ccy})</Label>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100.00"
          />
        </div>
      )}

      {savedCards.length > 0 && (
        <div className="space-y-2">
          <Label>Pay with</Label>
          <div className="space-y-2">
            {savedCards.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  name={`bambora-saved-${mountSuffix}`}
                  checked={selectedSavedId === c.id}
                  onChange={() => setSelectedSavedId(c.id)}
                />
                <span className="capitalize">{c.card_brand || "Card"}</span>
                <span>•••• {c.last_four}</span>
                {c.exp_month && c.exp_year ? (
                  <span className="text-muted-foreground">
                    {String(c.exp_month).padStart(2, "0")}/{String(c.exp_year).slice(-2)}
                  </span>
                ) : null}
              </label>
            ))}
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={`bambora-saved-${mountSuffix}`}
                checked={selectedSavedId === "__new__"}
                onChange={() => setSelectedSavedId("__new__")}
              />
              New card
            </label>
          </div>
        </div>
      )}

      {usingNew && (
        <>
          <div className="space-y-2">
            <Label>Name on card</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="As printed on card" autoComplete="cc-name" />
          </div>
          <div className="space-y-2">
            <Label>Card number</Label>
            <div id={`bambora-card-number-${mountSuffix}`} className="h-10 rounded-md border bg-background px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Expiry</Label>
              <div id={`bambora-expiry-${mountSuffix}`} className="h-10 rounded-md border bg-background px-3 py-2" />
            </div>
            <div className="space-y-2">
              <Label>CVV</Label>
              <div id={`bambora-cvv-${mountSuffix}`} className="h-10 rounded-md border bg-background px-3 py-2" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={saveCard} onCheckedChange={(v) => setSaveCard(v === true)} />
            Save card for next time
          </label>
        </>
      )}

      {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
      <Button className="w-full" disabled={busy || (usingNew && !ready)} onClick={() => void pay()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
        {busy ? "Processing…" : `Pay ${prefix}${Number(amount || 0).toFixed(2) || "—"}`}
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
        <CardTitle className="text-base">Card top-up ({ccy})</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
