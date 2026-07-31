import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";

const AdminGuard = ({ children }: { children: ReactNode }) => {
  // Two questions, two hooks: are they logged in at all? (useAuth),
  // and do they have an admin record? (useAdminAuth).
  const { user } = useAuth();
  const { admin, loading, signOut } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size={24} />
      </div>
    );
  }

  if (!user || !admin) {
    // Route through the shared /auth page with `?next=` so the lockout
    // banner knows to use admin thresholds (3 attempts / 2h).
    const next = location.pathname + location.search;
    return <Navigate to={`/auth?next=${encodeURIComponent(next)}`} replace />;
  }

  // Staff still onboarding -> send them to the wizard.
  if (admin.status === "invited" || admin.status === "pending_review") {
    if (location.pathname !== "/admin/onboarding") {
      return <Navigate to="/admin/onboarding" replace />;
    }
    return <>{children}</>;
  }

  // Rejected or suspended -> blocked screen.
  if (admin.status === "rejected" || admin.status === "suspended") {
    const rejected = admin.status === "rejected";
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full text-center space-y-4 rounded-2xl border border-border bg-card p-8">
          <div className="mx-auto w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
            <ShieldX className="w-6 h-6 text-destructive" />
          </div>
          <h1 className="text-xl font-display font-semibold text-foreground">
            {rejected ? "Application not approved" : "Account suspended"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {rejected
              ? "Your staff application was not approved. Please contact a super administrator if you believe this is a mistake."
              : "Your staff account has been suspended. Please contact a super administrator for assistance."}
          </p>
          <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
        </div>
      </div>
    );
  }

  // Active admins with full access.
  return <>{children}</>;
};

export default AdminGuard;
