import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  XCircle,
  RefreshCw,
  Ban,
  ArrowRightLeft,
  Search,
  Filter
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const PROVIDERS = [
  { value: "fincra", label: "Fincra" },
  { value: "nomba", label: "Nomba" },
  { value: "flovide", label: "Flovide" },
  { value: "flutterwave", label: "Flutterwave" },
  { value: "paytota", label: "Paytota" },
  { value: "swychr", label: "Swychr" },
  { value: "ghana_pay", label: "Ghana Pay" },
  { value: "elicate", label: "Elicate" },
  { value: "lenhub_flutter", label: "Lenhub" },
  { value: "verto", label: "Verto" },
];

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  initiated: { icon: Clock, color: 'bg-blue-500/10 text-blue-600', label: 'Initiated' },
  funded: { icon: CheckCircle2, color: 'bg-indigo-500/10 text-indigo-600', label: 'Funded' },
  processing: { icon: RefreshCw, color: 'bg-amber-500/10 text-amber-600', label: 'Processing' },
  pending_liquidity: { icon: Clock, color: 'bg-orange-500/10 text-orange-600', label: 'Awaiting settlement' },
  pending_ops: { icon: Clock, color: 'bg-orange-500/10 text-orange-600', label: 'Ops review' },
  completed: { icon: CheckCircle2, color: 'bg-indigo-500/10 text-indigo-600', label: 'Completed' },
  failed: { icon: XCircle, color: 'bg-red-500/10 text-red-600', label: 'Failed' },
  reversed: { icon: ArrowRightLeft, color: 'bg-purple-500/10 text-purple-600', label: 'Reversed' },
  expired: { icon: Ban, color: 'bg-muted text-muted-foreground', label: 'Expired' },
};

export const TransactionMonitoringPanel = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTransfer, setSelectedTransfer] = useState<any>(null);
  const [interventionType, setInterventionType] = useState<string>('');
  const [interventionReason, setInterventionReason] = useState('');
  const [provider, setProvider] = useState('');
  const [isInterventionOpen, setIsInterventionOpen] = useState(false);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['all-transfers', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('transfers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: interventions = [] } = useQuery({
    queryKey: ['transaction-interventions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_interventions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createIntervention = useMutation({
    mutationFn: async ({ transferId, type, reason, rail }: { transferId: string; type: string; reason: string; rail?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ops-intervene`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transfer_id: transferId,
          action: type,
          reason,
          provider: rail || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.result || json?.error || 'Intervention failed');
      }
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transaction-interventions'] });
      queryClient.invalidateQueries({ queryKey: ['all-transfers'] });
      toast.success(data?.result || 'Intervention applied');
      setIsInterventionOpen(false);
      setInterventionReason('');
      setInterventionType('');
      setProvider('');
      setSelectedTransfer(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const needsProvider = interventionType === 'switch_provider' || interventionType === 'retry';

  const filteredTransfers = transfers.filter(t => 
    t.recipient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.id.includes(searchTerm)
  );

  const pendingInterventions = interventions.filter(i => i.status === 'pending');
  const exceptionTransfers = transfers.filter(t => ['failed', 'expired'].includes(t.status));

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Transaction Monitoring</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{transfers.length}</p>
                <p className="text-xs text-muted-foreground">Total Transfers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{transfers.filter(t => t.status === 'processing').length}</p>
                <p className="text-xs text-muted-foreground">Processing</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{exceptionTransfers.length}</p>
                <p className="text-xs text-muted-foreground">Exceptions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{pendingInterventions.length}</p>
                <p className="text-xs text-muted-foreground">Pending Actions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Live Transfers
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
              <SelectTrigger className="w-36">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="initiated">Initiated</SelectItem>
                <SelectItem value="funded">Funded</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="pending_liquidity">Awaiting settlement</SelectItem>
                <SelectItem value="pending_ops">Ops review</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="reversed">Reversed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transfer ID</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransfers.map((transfer) => {
                  const config = statusConfig[transfer.status] || statusConfig.initiated;
                  const StatusIcon = config.icon;
                  
                  return (
                    <TableRow key={transfer.id}>
                      <TableCell className="font-mono text-xs">
                        {transfer.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{transfer.recipient_name}</p>
                          <p className="text-xs text-muted-foreground">{transfer.recipient_country}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{transfer.source_amount} {transfer.source_currency}</p>
                          <p className="text-xs text-muted-foreground">→ {transfer.target_amount} {transfer.target_currency}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{transfer.transfer_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={config.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(transfer.created_at), 'MMM dd, HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedTransfer(transfer);
                            setInterventionType('');
                            setInterventionReason('');
                            setProvider('');
                            setIsInterventionOpen(true);
                          }}
                        >
                          Intervene
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isInterventionOpen} onOpenChange={setIsInterventionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Intervention</DialogTitle>
            <DialogDescription>
              {selectedTransfer
                ? `${selectedTransfer.recipient_name} · ${selectedTransfer.source_amount} ${selectedTransfer.source_currency}`
                : "Apply an operations action to this transfer."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Intervention Type</Label>
              <Select value={interventionType} onValueChange={setInterventionType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retry">Retry Transfer</SelectItem>
                  <SelectItem value="cancel">Cancel Transfer</SelectItem>
                  <SelectItem value="switch_provider">Switch Provider</SelectItem>
                  <SelectItem value="manual_complete">Manual Complete</SelectItem>
                  <SelectItem value="reverse">Reverse</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {needsProvider && (
              <div className="space-y-2">
                <Label>{interventionType === "switch_provider" ? "New provider" : "Provider"}</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder={interventionType === "retry" ? "Same rail, or pick one..." : "Select provider..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={interventionReason}
                onChange={(e) => setInterventionReason(e.target.value)}
                placeholder="Explain the reason for this intervention..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsInterventionOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!selectedTransfer) return;
                  createIntervention.mutate({
                    transferId: selectedTransfer.id,
                    type: interventionType,
                    reason: interventionReason,
                    rail: provider || undefined,
                  });
                }}
                disabled={
                  !selectedTransfer
                  || !interventionType
                  || interventionReason.trim().length < 3
                  || (interventionType === "switch_provider" && !provider)
                  || createIntervention.isPending
                }
              >
                {createIntervention.isPending ? "Applying..." : "Create Intervention"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
