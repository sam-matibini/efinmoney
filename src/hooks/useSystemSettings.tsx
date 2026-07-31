import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type SystemSettings = Record<string, unknown>;

/** Supabase returns plain error objects, not Error instances — normalize so UI toasts show the cause. */
const toError = (error: unknown, fallback: string): Error => {
  if (error instanceof Error) return error;
  const e = error as { message?: string; code?: string; details?: string; hint?: string } | null;
  const parts = [e?.message, e?.details, e?.hint].filter(Boolean).join(' — ');
  const err = new Error(parts || fallback);
  if (e?.code) err.name = `PostgrestError ${e.code}`;
  console.error('[system_settings]', error);
  return err;
};

/** Key/value system settings stored in public.system_settings. */
export const useSystemSettings = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['system-settings'],
    queryFn: async (): Promise<SystemSettings> => {
      const { data, error } = await supabase.from('system_settings').select('key, value');
      if (error) throw toError(error, 'Could not load settings');
      return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    },
    staleTime: 5 * 60_000,
  });

  const saveSettings = useMutation({
    mutationFn: async (values: SystemSettings) => {
      if (!user?.id) throw new Error('You must be signed in to change settings.');
      const rows = Object.entries(values)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => ({
          key,
          value: (typeof value === 'number' && !Number.isFinite(value) ? null : value) as never,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }));
      if (rows.length === 0) return;
      const { error } = await supabase.from('system_settings').upsert(rows, { onConflict: 'key' });
      if (error) throw toError(error, 'Could not save settings');
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
