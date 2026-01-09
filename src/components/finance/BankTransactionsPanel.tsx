import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

export const BankTransactionsPanel = () => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, currency_code')
        .eq('is_active', true)
        .order('account_name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['bank-transactions', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];

      const { data, error } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('bank_account_id', selectedAccountId)
        .order('transaction_date', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedAccountId,
  });

  const selectedAccount = bankAccounts.find(a => a.id === selectedAccountId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bank Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-full md:w-[400px]">
              <SelectValue placeholder="Select a bank account" />
            </SelectTrigger>
            <SelectContent>
              {bankAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.account_name} ({account.bank_name})
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
                <CardTitle>{selectedAccount?.account_name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedAccount?.bank_name} • {selectedAccount?.currency_code}
                </p>
              </div>
              {transactions.length > 0 && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Running Balance</p>
                  <p className="text-xl font-bold font-mono">
                    {transactions[0]?.balance?.toFixed(2) || '0.00'}
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
                      <TableHead>Description</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No transactions found for this account
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((txn) => (
                        <TableRow key={txn.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(txn.transaction_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="max-w-[250px]">
                            <div className="flex items-center gap-2">
                              {Number(txn.credit_amount) > 0 ? (
                                <ArrowDownLeft className="w-4 h-4 text-green-500 flex-shrink-0" />
                              ) : (
                                <ArrowUpRight className="w-4 h-4 text-red-500 flex-shrink-0" />
                              )}
                              <span className="truncate">{txn.description}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {txn.reference || '-'}
                          </TableCell>
                          <TableCell>
                            {txn.category ? (
                              <Badge variant="outline">{txn.category}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-600">
                            {Number(txn.debit_amount) > 0 ? Number(txn.debit_amount).toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-600">
                            {Number(txn.credit_amount) > 0 ? Number(txn.credit_amount).toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {txn.balance ? Number(txn.balance).toFixed(2) : '-'}
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
