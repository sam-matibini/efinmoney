import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowRight, ArrowLeft, MailCheck, User, Building2, Check } from "lucide-react";
import { Logo, Wordmark } from "@/components/Logo";
import LoadingSpinner from "@/components/LoadingSpinner";

const isSafeRedirect = (path: string | null): path is string =>
  !!path && path.startsWith("/") && !path.startsWith("//");

const Auth = () => {
  const [params] = useSearchParams();
  const modeParam = params.get("mode");
  const redirectTo = params.get("redirect");
  const [isSignUp, setIsSignUp] = useState(modeParam !== "signin");
  const [accountType, setAccountType] = useState<"individual" | "business" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (modeParam) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("mode");
      window.history.replaceState({}, "", newUrl.toString());
    }
  }, [modeParam]);

  useEffect(() => {
    document.title = isSignUp ? "Create account · eFinMoney" : "Sign in · eFinMoney";
  }, [isSignUp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          toast.error("Passwords do not match.");
          return;
        }
        const { error } = await signUp(email, password, fullName, accountType ?? "individual");
        if (error) toast.error(error.message);
        else {
          // Identity is required before transfers; preserve the deep-link for after KYC.
          if (isSafeRedirect(redirectTo)) {
            try { sessionStorage.setItem("efm_post_kyc_redirect", redirectTo); } catch { /* noop */ }
          }
          // Email confirmation is required — show the "check your inbox" screen.
          setSignedUpEmail(email);
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) toast.error(error.message);
        else {
          toast.success("Welcome back!");
          navigate(isSafeRedirect(redirectTo) ? redirectTo : "/dashboard");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!signedUpEmail) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: signedUpEmail,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) toast.error(error.message);
      else toast.success("Verification email sent again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans flex flex-col">
      <header className="border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="w-9 h-9" />
            <Wordmark className="font-black text-xl tracking-tight" />
          </Link>
          <Link to="/" className="text-sm font-medium text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
        </div>
      </header>

      {signedUpEmail ? (
        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md text-center"
          >
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <MailCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-neutral-900">Check your inbox</h1>
            <p className="mt-3 text-neutral-600">
              We sent a verification link to <strong className="text-neutral-900">{signedUpEmail}</strong>.
              Click it to confirm your email — you'll be signed in automatically and taken to the next step.
            </p>
            <button
              onClick={handleResend}
              disabled={resending}
              className="mt-8 w-full h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
            >
              {resending ? <LoadingSpinner size={20} /> : "Resend verification email"}
            </button>
            <p className="mt-6 text-center text-neutral-600">
              Wrong email?
              <button
                onClick={() => { setSignedUpEmail(null); setIsSignUp(true); }}
                className="ml-2 text-primary hover:text-primary/80 font-bold"
              >
                Go back
              </button>
            </p>
            <p className="mt-2 text-center text-neutral-600">
              Already verified?
              <button
                onClick={() => { setSignedUpEmail(null); setIsSignUp(false); }}
                className="ml-2 text-primary hover:text-primary/80 font-bold"
              >
                Sign in
              </button>
            </p>
          </motion.div>
        </main>
      ) : (
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-neutral-900">
              {isSignUp ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-3 text-neutral-600">
              {isSignUp
                ? accountType
                  ? "Just a few details to get started."
                  : "First, who is this account for?"
                : "Sign in to access your wallets."}
            </p>
          </div>

          {isSignUp && !accountType ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setAccountType("individual")}
                className="w-full text-left rounded-2xl border border-neutral-200 p-5 hover:border-primary hover:bg-primary/5 transition-colors flex items-start gap-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-neutral-900">Individual</span>
                  <span className="block text-sm text-neutral-600">A personal account for sending, receiving and spending money.</span>
                </span>
                <ArrowRight className="ml-auto mt-1 h-5 w-5 shrink-0 text-neutral-300" />
              </button>
              <button
                type="button"
                onClick={() => setAccountType("business")}
                className="w-full text-left rounded-2xl border border-neutral-200 p-5 hover:border-primary hover:bg-primary/5 transition-colors flex items-start gap-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-neutral-900">Corporate / Business</span>
                  <span className="block text-sm text-neutral-600">For a registered company — verified with business documents and ownership (KYB).</span>
                </span>
                <ArrowRight className="ml-auto mt-1 h-5 w-5 shrink-0 text-neutral-300" />
              </button>
            </div>
          ) : (
          <>
          {isSignUp && accountType && (
            <button
              type="button"
              onClick={() => setAccountType(null)}
              className="mb-5 w-full flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {accountType === "business" ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-900">
                  {accountType === "business" ? "Corporate / Business account" : "Individual account"}
                </span>
                <span className="block text-xs text-neutral-500">Tap to change</span>
              </span>
              <ArrowLeft className="h-4 w-4 shrink-0 text-neutral-400" />
            </button>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-neutral-700 font-medium">Full name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-neutral-700 font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-neutral-700 font-medium">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 pr-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-neutral-700 font-medium">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12 pr-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 shadow-lg shadow-primary/20"
            >
              {isLoading ? (
                <LoadingSpinner size={20} />
              ) : (
                <>
                  {isSignUp ? "Create account" : "Sign in"}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
          </>
          )}

          <p className="mt-8 text-center text-neutral-600">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setConfirmPassword("");
                setAccountType(null);
              }}
              className="ml-2 text-primary hover:text-primary/80 font-bold"
            >
              {isSignUp ? "Sign in" : "Create one"}
            </button>
          </p>

          {isSignUp && (
            <p className="mt-6 text-center text-xs text-neutral-400">
              By creating an account, you agree to our{" "}
              <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>
          )}
        </motion.div>
      </main>
      )}
    </div>
  );
};

export default Auth;
