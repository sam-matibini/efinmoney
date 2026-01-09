import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerPortal } from "@/hooks/useCustomerPortal";
import { OnboardingWizard } from "@/components/portal/OnboardingWizard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Building2, 
  Shield, 
  LogOut, 
  Mail,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const CustomerPortalPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { portalAccess, isLoading, hasAccess, customer } = useCustomerPortal();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl px-4 py-8">
          <Skeleton className="h-12 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>Customer Portal</CardTitle>
            <CardDescription>
              Please sign in to access your onboarding portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/auth')}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              Your account does not have access to the customer portal. 
              Please contact support if you believe this is an error.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
              <Mail className="w-4 h-4" />
              <span>{user.email}</span>
            </div>
            <Button variant="outline" className="w-full" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const kycApproved = customer?.kyc_status === 'approved';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container max-w-4xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="font-semibold">{customer?.name}</h1>
                <p className="text-sm text-muted-foreground">Customer Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge 
                variant={kycApproved ? 'default' : 'secondary'}
                className="flex items-center gap-1"
              >
                {kycApproved ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <Shield className="w-3 h-3" />
                )}
                {customer?.kyc_status || 'pending'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-4xl px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div>
            <h2 className="text-2xl font-bold">Welcome to Your Onboarding Portal</h2>
            <p className="text-muted-foreground">
              Complete the steps below to verify your business and get started.
            </p>
          </div>

          <OnboardingWizard />
        </motion.div>
      </main>
    </div>
  );
};

export default CustomerPortalPage;