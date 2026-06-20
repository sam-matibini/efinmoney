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
      return { ok: true as const, refused: false };
    }
    if (result.verified && result.credit_error) {
      toast.error(`Payment OK but wallet not credited: ${result.credit_error}`);
      return { ok: false as const, refused: false };
    }
    if (result.verified) {
      toast.success("Payment confirmed — wallet will update shortly.");
      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      return { ok: true as const, refused: false };
    }
    const code = String(result.resultCode || "").toLowerCase();
    if (code === "refused" || code === "cancelled" || code === "error") {
      return { ok: false as const, refused: true };
    }
    return { ok: false as const, refused: false };
  } catch (e) {
    console.error("Adyen confirm failed", e);
    return { ok: false as const, refused: false };
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

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      toast.dismiss("adyen-return");
      fn();
    };

    const timeout = window.setTimeout(() => {
      settle(() => {
        toast.error("Payment confirmation timed out. Refresh the page if needed.");
        stripReturnParams(setParams);
      });
    }, 25000);

    (async () => {
      toast.loading("Confirming your payment…", { id: "adyen-return" });
      try {
        const checkout = await AdyenCheckout({
          environment: config.environment === "live" ? "live" : "test",
          clientKey: config.clientKey,
          session: { id: sessionId },
          analytics: { enabled: false },
          onPaymentCompleted: async (result) => {
            clearTimeout(timeout);
            const code = result?.resultCode;
            if (code === "Refused" || code === "Cancelled" || code === "Error") {
              settle(() => {
                toast.error("Payment was declined.");
                stripReturnParams(setParams);
              });
              return;
            }
            const outcome = await finalizeAdyenPayment(
              sessionId,
              (result as { sessionResult?: string })?.sessionResult,
              queryClient,
            );
            settle(() => {
              if (!outcome.ok && code !== "Authorised" && code !== "Received") {
                toast.info(`Payment status: ${code || "pending"}`);
              }
              stripReturnParams(setParams);
              try {
                sessionStorage.removeItem("adyen_checkout_config");
              } catch {
                /* ignore */
              }
            });
          },
          onError: (err) => {
            clearTimeout(timeout);
            console.error(err);
            settle(() => {
              toast.error("Payment was declined or could not be confirmed.");
              stripReturnParams(setParams);
            });
          },
        });

        await checkout.submitDetails({ details: { redirectResult } });

        // Refused/cancelled redirects often never fire onPaymentCompleted — confirm server-side.
        await new Promise((r) => setTimeout(r, 1500));
        if (settled) return;

        clearTimeout(timeout);
        const outcome = await finalizeAdyenPayment(sessionId, redirectResult, queryClient);
        settle(() => {
          if (outcome.refused || !outcome.ok) {
            toast.error("Payment was declined — no funds were added.");
          }
          stripReturnParams(setParams);
          try {
            sessionStorage.removeItem("adyen_checkout_config");
          } catch {
            /* ignore */
          }
        });
      } catch (err) {
        clearTimeout(timeout);
        console.error(err);
        settle(() => {
          toast.error("Payment was declined or could not be completed.");
          stripReturnParams(setParams);
        });
      }
    })();
  }, [params, setParams, queryClient]);

  return null;
}
