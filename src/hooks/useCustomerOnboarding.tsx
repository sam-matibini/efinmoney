import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OnboardingStep {
  id: string;
  step_order: number;
  name: string;
  description: string | null;
  is_required: boolean;
  requires_document: boolean;
  document_type: string | null;
  is_active: boolean;
}

export interface CustomerOnboarding {
  id: string;
  customer_id: string;
  step_id: string;
  status: string;
  completed_at: string | null;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  step?: OnboardingStep;
}

export const useOnboardingSteps = () => {
  return useQuery({
    queryKey: ['onboarding-steps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_steps')
        .select('*')
        .eq('is_active', true)
        .order('step_order');
      if (error) throw error;
      return data as OnboardingStep[];
    },
  });
};

export const useCustomerOnboarding = (customerId: string) => {
  const queryClient = useQueryClient();

  const onboardingQuery = useQuery({
    queryKey: ['customer-onboarding', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_onboarding')
        .select(`
          *,
          step:onboarding_steps(*)
        `)
        .eq('customer_id', customerId)
        .order('created_at');
      if (error) throw error;
      return data as CustomerOnboarding[];
    },
    enabled: !!customerId,
  });

  const initializeOnboarding = useMutation({
    mutationFn: async (steps: OnboardingStep[]) => {
      const records = steps.map(step => ({
        customer_id: customerId,
        step_id: step.id,
        status: 'pending',
      }));
      
      const { error } = await supabase.from('customer_onboarding').insert(records);
      if (error) throw error;

      // Update customer onboarding_started_at
      await supabase
        .from('customers')
        .update({ onboarding_started_at: new Date().toISOString() })
        .eq('id', customerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-onboarding', customerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Onboarding initialized');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateStepStatus = useMutation({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-onboarding', customerId] });
      toast.success('Step updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reviewStep = useMutation({
    mutationFn: async ({ 
      onboardingId, 
      approved,
      notes 
    }: { 
      onboardingId: string; 
      approved: boolean;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('customer_onboarding')
        .update({ 
          status: approved ? 'completed' : 'rejected',
          completed_at: approved ? new Date().toISOString() : null,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          notes,
        })
        .eq('id', onboardingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-onboarding', customerId] });
      toast.success('Step reviewed');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const completedSteps = onboardingQuery.data?.filter(o => o.status === 'completed').length || 0;
  const totalSteps = onboardingQuery.data?.length || 0;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return {
    onboarding: onboardingQuery.data || [],
    isLoading: onboardingQuery.isLoading,
    initializeOnboarding: initializeOnboarding.mutate,
    updateStepStatus: updateStepStatus.mutate,
    reviewStep: reviewStep.mutate,
    progress,
    completedSteps,
    totalSteps,
    isPending: initializeOnboarding.isPending || updateStepStatus.isPending,
  };
};
