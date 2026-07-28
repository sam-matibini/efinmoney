import { useState, useEffect, useRef, useCallback } from "react";
import Persona from "persona";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { toast } from "sonner";

const PERSONA_POLL_MS = 3000;

interface Props {
  userId: string;
  onComplete?: (info: { inquiryId: string; status: string }) => void;
  onError?: (err: unknown) => void;
  className?: string;
  label?: string;
  autoStart?: boolean;
}

export const PersonaVerification = ({ userId, onComplete, onError, className, label = "Start ID Verification", autoStart = false }: Props) => {
  const [loading, setLoading] = useState(false);
  const autoStartedRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The status poll is an async setInterval; overlapping ticks can each see
  // "approved" and fire onComplete more than once, spamming the finalize
  // toasts. This guard makes completion fire exactly once.
  const completedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const finish = useCallback(
    (inquiryId: string, status: string) => {
      if (completedRef.current) return;
      completedRef.current = true;
      stopPolling();
      setLoading(false);
      toast.success("Identity check submitted");
      onComplete?.({ inquiryId, status });
    },
    [onComplete, stopPolling],
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const openInNewWindow = useCallback(
    (sessionToken: string, inquiryId: string, environment: string) => {
      const baseUrl =
        environment === "sandbox"
          ? "https://sandbox.inquiry.withpersona.com"
          : "https://inquiry.withpersona.com";
      const url = `${baseUrl}/verify?inquiry-id=${encodeURIComponent(inquiryId)}`;
      const personaWindow = window.open(
        url,
        "persona-verification",
        "width=600,height=800,scrollbars=yes,resizable=yes",
      );

      if (!personaWindow) {
        setLoading(false);
        toast.error("Pop-up was blocked. Please allow pop-ups for this site and try again.");
        return;
      }

      pollingRef.current = setInterval(async () => {
        // Already finalized (possibly by an overlapping tick) — bail out.
        if (completedRef.current) {
          stopPolling();
          return;
        }
        if (personaWindow.closed) {
          stopPolling();
          setLoading(false);
          try {
            const { data } = await supabase.functions.invoke("get-persona-inquiry-status", {
              body: { inquiryId },
            });
            const status = data?.status || data?.persona_inquiry_status;
            if (status === "approved" || status === "completed" || status === "needs_review") {
              finish(inquiryId, status);
            } else if (!completedRef.current) {
              completedRef.current = true;
              toast.message("Verification window closed", {
                description: "If you completed the verification, we'll process it shortly.",
              });
            }
          } catch {
            if (!completedRef.current) {
              completedRef.current = true;
              toast.message("Verification window closed", {
                description: "If you completed the verification, we'll process it shortly.",
              });
            }
          }
          return;
        }

        try {
          const { data } = await supabase.functions.invoke("get-persona-inquiry-status", {
            body: { inquiryId },
          });
          const status = data?.status || data?.persona_inquiry_status;
          if (status === "approved" || status === "completed" || status === "needs_review") {
            personaWindow.close();
            finish(inquiryId, status);
          }
        } catch {
          /* polling error — retry next tick */
        }
      }, PERSONA_POLL_MS);
    },
    [finish, stopPolling],
  );

  const startVerification = async () => {
    setLoading(true);
    try {
      let { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) sessionData = { session: refreshed.session } as any;
      }
      const { data: userCheck, error: userCheckErr } = await supabase.auth.getUser();
      if (!sessionData?.session || userCheckErr || !userCheck?.user) {
        setLoading(false);
        toast.error("Your session has expired. Please sign in again.");
        await supabase.auth.signOut().catch(() => {});
        if (typeof window !== "undefined") window.location.assign("/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-persona-inquiry", {
        body: { userId },
      });
      console.log("[Persona] create-inquiry response", {
        hasData: !!data,
        mode: data?.mode,
        environment: data?.environment,
        environmentId: data?.environmentId,
        inquiryId: data?.inquiryId,
        hasSessionToken: !!data?.sessionToken,
        alreadySubmitted: !!data?.alreadySubmitted,
        templateId: data?.templateId,
        error: error?.message,
        origin: typeof window !== "undefined" ? window.location.origin : "n/a",
      });

      if (error && /401|unauthor/i.test(error.message || "")) {
        setLoading(false);
        toast.error("Your session has expired. Please sign in again.");
        await supabase.auth.signOut().catch(() => {});
        if (typeof window !== "undefined") window.location.assign("/auth");
        return;
      }
      if (data?.alreadySubmitted) {
        setLoading(false);
        toast.success("Verification already submitted");
        onComplete?.({ inquiryId: data.inquiryId, status: data.status || "completed" });
        return;
      }
      if (error) {
        const errorMessage = error.message || data?.error || "Failed to initialize verification";
        const isPersonaConfigError =
          data?.code === "INVALID_PERSONA_TEMPLATE_ID" ||
          /itmpl_|misconfigured|template id/i.test(errorMessage);

        throw new Error(
          isPersonaConfigError
            ? "Persona template is invalid. Replace PERSONA_TEMPLATE_ID with the template ID that starts with itmpl_."
            : errorMessage,
        );
      }
      if (!data?.sessionToken && data?.mode !== "client" && !data?.templateId) {
        throw new Error(data?.error || "Failed to initialize verification");
      }

      // Server-created inquiry with session token → open in a new window.
      // The Persona inquiry page sets X-Frame-Options: sameorigin, so it cannot
      // be embedded in a cross-origin iframe (the SDK's default). Opening in a
      // popup avoids the restriction entirely.
      if (data.sessionToken) {
        setLoading(false);
        openInNewWindow(
          data.sessionToken,
          data.inquiryId,
          data.environment || "production",
        );
        return;
      }

      // Client-side flow (no API key): fall back to the embedded SDK.
      const clientConfig: Record<string, unknown> = {
        onReady: () => {
          console.log("[Persona] SDK ready — opening overlay");
          setLoading(false);
          client.open();
        },
        onComplete: ({ inquiryId, status }: { inquiryId: string; status: string }) => {
          console.log("[Persona] onComplete", { inquiryId, status });
          toast.success("Identity check submitted");
          onComplete?.({ inquiryId, status });
        },
        onCancel: (payload?: unknown) => {
          console.warn(
            "[Persona] onCancel — SDK closed before completion. " +
              "If the overlay never opened, verify that this domain (" +
              (typeof window !== "undefined" ? window.location.origin : "?") +
              ") is in the Persona template's Allowed Origins for the current environment.",
            payload,
          );
          setLoading(false);
          toast.message("Verification window closed", {
            description: "If it didn't open, please contact support or try again.",
          });
        },
        onError: (e: unknown) => {
          setLoading(false);
          console.error("[Persona] onError", e);
          toast.error("Verification was interrupted. Please try again.");
          onError?.(e);
        },
      };

      if (data.environmentId) {
        clientConfig.environmentId = data.environmentId;
      } else {
        clientConfig.environment = data.environment || "sandbox";
      }

      if (data.templateId) {
        clientConfig.templateId = data.templateId;
        clientConfig.referenceId = userId;
      }
      const client = new (Persona as any).Client(clientConfig);
    } catch (err) {
      setLoading(false);
      console.error(err);
      toast.error((err as Error).message || "Could not start verification");
      onError?.(err);
    }
  };

  useEffect(() => {
    if (autoStart && !autoStartedRef.current && userId) {
      autoStartedRef.current = true;
      startVerification();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, userId]);

  return (
    <Button size="lg" className={className} onClick={startVerification} disabled={loading}>
      {loading ? <LoadingSpinner size={16} className="mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
      {loading ? "Initializing…" : label}
    </Button>
  );
};

export default PersonaVerification;
