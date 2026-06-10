import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import LoadingSpinner from "@/components/LoadingSpinner";

/**
 * Public callback route for Interac OIDC redirect.
 * URL shape: /callback?code=...&state=...   or   /callback?error=...
 * We POST {code, state} to the `interac-exchange` edge function,
 * then redirect back to /onboarding/identity with a status query string
 * (the Identity page already handles ?interac=success|error).
 */
const InteracCallback = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    const state = params.get("state");
    const err = params.get("error");

    const go = (qs: Record<string, string>) => {
      const sp = new URLSearchParams(qs);
      navigate(`/onboarding/identity?${sp.toString()}`, { replace: true });
    };

    if (err) {
      go({ interac: "error", reason: err });
      return;
    }
    if (!code || !state) {
      go({ interac: "error", reason: "missing_params" });
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("interac-exchange", {
          body: { code, state },
        });
        if (error) {
          go({ interac: "error", reason: "exchange_failed" });
          return;
        }
        if (data?.ok) {
          go({ interac: "success" });
        } else {
          go({ interac: "error", reason: data?.reason || "unknown" });
        }
      } catch {
        go({ interac: "error", reason: "network_error" });
      }
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <LoadingSpinner size={128} />
    </div>
  );
};

export default InteracCallback;
