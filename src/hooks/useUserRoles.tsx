import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type AppRole = 'admin' | 'user' | 'finance' | 'compliance';

export const useUserRoles = () => {
  const { user } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user) return { roles: [] as AppRole[], adminPortalRole: null as string | null, adminActive: false };

      const [rolesRes, adminRes] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id),
        supabase.from('admin_users').select('role, status').eq('id', user.id).maybeSingle(),
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (adminRes.error) throw adminRes.error;

      const roles = (rolesRes.data || []).map((r) => r.role as AppRole);
      const adminActive = adminRes.data?.status === 'active';
      const adminPortalRole = adminActive ? (adminRes.data?.role ?? null) : null;

      return { roles, adminPortalRole, adminActive };
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const roles = data?.roles ?? [];
  const adminPortalRole = data?.adminPortalRole ?? null;

  const hasRole = (role: AppRole) => roles.includes(role);
  const hasAnyRole = (...checkRoles: AppRole[]) => checkRoles.some((r) => roles.includes(r));
  const isSuperAdmin = adminPortalRole === 'super_admin';
  const isAdmin = hasRole('admin') || isSuperAdmin;
  const isFinance = hasAnyRole('admin', 'finance') || isSuperAdmin || adminPortalRole === 'finance_officer';
  const isCompliance = hasAnyRole('admin', 'compliance') || isSuperAdmin || adminPortalRole === 'compliance_officer';

  return {
    roles,
    isLoading,
    isError,
    refetch,
    hasRole,
    hasAnyRole,
    isAdmin,
    isFinance,
    isCompliance,
    isSuperAdmin,
  };
};
