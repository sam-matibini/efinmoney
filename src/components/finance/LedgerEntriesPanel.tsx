import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export const LedgerEntriesPanel = () => {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['ledger-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select(`
          id,
          journal_id,
          currency_code,
          debit_amount,
          credit_amount,
          description,
          reference_type,
          created_at
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
          <CardTitle>Recent Ledger Entries</CardTitle>
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
        <CardTitle>Recent Ledger Entries</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No ledger entries found
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(entry.created_at), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.reference_type || 'manual'}</Badge>
                    </TableCell>
                    <TableCell>{entry.currency_code}</TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(entry.debit_amount) > 0 ? Number(entry.debit_amount).toFixed(2) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(entry.credit_amount) > 0 ? Number(entry.credit_amount).toFixed(2) : '-'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {entry.description || '-'}
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
