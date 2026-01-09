import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeft, 
  Building2, 
  Mail, 
  Phone, 
  MapPin, 
  Globe,
  Calendar,
  Shield,
  Edit,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { CrmActivitiesPanel } from "./CrmActivitiesPanel";
import { OnboardingProgressPanel } from "./OnboardingProgressPanel";
import { CustomerDocumentsPanel } from "./CustomerDocumentsPanel";
import { toast } from "sonner";
import { format } from "date-fns";

interface CustomerDetailViewProps {
  customerId: string;
  onBack: () => void;
}

const kycStatuses = [
  { value: 'pending', label: 'Pending', color: 'secondary' },
  { value: 'in_review', label: 'In Review', color: 'secondary' },
  { value: 'approved', label: 'Approved', color: 'default' },
  { value: 'rejected', label: 'Rejected', color: 'destructive' },
];

const riskLevels = [
  { value: 'low', label: 'Low Risk', color: 'text-green-600' },
  { value: 'medium', label: 'Medium Risk', color: 'text-amber-600' },
  { value: 'high', label: 'High Risk', color: 'text-red-600' },
];

export const CustomerDetailView = ({ customerId, onBack }: CustomerDetailViewProps) => {
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { error } = await supabase
        .from('customers')
        .update(data)
        .eq('id', customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer updated');
      setIsEditOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approveKyc = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('customers')
        .update({
          kyc_status: 'approved',
          kyc_verified_at: new Date().toISOString(),
          kyc_verified_by: user?.id,
        })
        .eq('id', customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      toast.success('KYC approved');
    },
  });

  const handleEdit = () => {
    if (customer) {
      setEditData({
        company_type: customer.company_type || '',
        registration_number: customer.registration_number || '',
        industry: customer.industry || '',
        website: customer.website || '',
        risk_level: customer.risk_level || 'medium',
        notes: customer.notes || '',
      });
      setIsEditOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading customer details...
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Customer not found
      </div>
    );
  }

  const kycStatus = kycStatuses.find(s => s.value === customer.kyc_status) || kycStatuses[0];
  const riskLevel = riskLevels.find(r => r.value === customer.risk_level) || riskLevels[1];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{customer.name}</h2>
            <Badge variant={kycStatus.color as 'default' | 'secondary' | 'destructive'}>
              KYC: {kycStatus.label}
            </Badge>
            {!customer.is_active && (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Customer since {format(new Date(customer.created_at), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleEdit}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Details
          </Button>
          {customer.kyc_status !== 'approved' && (
            <Button onClick={() => approveKyc.mutate()} disabled={approveKyc.isPending}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve KYC
            </Button>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Contact Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {customer.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span>{customer.email}</span>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                <span>{customer.address}</span>
              </div>
            )}
            {customer.website && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <a href={customer.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {customer.website}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Company Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Company Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {customer.company_type && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span>{customer.company_type}</span>
              </div>
            )}
            {customer.registration_number && (
              <div className="text-sm">
                <span className="text-muted-foreground">Reg #:</span> {customer.registration_number}
              </div>
            )}
            {customer.tax_id && (
              <div className="text-sm">
                <span className="text-muted-foreground">Tax ID:</span> {customer.tax_id}
              </div>
            )}
            {customer.industry && (
              <div className="text-sm">
                <span className="text-muted-foreground">Industry:</span> {customer.industry}
              </div>
            )}
            {customer.date_of_incorporation && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>Founded {format(new Date(customer.date_of_incorporation), 'MMM yyyy')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Risk & Compliance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Risk & Compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className={`text-sm font-medium ${riskLevel.color}`}>
                {riskLevel.label}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Credit Limit:</span>{' '}
              <span className="font-mono">{customer.currency_code} {Number(customer.credit_limit).toFixed(2)}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Payment Terms:</span> {customer.payment_terms} days
            </div>
            {customer.kyc_verified_at && (
              <div className="text-sm text-primary flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                KYC verified {format(new Date(customer.kyc_verified_at), 'MMM d, yyyy')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="activities" className="space-y-4">
        <TabsList>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="activities">
          <CrmActivitiesPanel customerId={customerId} />
        </TabsContent>

        <TabsContent value="onboarding">
          <OnboardingProgressPanel customerId={customerId} />
        </TabsContent>

        <TabsContent value="documents">
          <CustomerDocumentsPanel customerId={customerId} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Customer Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Type</Label>
                <Input
                  value={editData.company_type as string || ''}
                  onChange={(e) => setEditData({ ...editData, company_type: e.target.value })}
                  placeholder="e.g., LLC, Corporation"
                />
              </div>
              <div className="space-y-2">
                <Label>Registration Number</Label>
                <Input
                  value={editData.registration_number as string || ''}
                  onChange={(e) => setEditData({ ...editData, registration_number: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input
                  value={editData.industry as string || ''}
                  onChange={(e) => setEditData({ ...editData, industry: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Risk Level</Label>
                <Select
                  value={editData.risk_level as string || 'medium'}
                  onValueChange={(v) => setEditData({ ...editData, risk_level: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {riskLevels.map(level => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={editData.website as string || ''}
                onChange={(e) => setEditData({ ...editData, website: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editData.notes as string || ''}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => updateMutation.mutate(editData)}
                disabled={updateMutation.isPending}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
