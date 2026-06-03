import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

const severityConfig = {
  high: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
  medium: { icon: AlertCircle, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  low: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10' },
};

const statusColors: Record<string, string> = {
  open: 'bg-red-500/10 text-red-500',
  investigating: 'bg-yellow-500/10 text-yellow-500',
  resolved: 'bg-indigo-500/10 text-indigo-500',
  dismissed: 'bg-muted text-muted-foreground',
};

export const ComplianceAlertsPanel = () => {
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['compliance-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_alerts')
        .select(`
          id,
          user_id,
          severity,
          status,
          alert_data,
          notes,
          created_at,
          resolved_at
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['compliance-alert-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_alerts')
        .select('status, severity');

      if (error) throw error;

      const statusCounts = { open: 0, investigating: 0, resolved: 0, dismissed: 0 };
      const severityCounts = { high: 0, medium: 0, low: 0 };

      (data || []).forEach(a => {
        if (a.status in statusCounts) {
          statusCounts[a.status as keyof typeof statusCounts]++;
        }
        if (a.severity in severityCounts) {
          severityCounts[a.severity as keyof typeof severityCounts]++;
        }
      });

      return { status: statusCounts, severity: severityCounts };
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compliance Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.status.open || 0}</p>
                <p className="text-sm text-muted-foreground">Open</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <AlertCircle className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.status.investigating || 0}</p>
                <p className="text-sm text-muted-foreground">Investigating</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div>
              <p className="text-2xl font-bold text-red-500">{stats?.severity.high || 0}</p>
              <p className="text-sm text-muted-foreground">High Severity</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div>
              <p className="text-2xl font-bold text-indigo-500">{stats?.status.resolved || 0}</p>
              <p className="text-sm text-muted-foreground">Resolved</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No compliance alerts found
                    </TableCell>
                  </TableRow>
                ) : (
                  alerts.map((alert) => {
                    const config = severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.low;
                    const Icon = config.icon;
                    return (
                      <TableRow key={alert.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(alert.created_at), 'MMM d, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${config.color}`} />
                            <span className={config.color}>{alert.severity}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[alert.status] || statusColors.open}>
                            {alert.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <pre className="text-xs text-muted-foreground truncate">
                            {JSON.stringify(alert.alert_data, null, 0).substring(0, 50)}...
                          </pre>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {alert.notes || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
