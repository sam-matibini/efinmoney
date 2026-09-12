import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { isPostgrestSchemaCacheError } from '@/lib/postgrestErrors';

const PROFILE_COLUMNS =
  "user_id, full_name, email, phone_number, kyc_status, kyc_tier, default_currency, country_code, risk_score, account_number, efin_tag, avatar_url, kyc_framework_version, street_address, city, state_province, postal_code, address_country, date_of_birth, occupation";

export interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  kyc_status: string;
  kyc_tier: string;
  default_currency: string | null;
  country_code: string | null;
  risk_score: number | null;
  account_number: string | null;
  efin_tag: string | null;
  avatar_url: string | null;
  kyc_framework_version: number | null;
  street_address: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  address_country: string | null;
  date_of_birth: string | null;
  occupation: string | null;
  interac_email: string | null;
}

export const useProfile = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const metaInterac = String(
        (user.user_metadata as { interac_email?: string | null } | undefined)?.interac_email || "",
      ).trim() || null;

      let { data, error } = await supabase
        .from('profiles')
        .select(`${PROFILE_COLUMNS}, interac_email`)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && isPostgrestSchemaCacheError(error)) {
        const retry = await supabase
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .eq('user_id', user.id)
          .maybeSingle();
        data = retry.data as typeof data;
        error = retry.error;
      }
      if (error) throw error;
      if (!data) return null;
      const row = data as Profile;
      return {
        ...row,
        interac_email: row.interac_email || metaInterac,
      };
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
};
