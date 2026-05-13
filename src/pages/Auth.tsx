import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowRight, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = isSignUp ? "Create account · eFinMoney" : "Sign in · eFinMoney";
  }, [isSignUp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, fullName);
        if (error) toast.error(error.message);
        else {
          toast.success("Sign up successful! Let's verify your identity.");
          navigate("/onboarding/welcome");
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) toast.error(error.message);
        else {
          toast.success("Welcome back!");
          navigate("/");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans flex flex-col">
      <header className="border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="w-9 h-9" />
            <span className="font-black text-xl tracking-tight">eFinMoney</span>
          </Link>
          <Link to="/" className="text-sm font-medium text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
        </div>
      </header>

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
              {isSignUp ? "Start sending money in minutes." : "Sign in to access your wallets."}
            </p>
          </div>

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
                  className="h-12 bg-white border-neutral-200 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
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
                className="h-12 bg-white border-neutral-200 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
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
                  className="h-12 pr-12 bg-white border-neutral-200 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
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

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 shadow-lg shadow-emerald-500/20"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isSignUp ? "Create account" : "Sign in"}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-neutral-600">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="ml-2 text-emerald-600 hover:text-emerald-700 font-bold"
            >
              {isSignUp ? "Sign in" : "Create one"}
            </button>
          </p>

          {isSignUp && (
            <p className="mt-6 text-center text-xs text-neutral-400">
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default Auth;
