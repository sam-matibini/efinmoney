import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type SystemSettings = Record<string, unknown>;

/** Key/value system settings stored in public.system_settings. */
export const useSystemSettings = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['system-settings'],
    queryFn: async (): Promise<SystemSettings> => {
      const { data, error } = await supabase.from('system_settings').select('key, value');
      if (error) throw error;
      return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    },
    staleTime: 5 * 60_000,
  });

  const saveSettings = useMutation({
    mutationFn: async (values: SystemSettings) => {
      const rows = Object.entries(values).map(([key, value]) => ({
        key,
        value: value as never,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('system_settings').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
    },
  });

  const getString = (key: string, fallback = ''): string => {
    const v = query.data?.[key];
    return typeof v === 'string' ? v : fallback;
  };

  const getNumber = (key: string, fallback = 0): number => {
    const v = query.data?.[key];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return fallback;
  };

  const getBoolean = (key: string, fallback = false): boolean => {
    const v = query.data?.[key];
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return fallback;
  };

  return { ...query, settings: query.data, getString, getNumber, getBoolean, saveSettings };
};
