import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type AppRole = 'admin' | 'user' | 'finance' | 'compliance';

export const useUserRoles = () => {
  const { user } = useAuth();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async (): Promise<AppRole[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user roles:', error);
        return [];
      }

      return (data || []).map(r => r.role as AppRole);
    },
    enabled: !!user,
  });

  const hasRole = (role: AppRole) => roles.includes(role);
  const hasAnyRole = (...checkRoles: AppRole[]) => checkRoles.some(r => roles.includes(r));
  const isAdmin = hasRole('admin');
  const isFinance = hasAnyRole('admin', 'finance');
  const isCompliance = hasAnyRole('admin', 'compliance');

  return {
    roles,
    isLoading,
    hasRole,
    hasAnyRole,
    isAdmin,
    isFinance,
    isCompliance,
  };
};
