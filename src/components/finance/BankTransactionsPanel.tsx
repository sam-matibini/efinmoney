import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Sparkles, CheckCircle2, Send, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { BankTransactionImport } from "./BankTransactionImport";

export const BankTransactionsPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedTxns, setSelectedTxns] = useState<Set<string>>(new Set());

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, currency_code, ledger_account_id')
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
        .select(`
          *,
          rule:transaction_rules(id, name),
          debit_account:ledger_accounts!bank_transactions_debit_account_id_fkey(code, name),
          credit_account:ledger_accounts!bank_transactions_credit_account_id_fkey(code, name)
        `)
        .eq('bank_account_id', selectedAccountId)
        .order('transaction_date', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedAccountId,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['transaction-rules-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_rules')
        .select('*')
        .eq('is_active', true)
        .order('priority');
      if (error) throw error;
      return data || [];
    },
  });

  const applyRulesMutation = useMutation({
    mutationFn: async (txnIds: string[]) => {
      const txnsToUpdate = transactions.filter(t => txnIds.includes(t.id) && !t.is_categorized);
      let matched = 0;
      
      for (const txn of txnsToUpdate) {
        for (const rule of rules) {
          const fieldValue = rule.match_field === 'description' ? txn.description : txn.reference;
          if (!fieldValue) continue;
          
          let isMatch = false;
          const searchValue = rule.match_value.toLowerCase();
          const targetValue = fieldValue.toLowerCase();
          
          switch (rule.match_type) {
            case 'contains':
              isMatch = targetValue.includes(searchValue);
              break;
            case 'starts_with':
              isMatch = targetValue.startsWith(searchValue);
              break;
            case 'ends_with':
              isMatch = targetValue.endsWith(searchValue);
              break;
            case 'exact':
              isMatch = targetValue === searchValue;
              break;
            case 'regex':
              try {
                isMatch = new RegExp(rule.match_value, 'i').test(fieldValue);
              } catch { isMatch = false; }
              break;
          }
          
          if (isMatch) {
            const { error } = await supabase
              .from('bank_transactions')
              .update({
                category: rule.category,
                rule_id: rule.id,
                debit_account_id: rule.debit_account_id,
                credit_account_id: rule.credit_account_id,
                is_categorized: true,
                categorized_at: new Date().toISOString(),
              })
              .eq('id', txn.id);
            
            if (!error) matched++;
            break; // First match wins
          }
        }
      }
      
      return matched;
    },
    onSuccess: (matched) => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      toast.success(`${matched} transaction(s) categorized`);
      setSelectedTxns(new Set());
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to apply rules');
    },
  });

  const postToGLMutation = useMutation({
    mutationFn: async (txnIds: string[]) => {
      const txnsToPost = transactions.filter(
        t => txnIds.includes(t.id) && t.is_categorized && !t.is_posted && t.debit_account_id && t.credit_account_id
      );
      
      let posted = 0;
      const selectedAccount = bankAccounts.find(a => a.id === selectedAccountId);
      
      for (const txn of txnsToPost) {
        const journalId = crypto.randomUUID();
        const amount = Number(txn.debit_amount) > 0 ? Number(txn.debit_amount) : Number(txn.credit_amount);
        
        // Create double-entry journal
        const entries = [
          {
            journal_id: journalId,
            account_id: txn.debit_account_id,
            debit_amount: amount,
            credit_amount: 0,
            currency_code: selectedAccount?.currency_code || 'USD',
            description: txn.description,
            reference_type: 'bank',
            created_by: user?.id,
          },
          {
            journal_id: journalId,
            account_id: txn.credit_account_id,
            debit_amount: 0,
            credit_amount: amount,
            currency_code: selectedAccount?.currency_code || 'USD',
            description: txn.description,
            reference_type: 'bank',
            created_by: user?.id,
          },
        ];
        
        const { error: entryError } = await supabase
          .from('ledger_entries')
          .insert(entries);
        
        if (!entryError) {
          await supabase
            .from('bank_transactions')
            .update({
              is_posted: true,
              journal_id: journalId,
              posted_at: new Date().toISOString(),
            })
            .eq('id', txn.id);
          posted++;
        }
      }
      
      return posted;
    },
    onSuccess: (posted) => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      toast.success(`${posted} transaction(s) posted to GL`);
      setSelectedTxns(new Set());
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to post to GL');
    },
  });

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedTxns);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedTxns(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedTxns.size === transactions.length) {
      setSelectedTxns(new Set());
    } else {
      setSelectedTxns(new Set(transactions.map(t => t.id)));
    }
  };

  const selectedAccount = bankAccounts.find(a => a.id === selectedAccountId);
  const uncategorizedCount = transactions.filter(t => !t.is_categorized).length;
  const unpostedCount = transactions.filter(t => t.is_categorized && !t.is_posted).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bank Transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
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
            {selectedAccountId && (
              <BankTransactionImport
                bankAccountId={selectedAccountId}
                onImportComplete={() => queryClient.invalidateQueries({ queryKey: ['bank-transactions', selectedAccountId] })}
              />
            )}
          </div>

          {selectedAccountId && transactions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {uncategorizedCount} uncategorized
              </Badge>
              <Badge variant="outline">
                {unpostedCount} ready to post
              </Badge>
              {selectedTxns.size > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyRulesMutation.mutate(Array.from(selectedTxns))}
                    disabled={applyRulesMutation.isPending}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Apply Rules ({selectedTxns.size})
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => postToGLMutation.mutate(Array.from(selectedTxns))}
                    disabled={postToGLMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Post to GL ({selectedTxns.size})
                  </Button>
                </>
              )}
            </div>
          )}
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
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={transactions.length > 0 && selectedTxns.size === transactions.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>GL Accounts</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No transactions found for this account
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((txn) => (
                        <TableRow key={txn.id} className={txn.is_posted ? 'bg-muted/30' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={selectedTxns.has(txn.id)}
                              onCheckedChange={() => toggleSelection(txn.id)}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(txn.transaction_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="max-w-[250px]">
                            <div className="flex items-center gap-2">
                              {Number(txn.credit_amount) > 0 ? (
                                <ArrowDownLeft className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                              ) : (
                                <ArrowUpRight className="w-4 h-4 text-red-500 flex-shrink-0" />
                              )}
                              <span className="truncate">{txn.description}</span>
                            </div>
                            {txn.reference && (
                              <p className="text-xs text-muted-foreground font-mono">{txn.reference}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            {txn.category ? (
                              <Badge variant="outline">{txn.category}</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-muted-foreground">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Uncategorized
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {txn.debit_account ? (
                              <>
                                <div>DR: {txn.debit_account.code}</div>
                                <div>CR: {txn.credit_account?.code || '-'}</div>
                              </>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-600">
                            {Number(txn.debit_amount) > 0 ? Number(txn.debit_amount).toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-indigo-600">
                            {Number(txn.credit_amount) > 0 ? Number(txn.credit_amount).toFixed(2) : '-'}
                          </TableCell>
                          <TableCell>
                            {txn.is_posted ? (
                              <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Posted
                              </Badge>
                            ) : txn.is_categorized ? (
                              <Badge variant="secondary">Ready</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
                            )}
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
