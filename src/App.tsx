import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import { useEffect, Suspense } from "react";
import { lazyImport } from "@/lib/lazyImport";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AppBootstrap, useAppSession } from "@/providers/AppBootstrap";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import SplashScreen from "@/components/SplashScreen";
import GatedPage from "@/components/common/GatedPage";

// Core nav pages — eager so tab switches never wait on chunks
import Index from "./pages/Index";
import WalletsPage from "./pages/WalletsPage";
import SendPage from "./pages/SendPage";
import ExchangePage from "./pages/ExchangePage";
import CardsPage from "./pages/CardsPage";
import ContactsPage from "./pages/ContactsPage";
import TopUpPage from "./pages/TopUpPage";
import PaymentLinksPage from "./pages/PaymentLinksPage";

// Layout shells (small, used by many routes — keep eager)
import KycAppLayout from "@/components/layout/KycAppLayout";
import ProtectedShell from "@/components/layout/ProtectedShell";
import ClientShell from "@/components/layout/ClientShell";
import AdminGuard from "@/components/admin-portal/AdminGuard";
import AdminLayout from "@/components/admin-portal/AdminLayout";

// Lazy-loaded pages (admin, onboarding, legal, rarely-used)
const PrivacyPolicyPage = lazyImport(() => import("./pages/PrivacyPolicyPage"));
const TermsPage = lazyImport(() => import("./pages/TermsPage"));
const CompliancePage = lazyImport(() => import("./pages/CompliancePage"));
const Features = lazyImport(() => import("./pages/Features"));
const HowItWorks = lazyImport(() => import("./pages/HowItWorks"));
const About = lazyImport(() => import("./pages/About"));
const Contact = lazyImport(() => import("./pages/Contact"));
const AuthConfirm = lazyImport(() => import("./pages/AuthConfirm"));
const ResetPasswordPage = lazyImport(() => import("./pages/ResetPasswordPage"));
const FinanceDashboard = lazyImport(() => import("./pages/FinanceDashboard"));
const AdminDashboard = lazyImport(() => import("./pages/AdminDashboard"));
const OperationsDashboard = lazyImport(() => import("./pages/OperationsDashboard"));
const SettingsDashboard = lazyImport(() => import("./pages/SettingsDashboard"));
const SendCpnPage = lazyImport(() => import("./pages/SendCpnPage"));
const EfinCardDetailPage = lazyImport(() => import("./pages/EfinCardDetailPage"));
const CustomerPortalPage = lazyImport(() => import("./pages/CustomerPortalPage"));
const ProfileSettingsPage = lazyImport(() => import("./pages/ProfileSettingsPage"));
const KYCPage = lazyImport(() => import("./pages/KYCPage"));
const SecurityPage = lazyImport(() => import("./pages/SecurityPage"));
const DepositComplete = lazyImport(() => import("./pages/DepositComplete"));
const PaymentCallback = lazyImport(() => import("./pages/PaymentCallback"));
const TransferTrackingPage = lazyImport(() => import("./pages/TransferTrackingPage"));
const TransfersListPage = lazyImport(() => import("./pages/TransfersListPage"));
const WalletStatementPage = lazyImport(() => import("./pages/WalletStatementPage"));
const TransactionDetailPage = lazyImport(() => import("./pages/TransactionDetailPage"));
const CanadaTransferPage = lazyImport(() => import("./pages/CanadaTransferPage"));
const ReceivePage = lazyImport(() => import("./pages/ReceivePage"));
const PayBillsPage = lazyImport(() => import("./pages/PayBillsPage"));
const CanadaBillPayPage = lazyImport(() => import("./pages/CanadaBillPayPage"));
const Welcome = lazyImport(() => import("./pages/onboarding/Welcome"));
const OnboardingIdentity = lazyImport(() => import("./pages/onboarding/Identity"));
const OnboardingEnhanced = lazyImport(() => import("./pages/onboarding/Enhanced"));
const OnboardingRejected = lazyImport(() => import("./pages/onboarding/Rejected"));
const ShortLinkResolver = lazyImport(() => import("./pages/ShortLinkResolver"));
const ClaimPaymentLinkPage = lazyImport(() => import("./pages/ClaimPaymentLinkPage"));
const AdminLogin = lazyImport(() => import("./pages/admin/AdminLogin"));
const AdminDashboardPage = lazyImport(() => import("./pages/admin/AdminDashboardPage"));
const KycQueuePage = lazyImport(() => import("./pages/admin/KycQueuePage"));
const KycReviewPage = lazyImport(() => import("./pages/admin/KycReviewPage"));
const AdminAdyenLinksPage = lazyImport(() => import("./pages/admin/AdminAdyenLinksPage"));
const AdminAdyenTransactionsPage = lazyImport(() => import("./pages/admin/AdminAdyenTransactionsPage"));
const RiskTiersPage = lazyImport(() => import("./pages/admin/RiskTiersPage"));
const AuditLogPage = lazyImport(() => import("./pages/admin/AuditLogPage"));
const ApiManagementPage = lazyImport(() => import("./pages/admin/ApiManagementPage"));
const KycConfigPage = lazyImport(() => import("./pages/admin/KycConfigPage"));
const UsersPage = lazyImport(() => import("./pages/admin/UsersPage"));
const UserDetailPage = lazyImport(() => import("./pages/admin/UserDetailPage"));
const SystemDiagnosticsPage = lazyImport(() => import("./pages/admin/SystemDiagnosticsPage"));
const DataExportPage = lazyImport(() => import("./pages/admin/DataExportPage"));
const StaffPage = lazyImport(() => import("./pages/admin/StaffPage"));
const StaffDetailPage = lazyImport(() => import("./pages/admin/StaffDetailPage"));
const StaffOnboardingPage = lazyImport(() => import("./pages/admin/StaffOnboardingPage"));
const BoardDashboardPage = lazyImport(() => import("./pages/admin/BoardDashboardPage"));
const SecurityMonitoringPage = lazyImport(() => import("./pages/admin/SecurityMonitoringPage"));
const OperationalRiskPage = lazyImport(() => import("./pages/admin/OperationalRiskPage"));
const ComplianceRegisterPage = lazyImport(() => import("./pages/admin/ComplianceRegisterPage"));
const EddWorkflowPage = lazyImport(() => import("./pages/admin/EddWorkflowPage"));
const AuditorPortalPage = lazyImport(() => import("./pages/admin/AuditorPortalPage"));
const AmlPolicyPage = lazyImport(() => import("./pages/admin/AmlPolicyPage"));
const CddWorkflowPage = lazyImport(() => import("./pages/admin/CddWorkflowPage"));
const TransactionMonitoringPage = lazyImport(() => import("./pages/admin/TransactionMonitoringPage"));
const SanctionsScreeningPage = lazyImport(() => import("./pages/admin/SanctionsScreeningPage"));
const BeneficialOwnershipPage = lazyImport(() => import("./pages/admin/BeneficialOwnershipPage"));
const PepScreeningPage = lazyImport(() => import("./pages/admin/PepScreeningPage"));
const StrFilingPage = lazyImport(() => import("./pages/admin/StrFilingPage"));
const IncidentManagementPage = lazyImport(() => import("./pages/admin/IncidentManagementPage"));
const StaffTrainingPage = lazyImport(() => import("./pages/admin/StaffTrainingPage"));
const CorrespondentBankingPage = lazyImport(() => import("./pages/admin/CorrespondentBankingPage"));
const GeographicRiskPage = lazyImport(() => import("./pages/admin/GeographicRiskPage"));
const TravelRulePage = lazyImport(() => import("./pages/admin/TravelRulePage"));
const LctrPage = lazyImport(() => import("./pages/admin/LctrPage"));
const EftrPage = lazyImport(() => import("./pages/admin/EftrPage"));
const TradeAmlPage = lazyImport(() => import("./pages/admin/TradeAmlPage"));
const WireTransfersPage = lazyImport(() => import("./pages/admin/WireTransfersPage"));
const RegulatoryChangesPage = lazyImport(() => import("./pages/admin/RegulatoryChangesPage"));
const SettlementReconciliationPage = lazyImport(() => import("./pages/admin/SettlementReconciliationPage"));
const PeriodEndControlsPage = lazyImport(() => import("./pages/admin/PeriodEndControlsPage"));
const EvidenceRepositoryPage = lazyImport(() => import("./pages/admin/EvidenceRepositoryPage"));
const InteracCallback = lazyImport(() => import("./pages/InteracCallback"));
const InteracHubCallback = lazyImport(() => import("./pages/InteracHubCallback"));
const MorePage = lazyImport(() => import("./pages/MorePage"));
const StripeConnectInstantPage = lazyImport(() => import("./pages/StripeConnectInstantPage"));
const AfricanCardSendPage = lazyImport(() => import("./pages/AfricanCardSendPage"));
const CommunicationHubPage = lazyImport(() => import("./pages/admin/CommunicationHubPage"));
const SupportInboxPage = lazyImport(() => import("./pages/admin/SupportInboxPage"));
const SupportPage = lazyImport(() => import("./pages/SupportPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      placeholderData: (previousData: unknown) => previousData,
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
  if (loading && !user) return <FullPageSpinner />;
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
  const { isBootstrapped } = useAppSession();
  const { isAdmin, isFinance, isCompliance, isLoading: rolesLoading } = useUserRoles();
  if (loading && !user) return <FullPageSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  if (rolesLoading && !isBootstrapped) return <FullPageSpinner />;
  const roleMap = { admin: isAdmin, finance: isFinance, compliance: isCompliance };
  const hasAccess = allowedRoles.some((role) => roleMap[role]);
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
        <Route path="/claim/:code" element={<GatedPage feature="paymentLinks"><ClaimPaymentLinkPage /></GatedPage>} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/features" element={<Features />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />

        <Route element={<KycShellRoute />}>
          <Route path="/dashboard" element={<Index />} />
          <Route path="/wallets" element={<WalletsPage />} />
          <Route path="/wallets/:walletId/statement" element={<WalletStatementPage />} />
          <Route path="/send" element={<SendPage />} />
          <Route path="/send/cpn" element={<GatedPage feature="crypto"><SendCpnPage /></GatedPage>} />
          <Route path="/send/african-card" element={<GatedPage feature="stripe"><AfricanCardSendPage /></GatedPage>} />
          <Route path="/exchange" element={<ExchangePage />} />
          <Route path="/cards" element={<GatedPage feature="cards"><CardsPage /></GatedPage>} />
          <Route path="/cards/efin/:id" element={<GatedPage feature="cards"><EfinCardDetailPage /></GatedPage>} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/transfers" element={<TransfersListPage />} />
          <Route path="/transfers/:id" element={<TransferTrackingPage />} />
          <Route path="/transactions/:journalId" element={<TransactionDetailPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/payees" element={<ContactsPage />} />
          <Route path="/payment-links" element={<GatedPage feature="paymentLinks"><PaymentLinksPage /></GatedPage>} />
          <Route path="/transfers/canada" element={<GatedPage feature="canadaDomestic"><CanadaTransferPage /></GatedPage>} />
          <Route path="/wallet/receive" element={<ReceivePage />} />
          <Route path="/wallet/topup" element={<TopUpPage />} />
          <Route path="/pay-bills" element={<GatedPage feature="billPay"><PayBillsPage /></GatedPage>} />
          <Route path="/pay-bills/canada" element={<GatedPage feature="billPay"><CanadaBillPayPage /></GatedPage>} />
          <Route path="/stripe-connect" element={<GatedPage feature="stripe"><StripeConnectInstantPage /></GatedPage>} />
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

        {/* Admin-sidebar versions of Finance / Operations / Settings */}
        <Route path="/admin/finance" element={<AdminAuthProvider><AdminGuard><AdminLayout><FinanceDashboard /></AdminLayout></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/operations" element={<AdminAuthProvider><AdminGuard><AdminLayout><OperationsDashboard /></AdminLayout></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/communication" element={<AdminAuthProvider><AdminGuard><AdminLayout><CommunicationHubPage /></AdminLayout></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/support" element={<AdminAuthProvider><AdminGuard><AdminLayout><SupportInboxPage /></AdminLayout></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/settings" element={<AdminAuthProvider><AdminGuard><AdminLayout><SettingsDashboard /></AdminLayout></AdminGuard></AdminAuthProvider>} />

        <Route element={<ProtectedShellRoute />}>
          <Route path="/profile" element={<ProfileSettingsPage />} />
          <Route path="/kyc" element={<KYCPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/support" element={<SupportPage />} />
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
        <Route path="/admin/api" element={<AdminAuthProvider><AdminGuard><ApiManagementPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/kyc-config" element={<AdminAuthProvider><AdminGuard><KycConfigPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/diagnostics" element={<AdminAuthProvider><AdminGuard><SystemDiagnosticsPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/data-export" element={<AdminAuthProvider><AdminGuard><DataExportPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/staff" element={<AdminAuthProvider><AdminGuard><StaffPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/staff/:id" element={<AdminAuthProvider><AdminGuard><StaffDetailPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/onboarding" element={<AdminAuthProvider><AdminGuard><StaffOnboardingPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/board-dashboard" element={<AdminAuthProvider><AdminGuard><BoardDashboardPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/security" element={<AdminAuthProvider><AdminGuard><SecurityMonitoringPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/operational-risks" element={<AdminAuthProvider><AdminGuard><OperationalRiskPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/compliance-register" element={<AdminAuthProvider><AdminGuard><ComplianceRegisterPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/edd" element={<AdminAuthProvider><AdminGuard><EddWorkflowPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/auditor-portal" element={<AdminAuthProvider><AdminGuard><AuditorPortalPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/aml-policy" element={<AdminAuthProvider><AdminGuard><AmlPolicyPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/cdd" element={<AdminAuthProvider><AdminGuard><CddWorkflowPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/transaction-monitoring" element={<AdminAuthProvider><AdminGuard><TransactionMonitoringPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/sanctions" element={<AdminAuthProvider><AdminGuard><SanctionsScreeningPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/beneficial-ownership" element={<AdminAuthProvider><AdminGuard><BeneficialOwnershipPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/pep-screening" element={<AdminAuthProvider><AdminGuard><PepScreeningPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/str-filing" element={<AdminAuthProvider><AdminGuard><StrFilingPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/incidents" element={<AdminAuthProvider><AdminGuard><IncidentManagementPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/training" element={<AdminAuthProvider><AdminGuard><StaffTrainingPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/correspondent-banking" element={<AdminAuthProvider><AdminGuard><CorrespondentBankingPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/geographic-risk" element={<AdminAuthProvider><AdminGuard><GeographicRiskPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/travel-rule" element={<AdminAuthProvider><AdminGuard><TravelRulePage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/lctr" element={<AdminAuthProvider><AdminGuard><LctrPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/eftr" element={<AdminAuthProvider><AdminGuard><EftrPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/trade-aml" element={<AdminAuthProvider><AdminGuard><TradeAmlPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/wire-transfers" element={<AdminAuthProvider><AdminGuard><WireTransfersPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/regulatory-changes" element={<AdminAuthProvider><AdminGuard><RegulatoryChangesPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/settlement-reconciliation" element={<AdminAuthProvider><AdminGuard><SettlementReconciliationPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/period-end-controls" element={<AdminAuthProvider><AdminGuard><PeriodEndControlsPage /></AdminGuard></AdminAuthProvider>} />
        <Route path="/admin/evidence-repository" element={<AdminAuthProvider><AdminGuard><EvidenceRepositoryPage /></AdminGuard></AdminAuthProvider>} />
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
        <AppBootstrap>
          <TooltipProvider>
            <SplashScreen />
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <ScrollToTop />
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </AppBootstrap>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
