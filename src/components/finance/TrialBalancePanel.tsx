import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type: string;
  debit_total: number;
  credit_total: number;
}

export const TrialBalancePanel = () => {
  const { data: trialBalance = [], isLoading } = useQuery({
    queryKey: ['trial-balance'],
    queryFn: async () => {
      // Get all accounts with their ledger entry totals
      const { data: accounts, error: accountsError } = await supabase
        .from('ledger_accounts')
        .select('id, code, name, account_type')
        .eq('is_active', true)
        .order('code');

      if (accountsError) throw accountsError;

      const { data: entries, error: entriesError } = await supabase
        .from('ledger_entries')
        .select('account_id, debit_amount, credit_amount');

      if (entriesError) throw entriesError;

      // Aggregate by account
      const accountTotals = new Map<string, { debit: number; credit: number }>();
      
      (entries || []).forEach(entry => {
        const current = accountTotals.get(entry.account_id) || { debit: 0, credit: 0 };
        accountTotals.set(entry.account_id, {
          debit: current.debit + Number(entry.debit_amount || 0),
          credit: current.credit + Number(entry.credit_amount || 0),
        });
      });

      // Build trial balance rows
      const rows: TrialBalanceRow[] = (accounts || [])
        .map(account => {
          const totals = accountTotals.get(account.id) || { debit: 0, credit: 0 };
          return {
            account_code: account.code,
            account_name: account.name,
            account_type: account.account_type,
            debit_total: totals.debit,
            credit_total: totals.credit,
          };
        })
        .filter(row => row.debit_total > 0 || row.credit_total > 0);

      return rows;
    },
  });

  const totals = trialBalance.reduce(
    (acc, row) => ({
      debit: acc.debit + row.debit_total,
      credit: acc.credit + row.credit_total,
    }),
    { debit: 0, credit: 0 }
  );

  const isBalanced = Math.abs(totals.debit - totals.credit) < 0.01;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trial Balance</CardTitle>
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
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Trial Balance</CardTitle>
          <p className="text-sm text-muted-foreground">
            As of {format(new Date(), 'MMMM d, yyyy')}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          isBalanced ? 'bg-indigo-500/10 text-indigo-500' : 'bg-red-500/10 text-red-500'
        }`}>
          {isBalanced ? 'Balanced' : 'Unbalanced'}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trialBalance.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No ledger entries found
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {trialBalance.map((row) => (
                    <TableRow key={row.account_code}>
                      <TableCell className="font-mono">{row.account_code}</TableCell>
                      <TableCell>{row.account_name}</TableCell>
                      <TableCell className="capitalize">{row.account_type}</TableCell>
                      <TableCell className="text-right font-mono">
                        {row.debit_total > 0 ? row.debit_total.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.credit_total > 0 ? row.credit_total.toFixed(2) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right font-mono">
                      {totals.debit.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {totals.credit.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
