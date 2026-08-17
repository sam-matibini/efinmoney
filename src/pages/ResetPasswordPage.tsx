import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { BrandedScreen, BrandIconBadge, BrandPrimaryButton } from "@/components/brand/BrandedScreen";
import { passwordPolicyMessage, PASSWORD_MIN_LENGTH } from "@/lib/passwordPolicy";

const isSafeRedirect = (path: string | null): path is string =>
  !!path && path.startsWith("/") && !path.startsWith("//");

const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const loginPath = isSafeRedirect(params.get("next")) ? params.get("next")! : "/auth";

  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Set new password · eFinMoney";
  }, []);

  useEffect(() => {
    // If the URL has a recovery token, clear any existing session first so the
    // new session (from the recovery link) takes over. Without this, a user
    // who is already signed in (e.g. an admin) would have their own session
    // returned by getSession() and could overwrite the wrong account's password.
    const hasRecoveryToken = window.location.hash.includes("type=recovery")
      || window.location.hash.includes("access_token=");

    const init = async () => {
      if (hasRecoveryToken) {
        await supabase.auth.signOut();
        // Give Supabase a moment to process the URL hash and establish the
        // new session from the recovery token.
        await new Promise((r) => setTimeout(r, 100));
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        toast.error("This reset link is invalid or has expired.");
        navigate(loginPath, { replace: true });
        return;
      }
      setChecking(false);
    };
    init();
  }, [loginPath, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordPolicyMessage(password)) {
      toast.error(passwordPolicyMessage(password)!);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();
      toast.success("Password updated. Sign in with your new password.");
      navigate(loginPath, { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-amber-50/40">
        <LoadingSpinner size={72} />
      </div>
    );
  }

  return (
    <BrandedScreen
      cardWidth="md"
      topBarAction={
        <Link to="/auth" className="inline-flex items-center gap-1.5 hover:text-amber-300 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to sign in
        </Link>
      }
    >
      <BrandIconBadge icon={<Lock className="h-8 w-8" />} tone="info" />
      <h1 className="text-center text-2xl font-display font-bold text-foreground">Set a new password</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Choose a strong password for your account. You'll be taken to sign in when you're done.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="newPwd" className="text-foreground font-medium">New password</Label>
          <Input
            id="newPwd"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8+ chars, upper, lower, number"
            className="h-12 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPwd" className="text-foreground font-medium">Confirm password</Label>
          <Input
            id="confirmPwd"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-12 rounded-xl"
          />
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>Use at least 8 characters with one uppercase, one lowercase, and one number.</span>
        </div>

        <BrandPrimaryButton type="submit" disabled={submitting || !password}>
          {submitting ? <LoadingSpinner size={18} /> : <>Save password &amp; continue →</>}
        </BrandPrimaryButton>
      </form>
    </BrandedScreen>
  );
};

export default ResetPasswordPage;
