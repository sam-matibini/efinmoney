import { useState, useEffect, useRef, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/LoadingSpinner";
import { toast } from "sonner";

interface Props {
  userId: string;
  onComplete?: (info: { identityVerificationId: string; status: string }) => void;
  onError?: (err: unknown) => void;
  className?: string;
  label?: string;
  autoStart?: boolean;
}

export const PlaidIdvVerification = ({
  userId,
  onComplete,
  onError,
  className,
  label = "Start ID Verification",
  autoStart = false,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [idvId, setIdvId] = useState<string | null>(null);
  const autoStartedRef = useRef(false);
  const completedRef = useRef(false);

  const finish = useCallback(
    (identityVerificationId: string, status: string) => {
      if (completedRef.current) return;
      completedRef.current = true;
      setLoading(false);
      onComplete?.({ identityVerificationId, status });
    },
    [onComplete],
  );

  const start = useCallback(async () => {
    if (loading || completedRef.current) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("plaid-idv-create", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      const token = String(data?.link_token || "");
      const verificationId = String(data?.identity_verification_id || "");
      if (!token || !verificationId) throw new Error("Plaid IDV did not return a link token");
      setIdvId(verificationId);
      setLinkToken(token);
    } catch (e) {
      console.error("plaid-idv-create failed", e);
      setLoading(false);
      onError?.(e);
      toast.error(e instanceof Error ? e.message : "Could not start Plaid verification");
    }
  }, [loading, onError, userId]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void start();
  }, [autoStart, start]);

  const { open, ready } = usePlaidLink({
    token: linkToken || "",
    onSuccess: async () => {
      try {
        const { data, error } = await supabase.functions.invoke("plaid-idv-finalize", {
          body: { identity_verification_id: idvId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));
        finish(String(data?.identity_verification_id || idvId), String(data?.status || "success"));
      } catch (e) {
        console.error("plaid-idv-finalize failed", e);
        setLoading(false);
        onError?.(e);
        toast.error(e instanceof Error ? e.message : "Could not finalize verification");
      }
    },
    onExit: (err) => {
      setLoading(false);
      setLinkToken(null);
      if (err) {
        onError?.(err);
        toast.message("Verification closed", {
          description: "You can restart anytime when you are ready.",
        });
      }
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <Button
      type="button"
      className={className}
      disabled={loading}
      onClick={() => void start()}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <LoadingSpinner size={18} /> Starting…
        </span>
      ) : (
        label
      )}
    </Button>
  );
};

export default PlaidIdvVerification;
