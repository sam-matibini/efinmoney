import { useEffect, useRef } from "react";
import { AdyenCheckout, Dropin } from "@adyen/adyen-web";
import "@adyen/adyen-web/styles/adyen.css";


interface Props {
  sessionId: string;
  sessionData: string;
  clientKey: string;
  environment: "test" | "live" | string;
  amount: { value: number; currency: string };
  onPaymentCompleted?: (result: any) => void;
  onError?: (err: any) => void;
}

export default function AdyenDropIn({
  sessionId,
  sessionData,
  clientKey,
  environment,
  amount,
  onPaymentCompleted,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dropinRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current) return;
      try {
        const checkout = await AdyenCheckout({
          environment: (environment === "live" ? "live" : "test") as any,
          clientKey,
          session: { id: sessionId, sessionData },
          amount,
          locale: "en-US",
          countryCode: "CA",
          analytics: { enabled: false },
          // Cards first — otherwise Drop-in auto-opens Alipay with no card fields.
          paymentMethodOrder: ["scheme", "visa", "mc", "amex", "interac_card", "alipay"],
          onPaymentCompleted: (result: any) => onPaymentCompleted?.(result),
          onError: (err: any) => onError?.(err),
        });
        if (cancelled) return;
        const dropin = new Dropin(checkout, {
          openFirstPaymentMethod: true,
          paymentMethodOrder: ["scheme", "visa", "mc", "amex", "interac_card", "alipay"],
          paymentMethodsConfiguration: {
            card: {
              hasHolderName: true,
              holderNameRequired: false,
            },
          },
        });
        dropin.mount(containerRef.current);
        dropinRef.current = dropin;
      } catch (e) {
        onError?.(e);
      }
    })();
    return () => {
      cancelled = true;
      try { dropinRef.current?.unmount(); } catch {}
    };
  }, [sessionId, sessionData, clientKey, environment]);

  return <div ref={containerRef} className="adyen-dropin-container" />;
}
