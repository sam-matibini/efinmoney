import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import PageTransition from "@/components/ui/PageTransition";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import Index from "./pages/Index";
import Landing from "./pages/Landing";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsPage from "./pages/TermsPage";
import CompliancePage from "./pages/CompliancePage";
import Auth from "./pages/Auth";
import AuthConfirm from "./pages/AuthConfirm";
import NotFound from "./pages/NotFound";
import FinanceDashboard from "./pages/FinanceDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import OperationsDashboard from "./pages/OperationsDashboard";
import SettingsDashboard from "./pages/SettingsDashboard";
import WalletsPage from "./pages/WalletsPage";
import SendPage from "./pages/SendPage";
import SendCpnPage from "./pages/SendCpnPage";
import ExchangePage from "./pages/ExchangePage";
import CardsPage from "./pages/CardsPage";
import EfinCardDetailPage from "./pages/EfinCardDetailPage";
import CustomerPortalPage from "./pages/CustomerPortalPage";
import ProfileSettingsPage from "./pages/ProfileSettingsPage";
import KYCPage from "./pages/KYCPage";
import SecurityPage from "./pages/SecurityPage";
import DepositComplete from "./pages/DepositComplete";
import PaymentCallback from "./pages/PaymentCallback";
import TransferTrackingPage from "./pages/TransferTrackingPage";
import TransfersListPage from "./pages/TransfersListPage";
import WalletStatementPage from "./pages/WalletStatementPage";
import TransactionDetailPage from "./pages/TransactionDetailPage";
import ContactsPage from "./pages/ContactsPage";
import CanadaTransferPage from "./pages/CanadaTransferPage";
import ReceivePage from "./pages/ReceivePage";
import TopUpPage from "./pages/TopUpPage";
import PayBillsPage from "./pages/PayBillsPage";
import KYCGuard from "@/components/kyc/KYCGuard";
import Welcome from "./pages/onboarding/Welcome";
import OnboardingIdentity from "./pages/onboarding/Identity";
import OnboardingEnhanced from "./pages/onboarding/Enhanced";


import OnboardingRejected from "./pages/onboarding/Rejected";
import ShortLinkResolver from "./pages/ShortLinkResolver";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import AdminGuard from "@/components/admin-portal/AdminGuard";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import KycQueuePage from "./pages/admin/KycQueuePage";
import KycReviewPage from "./pages/admin/KycReviewPage";
import AdminPlaceholderPage from "./pages/admin/AdminPlaceholderPage";
import RiskTiersPage from "./pages/admin/RiskTiersPage";
import AuditLogPage from "./pages/admin/AuditLogPage";
import ApiManagementPage from "./pages/admin/ApiManagementPage";
import KycConfigPage from "./pages/admin/KycConfigPage";
import UsersPage from "./pages/admin/UsersPage";
import UserDetailPage from "./pages/admin/UserDetailPage";
import SystemDiagnosticsPage from "./pages/admin/SystemDiagnosticsPage";
import DataExportPage from "./pages/admin/DataExportPage";
import StaffPage from "./pages/admin/StaffPage";
import StaffDetailPage from "./pages/admin/StaffDetailPage";
import StaffOnboardingPage from "./pages/admin/StaffOnboardingPage";
import InteracCallback from "./pages/InteracCallback";
import InteracHubCallback from "./pages/InteracHubCallback";
import MorePage from "./pages/MorePage";
import StripeConnectInstantPage from "./pages/StripeConnectInstantPage";
import AfricanCardSendPage from "./pages/AfricanCardSendPage";
import LoadingSpinner from "@/components/LoadingSpinner";
import SplashScreen from "@/components/SplashScreen";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner size={120} />
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
        <LoadingSpinner size={120} />
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
        <LoadingSpinner size={120} />
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
        <LoadingSpinner size={120} />
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
          <Route path="/s/:code" element={<ShortLinkResolver />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/dashboard" element={<KycProtectedRoute><Index /></KycProtectedRoute>} />
          <Route path="/wallets" element={<KycProtectedRoute><WalletsPage /></KycProtectedRoute>} />
          <Route path="/wallets/:walletId/statement" element={<KycProtectedRoute><WalletStatementPage /></KycProtectedRoute>} />
          <Route path="/send" element={<KycProtectedRoute><SendPage /></KycProtectedRoute>} />
          <Route path="/send/cpn" element={<KycProtectedRoute><SendCpnPage /></KycProtectedRoute>} />
          <Route path="/send/african-card" element={<KycProtectedRoute><AfricanCardSendPage /></KycProtectedRoute>} />
          <Route path="/exchange" element={<KycProtectedRoute><ExchangePage /></KycProtectedRoute>} />
          <Route path="/cards" element={<KycProtectedRoute><CardsPage /></KycProtectedRoute>} />
          <Route path="/cards/efin/:id" element={<KycProtectedRoute><EfinCardDetailPage /></KycProtectedRoute>} />

          <Route path="/finance" element={<RoleProtectedRoute allowedRoles={['admin', 'finance']}><FinanceDashboard /></RoleProtectedRoute>} />
          <Route path="/admin/legacy" element={<RoleProtectedRoute allowedRoles={['admin']}><AdminDashboard /></RoleProtectedRoute>} />
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/login" element={<AdminAuthProvider><AdminLogin /></AdminAuthProvider>} />
          <Route path="/admin/dashboard" element={<AdminAuthProvider><AdminGuard><AdminDashboardPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/kyc" element={<AdminAuthProvider><AdminGuard><KycQueuePage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/kyc/:id" element={<AdminAuthProvider><AdminGuard><KycReviewPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/users" element={<AdminAuthProvider><AdminGuard><UsersPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/users/:id" element={<AdminAuthProvider><AdminGuard><UserDetailPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/risk-tiers" element={<AdminAuthProvider><AdminGuard><RiskTiersPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/audit-log" element={<AdminAuthProvider><AdminGuard><AuditLogPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/settings" element={<AdminAuthProvider><AdminGuard><ApiManagementPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/kyc-config" element={<AdminAuthProvider><AdminGuard><KycConfigPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/diagnostics" element={<AdminAuthProvider><AdminGuard><SystemDiagnosticsPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/data-export" element={<AdminAuthProvider><AdminGuard><DataExportPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/staff" element={<AdminAuthProvider><AdminGuard><StaffPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/staff/:id" element={<AdminAuthProvider><AdminGuard><StaffDetailPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/admin/onboarding" element={<AdminAuthProvider><AdminGuard><StaffOnboardingPage /></AdminGuard></AdminAuthProvider>} />
          <Route path="/settings" element={<RoleProtectedRoute allowedRoles={['admin']}><SettingsDashboard /></RoleProtectedRoute>} />
          <Route path="/operations" element={<RoleProtectedRoute allowedRoles={['admin', 'compliance', 'finance']}><OperationsDashboard /></RoleProtectedRoute>} />
          <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
          <Route path="/auth/confirm" element={<AuthConfirm />} />
          <Route path="/portal" element={<CustomerPortalPage />} />
          <Route path="/profile" element={<ProtectedRoute><ProfileSettingsPage /></ProtectedRoute>} />
          <Route path="/more" element={<KycProtectedRoute><MorePage /></KycProtectedRoute>} />
          <Route path="/kyc" element={<ProtectedRoute><KYCPage /></ProtectedRoute>} />
          <Route path="/security" element={<ProtectedRoute><SecurityPage /></ProtectedRoute>} />
          <Route path="/transfers" element={<KycProtectedRoute><TransfersListPage /></KycProtectedRoute>} />
          <Route path="/transfers/:id" element={<KycProtectedRoute><TransferTrackingPage /></KycProtectedRoute>} />
          <Route path="/transactions/:journalId" element={<KycProtectedRoute><TransactionDetailPage /></KycProtectedRoute>} />
          <Route path="/contacts" element={<KycProtectedRoute><ContactsPage /></KycProtectedRoute>} />
          <Route path="/transfers/canada" element={<KycProtectedRoute><CanadaTransferPage /></KycProtectedRoute>} />
          <Route path="/wallet/receive" element={<KycProtectedRoute><ReceivePage /></KycProtectedRoute>} />
          <Route path="/wallet/topup" element={<KycProtectedRoute><TopUpPage /></KycProtectedRoute>} />
          <Route path="/pay-bills" element={<KycProtectedRoute><PayBillsPage /></KycProtectedRoute>} />
          <Route path="/stripe-connect" element={<KycProtectedRoute><StripeConnectInstantPage /></KycProtectedRoute>} />
          <Route path="/deposit/complete" element={<DepositComplete />} />
          <Route path="/payment-callback" element={<PaymentCallback />} />
          <Route path="/callback" element={<InteracCallback />} />
          <Route path="/interac/callback" element={<InteracHubCallback />} />
          <Route path="/onboarding/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
          <Route path="/onboarding/identity" element={<ProtectedRoute><OnboardingIdentity /></ProtectedRoute>} />
          <Route path="/onboarding/enhanced" element={<ProtectedRoute><OnboardingEnhanced /></ProtectedRoute>} />
          <Route path="/onboarding/pending" element={<Navigate to="/dashboard" replace />} />
          <Route path="/onboarding/approved" element={<Navigate to="/dashboard" replace />} />

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
          <SplashScreen />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
