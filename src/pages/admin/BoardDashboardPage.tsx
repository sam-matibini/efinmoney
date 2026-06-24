import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, AlertTriangle, FileWarning, Activity, WifiOff, SearchCheck, ShieldCheck } from "lucide-react";
import { useBoardDashboard } from "@/hooks/useBoardDashboard";
import { format } from "date-fns";

const MetricCard = ({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) => (
  <Card>
    <CardContent className="pt-4 pb-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={color}>{icon}</div>
      </div>
      <div className={`text-3xl font-bold mt-1 ${color}`}>{value}</div>
    </CardContent>
  </Card>
);

export default function BoardDashboardPage() {
  const { data: m, isLoading } = useBoardDashboard();

  return (
    <div className="container px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Board Compliance Dashboard</h1>
        <p className="text-muted-foreground">
          Governance & regulatory oversight metrics
          {m?.snapshot_at ? ` · As of ${format(new Date(m.snapshot_at), "MMM d, yyyy h:mm a")}` : ""}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (<Skeleton key={i} className="h-24" />))}
        </div>
      ) : m ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <MetricCard label="High-Risk Clients" value={m.high_risk_clients} icon={<ShieldAlert className="w-5 h-5" />} color={m.high_risk_clients > 0 ? "text-red-500" : "text-emerald-500"} />
            <MetricCard label="Open AML Alerts" value={m.open_alerts} icon={<AlertTriangle className="w-5 h-5" />} color={m.open_alerts > 0 ? "text-amber-500" : "text-emerald-500"} />
            <MetricCard label="Pending STRs" value={m.pending_strs} icon={<FileWarning className="w-5 h-5" />} color={m.pending_strs > 0 ? "text-red-500" : "text-emerald-500"} />
            <MetricCard label="Escalated Investigations" value={m.outstanding_investigations} icon={<Activity className="w-5 h-5" />} color={m.outstanding_investigations > 0 ? "text-purple-500" : "text-emerald-500"} />
            <MetricCard label="Compliance Breaches" value={m.compliance_breaches} icon={<ShieldAlert className="w-5 h-5" />} color={m.compliance_breaches > 0 ? "text-red-500" : "text-emerald-500"} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <MetricCard label="Safeguarding Breaches" value={m.safeguarding_breaches} icon={<ShieldAlert className="w-5 h-5" />} color={m.safeguarding_breaches > 0 ? "text-red-500" : "text-emerald-500"} />
            <MetricCard label="Rec. Exceptions" value={m.reconciliation_exceptions} icon={<SearchCheck className="w-5 h-5" />} color={m.reconciliation_exceptions > 0 ? "text-amber-500" : "text-emerald-500"} />
            <MetricCard label="System Outages" value={m.system_outages} icon={<WifiOff className="w-5 h-5" />} color={m.system_outages > 0 ? "text-red-500" : "text-emerald-500"} />
            <MetricCard label="Active Incidents" value={m.total_incidents} icon={<AlertTriangle className="w-5 h-5" />} color={m.total_incidents > 0 ? "text-amber-500" : "text-emerald-500"} />
            <MetricCard label="RPAA Significant" value={m.rpaa_significant_incidents} icon={<ShieldCheck className="w-5 h-5" />} color={m.rpaa_significant_incidents > 0 ? "text-red-500" : "text-emerald-500"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Board Oversight Summary</CardTitle>
              <CardDescription>All metrics are live from the production database</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-muted-foreground">Risk Indicators</span><span className="font-medium">{m.high_risk_clients} high-risk clients</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">AML Program</span><span className="font-medium">{m.open_alerts} open alerts, {m.pending_strs} pending STRs</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Investigations</span><span className="font-medium">{m.outstanding_investigations} escalated</span></div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-muted-foreground">Operational Resilience</span><span className="font-medium">{m.system_outages} outages</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Safeguarding</span><span className="font-medium">{m.safeguarding_breaches === 0 ? "All clear" : `${m.safeguarding_breaches} breaches`}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">RPAA Incidents</span><span className="font-medium">{m.rpaa_significant_incidents}</span></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-muted-foreground">No board data available.</p>
      )}
    </div>
  );
}