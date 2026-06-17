import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CheckCircle2, XCircle } from "lucide-react";
import efinIcon from "@/assets/efin-icon.png";

type EmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

const DEFAULT_NEXT: Record<string, string> = {
  signup: "/onboarding/identity",
  invite: "/admin/onboarding",
  recovery: "/security",
  email_change: "/profile",
  magiclink: "/",
  email: "/",
};

const SUCCESS_COPY: Record<string, { title: string; body: string }> = {
  signup: {
    title: "You're verified!",
    body: "Your email has been confirmed and you're now signed in. Taking you to the next step…",
  },
  invite: {
    title: "Invitation accepted",
    body: "Your email is confirmed and you're signed in. Let's finish setting up your staff account…",
  },
  recovery: {
    title: "Identity confirmed",
    body: "You're signed in. Let's set a new password for your account…",
  },
  email_change: {
    title: "Email updated",
    body: "Your new email address has been confirmed. Redirecting…",
  },
  magiclink: {
    title: "You're signed in",
    body: "Magic link confirmed. Taking you to your dashboard…",
  },
  email: {
    title: "You're verified!",
    body: "Your email has been confirmed and you're now signed in. Redirecting…",
  },
};

const AuthConfirm = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  const [type, setType] = useState<EmailOtpType>("signup");
  const [dest, setDest] = useState("/");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      const tokenHash = params.get("token_hash");
      const otpType = (params.get("type") || "signup") as EmailOtpType;
      const code = params.get("code");
      const nextParam = params.get("next");
      const target = nextParam && nextParam !== "/" ? nextParam : DEFAULT_NEXT[otpType] || "/";
      setType(otpType);
      setDest(target);

      try {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Legacy hash-token links are auto-consumed by the client; check for a session.
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            throw new Error("This confirmation link is invalid or has expired. Please request a new one.");
          }
        }

        setStatus("success");
        window.setTimeout(() => navigate(target, { replace: true }), 2200);
      } catch (e) {
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "We couldn't verify this link.");
      }
    };

    run();
  }, [params, navigate]);

  const copy = SUCCESS_COPY[type] || SUCCESS_COPY.signup;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <img src={efinIcon} alt="eFinMoney" className="mx-auto mb-6 h-12 w-12 rounded-xl object-contain" />

        {status === "verifying" && (
          <>
            <div className="flex justify-center"><LoadingSpinner size={72} /></div>
            <h1 className="mt-6 text-xl font-display font-semibold text-foreground">Verifying your email…</h1>
            <p className="mt-2 text-sm text-muted-foreground">Hang tight, this only takes a moment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            </div>
            <h1 className="mt-6 text-2xl font-display font-bold text-foreground">{copy.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
            <Button className="mt-6 w-full" onClick={() => navigate(dest, { replace: true })}>
              Continue
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-9 w-9 text-destructive" />
            </div>
            <h1 className="mt-6 text-xl font-display font-semibold text-foreground">Verification failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" className="mt-6 w-full" onClick={() => navigate("/auth", { replace: true })}>
              Back to sign in
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthConfirm;
