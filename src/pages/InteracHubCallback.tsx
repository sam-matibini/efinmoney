import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldAlert } from "lucide-react";

export default function InteracHubCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");

    if (oauthError) {
      navigate(`/onboarding/identity?interac=error&reason=${encodeURIComponent(oauthError)}`, { replace: true });
      return;
    }
    if (!code || !state) {
      navigate("/onboarding/identity?interac=error&reason=missing_params", { replace: true });
      return;
    }

    (async () => {
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke("interac-exchange", {
          body: { code, state },
        });
        if (invokeErr) {
          setError(invokeErr.message);
          navigate("/onboarding/identity?interac=error&reason=exchange_failed", { replace: true });
          return;
        }
        if (data?.ok) {
          navigate("/onboarding/identity?interac=success", { replace: true });
        } else {
          navigate(`/onboarding/identity?interac=error&reason=${encodeURIComponent(data?.reason || "unknown")}`, { replace: true });
        }
      } catch (e: any) {
        setError(e?.message || "Unknown error");
        navigate("/onboarding/identity?interac=error&reason=exchange_failed", { replace: true });
      }
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        {error ? (
          <>
            <ShieldAlert className="w-10 h-10 text-destructive mx-auto" />
            <h1 className="text-lg font-semibold text-foreground">Verification failed</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
            <h1 className="text-lg font-semibold text-foreground">Verifying with Interac…</h1>
            <p className="text-sm text-muted-foreground">Hold on while we finalize your identity check.</p>
          </>
        )}
      </div>
    </div>
  );
}
