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
  Wallet, 
  Search,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Eye
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  active: { icon: CheckCircle2, color: 'bg-green-500/10 text-green-600', label: 'Active' },
  frozen: { icon: Lock, color: 'bg-blue-500/10 text-blue-600', label: 'Frozen' },
  suspended: { icon: AlertTriangle, color: 'bg-amber-500/10 text-amber-600', label: 'Suspended' },
  closed: { icon: Ban, color: 'bg-red-500/10 text-red-600', label: 'Closed' },
};

export const WalletOperationsPanel = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedWallet, setSelectedWallet] = useState<any>(null);
  const [operationType, setOperationType] = useState<string>('');
  const [operationReason, setOperationReason] = useState('');
  const [isOperationOpen, setIsOperationOpen] = useState(false);

  const { data: wallets = [], isLoading } = useQuery({
    queryKey: ['all-wallets', statusFilter],
    queryFn: async () => {
      // Get wallets
      let walletsQuery = supabase
        .from('wallets')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (statusFilter !== 'all') {
        walletsQuery = walletsQuery.eq('status', statusFilter as any);
      }
      
      const { data: walletsData, error: walletsError } = await walletsQuery;
      if (walletsError) throw walletsError;
      
      // Get profiles for user names
      const userIds = [...new Set((walletsData || []).map(w => w.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);
      
      const profilesMap = new Map((profilesData || []).map(p => [p.user_id, p]));
      
      return (walletsData || []).map(w => ({
        ...w,
        profile: profilesMap.get(w.user_id) || null,
      }));
    },
  });

  const { data: walletOps = [] } = useQuery({
    queryKey: ['wallet-operations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_operations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const createOperation = useMutation({
    mutationFn: async ({ walletId, type, reason }: { walletId: string; type: string; reason: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const wallet = wallets.find(w => w.id === walletId);
      const previousStatus = wallet?.status;
      
      let newStatus = previousStatus;
      if (type === 'freeze') newStatus = 'frozen';
      else if (type === 'unfreeze' || type === 'reactivate') newStatus = 'active';
      else if (type === 'close') newStatus = 'closed';

      // Create operation record
      const { error: opError } = await supabase.from('wallet_operations').insert({
        wallet_id: walletId,
        operation_type: type,
        reason,
        performed_by: user.id,
        previous_status: previousStatus,
        new_status: newStatus,
      });
      if (opError) throw opError;

      // Update wallet status
      if (newStatus !== previousStatus) {
        const { error: walletError } = await supabase
          .from('wallets')
          .update({ status: newStatus })
          .eq('id', walletId);
        if (walletError) throw walletError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet-operations'] });
      queryClient.invalidateQueries({ queryKey: ['all-wallets'] });
      toast.success('Wallet operation completed');
      setIsOperationOpen(false);
      setOperationReason('');
      setOperationType('');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const filteredWallets = wallets.filter((w: any) => 
    w.currency_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.profile?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Wallet Operations</CardTitle></CardHeader>
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
              <Wallet className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{wallets.length}</p>
                <p className="text-xs text-muted-foreground">Total Wallets</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{wallets.filter(w => w.status === 'active').length}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{wallets.filter(w => w.status === 'frozen').length}</p>
                <p className="text-xs text-muted-foreground">Frozen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{wallets.filter(w => w.status === 'suspended').length}</p>
                <p className="text-xs text-muted-foreground">Suspended</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Wallet Management
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="frozen">Frozen</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wallet ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWallets.map((wallet) => {
                  const config = statusConfig[wallet.status] || statusConfig.active;
                  const StatusIcon = config.icon;
                  
                  return (
                    <TableRow key={wallet.id}>
                      <TableCell className="font-mono text-xs">{wallet.id.slice(0, 8)}...</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{(wallet as any).profile?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{(wallet as any).profile?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{wallet.currency_code}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={config.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {wallet.is_default && <Badge variant="secondary">Default</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(wallet.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog open={isOperationOpen && selectedWallet?.id === wallet.id} onOpenChange={(open) => {
                          setIsOperationOpen(open);
                          if (open) setSelectedWallet(wallet);
                        }}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              {wallet.status === 'frozen' ? <Unlock className="w-4 h-4 mr-1" /> : <Lock className="w-4 h-4 mr-1" />}
                              {wallet.status === 'frozen' ? 'Unfreeze' : 'Manage'}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Wallet Operation</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="p-3 bg-muted rounded-lg text-sm">
                                <p><strong>Wallet:</strong> {wallet.currency_code}</p>
                                <p><strong>User:</strong> {(wallet as any).profile?.full_name}</p>
                                <p><strong>Current Status:</strong> {wallet.status}</p>
                              </div>
                              <div className="space-y-2">
                                <Label>Operation Type</Label>
                                <Select value={operationType} onValueChange={setOperationType}>
                                  <SelectTrigger><SelectValue placeholder="Select operation..." /></SelectTrigger>
                                  <SelectContent>
                                    {wallet.status !== 'frozen' && <SelectItem value="freeze">Freeze Wallet</SelectItem>}
                                    {wallet.status === 'frozen' && <SelectItem value="unfreeze">Unfreeze Wallet</SelectItem>}
                                    <SelectItem value="restrict_inbound">Restrict Inbound</SelectItem>
                                    <SelectItem value="restrict_outbound">Restrict Outbound</SelectItem>
                                    {wallet.status !== 'closed' && <SelectItem value="close">Close Wallet</SelectItem>}
                                    {wallet.status === 'closed' && <SelectItem value="reactivate">Reactivate</SelectItem>}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Reason</Label>
                                <Textarea
                                  value={operationReason}
                                  onChange={(e) => setOperationReason(e.target.value)}
                                  placeholder="Explain the reason for this operation..."
                                  rows={3}
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setIsOperationOpen(false)}>Cancel</Button>
                                <Button
                                  variant={operationType === 'close' ? 'destructive' : 'default'}
                                  onClick={() => createOperation.mutate({
                                    walletId: wallet.id,
                                    type: operationType,
                                    reason: operationReason,
                                  })}
                                  disabled={!operationType || !operationReason || createOperation.isPending}
                                >
                                  Execute Operation
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Operations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Operations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {walletOps.slice(0, 5).map((op) => (
              <div key={op.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  {op.operation_type === 'freeze' ? <Lock className="w-4 h-4 text-blue-500" /> : <Unlock className="w-4 h-4 text-green-500" />}
                  <div>
                    <p className="font-medium text-sm">{op.operation_type?.replace('_', ' ')}</p>
                    <p className="text-xs text-muted-foreground">{op.reason?.slice(0, 50)}...</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(op.created_at), 'MMM dd, HH:mm')}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
