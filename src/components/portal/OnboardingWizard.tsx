import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerPortal } from "@/hooks/useCustomerPortal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Building2, 
  FileUp, 
  CheckCircle2, 
  Circle, 
  Clock, 
  XCircle,
  ArrowRight,
  ArrowLeft,
  Upload,
  File,
  
  PartyPopper,
  Shield
} from "lucide-react";
import { toast } from "sonner";

interface OnboardingStep {
  id: string;
  step_order: number;
  name: string;
  description: string | null;
  is_required: boolean;
  requires_document: boolean;
  document_type: string | null;
}

interface CustomerOnboarding {
  id: string;
  customer_id: string;
  step_id: string;
  status: string;
  completed_at: string | null;
  notes: string | null;
  step?: OnboardingStep;
}

const statusConfig: Record<string, { icon: typeof Circle; color: string }> = {
  pending: { icon: Circle, color: 'text-muted-foreground' },
  in_progress: { icon: Clock, color: 'text-amber-500' },
  completed: { icon: CheckCircle2, color: 'text-primary' },
  rejected: { icon: XCircle, color: 'text-destructive' },
};

export const OnboardingWizard = () => {
  const { user } = useAuth();
  const { customerId, customer } = useCustomerPortal();
  const queryClient = useQueryClient();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch onboarding progress
  const { data: onboarding = [], isLoading } = useQuery({
    queryKey: ['customer-onboarding', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_onboarding')
        .select(`*, step:onboarding_steps(*)`)
        .eq('customer_id', customerId)
        .order('created_at');
      if (error) throw error;
      return data as CustomerOnboarding[];
    },
    enabled: !!customerId,
  });

  // Update step mutation
  const updateStepMutation = useMutation({
    mutationFn: async ({ 
      onboardingId, 
      status,
      notes 
    }: { 
      onboardingId: string; 
      status: string;
      notes?: string;
    }) => {
      const updateData: Record<string, unknown> = { 
        status,
        notes,
        ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      };
      
      const { error } = await supabase
        .from('customer_onboarding')
        .update(updateData)
        .eq('id', onboardingId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      if (variables.status === 'completed' || variables.status === 'in_progress') {
        import('@/lib/analytics').then(({ track }) => track('kyc_submitted', { status: variables.status }));
      }
      queryClient.invalidateQueries({ queryKey: ['customer-onboarding', customerId] });
    },
  });

  // Upload document mutation
  const uploadDocMutation = useMutation({
    mutationFn: async ({ 
      file, 
      documentType,
      onboardingId 
    }: { 
      file: File; 
      documentType: string;
      onboardingId: string;
    }) => {
      const filePath = `${customerId}/${Date.now()}-${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;

      const { error } = await supabase.from('customer_documents').insert({
        customer_id: customerId,
        onboarding_id: onboardingId,
        document_type: documentType,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-documents', customerId] });
      toast.success('Document uploaded successfully');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Update customer info mutation
  const updateCustomerMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const { error } = await supabase
        .from('customers')
        .update(data)
        .eq('id', customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
    },
  });

  const sortedSteps = onboarding.sort((a, b) => 
    (a.step?.step_order || 0) - (b.step?.step_order || 0)
  );
  
  const currentStep = sortedSteps[currentStepIndex];
  const completedCount = sortedSteps.filter(s => s.status === 'completed').length;
  const progress = sortedSteps.length > 0 ? (completedCount / sortedSteps.length) * 100 : 0;
  const allCompleted = sortedSteps.every(s => s.status === 'completed');

  const handleNext = async () => {
    if (!currentStep) return;

    const step = currentStep.step;
    
    // Handle document upload step
    if (step?.requires_document && uploadedFile) {
      await uploadDocMutation.mutateAsync({
        file: uploadedFile,
        documentType: step.document_type || 'other',
        onboardingId: currentStep.id,
      });
      setUploadedFile(null);
    }

    // Handle company info step
    if (step?.name === 'Company Information' && Object.keys(formData).length > 0) {
      await updateCustomerMutation.mutateAsync(formData);
    }

    // Handle terms step
    if (step?.name === 'Terms & Agreement' && !termsAccepted) {
      toast.error('Please accept the terms and conditions');
      return;
    }

    // Mark step as completed (or in_progress if requires review)
    const newStatus = step?.requires_document ? 'in_progress' : 'completed';
    await updateStepMutation.mutateAsync({
      onboardingId: currentStep.id,
      status: newStatus,
    });

    // Move to next step
    if (currentStepIndex < sortedSteps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      setFormData({});
      setTermsAccepted(false);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (sortedSteps.length === 0) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Onboarding Not Started</h3>
          <p className="text-muted-foreground">
            Please contact us to begin your onboarding process.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (allCompleted) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
          >
            <PartyPopper className="w-16 h-16 mx-auto mb-4 text-primary" />
          </motion.div>
          <h3 className="text-2xl font-bold mb-2">Onboarding Complete!</h3>
          <p className="text-muted-foreground mb-4">
            Thank you for completing your onboarding. Our team will review your submission and get back to you shortly.
          </p>
          <Badge variant="default" className="text-sm">
            <Shield className="w-4 h-4 mr-1" />
            {customer?.kyc_status === 'approved' ? 'Verified' : 'Under Review'}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  const step = currentStep?.step;

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Onboarding Progress</h2>
              <p className="text-sm text-muted-foreground">
                Step {currentStepIndex + 1} of {sortedSteps.length}
              </p>
            </div>
            <Badge variant="outline" className="text-sm">
              {completedCount}/{sortedSteps.length} completed
            </Badge>
          </div>
          <Progress value={progress} className="h-2" />
          
          {/* Step indicators */}
          <div className="flex items-center justify-between mt-4 overflow-x-auto pb-2">
            {sortedSteps.map((s, index) => {
              const config = statusConfig[s.status] || statusConfig.pending;
              const Icon = config.icon;
              const isActive = index === currentStepIndex;
              
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentStepIndex(index)}
                  className={`flex flex-col items-center min-w-[80px] p-2 rounded-lg transition-colors ${
                    isActive ? 'bg-primary/10' : 'hover:bg-muted'
                  }`}
                >
                  <div className={`p-2 rounded-full ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    <Icon className={`w-4 h-4 ${!isActive ? config.color : ''}`} />
                  </div>
                  <span className={`text-xs mt-1 text-center ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                    {s.step?.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Current Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep?.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-primary/10">
                  {step?.requires_document ? (
                    <FileUp className="w-6 h-6 text-primary" />
                  ) : (
                    <Building2 className="w-6 h-6 text-primary" />
                  )}
                </div>
                <div>
                  <CardTitle>{step?.name}</CardTitle>
                  <CardDescription>{step?.description}</CardDescription>
                </div>
                {step?.is_required && (
                  <Badge variant="destructive" className="ml-auto">Required</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Company Information Step */}
              {step?.name === 'Company Information' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company_type">Company Type</Label>
                    <Input
                      id="company_type"
                      value={formData.company_type || ''}
                      onChange={(e) => setFormData({ ...formData, company_type: e.target.value })}
                      placeholder="e.g., LLC, Corporation, Partnership"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="registration_number">Registration Number</Label>
                    <Input
                      id="registration_number"
                      value={formData.registration_number || ''}
                      onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      value={formData.industry || ''}
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={formData.website || ''}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      placeholder="https://"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Business Address</Label>
                    <Textarea
                      id="address"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* Bank Account Details Step */}
              {step?.name === 'Bank Account Details' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank_name">Bank Name</Label>
                    <Input
                      id="bank_name"
                      value={formData.bank_name || ''}
                      onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account_number">Account Number</Label>
                    <Input
                      id="account_number"
                      value={formData.account_number || ''}
                      onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="routing_number">Routing Number</Label>
                    <Input
                      id="routing_number"
                      value={formData.routing_number || ''}
                      onChange={(e) => setFormData({ ...formData, routing_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="swift_code">SWIFT/BIC Code (if applicable)</Label>
                    <Input
                      id="swift_code"
                      value={formData.swift_code || ''}
                      onChange={(e) => setFormData({ ...formData, swift_code: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Document Upload Steps */}
              {step?.requires_document && (
                <div className="space-y-4">
                  <div 
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      uploadedFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                    />
                    {uploadedFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <File className="w-8 h-8 text-primary" />
                        <div className="text-left">
                          <p className="font-medium">{uploadedFile.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <CheckCircle2 className="w-6 h-6 text-primary ml-4" />
                      </div>
                    ) : (
                      <>
                        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="font-medium mb-1">Click to upload or drag and drop</p>
                        <p className="text-sm text-muted-foreground">
                          PDF, JPG, PNG, DOC or DOCX (max 20MB)
                        </p>
                      </>
                    )}
                  </div>
                  {currentStep?.status === 'in_progress' && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-700">
                      <Clock className="w-5 h-5" />
                      <span className="text-sm">Document uploaded and pending review</span>
                    </div>
                  )}
                  {currentStep?.status === 'rejected' && currentStep?.notes && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                      <XCircle className="w-5 h-5 mt-0.5" />
                      <div>
                        <p className="font-medium">Document rejected</p>
                        <p className="text-sm">{currentStep.notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Terms & Agreement Step */}
              {step?.name === 'Terms & Agreement' && (
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 max-h-64 overflow-y-auto bg-muted/30">
                    <h4 className="font-semibold mb-2">Terms of Service</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      By using our services, you agree to comply with all applicable laws and regulations. 
                      You understand that your information will be processed in accordance with our Privacy Policy.
                    </p>
                    <h4 className="font-semibold mb-2">Privacy Policy</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      We collect and process your personal information to provide our services and comply with 
                      regulatory requirements. Your data is stored securely and will not be shared with third 
                      parties without your consent, except as required by law.
                    </p>
                    <h4 className="font-semibold mb-2">Anti-Money Laundering (AML) Compliance</h4>
                    <p className="text-sm text-muted-foreground">
                      You confirm that all funds used in transactions through our platform are from legitimate 
                      sources and that you will not use our services for any illegal activities.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                    />
                    <label
                      htmlFor="terms"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      I have read and agree to the Terms of Service, Privacy Policy, and AML Compliance requirements
                    </label>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={currentStepIndex === 0}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={
                    updateStepMutation.isPending || 
                    uploadDocMutation.isPending ||
                    (step?.requires_document && !uploadedFile && currentStep?.status === 'pending') ||
                    (step?.name === 'Terms & Agreement' && !termsAccepted)
                  }
                >
                  {updateStepMutation.isPending || uploadDocMutation.isPending ? (
                    <LoadingSpinner size={16} className="mr-2" />
                  ) : null}
                  {currentStepIndex === sortedSteps.length - 1 ? 'Complete' : 'Continue'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
