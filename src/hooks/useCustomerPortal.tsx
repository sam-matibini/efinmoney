import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface CustomerPortalAccess {
  id: string;
  customer_id: string;
  user_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  customer?: {
    id: string;
    name: string;
    email: string | null;
    kyc_status: string | null;
    onboarding_started_at: string | null;
    onboarding_completed_at: string | null;
  };
}

export const useCustomerPortal = () => {
  const { user } = useAuth();

  const portalAccessQuery = useQuery({
    queryKey: ['customer-portal-access', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('customer_portal_access')
        .select(`
          *,
          customer:customers(id, name, email, kyc_status, onboarding_started_at, onboarding_completed_at)
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      return data as CustomerPortalAccess | null;
    },
    enabled: !!user,
  });

  return {
    portalAccess: portalAccessQuery.data,
    isLoading: portalAccessQuery.isLoading,
    hasAccess: !!portalAccessQuery.data,
    customerId: portalAccessQuery.data?.customer_id,
    customer: portalAccessQuery.data?.customer,
  };
};
