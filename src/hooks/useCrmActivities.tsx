import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CrmActivity {
  id: string;
  customer_id: string;
  activity_type: string;
  subject: string;
  description: string | null;
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useCrmActivities = (customerId?: string) => {
  const queryClient = useQueryClient();

  const activitiesQuery = useQuery({
    queryKey: ['crm-activities', customerId],
    queryFn: async () => {
      let query = supabase
        .from('crm_activities')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (customerId) {
        query = query.eq('customer_id', customerId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as CrmActivity[];
    },
  });

  const createActivity = useMutation({
    mutationFn: async (activity: Omit<CrmActivity, 'id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase.from('crm_activities').insert(activity);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
      toast.success('Activity created');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateActivity = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CrmActivity> & { id: string }) => {
      const { error } = await supabase.from('crm_activities').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
      toast.success('Activity updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const completeActivity = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_activities')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
      toast.success('Activity marked as complete');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    activities: activitiesQuery.data || [],
    isLoading: activitiesQuery.isLoading,
    createActivity: createActivity.mutate,
    updateActivity: updateActivity.mutate,
    completeActivity: completeActivity.mutate,
    isPending: createActivity.isPending || updateActivity.isPending,
  };
};
