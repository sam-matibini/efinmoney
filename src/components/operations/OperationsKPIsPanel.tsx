import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  Activity,
  Target,
  Timer,
  AlertTriangle
} from "lucide-react";

export const OperationsKPIsPanel = () => {
  // Fetch transfers for transaction metrics
  const { data: transfers = [], isLoading: transfersLoading } = useQuery({
    queryKey: ['kpi-transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transfers')
        .select('status, created_at, completed_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch customer onboarding for KYC metrics
  const { data: onboarding = [], isLoading: onboardingLoading } = useQuery({
    queryKey: ['kpi-onboarding'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_onboarding')
        .select('status, created_at, completed_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch customers for onboarding rate
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['kpi-customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('kyc_status, onboarding_started_at, onboarding_completed_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch disputes for resolution metrics
  const { data: disputes = [], isLoading: disputesLoading } = useQuery({
    queryKey: ['kpi-disputes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('disputes')
        .select('status, created_at, resolved_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch compliance alerts
  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['kpi-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_alerts')
        .select('status, severity, created_at, resolved_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;
      return data || [];
    },
  });

  const isLoading = transfersLoading || onboardingLoading || customersLoading || disputesLoading || alertsLoading;

  // Calculate KPIs
  const totalTransfers = transfers.length;
  const completedTransfers = transfers.filter(t => t.status === 'completed').length;
  const failedTransfers = transfers.filter(t => t.status === 'failed').length;
  const transferSuccessRate = totalTransfers > 0 ? (completedTransfers / totalTransfers) * 100 : 0;
  const transferFailRate = totalTransfers > 0 ? (failedTransfers / totalTransfers) * 100 : 0;

  const onboardingCompleted = onboarding.filter(o => o.status === 'completed').length;
  const onboardingTotal = onboarding.length;
  const onboardingCompletionRate = onboardingTotal > 0 ? (onboardingCompleted / onboardingTotal) * 100 : 0;

  const kycApproved = customers.filter(c => c.kyc_status === 'approved').length;
  const kycTotal = customers.length;
  const kycApprovalRate = kycTotal > 0 ? (kycApproved / kycTotal) * 100 : 0;

  const resolvedDisputes = disputes.filter(d => ['resolved', 'approved', 'rejected'].includes(d.status)).length;
  const totalDisputes = disputes.length;
  const disputeResolutionRate = totalDisputes > 0 ? (resolvedDisputes / totalDisputes) * 100 : 0;

  const resolvedAlerts = alerts.filter(a => ['resolved', 'false_positive'].includes(a.status)).length;
  const totalAlerts = alerts.length;
  const alertResolutionRate = totalAlerts > 0 ? (resolvedAlerts / totalAlerts) * 100 : 0;

  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status === 'open').length;

  // Calculate average resolution times
  const completedTransfersWithTime = transfers.filter(t => t.completed_at && t.status === 'completed');
  const avgTransferTime = completedTransfersWithTime.length > 0
    ? completedTransfersWithTime.reduce((acc, t) => {
        const duration = new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime();
        return acc + duration;
      }, 0) / completedTransfersWithTime.length / (1000 * 60 * 60)
    : 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const kpis = [
    {
      title: 'Transfer Success Rate',
      value: `${transferSuccessRate.toFixed(1)}%`,
      icon: CheckCircle2,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
      progress: transferSuccessRate,
      subtitle: `${completedTransfers}/${totalTransfers} transfers`,
      trend: transferSuccessRate > 95 ? 'up' : 'down',
    },
    {
      title: 'Failed Transfer Rate',
      value: `${transferFailRate.toFixed(1)}%`,
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      progress: 100 - transferFailRate,
      subtitle: `${failedTransfers} failed`,
      trend: transferFailRate < 5 ? 'up' : 'down',
    },
    {
      title: 'Avg Transfer Time',
      value: `${avgTransferTime.toFixed(1)}h`,
      icon: Timer,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      progress: Math.min(100, (24 - avgTransferTime) / 24 * 100),
      subtitle: 'Average completion',
      trend: avgTransferTime < 4 ? 'up' : 'down',
    },
    {
      title: 'Onboarding Completion',
      value: `${onboardingCompletionRate.toFixed(1)}%`,
      icon: Users,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      progress: onboardingCompletionRate,
      subtitle: `${onboardingCompleted}/${onboardingTotal} steps`,
      trend: onboardingCompletionRate > 80 ? 'up' : 'down',
    },
    {
      title: 'KYC Approval Rate',
      value: `${kycApprovalRate.toFixed(1)}%`,
      icon: Target,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
      progress: kycApprovalRate,
      subtitle: `${kycApproved}/${kycTotal} customers`,
      trend: kycApprovalRate > 85 ? 'up' : 'down',
    },
    {
      title: 'Dispute Resolution',
      value: `${disputeResolutionRate.toFixed(1)}%`,
      icon: Activity,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      progress: disputeResolutionRate,
      subtitle: `${resolvedDisputes}/${totalDisputes} disputes`,
      trend: disputeResolutionRate > 90 ? 'up' : 'down',
    },
    {
      title: 'Alert Resolution',
      value: `${alertResolutionRate.toFixed(1)}%`,
      icon: AlertTriangle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      progress: alertResolutionRate,
      subtitle: `${resolvedAlerts}/${totalAlerts} alerts`,
      trend: alertResolutionRate > 90 ? 'up' : 'down',
    },
    {
      title: 'Critical Alerts',
      value: criticalAlerts.toString(),
      icon: AlertTriangle,
      color: criticalAlerts > 0 ? 'text-red-500' : 'text-indigo-500',
      bgColor: criticalAlerts > 0 ? 'bg-red-500/10' : 'bg-indigo-500/10',
      progress: criticalAlerts === 0 ? 100 : Math.max(0, 100 - criticalAlerts * 20),
      subtitle: 'Pending attention',
      trend: criticalAlerts === 0 ? 'up' : 'down',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Operations KPIs</h2>
          <p className="text-sm text-muted-foreground">Last 30 days performance metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          const TrendIcon = kpi.trend === 'up' ? TrendingUp : TrendingDown;
          
          return (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                    <Icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                  <TrendIcon className={`w-4 h-4 ${kpi.trend === 'up' ? 'text-indigo-500' : 'text-red-500'}`} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{kpi.title}</p>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <Progress value={kpi.progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">{kpi.subtitle}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Transaction Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Transfers</span>
                <span className="font-bold">{totalTransfers}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Completed</span>
                <span className="font-bold text-indigo-600">{completedTransfers}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Processing</span>
                <span className="font-bold text-amber-600">{transfers.filter(t => t.status === 'processing').length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Failed</span>
                <span className="font-bold text-red-600">{failedTransfers}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Customer Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">New Customers</span>
                <span className="font-bold">{kycTotal}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">KYC Approved</span>
                <span className="font-bold text-indigo-600">{kycApproved}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Pending KYC</span>
                <span className="font-bold text-amber-600">{customers.filter(c => c.kyc_status === 'pending').length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Onboarding Complete</span>
                <span className="font-bold">{customers.filter(c => c.onboarding_completed_at).length}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Compliance Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Open Alerts</span>
                <span className="font-bold text-amber-600">{alerts.filter(a => a.status === 'open').length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Critical Alerts</span>
                <span className="font-bold text-red-600">{criticalAlerts}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Open Disputes</span>
                <span className="font-bold text-amber-600">{disputes.filter(d => d.status === 'open').length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Resolved Disputes</span>
                <span className="font-bold text-indigo-600">{resolvedDisputes}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
