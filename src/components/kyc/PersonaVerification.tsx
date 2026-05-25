import { useState, useEffect, useRef } from "react";
import Persona from "persona";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

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

  const startVerification = async () => {
    setLoading(true);
    try {
      // Guard: ensure we still have a VALID session before invoking the edge function.
      // getSession() can return a cached session whose token was already revoked
      // server-side, so we proactively refresh and verify with getUser().
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
        environment: data?.environment,
        inquiryId: data?.inquiryId,
        hasSessionToken: !!data?.sessionToken,
        alreadySubmitted: !!data?.alreadySubmitted,
        templateId: data?.templateId,
        error: error?.message,
        origin: typeof window !== "undefined" ? window.location.origin : "n/a",
      });
      // Handle expired/invalid auth from the edge function
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
      if (error || !data?.sessionToken) {
        throw new Error(data?.error || "Failed to initialize verification");
      }

      // IMPORTANT: When resuming via sessionToken, do NOT pass templateId.
      // Passing both causes the SDK to create a brand-new inquiry from the
      // template (without our referenceId), producing orphan "Needs Review"
      // inquiries that can never be linked back to the user.
      const clientConfig: Record<string, unknown> = {
        environment: data.environment || "production",
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
      if (data.sessionToken) {
        clientConfig.sessionToken = data.sessionToken;
        if (data.inquiryId) clientConfig.inquiryId = data.inquiryId;
      } else if (data.templateId) {
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
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
      {loading ? "Initializing…" : label}
    </Button>
  );
};

export default PersonaVerification;
