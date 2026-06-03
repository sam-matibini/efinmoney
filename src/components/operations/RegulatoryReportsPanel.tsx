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
  FileText, 
  Plus,
  Send,
  CheckCircle2,
  Clock,
  Eye,
  Search,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusConfig: Record<string, { color: string; label: string }> = {
  draft: { color: 'bg-muted text-muted-foreground', label: 'Draft' },
  pending_review: { color: 'bg-amber-500/10 text-amber-600', label: 'Pending Review' },
  approved: { color: 'bg-blue-500/10 text-blue-600', label: 'Approved' },
  submitted: { color: 'bg-indigo-500/10 text-indigo-600', label: 'Submitted' },
  acknowledged: { color: 'bg-indigo-500/10 text-indigo-600', label: 'Acknowledged' },
};

const reportTypeConfig: Record<string, { label: string; description: string }> = {
  SAR: { label: 'SAR', description: 'Suspicious Activity Report' },
  STR: { label: 'STR', description: 'Suspicious Transaction Report' },
  CTR: { label: 'CTR', description: 'Currency Transaction Report' },
  FBAR: { label: 'FBAR', description: 'Foreign Bank Account Report' },
  large_transaction: { label: 'Large Transaction', description: 'Large Transaction Report' },
  cross_border: { label: 'Cross Border', description: 'Cross Border Movement Report' },
};

export const RegulatoryReportsPanel = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [formData, setFormData] = useState({
    report_type: '',
    jurisdiction: 'US',
    narrative: '',
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['regulatory-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('regulatory_reports')
        .select('*, customers(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createReport = useMutation({
    mutationFn: async (data: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('regulatory_reports').insert({
        ...data,
        created_by: user.id,
        report_data: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regulatory-reports'] });
      toast.success('Report created successfully');
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateReport = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const updateData: any = { status };
      if (status === 'submitted') {
        updateData.submitted_at = new Date().toISOString();
        updateData.submitted_by = user.id;
      }
      if (status === 'approved') {
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = user.id;
      }

      const { error } = await supabase.from('regulatory_reports').update(updateData).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regulatory-reports'] });
      toast.success('Report updated successfully');
      setSelectedReport(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({
      report_type: '',
      jurisdiction: 'US',
      narrative: '',
    });
  };

  const filteredReports = reports.filter(r => 
    r.report_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.reference_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingReports = reports.filter(r => ['draft', 'pending_review'].includes(r.status));
  const overdueReports = reports.filter(r => 
    r.filing_deadline && new Date(r.filing_deadline) < new Date() && !['submitted', 'acknowledged'].includes(r.status)
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Regulatory Reports</CardTitle></CardHeader>
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
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{reports.length}</p>
                <p className="text-xs text-muted-foreground">Total Reports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{pendingReports.length}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-500" />
              <div>
                <p className="text-2xl font-bold">{reports.filter(r => r.status === 'submitted').length}</p>
                <p className="text-xs text-muted-foreground">Submitted</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{overdueReports.length}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Regulatory Reports
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
                <Button size="sm"><Plus className="w-4 h-4 mr-2" />New Report</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Regulatory Report</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Report Type</Label>
                      <Select value={formData.report_type} onValueChange={(v) => setFormData({ ...formData, report_type: v })}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(reportTypeConfig).map(([key, config]) => (
                            <SelectItem key={key} value={key}>{config.label} - {config.description}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Jurisdiction</Label>
                      <Select value={formData.jurisdiction} onValueChange={(v) => setFormData({ ...formData, jurisdiction: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="US">United States</SelectItem>
                          <SelectItem value="CA">Canada</SelectItem>
                          <SelectItem value="UK">United Kingdom</SelectItem>
                          <SelectItem value="EU">European Union</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Narrative</Label>
                    <Textarea
                      value={formData.narrative}
                      onChange={(e) => setFormData({ ...formData, narrative: e.target.value })}
                      placeholder="Describe the suspicious activity or transaction details..."
                      rows={4}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button
                      onClick={() => createReport.mutate(formData)}
                      disabled={!formData.report_type || !formData.narrative || createReport.isPending}
                    >
                      Create Report
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
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filing Deadline</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No reports found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-mono text-xs">
                        {report.reference_number || report.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {reportTypeConfig[report.report_type]?.label || report.report_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{report.jurisdiction}</TableCell>
                      <TableCell>
                        <Badge className={statusConfig[report.status]?.color || ''}>
                          {statusConfig[report.status]?.label || report.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {report.filing_deadline ? format(new Date(report.filing_deadline), 'MMM dd, yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(report.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setSelectedReport(report)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {report.status === 'approved' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => updateReport.mutate({ id: report.id, status: 'submitted' })}
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Submit
                            </Button>
                          )}
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

      {/* Report Detail Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Details</DialogTitle>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{reportTypeConfig[selectedReport.report_type]?.description}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge className={statusConfig[selectedReport.status]?.color || ''}>
                    {statusConfig[selectedReport.status]?.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Jurisdiction</p>
                  <p className="font-medium">{selectedReport.jurisdiction}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Reference</p>
                  <p className="font-medium font-mono text-xs">{selectedReport.reference_number || '-'}</p>
                </div>
              </div>
              {selectedReport.narrative && (
                <div>
                  <p className="text-muted-foreground text-sm">Narrative</p>
                  <p className="text-sm">{selectedReport.narrative}</p>
                </div>
              )}
              {!['submitted', 'acknowledged'].includes(selectedReport.status) && (
                <div className="flex gap-2 pt-4 border-t">
                  {selectedReport.status === 'draft' && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => updateReport.mutate({ id: selectedReport.id, status: 'pending_review' })}
                    >
                      Submit for Review
                    </Button>
                  )}
                  {selectedReport.status === 'pending_review' && (
                    <Button
                      variant="default"
                      className="flex-1"
                      onClick={() => updateReport.mutate({ id: selectedReport.id, status: 'approved' })}
                    >
                      Approve
                    </Button>
                  )}
                  {selectedReport.status === 'approved' && (
                    <Button
                      variant="default"
                      className="flex-1"
                      onClick={() => updateReport.mutate({ id: selectedReport.id, status: 'submitted' })}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Submit to Regulator
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
