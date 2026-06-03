import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Sparkles, 
  Zap, 
  ArrowRight,
  Brain,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

interface TransactionRule {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  match_type: string;
  match_field: string;
  match_value: string;
  category: string | null;
  debit_account_id: string | null;
  credit_account_id: string | null;
  auto_post: boolean;
  ai_generated: boolean;
  ai_confidence: number | null;
}

const matchTypes = [
  { value: 'contains', label: 'Contains' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'exact', label: 'Exact match' },
  { value: 'regex', label: 'Regex' },
];

const matchFields = [
  { value: 'description', label: 'Description' },
  { value: 'reference', label: 'Reference' },
];

const defaultCategories = [
  'Bank Fees',
  'Card Processing',
  'Customer Deposit',
  'Customer Withdrawal',
  'FX Settlement',
  'Interest',
  'Mobile Money',
  'Provider Payment',
  'Refund',
  'Transfer In',
  'Transfer Out',
  'Wire Transfer',
  'Other',
];

export const TransactionRulesPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TransactionRule | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    priority: 100,
    match_type: 'contains',
    match_field: 'description',
    match_value: '',
    category: '',
    debit_account_id: '',
    credit_account_id: '',
    auto_post: false,
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['transaction-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_rules')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return data as TransactionRule[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['ledger-accounts-for-rules'],
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

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('transaction_rules')
        .insert({
          name: data.name,
          description: data.description || null,
          priority: data.priority,
          match_type: data.match_type,
          match_field: data.match_field,
          match_value: data.match_value,
          category: data.category || null,
          debit_account_id: data.debit_account_id || null,
          credit_account_id: data.credit_account_id || null,
          auto_post: data.auto_post,
          ai_generated: false,
          created_by: user?.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-rules'] });
      toast.success('Rule created successfully');
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create rule');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const { error } = await supabase
        .from('transaction_rules')
        .update({
          name: data.name,
          description: data.description || null,
          priority: data.priority,
          match_type: data.match_type,
          match_field: data.match_field,
          match_value: data.match_value,
          category: data.category || null,
          debit_account_id: data.debit_account_id || null,
          credit_account_id: data.credit_account_id || null,
          auto_post: data.auto_post,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-rules'] });
      toast.success('Rule updated successfully');
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update rule');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('transaction_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-rules'] });
      toast.success('Rule deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete rule');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('transaction_rules')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-rules'] });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      priority: 100,
      match_type: 'contains',
      match_field: 'description',
      match_value: '',
      category: '',
      debit_account_id: '',
      credit_account_id: '',
      auto_post: false,
    });
    setEditingRule(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (rule: TransactionRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || '',
      priority: rule.priority,
      match_type: rule.match_type,
      match_field: rule.match_field,
      match_value: rule.match_value,
      category: rule.category || '',
      debit_account_id: rule.debit_account_id || '',
      credit_account_id: rule.credit_account_id || '',
      auto_post: rule.auto_post,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getAccountName = (id: string | null) => {
    if (!id) return '-';
    const account = accounts.find(a => a.id === id);
    return account ? `${account.code} - ${account.name}` : id.slice(0, 8);
  };

  const activeRules = rules.filter(r => r.is_active).length;
  const aiRules = rules.filter(r => r.ai_generated).length;
  const autoPostRules = rules.filter(r => r.auto_post).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transaction Rules</CardTitle>
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
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rules.length}</p>
                <p className="text-sm text-muted-foreground">Total Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10">
                <CheckCircle2 className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeRules}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Brain className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{aiRules}</p>
                <p className="text-sm text-muted-foreground">AI Generated</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <ArrowRight className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{autoPostRules}</p>
                <p className="text-sm text-muted-foreground">Auto-Post</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rules Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Transaction Rules
            </CardTitle>
            <CardDescription>
              Automatically categorize and post bank transactions to the General Ledger
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Transaction Rule'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Rule Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Bank Fee Detection"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority (lower = higher)</Label>
                    <Input
                      id="priority"
                      type="number"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 100 })}
                      min={1}
                      max={9999}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Match Field</Label>
                    <Select
                      value={formData.match_field}
                      onValueChange={(value) => setFormData({ ...formData, match_field: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {matchFields.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Match Type</Label>
                    <Select
                      value={formData.match_type}
                      onValueChange={(value) => setFormData({ ...formData, match_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {matchTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="match_value">Match Value</Label>
                    <Input
                      id="match_value"
                      value={formData.match_value}
                      onChange={(e) => setFormData({ ...formData, match_value: e.target.value })}
                      placeholder="e.g., BANK FEE"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {defaultCategories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Debit Account</Label>
                    <Select
                      value={formData.debit_account_id}
                      onValueChange={(value) => setFormData({ ...formData, debit_account_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select debit account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Credit Account</Label>
                    <Select
                      value={formData.credit_account_id}
                      onValueChange={(value) => setFormData({ ...formData, credit_account_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select credit account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Auto-Post to GL</p>
                    <p className="text-sm text-muted-foreground">
                      Automatically create journal entries when matched
                    </p>
                  </div>
                  <Switch
                    checked={formData.auto_post}
                    onCheckedChange={(checked) => setFormData({ ...formData, auto_post: checked })}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingRule ? 'Update' : 'Create'} Rule
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>GL Accounts</TableHead>
                  <TableHead>Auto-Post</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No transaction rules configured</p>
                      <p className="text-sm">Create rules to automatically categorize bank transactions</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  rules.map((rule) => (
                    <TableRow key={rule.id} className={!rule.is_active ? 'opacity-50' : ''}>
                      <TableCell className="font-mono">{rule.priority}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{rule.name}</span>
                          {rule.ai_generated && (
                            <Badge variant="secondary" className="text-xs">
                              <Brain className="h-3 w-3 mr-1" />
                              AI
                            </Badge>
                          )}
                        </div>
                        {rule.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {rule.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="text-muted-foreground">{rule.match_field}</span>
                          <span className="mx-1">{matchTypes.find(t => t.value === rule.match_type)?.label?.toLowerCase()}</span>
                          <code className="bg-muted px-1 rounded text-xs">{rule.match_value}</code>
                        </div>
                      </TableCell>
                      <TableCell>
                        {rule.category ? (
                          <Badge variant="outline">{rule.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>DR: {getAccountName(rule.debit_account_id)}</div>
                        <div>CR: {getAccountName(rule.credit_account_id)}</div>
                      </TableCell>
                      <TableCell>
                        {rule.auto_post ? (
                          <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                            <Zap className="h-3 w-3 mr-1" />
                            Auto
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Manual</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: rule.id, is_active: checked })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(rule)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm('Delete this rule?')) {
                                deleteMutation.mutate(rule.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* AI Suggestions Card */}
      <Card className="border-dashed">
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500/10 to-blue-500/10">
              <Sparkles className="h-8 w-8 text-purple-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">AI-Powered Rule Suggestions</h3>
              <p className="text-sm text-muted-foreground">
                Analyze your bank transactions to automatically generate categorization rules
              </p>
            </div>
            <Button variant="outline" disabled>
              <Brain className="h-4 w-4 mr-2" />
              Generate Rules (Coming Soon)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
