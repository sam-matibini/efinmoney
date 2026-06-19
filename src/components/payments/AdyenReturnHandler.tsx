import { useEffect, useRef } from "react";
import { useSearchParams, type SetURLSearchParams } from "react-router-dom";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AdyenCheckout } from "@adyen/adyen-web";
import { toast } from "sonner";
import { resolveAdyenClientConfig, confirmAdyenSession } from "@/lib/adyen";

async function finalizeAdyenPayment(
  sessionId: string,
  sessionResult: string | undefined,
  queryClient: QueryClient,
) {
  try {
    const result = await confirmAdyenSession({
      sessionId,
      sessionResult: sessionResult ?? null,
    });
    if (result.verified && (result.credited || result.already)) {
      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      if (result.already) {
        toast.info("Payment already credited to your wallet.");
      } else {
        toast.success(
          `Wallet credited: ${result.amount ?? ""} ${result.currency ?? ""}`.trim(),
        );
      }
      return true;
    }
    if (result.verified && result.credit_error) {
      toast.error(`Payment OK but wallet not credited: ${result.credit_error}`);
      return false;
    }
    if (result.verified) {
      toast.success("Payment confirmed — wallet will update shortly.");
      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      return true;
    }
    return false;
  } catch (e) {
    console.error("Adyen confirm failed", e);
    return false;
  }
}

function stripReturnParams(setParams: SetURLSearchParams) {
  setParams((prev) => {
    const next = new URLSearchParams(prev);
    next.delete("sessionId");
    next.delete("redirectResult");
    return next;
  }, { replace: true });
}

/** Completes Adyen session after 3DS / redirect flows (returnUrl query params). */
export default function AdyenReturnHandler() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const handledRef = useRef(false);

  useEffect(() => {
    const sessionId = params.get("sessionId");
    const redirectResult = params.get("redirectResult");
    if (!sessionId || !redirectResult || handledRef.current) return;
    handledRef.current = true;

    const config = resolveAdyenClientConfig();
    if (!config) {
      toast.error("Could not confirm payment — Adyen client key missing.");
      stripReturnParams(setParams);
      return;
    }

    (async () => {
      toast.loading("Confirming your payment…", { id: "adyen-return" });
      try {
        const checkout = await AdyenCheckout({
          environment: config.environment === "live" ? "live" : "test",
          clientKey: config.clientKey,
          session: { id: sessionId },
          analytics: { enabled: false },
          onPaymentCompleted: async (result) => {
            toast.dismiss("adyen-return");
            const code = result?.resultCode;
            const credited = await finalizeAdyenPayment(
              sessionId,
              result?.sessionResult,
              queryClient,
            );
            if (!credited) {
              if (code === "Authorised" || code === "Received") {
                toast.success("Payment successful — your wallet will update shortly.");
                await queryClient.invalidateQueries({ queryKey: ["wallets"] });
              } else if (code === "Refused") {
                toast.error("Payment was refused.");
              } else {
                toast.info(`Payment status: ${code || "pending"}`);
              }
            }
            stripReturnParams(setParams);
            try {
              sessionStorage.removeItem("adyen_checkout_config");
            } catch {
              /* ignore */
            }
          },
          onError: (err) => {
            toast.dismiss("adyen-return");
            console.error(err);
            toast.error("Could not confirm payment after redirect.");
            stripReturnParams(setParams);
          },
        });

        await checkout.submitDetails({ details: { redirectResult } });
      } catch (err) {
        toast.dismiss("adyen-return");
        console.error(err);
        toast.error("Could not complete payment return.");
        stripReturnParams(setParams);
      }
    })();
  }, [params, setParams, queryClient]);

  return null;
}
