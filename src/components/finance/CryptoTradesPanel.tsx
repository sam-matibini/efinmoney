import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";

const statusColors: Record<string, string> = {
  executed: 'bg-green-500/10 text-green-500',
  completed: 'bg-green-500/10 text-green-500',
  pending: 'bg-yellow-500/10 text-yellow-500',
  failed: 'bg-red-500/10 text-red-500',
  cancelled: 'bg-muted text-muted-foreground',
};

export const CryptoTradesPanel = () => {
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ['crypto-trades'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crypto_trades')
        .select(`
          id,
          side,
          base_amount,
          quote_amount,
          price,
          fee_amount,
          fee_currency,
          status,
          created_at,
          executed_at,
          pair_id,
          crypto_pairs (
            base_currency,
            quote_currency
          )
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
          <CardTitle>Crypto Trades</CardTitle>
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
        <CardTitle>Crypto Trades</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Pair</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Base Amount</TableHead>
                <TableHead className="text-right">Quote Amount</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No crypto trades found
                  </TableCell>
                </TableRow>
              ) : (
                trades.map((trade) => {
                  const pair = trade.crypto_pairs as { base_currency: string; quote_currency: string } | null;
                  return (
                    <TableRow key={trade.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(trade.created_at), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {pair ? `${pair.base_currency}/${pair.quote_currency}` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {trade.side === 'buy' ? (
                            <ArrowDownLeft className="w-4 h-4 text-green-500" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-red-500" />
                          )}
                          <span className={trade.side === 'buy' ? 'text-green-500' : 'text-red-500'}>
                            {trade.side.toUpperCase()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(trade.base_amount).toFixed(6)} {pair?.base_currency || ''}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(trade.quote_amount).toFixed(2)} {pair?.quote_currency || ''}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(trade.price).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(trade.fee_amount).toFixed(4)} {trade.fee_currency || ''}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[trade.status] || statusColors.pending}>
                          {trade.status}
                        </Badge>
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
  );
};
