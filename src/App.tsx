import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import { useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import SplashScreen from "@/components/SplashScreen";

// Layout shells (small, used by many routes — keep eager)
import KycAppLayout from "@/components/layout/KycAppLayout";
import ProtectedShell from "@/components/layout/ProtectedShell";
import ClientShell from "@/components/layout/ClientShell";
import AdminGuard from "@/components/admin-portal/AdminGuard";
import KYCGuard from "@/components/kyc/KYCGuard";

// Lazy-loaded pages
const Index = lazy(() => import("./pages/Index"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const CompliancePage = lazy(() => import("./pages/CompliancePage"));
const AuthConfirm = lazy(() => import("./pages/AuthConfirm"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const FinanceDashboard = lazy(() => import("./pages/FinanceDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const OperationsDashboard = lazy(() => import("./pages/OperationsDashboard"));
const SettingsDashboard = lazy(() => import("./pages/SettingsDashboard"));
const WalletsPage = lazy(() => import("./pages/WalletsPage"));
const SendPage = lazy(() => import("./pages/SendPage"));
const SendCpnPage = lazy(() => import("./pages/SendCpnPage"));
const ExchangePage = lazy(() => import("./pages/ExchangePage"));
const CardsPage = lazy(() => import("./pages/CardsPage"));
const EfinCardDetailPage = lazy(() => import("./pages/EfinCardDetailPage"));
const CustomerPortalPage = lazy(() => import("./pages/CustomerPortalPage"));
const ProfileSettingsPage = lazy(() => import("./pages/ProfileSettingsPage"));
const KYCPage = lazy(() => import("./pages/KYCPage"));
const SecurityPage = lazy(() => import("./pages/SecurityPage"));
const DepositComplete = lazy(() => import("./pages/DepositComplete"));
const PaymentCallback = lazy(() => import("./pages/PaymentCallback"));
const TransferTrackingPage = lazy(() => import("./pages/TransferTrackingPage"));
const TransfersListPage = lazy(() => import("./pages/TransfersListPage"));
const WalletStatementPage = lazy(() => import("./pages/WalletStatementPage"));
const TransactionDetailPage = lazy(() => import("./pages/TransactionDetailPage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const CanadaTransferPage = lazy(() => import("./pages/CanadaTransferPage"));
const ReceivePage = lazy(() => import("./pages/ReceivePage"));
const TopUpPage = lazy(() => import("./pages/TopUpPage"));
const PayBillsPage = lazy(() => import("./pages/PayBillsPage"));
const Welcome = lazy(() => import("./pages/onboarding/Welcome"));
const OnboardingIdentity = lazy(() => import("./pages/onboarding/Identity"));
const OnboardingEnhanced = lazy(() => import("./pages/onboarding/Enhanced"));
const OnboardingRejected = lazy(() => import("./pages/onboarding/Rejected"));
const ShortLinkResolver = lazy(() => import("./pages/ShortLinkResolver"));
const ClaimPaymentLinkPage = lazy(() => import("./pages/ClaimPaymentLinkPage"));
const PaymentLinksPage = lazy(() => import("./pages/PaymentLinksPage"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const KycQueuePage = lazy(() => import("./pages/admin/KycQueuePage"));
const KycReviewPage = lazy(() => import("./pages/admin/KycReviewPage"));
const AdminAdyenLinksPage = lazy(() => import("./pages/admin/AdminAdyenLinksPage"));
const AdminAdyenTransactionsPage = lazy(() => import("./pages/admin/AdminAdyenTransactionsPage"));
const RiskTiersPage = lazy(() => import("./pages/admin/RiskTiersPage"));
const AuditLogPage = lazy(() => import("./pages/admin/AuditLogPage"));
const ApiManagementPage = lazy(() => import("./pages/admin/ApiManagementPage"));
const KycConfigPage = lazy(() => import("./pages/admin/KycConfigPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const UserDetailPage = lazy(() => import("./pages/admin/UserDetailPage"));
const SystemDiagnosticsPage = lazy(() => import("./pages/admin/SystemDiagnosticsPage"));
const DataExportPage = lazy(() => import("./pages/admin/DataExportPage"));
const StaffPage = lazy(() => import("./pages/admin/StaffPage"));
const StaffDetailPage = lazy(() => import("./pages/admin/StaffDetailPage"));
const StaffOnboardingPage = lazy(() => import("./pages/admin/StaffOnboardingPage"));
const InteracCallback = lazy(() => import("./pages/InteracCallback"));
const InteracHubCallback = lazy(() => import("./pages/InteracHubCallback"));
const MorePage = lazy(() => import("./pages/MorePage"));
const StripeConnectInstantPage = lazy(() => import("./pages/StripeConnectInstantPage"));
const AfricanCardSendPage = lazy(() => import("./pages/AfricanCardSendPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const FullPageSpinner = () => (
  <div className="min-h-screen flex items-center justify-center" style={{ background: "#07122e" }}>
    <LoadingSpinner size={140} />
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const RoleProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: ("admin" | "finance" | "compliance")[];
}) => {
  const { user, loading } = useAuth();
  const { roles, isLoading: rolesLoading } = useUserRoles();
  if (loading || rolesLoading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  const hasAccess = allowedRoles.some((role) => roles.includes(role));
  if (!hasAccess) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const KycShellRoute = () => (
  <ProtectedRoute>
    <KycAppLayout />
  </ProtectedRoute>
);

const ProtectedShellRoute = () => (
  <ProtectedRoute>
    <ProtectedShell />
  </ProtectedRoute>
);

const RoleShellRoute = ({
  allowedRoles,
}: {
  allowedRoles: ("admin" | "finance" | "compliance")[];
}) => (
  <RoleProtectedRoute allowedRoles={allowedRoles}>
    <ClientShell />
  </RoleProtectedRoute>
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
  return <Navigate to="/dashboard" replace />;
};

const AppRoutes = () => {
  const location = useLocation();

  // Workaround for a known Radix UI bug where Dialog/DropdownMenu
  // sometimes leaves `pointer-events: none` stuck on <body> after closing.
  useEffect(() => {
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = "";
    }
  }, [location.pathname]);

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes location={location}>
        <Route path="/" element={<RootRoute />} />
        <Route path="/s/:code" element={<ShortLinkResolver />} />
        <Route path="/claim/:code" element={<ClaimPaymentLinkPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/compliance" element={<CompliancePage />} />

        <Route element={<KycShellRoute />}>
          <Route path="/dashboard" element={<Index />} />
          <Route path="/wallets" element={<WalletsPage />} />
          <Route path="/wallets/:walletId/statement" element={<WalletStatementPage />} />
          <Route path="/send" element={<SendPage />} />
          <Route path="/send/cpn" element={<SendCpnPage />} />
          <Route path="/send/african-card" element={<AfricanCardSendPage />} />
          <Route path="/exchange" element={<ExchangePage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/cards/efin/:id" element={<EfinCardDetailPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/transfers" element={<TransfersListPage />} />
          <Route path="/transfers/:id" element={<TransferTrackingPage />} />
          <Route path="/transactions/:journalId" element={<TransactionDetailPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/payees" element={<ContactsPage />} />
          <Route path="/payment-links" element={<PaymentLinksPage />} />
          <Route path="/transfers/canada" element={<CanadaTransferPage />} />
          <Route path="/wallet/receive" element={<ReceivePage />} />
          <Route path="/wallet/topup" element={<TopUpPage />} />
          <Route path="/pay-bills" element={<PayBillsPage />} />
          <Route path="/stripe-connect" element={<StripeConnectInstantPage />} />
        </Route>

        <Route element={<RoleShellRoute allowedRoles={["admin", "finance"]} />}>
          <Route path="/finance" element={<FinanceDashboard />} />
        </Route>
        <Route element={<RoleShellRoute allowedRoles={["admin"]} />}>
          <Route path="/admin/legacy" element={<AdminDashboard />} />
          <Route path="/settings" element={<SettingsDashboard />} />
        </Route>
        <Route element={<RoleShellRoute allowedRoles={["admin", "compliance", "finance"]} />}>
          <Route path="/operations" element={<OperationsDashboard />} />
        </Route>

        <Route element={<ProtectedShellRoute />}>
          <Route path="/profile" element={<ProfileSettingsPage />} />
          <Route path="/kyc" element={<KYCPage />} />
          <Route path="/security" element={<SecurityPage />} />
        </Route>

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
        <Route path="/admin/payments/adyen" element={<AdminAuthProvider><AdminGuard><AdminAdyenLinksPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/payments/adyen/transactions" element={<AdminAuthProvider><AdminGuard><AdminAdyenTransactionsPage /></AdminGuard></AdminAuthProvider>} />

        <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
        <Route path="/auth/confirm" element={<AuthConfirm />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/portal" element={<CustomerPortalPage />} />
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
        <Route path="/settings/profile" element={<Navigate to="/profile" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
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
