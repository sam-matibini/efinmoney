import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface JournalLine {
  account_id: string;
  debit_amount: string;
  credit_amount: string;
}

export const JournalEntriesPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { account_id: '', debit_amount: '', credit_amount: '' },
    { account_id: '', debit_amount: '', credit_amount: '' },
  ]);

  const { data: accounts = [] } = useQuery({
    queryKey: ['ledger-accounts-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_accounts')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: recentJournals = [], isLoading } = useQuery({
    queryKey: ['recent-journals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select(`
          journal_id,
          description,
          created_at,
          debit_amount,
          credit_amount,
          account_id
        `)
        .eq('reference_type', 'journal')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Group by journal_id
      const journalMap = new Map<string, { entries: typeof data; created_at: string; description: string }>();
      (data || []).forEach(entry => {
        const existing = journalMap.get(entry.journal_id);
        if (existing) {
          existing.entries.push(entry);
        } else {
          journalMap.set(entry.journal_id, {
            entries: [entry],
            created_at: entry.created_at,
            description: entry.description || '',
          });
        }
      });

      return Array.from(journalMap.entries()).map(([id, data]) => ({
        id,
        ...data,
        total_debit: data.entries.reduce((sum, e) => sum + Number(e.debit_amount || 0), 0),
        total_credit: data.entries.reduce((sum, e) => sum + Number(e.credit_amount || 0), 0),
      }));
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const journalId = crypto.randomUUID();
      
      const validLines = lines.filter(l => l.account_id && (l.debit_amount || l.credit_amount));
      
      if (validLines.length < 2) {
        throw new Error('At least 2 lines required');
      }

      const totalDebit = validLines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0);
      const totalCredit = validLines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0);

      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new Error(`Debits (${totalDebit.toFixed(2)}) must equal Credits (${totalCredit.toFixed(2)})`);
      }

      const entries = validLines.map(line => ({
        journal_id: journalId,
        account_id: line.account_id,
        debit_amount: parseFloat(line.debit_amount) || 0,
        credit_amount: parseFloat(line.credit_amount) || 0,
        currency_code: 'USD',
        description,
        reference_type: 'journal',
        created_by: user?.id,
      }));

      const { error } = await supabase
        .from('ledger_entries')
        .insert(entries);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recent-journals'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      toast.success('Journal entry created successfully');
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create journal entry');
    },
  });

  const resetForm = () => {
    setDescription('');
    setLines([
      { account_id: '', debit_amount: '', credit_amount: '' },
      { account_id: '', debit_amount: '', credit_amount: '' },
    ]);
    setIsDialogOpen(false);
  };

  const addLine = () => {
    setLines([...lines, { account_id: '', debit_amount: '', credit_amount: '' }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, field: keyof JournalLine, value: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Journal Entries</CardTitle>
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
        <CardTitle>Journal Entries</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New Journal Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Create Journal Entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Description / Memo</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter journal entry description"
                />
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Account</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Select
                            value={line.account_id}
                            onValueChange={(value) => updateLine(index, 'account_id', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  {acc.code} - {acc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.debit_amount}
                            onChange={(e) => updateLine(index, 'debit_amount', e.target.value)}
                            placeholder="0.00"
                            className="text-right font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.credit_amount}
                            onChange={(e) => updateLine(index, 'credit_amount', e.target.value)}
                            placeholder="0.00"
                            className="text-right font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeLine(index)}
                            disabled={lines.length <= 2}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50">
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {totalDebit.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {totalCredit.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {isBalanced ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <Button type="button" variant="outline" onClick={addLine} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Line
              </Button>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => createMutation.mutate()} 
                  disabled={!isBalanced || createMutation.isPending}
                >
                  Post Journal Entry
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Journal ID</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentJournals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No journal entries found
                  </TableCell>
                </TableRow>
              ) : (
                recentJournals.map((journal) => (
                  <TableRow key={journal.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(journal.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {journal.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {journal.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {journal.total_debit.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {journal.total_credit.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {Math.abs(journal.total_debit - journal.total_credit) < 0.01 ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
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
