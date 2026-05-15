import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import PageTransition from "@/components/ui/PageTransition";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import Index from "./pages/Index";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import FinanceDashboard from "./pages/FinanceDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import OperationsDashboard from "./pages/OperationsDashboard";
import SettingsDashboard from "./pages/SettingsDashboard";
import WalletsPage from "./pages/WalletsPage";
import SendPage from "./pages/SendPage";
import ExchangePage from "./pages/ExchangePage";
import CardsPage from "./pages/CardsPage";
import CustomerPortalPage from "./pages/CustomerPortalPage";
import ProfileSettingsPage from "./pages/ProfileSettingsPage";
import KYCPage from "./pages/KYCPage";
import SecurityPage from "./pages/SecurityPage";
import DepositComplete from "./pages/DepositComplete";
import PaymentCallback from "./pages/PaymentCallback";
import TransferTrackingPage from "./pages/TransferTrackingPage";
import TransfersListPage from "./pages/TransfersListPage";
import ContactsPage from "./pages/ContactsPage";
import CanadaTransferPage from "./pages/CanadaTransferPage";
import ReceivePage from "./pages/ReceivePage";
import TopUpPage from "./pages/TopUpPage";
import PayBillsPage from "./pages/PayBillsPage";
import KYCGuard from "@/components/kyc/KYCGuard";
import Welcome from "./pages/onboarding/Welcome";
import OnboardingIdentity from "./pages/onboarding/Identity";
import OnboardingAddress from "./pages/onboarding/Address";
import OnboardingReview from "./pages/onboarding/Review";
import OnboardingPending from "./pages/onboarding/Pending";
import OnboardingApproved from "./pages/onboarding/Approved";
import OnboardingRejected from "./pages/onboarding/Rejected";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import AdminGuard from "@/components/admin-portal/AdminGuard";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import KycQueuePage from "./pages/admin/KycQueuePage";
import KycReviewPage from "./pages/admin/KycReviewPage";
import AdminPlaceholderPage from "./pages/admin/AdminPlaceholderPage";
import UsersPage from "./pages/admin/UsersPage";
import UserDetailPage from "./pages/admin/UserDetailPage";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const RoleProtectedRoute = ({ 
  children, 
  allowedRoles 
}: { 
  children: React.ReactNode; 
  allowedRoles: ('admin' | 'finance' | 'compliance')[];
}) => {
  const { user, loading } = useAuth();
  const { roles, isLoading: rolesLoading } = useUserRoles();

  if (loading || rolesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const hasAccess = allowedRoles.some(role => roles.includes(role));
  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const KycProtectedRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <KYCGuard>{children}</KYCGuard>
  </ProtectedRoute>
);

const RootRoute = () => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Landing />;
  return <KYCGuard><Index /></KYCGuard>;
};

const AppRoutes = () => {
  const location = useLocation();

  // Workaround for a known Radix UI bug where Dialog/DropdownMenu
  // sometimes leaves `pointer-events: none` stuck on <body> after closing,
  // requiring users to double-click the next interactive element.
  useEffect(() => {
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = "";
    }
  }, [location.pathname]);

  return (
    <AnimatePresence mode="wait">
      <PageTransition key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<RootRoute />} />
          <Route path="/dashboard" element={<KycProtectedRoute><Index /></KycProtectedRoute>} />
          <Route path="/wallets" element={<KycProtectedRoute><WalletsPage /></KycProtectedRoute>} />
          <Route path="/send" element={<KycProtectedRoute><SendPage /></KycProtectedRoute>} />
          <Route path="/exchange" element={<KycProtectedRoute><ExchangePage /></KycProtectedRoute>} />
          <Route path="/cards" element={<KycProtectedRoute><CardsPage /></KycProtectedRoute>} />
          <Route path="/finance" element={<RoleProtectedRoute allowedRoles={['admin', 'finance']}><FinanceDashboard /></RoleProtectedRoute>} />
          <Route path="/admin/legacy" element={<RoleProtectedRoute allowedRoles={['admin']}><AdminDashboard /></RoleProtectedRoute>} />
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/dashboard" element={<AdminAuthProvider><AdminGuard><AdminDashboardPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/kyc" element={<AdminAuthProvider><AdminGuard><KycQueuePage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/kyc/:id" element={<AdminAuthProvider><AdminGuard><KycReviewPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/users" element={<AdminAuthProvider><AdminGuard><UsersPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/users/:id" element={<AdminAuthProvider><AdminGuard><UserDetailPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/risk-tiers" element={<AdminAuthProvider><AdminGuard><AdminPlaceholderPage title="Risk Tiers" description="Tier configuration — coming in Phase 2" /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/audit-log" element={<AdminAuthProvider><AdminGuard><AdminPlaceholderPage title="Audit Log" description="Complete audit trail — coming in Phase 2" /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/settings" element={<AdminAuthProvider><AdminGuard><AdminPlaceholderPage title="Settings" description="Admin settings — coming in Phase 2" /></AdminGuard></AdminAuthProvider>} />
          <Route path="/settings" element={<RoleProtectedRoute allowedRoles={['admin']}><SettingsDashboard /></RoleProtectedRoute>} />
          <Route path="/operations" element={<RoleProtectedRoute allowedRoles={['admin', 'compliance', 'finance']}><OperationsDashboard /></RoleProtectedRoute>} />
          <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
          <Route path="/portal" element={<CustomerPortalPage />} />
          <Route path="/profile" element={<ProtectedRoute><ProfileSettingsPage /></ProtectedRoute>} />
          <Route path="/kyc" element={<ProtectedRoute><KYCPage /></ProtectedRoute>} />
          <Route path="/security" element={<ProtectedRoute><SecurityPage /></ProtectedRoute>} />
          <Route path="/transfers" element={<KycProtectedRoute><TransfersListPage /></KycProtectedRoute>} />
          <Route path="/transfers/:id" element={<KycProtectedRoute><TransferTrackingPage /></KycProtectedRoute>} />
          <Route path="/contacts" element={<KycProtectedRoute><ContactsPage /></KycProtectedRoute>} />
          <Route path="/transfers/canada" element={<KycProtectedRoute><CanadaTransferPage /></KycProtectedRoute>} />
          <Route path="/wallet/receive" element={<KycProtectedRoute><ReceivePage /></KycProtectedRoute>} />
          <Route path="/wallet/topup" element={<KycProtectedRoute><TopUpPage /></KycProtectedRoute>} />
          <Route path="/pay-bills" element={<KycProtectedRoute><PayBillsPage /></KycProtectedRoute>} />
          <Route path="/deposit/complete" element={<DepositComplete />} />
          <Route path="/payment-callback" element={<PaymentCallback />} />
          <Route path="/onboarding/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
          <Route path="/onboarding/identity" element={<ProtectedRoute><OnboardingIdentity /></ProtectedRoute>} />
          <Route path="/onboarding/address" element={<ProtectedRoute><OnboardingAddress /></ProtectedRoute>} />
          <Route path="/onboarding/review" element={<ProtectedRoute><OnboardingReview /></ProtectedRoute>} />
          <Route path="/onboarding/pending" element={<ProtectedRoute><OnboardingPending /></ProtectedRoute>} />
          <Route path="/onboarding/approved" element={<ProtectedRoute><OnboardingApproved /></ProtectedRoute>} />
          <Route path="/onboarding/rejected" element={<ProtectedRoute><OnboardingRejected /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </PageTransition>
    </AnimatePresence>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
