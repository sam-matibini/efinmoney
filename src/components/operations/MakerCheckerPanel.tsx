import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  ShieldCheck, 
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Search,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: 'bg-amber-500/10 text-amber-600', label: 'Pending' },
  approved: { icon: CheckCircle2, color: 'bg-green-500/10 text-green-600', label: 'Approved' },
  rejected: { icon: XCircle, color: 'bg-red-500/10 text-red-600', label: 'Rejected' },
  expired: { icon: AlertTriangle, color: 'bg-muted text-muted-foreground', label: 'Expired' },
  cancelled: { icon: XCircle, color: 'bg-muted text-muted-foreground', label: 'Cancelled' },
};

const actionLabels: Record<string, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  freeze: 'Freeze',
  unfreeze: 'Unfreeze',
  approve: 'Approve',
  reject: 'Reject',
  reverse: 'Reverse',
  override: 'Override',
};

export const MakerCheckerPanel = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [checkerNotes, setCheckerNotes] = useState('');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['maker-checker-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maker_checker_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const processRequest = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('maker_checker_requests')
        .update({
          status,
          checker_id: user.id,
          checker_notes: notes,
          checked_at: new Date().toISOString(),
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maker-checker-requests'] });
      toast.success('Request processed successfully');
      setSelectedRequest(null);
      setCheckerNotes('');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const filteredRequests = requests.filter(r => 
    r.request_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.entity_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingRequests = requests.filter(r => r.status === 'pending');

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Maker-Checker Approvals</CardTitle></CardHeader>
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
              <ShieldCheck className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{requests.length}</p>
                <p className="text-xs text-muted-foreground">Total Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{pendingRequests.length}</p>
                <p className="text-xs text-muted-foreground">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{requests.filter(r => r.status === 'approved').length}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{requests.filter(r => r.status === 'rejected').length}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals Alert */}
      {pendingRequests.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <div>
                <p className="font-medium">Pending Approvals Required</p>
                <p className="text-sm text-muted-foreground">
                  You have {pendingRequests.length} request(s) awaiting approval
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Maker-Checker Approvals
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request Type</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No requests found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRequests.map((request) => {
                    const config = statusConfig[request.status] || statusConfig.pending;
                    const StatusIcon = config.icon;
                    
                    return (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.request_type}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{request.entity_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{actionLabels[request.action] || request.action}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={config.color}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(request.created_at), 'MMM dd, HH:mm')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => setSelectedRequest(request)}>
                            <Eye className="w-4 h-4" />
                          </Button>
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

      {/* Request Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) { setSelectedRequest(null); setCheckerNotes(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Request</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Request Type</p>
                  <p className="font-medium">{selectedRequest.request_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge className={statusConfig[selectedRequest.status]?.color || ''}>
                    {statusConfig[selectedRequest.status]?.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Entity Type</p>
                  <p className="font-medium">{selectedRequest.entity_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Action</p>
                  <p className="font-medium">{actionLabels[selectedRequest.action] || selectedRequest.action}</p>
                </div>
              </div>
              
              {selectedRequest.reason && (
                <div>
                  <p className="text-muted-foreground text-sm">Reason</p>
                  <p className="text-sm">{selectedRequest.reason}</p>
                </div>
              )}

              <div>
                <p className="text-muted-foreground text-sm mb-2">Request Data</p>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-32">
                  {JSON.stringify(selectedRequest.request_data, null, 2)}
                </pre>
              </div>

              {selectedRequest.checker_notes && (
                <div>
                  <p className="text-muted-foreground text-sm">Checker Notes</p>
                  <p className="text-sm">{selectedRequest.checker_notes}</p>
                </div>
              )}

              {selectedRequest.status === 'pending' && (
                <>
                  <div className="space-y-2">
                    <Label>Notes (Optional)</Label>
                    <Textarea
                      value={checkerNotes}
                      onChange={(e) => setCheckerNotes(e.target.value)}
                      placeholder="Add notes about your decision..."
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => processRequest.mutate({ 
                        id: selectedRequest.id, 
                        status: 'rejected', 
                        notes: checkerNotes 
                      })}
                      disabled={processRequest.isPending}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      variant="default"
                      className="flex-1"
                      onClick={() => processRequest.mutate({ 
                        id: selectedRequest.id, 
                        status: 'approved', 
                        notes: checkerNotes 
                      })}
                      disabled={processRequest.isPending}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
