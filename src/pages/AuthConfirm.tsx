import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ArrowLeft, CheckCircle2, XCircle, MailCheck } from "lucide-react";
import { BrandedScreen, BrandIconBadge, BrandPrimaryButton } from "@/components/brand/BrandedScreen";

type EmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

const DEFAULT_NEXT: Record<string, string> = {
  signup: "/onboarding/account-type",
  invite: "/admin/onboarding",
  recovery: "/auth/reset-password",
  email_change: "/profile",
  magiclink: "/",
  email: "/",
};

const isSafeRedirect = (path: string | null): path is string =>
  !!path && path.startsWith("/") && !path.startsWith("//");

const recoveryTarget = (nextParam: string | null) => {
  const loginPath = isSafeRedirect(nextParam) ? nextParam : "/auth";
  return `/auth/reset-password?next=${encodeURIComponent(loginPath)}`;
};

const SUCCESS_COPY: Record<string, { title: string; body: string; icon: React.ReactNode }> = {
  signup: {
    title: "Email verified",
    body: "Your email has been confirmed and you're now signed in. Taking you to the next step…",
    icon: <CheckCircle2 className="h-9 w-9" />,
  },
  invite: {
    title: "Invitation accepted",
    body: "Your email is confirmed and you're signed in. Let's finish setting up your staff account…",
    icon: <CheckCircle2 className="h-9 w-9" />,
  },
  recovery: {
    title: "Identity confirmed",
    body: "Let's set a new password for your account. You'll be redirected to sign in when you're done.",
    icon: <CheckCircle2 className="h-9 w-9" />,
  },
  email_change: {
    title: "Email updated",
    body: "Your new email address has been confirmed. Redirecting…",
    icon: <CheckCircle2 className="h-9 w-9" />,
  },
  magiclink: {
    title: "You're signed in",
    body: "Magic link confirmed. Taking you to your dashboard…",
    icon: <CheckCircle2 className="h-9 w-9" />,
  },
  email: {
    title: "Email verified",
    body: "Your email has been confirmed and you're now signed in. Redirecting…",
    icon: <CheckCircle2 className="h-9 w-9" />,
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
      const target =
        otpType === "recovery"
          ? recoveryTarget(nextParam)
          : nextParam && nextParam !== "/"
            ? nextParam
            : DEFAULT_NEXT[otpType] || "/";
      setType(otpType);
      setDest(target);

      if (otpType === "recovery") {
        const loginPath = isSafeRedirect(nextParam) ? nextParam : "/auth";
        try {
          sessionStorage.setItem("efm_post_reset_login", loginPath);
        } catch {
          /* noop */
        }
      }

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

        // Route new signups by the account type chosen at registration.
        // Falls back to the account-type picker if metadata is missing.
        let finalTarget = target;
        if (otpType === "signup" && (!nextParam || nextParam === "/")) {
          try {
            const { data } = await supabase.auth.getUser();
            const at = (data.user?.user_metadata as { account_type?: string } | undefined)?.account_type;
            if (at === "business") finalTarget = "/onboarding/business/details";
            else if (at === "individual") finalTarget = "/onboarding/identity";
          } catch {
            /* keep default target */
          }
          setDest(finalTarget);
        }

        setStatus("success");
        window.setTimeout(() => navigate(finalTarget, { replace: true }), 2200);
      } catch (e) {
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "We couldn't verify this link.");
      }
    };

    run();
  }, [params, navigate]);

  const copy = SUCCESS_COPY[type] || SUCCESS_COPY.signup;

  return (
    <BrandedScreen
      cardWidth="md"
      topBarAction={
        <Link to="/auth" className="inline-flex items-center gap-1.5 hover:text-amber-300 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to sign in
        </Link>
      }
    >
      {status === "verifying" && (
        <>
          <BrandIconBadge icon={<MailCheck className="h-9 w-9" />} tone="info" />
          <h1 className="text-center text-2xl font-display font-bold text-foreground">Verifying your email</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Hang tight — this only takes a moment.
          </p>
          <div className="mt-6 flex justify-center">
            <LoadingSpinner size={40} />
          </div>
        </>
      )}

      {status === "success" && (
        <>
          <BrandIconBadge icon={copy.icon} tone="success" />
          <h1 className="text-center text-2xl font-display font-bold text-foreground">{copy.title}</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground leading-relaxed">{copy.body}</p>
          <BrandPrimaryButton onClick={() => navigate(dest, { replace: true })}>
            Continue →
          </BrandPrimaryButton>
        </>
      )}

      {status === "error" && (
        <>
          <BrandIconBadge icon={<XCircle className="h-9 w-9" />} tone="danger" />
          <h1 className="text-center text-2xl font-display font-bold text-foreground">Verification failed</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground leading-relaxed">{errorMsg}</p>
          <Button
            variant="outline"
            className="mt-7 w-full h-12 rounded-full font-bold"
            onClick={() => navigate("/auth", { replace: true })}
          >
            Back to sign in
          </Button>
        </>
      )}
    </BrandedScreen>
  );
};

export default AuthConfirm;
