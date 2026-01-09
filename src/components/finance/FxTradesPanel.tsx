import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-500',
  pending: 'bg-yellow-500/10 text-yellow-500',
  failed: 'bg-red-500/10 text-red-500',
  cancelled: 'bg-muted text-muted-foreground',
};

export const FxTradesPanel = () => {
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ['fx-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fx_transactions')
        .select(`
          id,
          from_currency,
          to_currency,
          from_amount,
          to_amount,
          market_rate,
          effective_rate,
          fee_amount,
          status,
          created_at,
          executed_at
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FX Transactions</CardTitle>
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
    <Card>
      <CardHeader>
        <CardTitle>FX Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Pair</TableHead>
                <TableHead className="text-right">From Amount</TableHead>
                <TableHead className="text-right">To Amount</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No FX transactions found
                  </TableCell>
                </TableRow>
              ) : (
                trades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(trade.created_at), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {trade.from_currency}/{trade.to_currency}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(trade.from_amount).toFixed(2)} {trade.from_currency}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(trade.to_amount).toFixed(2)} {trade.to_currency}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(trade.effective_rate).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(trade.fee_amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[trade.status] || statusColors.pending}>
                        {trade.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
