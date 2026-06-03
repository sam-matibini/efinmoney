import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  Plus, 
  Edit, 
  Users, 
  Mail, 
  Phone, 
  Eye, 
  Search,
  Building2,
  Shield,
  CheckCircle2,
  Clock,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { CustomerDetailView } from "@/components/crm/CustomerDetailView";

const kycStatusConfig: Record<string, { icon: typeof Clock; color: 'default' | 'secondary' | 'destructive' }> = {
  pending: { icon: Clock, color: 'secondary' },
  in_review: { icon: Clock, color: 'secondary' },
  approved: { icon: CheckCircle2, color: 'default' },
  rejected: { icon: XCircle, color: 'destructive' },
};

export const CrmCustomersPanel = () => {
  const queryClient = useQueryClient();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    tax_id: '',
    payment_terms: 30,
    credit_limit: 0,
    currency_code: 'USD',
    company_type: '',
    registration_number: '',
    industry: '',
    website: '',
    notes: '',
  });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Get onboarding progress for each customer
  const { data: onboardingData = [] } = useQuery({
    queryKey: ['customers-onboarding-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_onboarding')
        .select('customer_id, status');
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('customers').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer created successfully');
      resetForm();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from('customers').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer updated successfully');
      resetForm();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({ 
      name: '', email: '', phone: '', address: '', tax_id: '', 
      payment_terms: 30, credit_limit: 0, currency_code: 'USD',
      company_type: '', registration_number: '', industry: '', website: '', notes: '' 
    });
    setEditingCustomer(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      tax_id: customer.tax_id || '',
      payment_terms: customer.payment_terms || 30,
      credit_limit: customer.credit_limit || 0,
      currency_code: customer.currency_code || 'USD',
      company_type: customer.company_type || '',
      registration_number: customer.registration_number || '',
      industry: customer.industry || '',
      website: customer.website || '',
      notes: customer.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getOnboardingProgress = (customerId: string) => {
    const customerOnboarding = onboardingData.filter(o => o.customer_id === customerId);
    if (customerOnboarding.length === 0) return null;
    const completed = customerOnboarding.filter(o => o.status === 'completed').length;
    return { completed, total: customerOnboarding.length, percent: (completed / customerOnboarding.length) * 100 };
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  // Show customer detail view if selected
  if (selectedCustomerId) {
    return (
      <CustomerDetailView 
        customerId={selectedCustomerId} 
        onBack={() => setSelectedCustomerId(null)} 
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>CRM - Customers</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          CRM - Customers
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" />Add Customer</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Customer/Company Name *</Label>
                  <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company_type">Company Type</Label>
                    <Input id="company_type" value={formData.company_type} onChange={(e) => setFormData({ ...formData, company_type: e.target.value })} placeholder="e.g., LLC, Corporation" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="registration_number">Registration Number</Label>
                    <Input id="registration_number" value={formData.registration_number} onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input id="industry" value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="https://" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={2} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tax_id">Tax ID</Label>
                    <Input id="tax_id" value={formData.tax_id} onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment_terms">Payment Terms (days)</Label>
                    <Input id="payment_terms" type="number" value={formData.payment_terms} onChange={(e) => setFormData({ ...formData, payment_terms: parseInt(e.target.value) || 30 })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="credit_limit">Credit Limit</Label>
                    <Input id="credit_limit" type="number" step="0.01" value={formData.credit_limit} onChange={(e) => setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingCustomer ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>KYC Status</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {searchTerm ? 'No customers match your search' : 'No customers found'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((customer) => {
                  const kycConfig = kycStatusConfig[customer.kyc_status] || kycStatusConfig.pending;
                  const KycIcon = kycConfig.icon;
                  const onboardingProgress = getOnboardingProgress(customer.id);
                  
                  return (
                    <TableRow 
                      key={customer.id} 
                      className={`${!customer.is_active ? 'opacity-50' : ''} cursor-pointer hover:bg-muted/50`}
                      onClick={() => setSelectedCustomerId(customer.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-full bg-muted">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            {customer.industry && (
                              <p className="text-xs text-muted-foreground">{customer.industry}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          {customer.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{customer.email}</span>}
                          {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={kycConfig.color} className="flex items-center gap-1 w-fit">
                          <KycIcon className="w-3 h-3" />
                          {customer.kyc_status || 'pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {onboardingProgress ? (
                          <div className="w-32">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span>{onboardingProgress.completed}/{onboardingProgress.total}</span>
                              <span>{Math.round(onboardingProgress.percent)}%</span>
                            </div>
                            <Progress value={onboardingProgress.percent} className="h-1.5" />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not started</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline"
                          className={
                            customer.risk_level === 'low' ? 'border-indigo-500 text-indigo-600' :
                            customer.risk_level === 'high' ? 'border-red-500 text-red-600' :
                            'border-amber-500 text-amber-600'
                          }
                        >
                          <Shield className="w-3 h-3 mr-1" />
                          {customer.risk_level || 'medium'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" onClick={() => setSelectedCustomerId(customer.id)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleEdit(customer)}>
                            <Edit className="w-4 h-4" />
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
