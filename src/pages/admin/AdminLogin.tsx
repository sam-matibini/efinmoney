import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useLoginLockout } from "@/hooks/useLoginLockout";
import { LoginLockoutBanners } from "@/components/auth/LoginLockoutBanners";

const AdminLogin = () => {
  const { signIn, user, admin, loading } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lockout = useLoginLockout({ maxAttempts: 3, kind: "admin" });

  useEffect(() => {
    if (!loading && user && admin) navigate("/admin/dashboard", { replace: true });
  }, [loading, user, admin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockout.isLocked) return;
    setSubmitting(true);

    // Re-check lockout right before sending credentials.
    const current = await lockout.checkLockout(email);
    if (current.lockedUntil) {
      setSubmitting(false);
      toast.error(`Account is locked. Try again in ${lockout.formatRemaining(current.remainingSeconds)}.`);
      return;
    }

    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      const msg = error.message || "Sign-in failed";
      toast.error(msg);
      await lockout.applyError(msg, email);
      return;
    }
    lockout.reset();
    toast.success("Welcome to the admin portal");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-accent/30">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-primary mx-auto flex items-center justify-center mb-2">
            <ShieldCheck className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="font-display">eFin Money Admin</CardTitle>
          <CardDescription>Sign in to access the admin portal</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginLockoutBanners
            isLocked={lockout.isLocked}
            secondsLeft={lockout.secondsLeft}
            formatRemaining={lockout.formatRemaining}
            attemptsLeft={lockout.attemptsLeft}
            showAttemptsWarning={lockout.showAttemptsWarning}
            maxAttempts={3}
            lockoutDuration="2 hours"
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={lockout.isLocked}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={lockout.isLocked}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || lockout.isLocked}>
              {submitting && <LoadingSpinner size={16} className="mr-2" />}
              {lockout.isLocked ? "Locked" : "Sign in"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Sessions auto-expire after 30 minutes of inactivity.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
