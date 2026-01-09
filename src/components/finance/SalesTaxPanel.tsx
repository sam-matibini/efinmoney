import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Receipt, 
  Building2, 
  MapPin, 
  Calculator, 
  FileText, 
  Plus, 
  Edit2, 
  CheckCircle, 
  Clock,
  DollarSign,
  TrendingUp,
  Download
} from "lucide-react";

type TaxType = 'GST' | 'HST' | 'QST' | 'PST' | 'RST';
type FilingStatus = 'draft' | 'pending_review' | 'approved' | 'filed' | 'paid';
type FilingFrequency = 'monthly' | 'quarterly' | 'annually';

// Tax Registrations Tab
const TaxRegistrationsTab = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    tax_type: 'GST' as TaxType,
    registration_number: '',
    legal_name: '',
    filing_frequency: 'quarterly' as FilingFrequency,
  });

  const { data: registrations, isLoading } = useQuery({
    queryKey: ['tax-registrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_registrations')
        .select('*')
        .order('tax_type');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('tax_registrations')
        .insert([formData]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-registrations'] });
      toast.success('Tax registration added');
      setIsDialogOpen(false);
      setFormData({ tax_type: 'GST', registration_number: '', legal_name: '', filing_frequency: 'quarterly' });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('tax_registrations')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-registrations'] });
      toast.success('Registration updated');
    },
  });

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Tax Registrations
          </CardTitle>
          <CardDescription>GST/HST, QST, PST registration numbers</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Add Registration</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Tax Registration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tax Type</Label>
                <Select value={formData.tax_type} onValueChange={(v: TaxType) => setFormData({ ...formData, tax_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GST">GST</SelectItem>
                    <SelectItem value="HST">HST</SelectItem>
                    <SelectItem value="QST">QST</SelectItem>
                    <SelectItem value="PST">PST</SelectItem>
                    <SelectItem value="RST">RST (Manitoba)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Registration Number</Label>
                <Input
                  value={formData.registration_number}
                  onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                  placeholder="123456789 RT0001"
                />
              </div>
              <div className="space-y-2">
                <Label>Legal Name</Label>
                <Input
                  value={formData.legal_name}
                  onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                  placeholder="Business legal name"
                />
              </div>
              <div className="space-y-2">
                <Label>Filing Frequency</Label>
                <Select value={formData.filing_frequency} onValueChange={(v: FilingFrequency) => setFormData({ ...formData, filing_frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                Add Registration
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tax Type</TableHead>
                <TableHead>Registration Number</TableHead>
                <TableHead>Legal Name</TableHead>
                <TableHead>Filing Frequency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No tax registrations configured
                  </TableCell>
                </TableRow>
              ) : (
                registrations?.map((reg) => (
                  <TableRow key={reg.id}>
                    <TableCell><Badge variant="outline">{reg.tax_type}</Badge></TableCell>
                    <TableCell className="font-mono">{reg.registration_number}</TableCell>
                    <TableCell>{reg.legal_name}</TableCell>
                    <TableCell className="capitalize">{reg.filing_frequency}</TableCell>
                    <TableCell>
                      <Switch
                        checked={reg.is_active}
                        onCheckedChange={(checked) => toggleActive.mutate({ id: reg.id, is_active: checked })}
                      />
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

// Tax Rates Tab
const TaxRatesTab = () => {
  const { data: rates, isLoading } = useQuery({
    queryKey: ['tax-rates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_rates')
        .select('*')
        .eq('is_active', true)
        .order('province_name');
      if (error) throw error;
      return data;
    },
  });

  // Group rates by province
  const ratesByProvince = rates?.reduce((acc, rate) => {
    if (!acc[rate.province_code]) {
      acc[rate.province_code] = { name: rate.province_name, rates: [] };
    }
    acc[rate.province_code].rates.push(rate);
    return acc;
  }, {} as Record<string, { name: string; rates: typeof rates }>);

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Provincial Tax Rates
        </CardTitle>
        <CardDescription>Current GST/HST/PST/QST rates by province</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Province</TableHead>
                <TableHead>Tax Type(s)</TableHead>
                <TableHead className="text-right">Combined Rate</TableHead>
                <TableHead>Effective From</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(ratesByProvince || {}).map(([code, { name, rates: provRates }]) => {
                const combinedRate = provRates!.reduce((sum, r) => sum + Number(r.rate), 0);
                return (
                  <TableRow key={code}>
                    <TableCell className="font-medium">{name} ({code})</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {provRates!.map((r) => (
                          <Badge key={r.id} variant="secondary">
                            {r.tax_type}: {(Number(r.rate) * 100).toFixed(2)}%
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {(combinedRate * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(provRates![0].effective_from), 'MMM d, yyyy')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

// Taxable Services Tab
const TaxableServicesTab = () => {
  const queryClient = useQueryClient();
  
  const { data: services, isLoading } = useQuery({
    queryKey: ['taxable-services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('taxable_services')
        .select('*')
        .order('service_name');
      if (error) throw error;
      return data;
    },
  });

  const toggleTaxable = useMutation({
    mutationFn: async ({ id, is_taxable }: { id: string; is_taxable: boolean }) => {
      const { error } = await supabase
        .from('taxable_services')
        .update({ is_taxable })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxable-services'] });
      toast.success('Service updated');
    },
  });

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Taxable Services
        </CardTitle>
        <CardDescription>Configure which fees are subject to sales tax (CRA rules)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Taxable</TableHead>
                <TableHead>Exemption Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services?.map((svc) => (
                <TableRow key={svc.id}>
                  <TableCell className="font-medium">{svc.service_name}</TableCell>
                  <TableCell className="font-mono text-xs">{svc.service_code}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {svc.description}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={svc.is_taxable}
                      onCheckedChange={(checked) => toggleTaxable.mutate({ id: svc.id, is_taxable: checked })}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground italic">
                    {svc.exemption_reason || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

// Tax Transactions Tab
const TaxTransactionsTab = () => {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['tax-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <Skeleton className="h-64" />;

  const totalTaxCollected = transactions?.reduce((sum, t) => sum + Number(t.total_tax || 0), 0) || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Tax Collected</p>
                <p className="text-2xl font-bold">${totalTaxCollected.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Receipt className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Transactions</p>
                <p className="text-2xl font-bold">{transactions?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <TrendingUp className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Tax Rate</p>
                <p className="text-2xl font-bold">
                  {transactions?.length ? (
                    (transactions.reduce((sum, t) => sum + (Number(t.total_tax) / Number(t.taxable_amount) * 100), 0) / transactions.length).toFixed(2)
                  ) : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Tax Transactions
          </CardTitle>
          <CardDescription>Individual tax calculations per fee</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Province</TableHead>
                  <TableHead className="text-right">Taxable Amt</TableHead>
                  <TableHead className="text-right">GST/HST</TableHead>
                  <TableHead className="text-right">PST/QST</TableHead>
                  <TableHead className="text-right">Total Tax</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No tax transactions recorded
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions?.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(tx.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>{tx.transaction_type}</TableCell>
                      <TableCell><Badge variant="outline">{tx.province_code}</Badge></TableCell>
                      <TableCell className="text-right font-mono">${Number(tx.taxable_amount).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${(Number(tx.gst_amount) + Number(tx.hst_amount)).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${(Number(tx.pst_amount) + Number(tx.qst_amount)).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        ${Number(tx.total_tax).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {tx.is_refunded ? (
                          <Badge variant="destructive">Refunded</Badge>
                        ) : (
                          <Badge variant="default">Active</Badge>
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
    </div>
  );
};

// Tax Filings Tab
const TaxFilingsTab = () => {
  const { data: filings, isLoading } = useQuery({
    queryKey: ['tax-filings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_filings')
        .select('*')
        .order('filing_period_end', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const getStatusBadge = (status: FilingStatus) => {
    const variants: Record<FilingStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      draft: { variant: 'outline', icon: <Edit2 className="h-3 w-3" /> },
      pending_review: { variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
      approved: { variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
      filed: { variant: 'default', icon: <FileText className="h-3 w-3" /> },
      paid: { variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
    };
    const { variant, icon } = variants[status];
    return (
      <Badge variant={variant} className="flex items-center gap-1 w-fit">
        {icon}
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Tax Filings
          </CardTitle>
          <CardDescription>CRA return filing and payment tracking</CardDescription>
        </div>
        <Button size="sm" variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Reports
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Tax Type</TableHead>
                <TableHead className="text-right">Tax Collected</TableHead>
                <TableHead className="text-right">ITCs</TableHead>
                <TableHead className="text-right">Net Payable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Filed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filings?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No tax filings recorded
                  </TableCell>
                </TableRow>
              ) : (
                filings?.map((filing) => (
                  <TableRow key={filing.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(filing.filing_period_start), 'MMM d')} - {format(new Date(filing.filing_period_end), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell><Badge variant="outline">{filing.tax_type}</Badge></TableCell>
                    <TableCell className="text-right font-mono">${Number(filing.tax_collected).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      -${Number(filing.input_tax_credits).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      ${Number(filing.net_tax_payable).toFixed(2)}
                    </TableCell>
                    <TableCell>{getStatusBadge(filing.status as FilingStatus)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {filing.filed_at ? format(new Date(filing.filed_at), 'MMM d, yyyy') : '-'}
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

// Main Sales Tax Panel
export const SalesTaxPanel = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Sales Tax Module
          </h2>
          <p className="text-muted-foreground">CRA-compliant GST/HST/PST/QST management</p>
        </div>
      </div>

      <Tabs defaultValue="registrations" className="space-y-4">
        <div className="overflow-x-auto pb-2">
          <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
            <TabsTrigger value="registrations">Registrations</TabsTrigger>
            <TabsTrigger value="rates">Tax Rates</TabsTrigger>
            <TabsTrigger value="services">Taxable Services</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="filings">Filings</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="registrations">
          <TaxRegistrationsTab />
        </TabsContent>

        <TabsContent value="rates">
          <TaxRatesTab />
        </TabsContent>

        <TabsContent value="services">
          <TaxableServicesTab />
        </TabsContent>

        <TabsContent value="transactions">
          <TaxTransactionsTab />
        </TabsContent>

        <TabsContent value="filings">
          <TaxFilingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
