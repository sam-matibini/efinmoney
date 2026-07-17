import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck, AlertTriangle, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export default function ResetPinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const uid = params.get("uid") ?? "";

  const [state, setState] = useState<"verifying" | "ok" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token || !uid) {
      setState("error");
      setErrorMsg("Invalid reset link — missing token or user ID.");
      return;
    }
    supabase.functions
      .invoke("pin-reset-confirm", { body: { token, uid } })
      .then(({ data, error }) => {
        if (error || !data?.ok) {
          setState("error");
          setErrorMsg(
            data?.error ?? "This link is invalid or has expired. Please request a new one from the app.",
          );
        } else {
          setState("ok");
        }
      });
  }, []); // run once on mount

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-5">
        {state === "verifying" && (
          <>
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <h1 className="text-xl font-bold">Verifying your link…</h1>
            <p className="text-muted-foreground text-sm">Please wait a moment.</p>
          </>
        )}

        {state === "ok" && (
          <>
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold">PIN cleared</h1>
            <p className="text-muted-foreground text-sm">
              Your transaction PIN has been reset. You&apos;ll be prompted to create a new one the next
              time you send money.
            </p>
            <Button className="w-full" onClick={() => navigate("/dashboard")}>
              Go to dashboard
            </Button>
          </>
        )}

        {state === "error" && (
          <>
            <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-xl font-bold">Link invalid</h1>
            <p className="text-muted-foreground text-sm">{errorMsg}</p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard")}>
              Back to app
            </Button>
          </>
        )}

        <div className="flex items-center justify-center gap-1.5 pt-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">eFinMoney — Secure cross-border transfers</span>
        </div>
      </div>
    </div>
  );
}
