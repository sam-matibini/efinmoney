import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export interface ApiPartner {
  id: string;
  name: string;
  contact_email: string | null;
  status: string;
  tier: string;
  rate_limit_per_min: number;
  allowed_endpoints: string[];
  notes: string | null;
  created_at: string;
}

export interface ApiPartnerKey {
  id: string;
  partner_id: string;
  key_prefix: string;
  label: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiRequestLog {
  id: string;
  partner_id: string | null;
  endpoint: string;
  method: string;
  status_code: number;
  latency_ms: number | null;
  ip: string | null;
  error: string | null;
  created_at: string;
}

const table = (name: string) => supabase.from(name as never);

export const useApiPartners = () =>
  useQuery({
    queryKey: ["api-partners"],
    queryFn: async (): Promise<ApiPartner[]> => {
      const { data, error } = await table("api_partners")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ApiPartner[];
    },
  });

export const useApiPartnerKeys = () =>
  useQuery({
    queryKey: ["api-partner-keys"],
    queryFn: async (): Promise<ApiPartnerKey[]> => {
      const { data, error } = await table("api_partner_keys")
        .select("id, partner_id, key_prefix, label, last_used_at, revoked_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ApiPartnerKey[];
    },
  });

export const useApiRequestLogs = (partnerId?: string) =>
  useQuery({
    queryKey: ["api-request-logs", partnerId ?? "all"],
    queryFn: async (): Promise<ApiRequestLog[]> => {
      let q = table("api_request_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ApiRequestLog[];
    },
  });

export const useSaveApiPartner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ApiPartner> & { name: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { error } = await table("api_partners").update(rest as never).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await table("api_partners")
        .insert(rest as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-partners"] }),
  });
};

export const useDeleteApiPartner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await table("api_partners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-partners"] });
      qc.invalidateQueries({ queryKey: ["api-partner-keys"] });
    },
  });
};

export const useIssueApiKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { partner_id: string; label?: string; env?: "live" | "test" }) =>
      invokeEdgeFunction<{ key: string }>("api-partner-key-create", { ...args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-partner-keys"] }),
  });
};

export const useRevokeApiKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await table("api_partner_keys")
        .update({ revoked_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-partner-keys"] }),
  });
};
