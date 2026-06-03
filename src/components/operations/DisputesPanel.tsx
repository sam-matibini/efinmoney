import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { 
  Scale, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  XCircle,
  Search,
  Eye
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusConfig: Record<string, { color: string; label: string }> = {
  open: { color: 'bg-blue-500/10 text-blue-600', label: 'Open' },
  investigating: { color: 'bg-amber-500/10 text-amber-600', label: 'Investigating' },
  pending_approval: { color: 'bg-purple-500/10 text-purple-600', label: 'Pending Approval' },
  approved: { color: 'bg-indigo-500/10 text-indigo-600', label: 'Approved' },
  rejected: { color: 'bg-red-500/10 text-red-600', label: 'Rejected' },
  resolved: { color: 'bg-indigo-500/10 text-indigo-600', label: 'Resolved' },
  escalated: { color: 'bg-orange-500/10 text-orange-600', label: 'Escalated' },
};

const priorityConfig: Record<string, { color: string }> = {
  low: { color: 'bg-muted text-muted-foreground' },
  medium: { color: 'bg-amber-500/10 text-amber-600' },
  high: { color: 'bg-orange-500/10 text-orange-600' },
  critical: { color: 'bg-red-500/10 text-red-600' },
};

export const DisputesPanel = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const [formData, setFormData] = useState({
    dispute_type: '',
    priority: 'medium',
    reason: '',
    customer_statement: '',
    amount: '',
    currency_code: 'USD',
  });

  const { data: disputes = [], isLoading } = useQuery({
    queryKey: ['disputes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('disputes')
        .select('*, customers(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const createDispute = useMutation({
    mutationFn: async (data: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('disputes').insert({
        ...data,
        created_by: user.id,
        amount: data.amount ? parseFloat(data.amount) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      toast.success('Dispute created successfully');
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateDispute = useMutation({
    mutationFn: async ({ id, status, resolution }: { id: string; status: string; resolution?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const updateData: any = { status };
      if (resolution) updateData.resolution = resolution;
      if (['resolved', 'rejected', 'approved'].includes(status)) {
        updateData.resolved_by = user.id;
        updateData.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase.from('disputes').update(updateData).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      toast.success('Dispute updated successfully');
      setSelectedDispute(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({
      dispute_type: '',
      priority: 'medium',
      reason: '',
      customer_statement: '',
      amount: '',
      currency_code: 'USD',
    });
  };

  const filteredDisputes = disputes.filter(d => 
    d.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openDisputes = disputes.filter(d => ['open', 'investigating'].includes(d.status));

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Disputes & Refunds</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{disputes.length}</p>
                <p className="text-xs text-muted-foreground">Total Disputes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{openDisputes.length}</p>
                <p className="text-xs text-muted-foreground">Open</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-500" />
              <div>
                <p className="text-2xl font-bold">{disputes.filter(d => d.status === 'resolved').length}</p>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{disputes.filter(d => d.status === 'rejected').length}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5" />
            Disputes & Refunds
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-2" />New Dispute</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Dispute</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Dispute Type</Label>
                      <Select value={formData.dispute_type} onValueChange={(v) => setFormData({ ...formData, dispute_type: v })}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chargeback">Chargeback</SelectItem>
                          <SelectItem value="refund_request">Refund Request</SelectItem>
                          <SelectItem value="transaction_error">Transaction Error</SelectItem>
                          <SelectItem value="unauthorized">Unauthorized</SelectItem>
                          <SelectItem value="service_issue">Service Issue</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select value={formData.currency_code} onValueChange={(v) => setFormData({ ...formData, currency_code: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="CAD">CAD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Textarea
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Describe the dispute reason..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Statement</Label>
                    <Textarea
                      value={formData.customer_statement}
                      onChange={(e) => setFormData({ ...formData, customer_statement: e.target.value })}
                      placeholder="Customer's statement..."
                      rows={2}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button
                      onClick={() => createDispute.mutate(formData)}
                      disabled={!formData.dispute_type || !formData.reason || createDispute.isPending}
                    >
                      Create Dispute
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDisputes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No disputes found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDisputes.map((dispute) => (
                    <TableRow key={dispute.id}>
                      <TableCell className="font-mono text-xs">{dispute.id.slice(0, 8)}...</TableCell>
                      <TableCell>
                        <Badge variant="outline">{dispute.dispute_type?.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell>{dispute.customers?.name || '-'}</TableCell>
                      <TableCell>
                        {dispute.amount ? `${dispute.amount} ${dispute.currency_code}` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={priorityConfig[dispute.priority]?.color || ''}>
                          {dispute.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig[dispute.status]?.color || ''}>
                          {statusConfig[dispute.status]?.label || dispute.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(dispute.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setSelectedDispute(dispute)}>
                            <Eye className="w-4 h-4" />
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

      {/* Dispute Detail Dialog */}
      <Dialog open={!!selectedDispute} onOpenChange={(open) => !open && setSelectedDispute(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dispute Details</DialogTitle>
          </DialogHeader>
          {selectedDispute && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{selectedDispute.dispute_type?.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge className={statusConfig[selectedDispute.status]?.color || ''}>
                    {statusConfig[selectedDispute.status]?.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-medium">{selectedDispute.amount || '-'} {selectedDispute.currency_code}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Priority</p>
                  <Badge className={priorityConfig[selectedDispute.priority]?.color || ''}>
                    {selectedDispute.priority}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Reason</p>
                <p className="text-sm">{selectedDispute.reason}</p>
              </div>
              {selectedDispute.customer_statement && (
                <div>
                  <p className="text-muted-foreground text-sm">Customer Statement</p>
                  <p className="text-sm">{selectedDispute.customer_statement}</p>
                </div>
              )}
              {selectedDispute.resolution && (
                <div>
                  <p className="text-muted-foreground text-sm">Resolution</p>
                  <p className="text-sm">{selectedDispute.resolution}</p>
                </div>
              )}
              {!['resolved', 'rejected', 'approved'].includes(selectedDispute.status) && (
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => updateDispute.mutate({ id: selectedDispute.id, status: 'investigating' })}
                  >
                    Investigate
                  </Button>
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={() => updateDispute.mutate({ id: selectedDispute.id, status: 'approved', resolution: 'Approved for refund' })}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => updateDispute.mutate({ id: selectedDispute.id, status: 'rejected', resolution: 'Dispute rejected' })}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
