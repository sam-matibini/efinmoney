import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";

const statusConfig = {
  matched: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
  unmatched: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  exception: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  pending: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted' },
};

export const ReconciliationPanel = () => {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['reconciliation-records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_records')
        .select(`
          id,
          status,
          matched_amount,
          match_confidence,
          match_reason,
          exception_reason,
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
    queryKey: ['reconciliation-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_records')
        .select('status');

      if (error) throw error;

      const counts = { matched: 0, unmatched: 0, exception: 0, pending: 0 };
      (data || []).forEach(r => {
        if (r.status in counts) {
          counts[r.status as keyof typeof counts]++;
        }
      });
      return counts;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bank Reconciliation</CardTitle>
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
        {Object.entries(statusConfig).map(([status, config]) => {
          const Icon = config.icon;
          const count = stats?.[status as keyof typeof stats] || 0;
          return (
            <Card key={status}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.bg}`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-sm text-muted-foreground capitalize">{status}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reconciliation Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No reconciliation records found
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => {
                    const config = statusConfig[record.status as keyof typeof statusConfig] || statusConfig.pending;
                    return (
                      <TableRow key={record.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(record.created_at), 'MMM d, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={config.color}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {record.matched_amount ? Number(record.matched_amount).toFixed(2) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.match_confidence ? `${(Number(record.match_confidence) * 100).toFixed(0)}%` : '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {record.match_reason || record.exception_reason || '-'}
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
