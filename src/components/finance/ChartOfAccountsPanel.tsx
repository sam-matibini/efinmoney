import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { currencySymbol } from "@/lib/currency";
import { cn } from "@/lib/utils";

const accountTypes = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

interface Props {
  onViewLedger?: (accountId: string) => void;
}

export const ChartOfAccountsPanel = ({ onViewLedger }: Props) => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    account_type: 'asset' as typeof accountTypes[number],
    currency_code: '',
    description: '',
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['chart-of-accounts'],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_accounts')
        .select('*')
        .order('code');
      if (error) throw error;
      return data || [];
    },
  });

  // Aggregate balances from ledger_entries
  const { data: balances = {} } = useQuery({
    queryKey: ['account-balances'],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const map: Record<string, { debit: number; credit: number }> = {};
      const pageSize = 1000;
      let from = 0;
      // Paginate to bypass 1000-row default
      while (true) {
        const { data, error } = await supabase
          .from('ledger_entries')
          .select('account_id, debit_amount, credit_amount')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const r of data) {
          const k = r.account_id as string;
          if (!map[k]) map[k] = { debit: 0, credit: 0 };
          map[k].debit += Number(r.debit_amount || 0);
          map[k].credit += Number(r.credit_amount || 0);
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return map;
    },
  });

  const { data: currencies = [] } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('currencies')
        .select('code, name')
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('ledger_accounts')
        .insert({
          code: data.code,
          name: data.name,
          account_type: data.account_type,
          currency_code: data.currency_code || null,
          description: data.description || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      toast.success('Account created successfully');
      resetForm();
    },
    onError: (error: any) => toast.error(error.message || 'Failed to create account'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const { error } = await supabase
        .from('ledger_accounts')
        .update({
          name: data.name,
          account_type: data.account_type,
          currency_code: data.currency_code || null,
          description: data.description || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      toast.success('Account updated successfully');
      resetForm();
    },
    onError: (error: any) => toast.error(error.message || 'Failed to update account'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('ledger_accounts')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      toast.success('Account status updated');
    },
  });

  const resetForm = () => {
    setFormData({ code: '', name: '', account_type: 'asset', currency_code: '', description: '' });
    setEditingAccount(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (account: any) => {
    setEditingAccount(account);
    setFormData({
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      currency_code: account.currency_code || '',
      description: account.description || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const computeBalance = (account: any): number => {
    const b = balances[account.id];
    if (!b) return 0;
    const debitNormal = account.account_type === 'asset' || account.account_type === 'expense';
    return debitNormal ? b.debit - b.credit : b.credit - b.debit;
  };

  const formatBalance = (amount: number, currency?: string | null) => {
    const sym = currencySymbol(currency);
    const abs = Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return amount < 0 ? `(${sym}${abs})` : `${sym}${abs}`;
  };

  const typeColors: Record<string, string> = {
    asset: 'bg-blue-500/10 text-blue-500',
    liability: 'bg-orange-500/10 text-orange-500',
    equity: 'bg-purple-500/10 text-purple-500',
    income: 'bg-indigo-500/10 text-indigo-500',
    expense: 'bg-red-500/10 text-red-500',
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Chart of Accounts</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Chart of Accounts</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />Add Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAccount ? 'Edit Account' : 'Add New Account'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Account Code</Label>
                  <Input id="code" value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="1000" disabled={!!editingAccount} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Account Type</Label>
                  <Select value={formData.account_type}
                    onValueChange={(value) => setFormData({ ...formData, account_type: value as typeof accountTypes[number] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accountTypes.map((type) => (
                        <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Account Name</Label>
                <Input id="name" value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Cash in Bank" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency (Optional)</Label>
                <Select value={formData.currency_code}
                  onValueChange={(value) => setFormData({ ...formData, currency_code: value })}>
                  <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No specific currency</SelectItem>
                    {currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} - {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description" />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingAccount ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No accounts found
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((account) => {
                  const balance = computeBalance(account);
                  return (
                    <TableRow key={account.id} className={!account.is_active ? 'opacity-50' : ''}>
                      <TableCell className="font-mono">{account.code}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => onViewLedger?.(account.id)}
                          className="text-left hover:text-primary hover:underline transition-colors"
                        >
                          {account.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={typeColors[account.account_type]}>
                          {account.account_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{account.currency_code || '-'}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono cursor-pointer hover:underline",
                          balance < 0 && "text-destructive"
                        )}
                        onClick={() => onViewLedger?.(account.id)}
                      >
                        {formatBalance(balance, account.currency_code)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.is_active ? 'default' : 'secondary'}>
                          {account.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="ghost" onClick={() => handleEdit(account)} disabled={account.is_system}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost"
                            onClick={() => toggleActiveMutation.mutate({ id: account.id, is_active: !account.is_active })}
                            disabled={account.is_system}>
                            {account.is_active ? (
                              <ToggleRight className="w-4 h-4 text-indigo-500" />
                            ) : (
                              <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
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
