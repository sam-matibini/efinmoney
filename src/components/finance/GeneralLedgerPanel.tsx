import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface Props {
  initialAccountId?: string;
}

export const GeneralLedgerPanel = ({ initialAccountId }: Props = {}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId || "");

  useEffect(() => {
    if (initialAccountId) setSelectedAccountId(initialAccountId);
  }, [initialAccountId]);

  const { data: accounts = [] } = useQuery({
    queryKey: ['ledger-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_accounts')
        .select('id, code, name, account_type')
        .eq('is_active', true)
        .order('code');

      if (error) throw error;
      return data || [];
    },
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['gl-entries', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];

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
        .eq('account_id', selectedAccountId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedAccountId,
  });

  // Calculate running balance
  const entriesWithBalance = entries.reduce((acc, entry, index) => {
    const prevBalance = index > 0 ? acc[index - 1].balance : 0;
    const balance = prevBalance + Number(entry.debit_amount || 0) - Number(entry.credit_amount || 0);
    return [...acc, { ...entry, balance }];
  }, [] as Array<typeof entries[0] & { balance: number }>);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>General Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-full md:w-[400px]">
              <SelectValue placeholder="Select an account to view" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedAccountId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {selectedAccount?.code} - {selectedAccount?.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground capitalize">
                  {selectedAccount?.account_type} Account
                </p>
              </div>
              {entriesWithBalance.length > 0 && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className="text-xl font-bold font-mono">
                    {entriesWithBalance[entriesWithBalance.length - 1]?.balance.toFixed(2) || '0.00'}
                  </p>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entriesWithBalance.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No entries for this account
                        </TableCell>
                      </TableRow>
                    ) : (
                      entriesWithBalance.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(entry.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{entry.reference_type || 'manual'}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {entry.description || '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(entry.debit_amount) > 0 ? Number(entry.debit_amount).toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(entry.credit_amount) > 0 ? Number(entry.credit_amount).toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {entry.balance.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
