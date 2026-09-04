import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowRight, ArrowLeft, MailCheck, User, Building2, Check, X, Loader2, MapPin } from "lucide-react";
import { Logo, Wordmark } from "@/components/Logo";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PhotonAddressInput } from "@/components/PhotonAddressInput";
import { verifyEmail } from "@/lib/emailValidation";
import CountrySelect from "@/components/inputs/CountrySelect";
import { useLoginLockout } from "@/hooks/useLoginLockout";
import { LoginLockoutBanners } from "@/components/auth/LoginLockoutBanners";
import { BrandedScreen, BrandIconBadge, BrandPrimaryButton } from "@/components/brand/BrandedScreen";
import { passwordPolicyMessage, PASSWORD_MIN_LENGTH } from "@/lib/passwordPolicy";

const isSafeRedirect = (path: string | null): path is string =>
  !!path && path.startsWith("/") && !path.startsWith("//");

const Auth = () => {
  const [params] = useSearchParams();
  const modeParam = params.get("mode");
  const redirectTo = params.get("redirect");
  const nextParam = params.get("next");
  // The post-signin target. Prefer `next` (used by AdminGuard) over the
  // older `redirect` so admins always get back to the admin portal.
  const postSignInTarget = nextParam || redirectTo;
  // Detect admin flow from the URL so the lockout banner + RPC use the
  // stricter 3-attempt / 2h rules instead of the customer 10/1h.
  const isAdminFlow = (postSignInTarget ?? "").startsWith("/admin");
  const [isSignUp, setIsSignUp] = useState(modeParam !== "signin" && !nextParam);
  const [accountType, setAccountType] = useState<"individual" | "business" | null>(null);
  const [email, setEmail] = useState("");
  const [emailCheck, setEmailCheck] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [emailCheckMessage, setEmailCheckMessage] = useState<string | null>(null);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [occupation, setOccupation] = useState("");
  const [nationality, setNationality] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const lockout = useLoginLockout({
    maxAttempts: isAdminFlow ? 3 : 10,
    kind: isAdminFlow ? "admin" : "customer",
  });
  const lockoutHours = isAdminFlow ? "2 hours" : "1 hour";

  useEffect(() => {
    if (modeParam) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("mode");
      window.history.replaceState({}, "", newUrl.toString());
    }
  }, [modeParam]);

  useEffect(() => {
    document.title = isSignUp
      ? (isAdminFlow ? "Admin sign in · eFinMoney" : "Create account · eFinMoney")
      : (isAdminFlow ? "Admin sign in · eFinMoney" : "Sign in · eFinMoney");
  }, [isSignUp, isAdminFlow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          toast.error("Passwords do not match.");
          return;
        }
        const pwIssue = passwordPolicyMessage(password);
        if (pwIssue) {
          toast.error(pwIssue);
          return;
        }
        if (emailCheck === "checking") {
          toast.error("Please wait — we're still checking your email address.");
          return;
        }
        if (emailCheck === "invalid") {
          toast.error(emailCheckMessage ?? "Please enter a valid email address.");
          return;
        }
        if (!streetAddress.trim() || !city.trim() || !country) {
          toast.error("Please complete your address.");
          return;
        }
        if (!phone.trim() || !dob || !nationality) {
          toast.error("Phone, date of birth, and nationality are required.");
          return;
        }
        const { error } = await signUp(
          email,
          password,
          firstName.trim(),
          lastName.trim(),
          accountType ?? "individual",
          {
            street: streetAddress.trim(),
            city: city.trim(),
            state: stateRegion.trim(),
            postalCode: postalCode.trim(),
            countryCode: country,
            phone: phone.trim(),
            dateOfBirth: dob,
            occupation: occupation.trim(),
            nationality,
          }
        );
        if (error) toast.error(error.message);
        else {
          // Identity is required before transfers; preserve the deep-link for after KYC.
          if (isSafeRedirect(postSignInTarget)) {
            try { sessionStorage.setItem("efm_post_kyc_redirect", postSignInTarget); } catch { /* noop */ }
          }
          // Email confirmation is required — show the "check your inbox" screen.
          setSignedUpEmail(email);
        }
      } else {
        if (lockout.isLocked) return;
        // Re-check lockout right before sending credentials.
        const current = await lockout.checkLockout(email);
        if (current.lockedUntil) {
          toast.error(`Account is locked. Try again in ${lockout.formatRemaining(current.remainingSeconds)}.`);
          return;
        }
        const signInKind: "admin" | "customer" = isAdminFlow ? "admin" : "customer";
        const { error } = await signIn(email, password, signInKind);
        if (error) {
          toast.error(error.message);
          await lockout.applyError(error.message, email);
        } else {
          lockout.reset();
          toast.success("Welcome back!");
          navigate(isSafeRedirect(postSignInTarget) ? postSignInTarget : "/dashboard");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailBlur = async () => {
    if (!email.trim() || emailCheck === "checking") return;
    setEmailCheck("checking");
    setEmailCheckMessage(null);
    setEmailSuggestion(null);
    const result = await verifyEmail(email);
    setEmailCheck(result.valid ? "valid" : "invalid");
    setEmailCheckMessage(result.message ?? null);
    setEmailSuggestion(result.suggestion ?? null);
  };

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Enter your email address first.");
      return;
    }
    setSendingReset(true);
    try {
      // Route through our branded Edge Function so the user gets the
      // eFinMoney-styled reset email instead of the stock Supabase one.
      const { error } = await supabase.functions.invoke("send-password-reset", {
        body: { email, next: "/auth" },
      });
      if (error) toast.error(error.message);
      else setResetSentTo(email);
    } finally {
      setSendingReset(false);
    }
  };

  const handleResend = async () => {
    if (!signedUpEmail) return;
    setResending(true);
    try {
      const appOrigin = (import.meta.env.VITE_APP_URL || "https://www.efin.money").replace(/\/+$/, "");
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: signedUpEmail,
        options: { emailRedirectTo: `${appOrigin}/auth/confirm` },
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

      {resetSentTo ? (
        <BrandedScreen
          cardWidth="md"
          hideTopBar
        >
          <BrandIconBadge icon={<MailCheck className="h-9 w-9" />} tone="info" />
          <h1 className="text-center text-2xl font-display font-bold text-foreground">Check your inbox</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground leading-relaxed">
            If an account exists for <strong className="text-foreground">{resetSentTo}</strong>, we've sent a
            password reset link. Click it to choose a new password.
          </p>
          <BrandPrimaryButton onClick={handleSendReset} disabled={sendingReset}>
            {sendingReset ? <LoadingSpinner size={18} /> : "Resend reset link"}
          </BrandPrimaryButton>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <button
              onClick={() => { setResetSentTo(null); setShowForgot(false); setIsSignUp(false); }}
              className="text-primary hover:text-primary/80 font-bold underline-offset-4 hover:underline"
            >
              Back to sign in
            </button>
          </p>
        </BrandedScreen>
      ) : showForgot ? (
        <BrandedScreen
          cardWidth="md"
          hideTopBar
        >
          <BrandIconBadge icon={<MailCheck className="h-8 w-8" />} tone="info" />
          <h1 className="text-center text-2xl font-display font-bold text-foreground">Reset your password</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Enter your email and we'll send you a link to set a new password.
          </p>
          <form onSubmit={handleSendReset} className="mt-7 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="reset-email" className="text-foreground font-medium">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-xl"
                required
              />
            </div>
            <BrandPrimaryButton type="submit" disabled={sendingReset}>
              {sendingReset ? <LoadingSpinner size={18} /> : (<>Send reset link <ArrowRight className="w-5 h-5" /></>)}
            </BrandPrimaryButton>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            <button
              onClick={() => { setShowForgot(false); setIsSignUp(false); }}
              className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-bold underline-offset-4 hover:underline"
            >
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </button>
          </p>
        </BrandedScreen>
      ) : signedUpEmail ? (
        <BrandedScreen
          cardWidth="md"
          hideTopBar
        >
          <BrandIconBadge icon={<MailCheck className="h-9 w-9" />} tone="info" />
          <h1 className="text-center text-2xl font-display font-bold text-foreground">Check your inbox</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground leading-relaxed">
            We sent a verification link to <strong className="text-foreground">{signedUpEmail}</strong>.
            Click it to confirm your email — you'll be signed in automatically and taken to the next step.
          </p>
          <BrandPrimaryButton onClick={handleResend} disabled={resending}>
            {resending ? <LoadingSpinner size={18} /> : "Resend verification email"}
          </BrandPrimaryButton>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Wrong email?{" "}
            <button
              onClick={() => { setSignedUpEmail(null); setIsSignUp(true); }}
              className="text-primary hover:text-primary/80 font-bold underline-offset-4 hover:underline"
            >
              Go back
            </button>
          </p>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Already verified?{" "}
            <button
              onClick={() => { setSignedUpEmail(null); setIsSignUp(false); }}
              className="text-primary hover:text-primary/80 font-bold underline-offset-4 hover:underline"
            >
              Sign in
            </button>
          </p>
        </BrandedScreen>
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
              {isAdminFlow
                ? "Admin sign in"
                : isSignUp
                  ? accountType === "business"
                    ? "Create your business account"
                    : "Create your account"
                  : "Welcome back"}
            </h1>
            <p className="mt-3 text-neutral-600">
              {isAdminFlow
                ? "Sign in to the eFin Money admin portal."
                : isSignUp
                  ? accountType
                    ? accountType === "business"
                      ? "First, create your login — you'll add your company details next."
                      : "Just a few details to get started."
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
          <LoginLockoutBanners
            isLocked={lockout.isLocked}
            secondsLeft={lockout.secondsLeft}
            formatRemaining={lockout.formatRemaining}
            attemptsLeft={lockout.attemptsLeft}
            showAttemptsWarning={lockout.showAttemptsWarning}
            maxAttempts={isAdminFlow ? 3 : 10}
            lockoutDuration={lockoutHours}
          />

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-neutral-700 font-medium">First name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="h-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                    autoComplete="given-name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-neutral-700 font-medium">Last name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="h-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                    autoComplete="family-name"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-neutral-700 font-medium">Email</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailCheck !== "idle") {
                      setEmailCheck("idle");
                      setEmailCheckMessage(null);
                      setEmailSuggestion(null);
                    }
                  }}
                  onBlur={isSignUp ? handleEmailBlur : undefined}
                  className="h-12 pr-10 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                  required
                  disabled={!isSignUp && lockout.isLocked}
                />
                {isSignUp && emailCheck === "checking" && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 animate-spin" />
                )}
                {isSignUp && emailCheck === "valid" && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
                )}
                {isSignUp && emailCheck === "invalid" && (
                  <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-600" />
                )}
              </div>
              {isSignUp && emailCheck === "invalid" && emailCheckMessage && (
                <p className="text-xs text-red-600">
                  {emailCheckMessage}
                  {emailSuggestion && (
                    <>
                      {" "}Did you mean{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setEmail(emailSuggestion);
                          setEmailCheck("valid");
                          setEmailCheckMessage(null);
                          setEmailSuggestion(null);
                        }}
                        className="font-semibold text-primary hover:underline"
                      >
                        {emailSuggestion}
                      </button>
                      ?
                    </>
                  )}
                </p>
              )}
            </div>

            {isSignUp && (
              <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                  <MapPin className="h-4 w-4 text-primary" />
                  Address
                </div>
                <div className="space-y-2">
                  <Label htmlFor="streetAddress" className="text-neutral-700 font-medium">Street address</Label>
                  <PhotonAddressInput
                    id="streetAddress"
                    value={streetAddress}
                    onChange={setStreetAddress}
                    onPlace={(place) => {
                      setStreetAddress(place.street);
                      setCity(place.city);
                      setStateRegion(place.state);
                      setPostalCode(place.postalCode);
                      if (place.countryCode) setCountry(place.countryCode);
                    }}
                    placeholder="Start typing your address…"
                    autoComplete="address-line1"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-neutral-700 font-medium">City</Label>
                    <Input
                      id="city"
                      type="text"
                      placeholder="Toronto"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="h-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                      autoComplete="address-level2"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stateRegion" className="text-neutral-700 font-medium">State / Province</Label>
                    <Input
                      id="stateRegion"
                      type="text"
                      placeholder="Ontario"
                      value={stateRegion}
                      onChange={(e) => setStateRegion(e.target.value)}
                      className="h-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                      autoComplete="address-level1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postalCode" className="text-neutral-700 font-medium">Postal code</Label>
                    <Input
                      id="postalCode"
                      type="text"
                      placeholder="M5V 2H1"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="h-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                      autoComplete="postal-code"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country" className="text-neutral-700 font-medium">Country</Label>
                    <CountrySelect
                      id="country"
                      value={country}
                      onValueChange={setCountry}
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-neutral-700 font-medium">Phone number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+14165550123"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                      autoComplete="tel"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dob" className="text-neutral-700 font-medium">Date of birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="h-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                      autoComplete="bday"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="occupation" className="text-neutral-700 font-medium">Occupation</Label>
                    <Input
                      id="occupation"
                      type="text"
                      placeholder="e.g. Software engineer"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      className="h-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                      autoComplete="organization-title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationality" className="text-neutral-700 font-medium">Nationality</Label>
                    <CountrySelect
                      id="nationality"
                      value={nationality}
                      onValueChange={setNationality}
                      placeholder="Select nationality"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-neutral-700 font-medium">Password</Label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-sm font-medium text-primary hover:text-primary/80"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 pr-12 bg-white border-neutral-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                  required
                  minLength={isSignUp ? PASSWORD_MIN_LENGTH : 6}
                  disabled={!isSignUp && lockout.isLocked}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                  disabled={!isSignUp && lockout.isLocked}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {isSignUp && (
                <p className="text-xs text-muted-foreground">
                  At least 8 characters, with one uppercase, one lowercase, and one number.
                </p>
              )}
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
                    minLength={PASSWORD_MIN_LENGTH}
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
              disabled={isLoading || (!isSignUp && lockout.isLocked)}
              className="w-full h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 shadow-lg shadow-primary/20"
            >
              {isLoading ? (
                <LoadingSpinner size={20} />
              ) : (
                <>
                  {isSignUp
                    ? accountType === "business"
                      ? "Continue to business setup"
                      : "Create account"
                    : lockout.isLocked
                      ? "Locked"
                      : "Sign in"}
                  {!lockout.isLocked && <ArrowRight className="w-5 h-5" />}
                </>
              )}
            </button>
          </form>
          </>
          )}

          {!isAdminFlow && (
          <p className="mt-8 text-center text-neutral-600">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setConfirmPassword("");
                setAccountType(null);
                setFirstName("");
                setLastName("");
                setStreetAddress("");
                setCity("");
                setStateRegion("");
                setPostalCode("");
                setCountry("");
                setPhone("");
                setDob("");
                setOccupation("");
                setNationality("");
                setEmailCheck("idle");
                setEmailCheckMessage(null);
                setEmailSuggestion(null);
              }}
              className="ml-2 text-primary hover:text-primary/80 font-bold"
            >
              {isSignUp ? "Sign in" : "Create one"}
            </button>
          </p>
          )}

          {isSignUp && !isAdminFlow && (
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
