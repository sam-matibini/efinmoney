/**
 * PayPal Checkout (Orders API) — Client ID + Secret, no Braintree.
 * createOrder → paypal-create-order; onApprove → paypal-capture-order → wallet credit.
 */
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

type Props = {
  walletId: string;
  walletCurrency: string;
  initialAmount?: string;
  embedded?: boolean;
  onComplete?: () => void;
};

const SUPPORTED = new Set(["USD", "CAD", "EUR", "GBP"]);
const SDK_NS = "paypal_sdk";
const SCRIPT_ID = "efm-paypal-js-sdk";

type PayPalNamespace = {
  Buttons: (opts: Record<string, unknown>) => { render: (el: string | HTMLElement) => Promise<void> };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
    paypal_sdk?: PayPalNamespace;
  }
}

function paypalApi(): PayPalNamespace | null {
  const api = window.paypal_sdk || window.paypal;
  if (api && typeof api.Buttons === "function") return api;
  return null;
}

function waitForButtons(timeoutMs = 12_000): Promise<PayPalNamespace> {
  const ready = paypalApi();
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const api = paypalApi();
      if (api) {
        resolve(api);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(
          new Error(
            "PayPal checkout did not finish loading. Try another card option, or refresh and try again.",
          ),
        );
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

function loadPayPalSdk(clientId: string, currency: string, environment: string): Promise<PayPalNamespace> {
  const wanted =
    `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}` +
    `&currency=${encodeURIComponent(currency)}` +
    `&intent=capture&components=buttons`;

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    const sameSrc =
      existing.src.includes(`client-id=${encodeURIComponent(clientId)}`) ||
      existing.src.includes(`client-id=${clientId}`);
    const sameCcy = existing.src.includes(`currency=${encodeURIComponent(currency)}`)
      || existing.src.includes(`currency=${currency}`);
    if (sameSrc && sameCcy && paypalApi()) {
      return Promise.resolve(paypalApi()!);
    }
    existing.remove();
    try {
      delete (window as { paypal?: unknown }).paypal;
      delete (window as { paypal_sdk?: unknown }).paypal_sdk;
    } catch {
      /* ignore */
    }
  }

  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = wanted;
    s.async = true;
    s.dataset.namespace = SDK_NS;
    s.dataset.environment = environment;
    s.onload = () => {
      void waitForButtons()
        .then(resolve)
        .catch(reject);
    };
    s.onerror = () => reject(new Error("PayPal SDK failed to load. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

export default function PayPalTopUpCard({
  walletId,
  walletCurrency,
  initialAmount = "",
  embedded = false,
  onComplete,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(initialAmount);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [stableAmount, setStableAmount] = useState(initialAmount);
  const buttonHostRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<{ close?: () => void } | null>(null);
  const ccy = walletCurrency.toUpperCase();

  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);

  useEffect(() => {
    const t = window.setTimeout(() => setStableAmount(amount), 400);
    return () => window.clearTimeout(t);
  }, [amount]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setReady(false);
      setBootError(null);
      if (!SUPPORTED.has(ccy)) {
        setBootError(`Card top-up is not available for ${ccy}`);
        return;
      }

      const amt = Number(String(stableAmount).replace(/,/g, ""));
      if (!Number.isFinite(amt) || amt < 1) return;

      try {
        const { data, error } = await supabase.functions.invoke("paypal-public-config");
        if (error || !data?.configured || !data?.clientId) {
          throw new Error(data?.error || error?.message || "Card checkout is not configured");
        }

        const paypal = await loadPayPalSdk(
          String(data.clientId),
          ccy,
          String(data.environment || "sandbox"),
        );
        if (cancelled || !buttonHostRef.current) return;

        try {
          buttonsRef.current?.close?.();
        } catch {
          /* ignore */
        }
        buttonHostRef.current.innerHTML = "";

        const buttons = paypal.Buttons({
          style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },
          createOrder: async () => {
            const { data: order, error: orderErr } = await supabase.functions.invoke("paypal-create-order", {
              body: { walletId, amount: amt, currency: ccy },
            });
            const errMsg = (order as { error?: string } | null)?.error || orderErr?.message;
            if (orderErr || (order as { error?: string } | null)?.error) {
              throw new Error(errMsg || "Could not create card checkout");
            }
            const id = String(order?.orderID || order?.orderId || "");
            if (!id) throw new Error("No PayPal order id");
            return id;
          },
          onApprove: async (data: { orderID?: string }) => {
            setBusy(true);
            try {
              const orderID = String(data.orderID || "");
              const { data: res, error: capErr } = await supabase.functions.invoke("paypal-capture-order", {
                body: { orderID, walletId, currency: ccy, amount: amt },
              });
              const errMsg = (res as { error?: string } | null)?.error || capErr?.message;
              if (capErr || (res as { error?: string } | null)?.error) {
                throw new Error(errMsg || "Capture failed");
              }
              toast.success(
                (res as { already?: boolean })?.already
                  ? "Payment already credited"
                  : `${ccy} ${Number((res as { amount?: number })?.amount ?? amt).toLocaleString()} added to your wallet`,
              );
              queryClient.invalidateQueries({ queryKey: ["wallets", user?.id] });
              onComplete?.();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Payment failed");
            } finally {
              setBusy(false);
            }
          },
          onError: (err: unknown) => {
            console.error("[PayPalTopUpCard]", err);
            toast.error("Card checkout error — try again");
          },
          onCancel: () => toast.message("Checkout cancelled"),
        });

        buttonsRef.current = buttons as { close?: () => void };
        await buttons.render(buttonHostRef.current);

        if (!cancelled) setReady(true);
      } catch (e) {
        console.error("[PayPalTopUpCard]", e);
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Could not load card checkout";
          // Never surface raw "Buttons is not a function" to customers
          setBootError(
            /Buttons is not a function|Buttons is undefined/i.test(msg)
              ? "PayPal checkout is temporarily unavailable. Try Square card, Interac, or another method — or tap Retry."
              : msg,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        buttonsRef.current?.close?.();
      } catch {
        /* ignore */
      }
      buttonsRef.current = null;
      if (buttonHostRef.current) buttonHostRef.current.innerHTML = "";
    };
  }, [ccy, stableAmount, walletId, retryKey, user?.id, queryClient, onComplete]);

  if (!SUPPORTED.has(ccy)) {
    return <p className="text-sm text-destructive">Card top-up is not available for {ccy}</p>;
  }

  const amtNum = Number(String(amount).replace(/,/g, ""));
  const amountOk = Number.isFinite(amtNum) && amtNum >= 1;

  const body = (
    <div className="space-y-4">
      {!embedded && (
        <div className="space-y-2">
          <Label>Amount ({ccy})</Label>
          <Input
            inputMode="decimal"
            placeholder="25.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            disabled={busy}
          />
        </div>
      )}
      {embedded && (
        <p className="text-xs text-muted-foreground">
          Paying <span className="font-medium text-foreground">{ccy} {amount || "—"}</span>
        </p>
      )}

      {!amountOk && (
        <p className="text-xs text-muted-foreground">Enter an amount of at least 1 to continue.</p>
      )}

      <div ref={buttonHostRef} className="min-h-[45px]" data-efm-paypal-host />

      {amountOk && !ready && !bootError && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading checkout…
        </p>
      )}
      {bootError && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{bootError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRetryKey((k) => k + 1)}>
            Retry checkout
          </Button>
        </div>
      )}
      {busy && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Completing payment…
        </p>
      )}
      <p className="text-[11px] text-muted-foreground text-center">
        You’ll approve on a secure page — we never see your password.
      </p>
    </div>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Card checkout</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
