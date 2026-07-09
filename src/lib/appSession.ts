import { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SESSION_QUERY_KEYS = {
  profile: (userId: string) => ["profile", userId] as const,
  roles: (userId: string) => ["user-roles", userId] as const,
  wallets: (userId: string) => ["wallets", userId] as const,
  fxRates: () => ["fx_rates"] as const,
};

/** Parallel prefetch of session-stable data after auth. */
export async function prefetchAppSession(queryClient: QueryClient, userId: string) {
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: SESSION_QUERY_KEYS.profile(userId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "user_id, full_name, email, phone_number, kyc_status, kyc_tier, default_currency, country_code, risk_score, account_number, efin_tag, avatar_url, kyc_framework_version, street_address, city, state_province, postal_code, address_country",
          )
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      staleTime: 5 * 60_000,
    }),
    queryClient.prefetchQuery({
      queryKey: SESSION_QUERY_KEYS.roles(userId),
      queryFn: async () => {
        const [rolesRes, adminRes] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", userId),
          supabase.from("admin_users").select("role, status").eq("id", userId).maybeSingle(),
        ]);
        if (rolesRes.error) throw rolesRes.error;
        const roles = (rolesRes.data || []).map((r) => r.role);
        const adminActive = adminRes.data?.status === "active";
        const adminPortalRole = adminActive ? (adminRes.data?.role ?? null) : null;
        return { roles, adminPortalRole, adminActive };
      },
      staleTime: 5 * 60_000,
    }),
    queryClient.prefetchQuery({
      queryKey: SESSION_QUERY_KEYS.wallets(userId),
      queryFn: async () => {
        const { data, error } = await supabase.rpc("get_user_wallet_balances", { p_user_id: userId });
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 5 * 60_000,
    }),
    queryClient.prefetchQuery({
      queryKey: SESSION_QUERY_KEYS.fxRates(),
      queryFn: async () => {
        const { data, error } = await supabase
          .from("fx_rates")
          .select("*")
          .or("valid_until.is.null,valid_until.gt." + new Date().toISOString())
          .order("valid_from", { ascending: false })
          .limit(500);
        if (error) throw error;
        const seen = new Set<string>();
        const latest: typeof data = [];
        for (const r of data || []) {
          const key = `${r.from_currency}->${r.to_currency}`;
          if (!seen.has(key)) {
            seen.add(key);
            latest.push(r);
          }
        }
        return latest.sort((a, b) => a.from_currency.localeCompare(b.from_currency));
      },
      staleTime: 60_000,
    }),
  ]);
}
