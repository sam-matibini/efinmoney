import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as unknown as { from: (t: string) => any };

export interface RouteCandidate {
  partner_id: string;
  partner_code: string;
  partner_name: string;
  function_slug: string | null;
  est_minutes: number | null;
  success_rate: number | null;
  total_cost: number;
  customer_revenue: number;
  expected_profit: number;
  margin_percent: number;
  score: number;
  pricing_missing: boolean;
}

export interface RouteQuote {
  success: boolean;
  mode: "shadow" | "live" | "simulation";
  kill_switch: boolean;
  live_corridor: boolean;
  rule: { id: string; name: string } | null;
  recommended: RouteCandidate | null;
  candidates: RouteCandidate[];
  excluded: Array<{ partner_code: string; reason: string }>;
  overrides: Array<{ type: string; partner_code: string; reason: string | null }>;
}

export interface RoutingOverride {
  id: string;
  override_type: "pin" | "block";
  partner_id: string;
  direction: string;
  source_currency: string | null;
  dest_currency: string | null;
  dest_country: string | null;
  payment_method: string | null;
  reason: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface RoutingAttempt {
  id: string;
  transfer_id: string | null;
  partner_code: string | null;
  function_slug: string | null;
  attempt_number: number;
  outcome: string;
  retryable: boolean;
  provider_reference: string | null;
  error_message: string | null;
  latency_ms: number | null;
  created_at: string;
}

/* --------------------------------- quote -------------------------------- */

export const useRouteQuote = () =>
  useMutation({
    mutationFn: async (body: {
      source_currency: string;
      dest_currency: string;
      dest_country?: string | null;
      payment_method?: string | null;
      amount: number;
      log?: boolean;
    }): Promise<RouteQuote> => {
      const { data, error } = await supabase.functions.invoke("routing-quote", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as RouteQuote;
    },
    onError: (e: Error) => toast.error(e.message),
  });

/* ------------------------------- decisions ------------------------------ */

export const useRoutingDecisions = (limit = 50) =>
  useQuery({
    queryKey: ["routing_decisions", limit],
    queryFn: async () => {
      const { data, error } = await db
        .from("routing_decisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
  });

/* -------------------------------- attempts ------------------------------ */

export const useRoutingAttempts = (limit = 100) =>
  useQuery({
    queryKey: ["routing_attempts", limit],
    queryFn: async (): Promise<RoutingAttempt[]> => {
      const { data, error } = await db
        .from("routing_attempts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
  });

/* ------------------------------- overrides ------------------------------ */

export const useRoutingOverrides = () =>
  useQuery({
    queryKey: ["routing_overrides"],
    queryFn: async (): Promise<RoutingOverride[]> => {
      const { data, error } = await db
        .from("routing_overrides")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

export const useCreateRoutingOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<RoutingOverride>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db
        .from("routing_overrides")
        .insert({ ...row, created_by: auth?.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routing_overrides"] });
      toast.success("Override saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteRoutingOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("routing_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routing_overrides"] });
      toast.success("Override removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/* ----------------------------- live controls ---------------------------- */

export const useLiveCorridors = () =>
  useQuery({
    queryKey: ["partner_corridors_live"],
    queryFn: async () => {
      const { data, error } = await db
        .from("partner_corridors")
        .select("*, payment_partners(code, name)")
        .order("dest_country");
      if (error) throw error;
      return data || [];
    },
  });

export const useSetCorridorLive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, live }: { id: string; live: boolean }) => {
      const { error } = await db
        .from("partner_corridors")
        .update({ live_routing_enabled: live })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_corridors_live"] });
      qc.invalidateQueries({ queryKey: ["partner_corridors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useActiveRoutingRule = () =>
  useQuery({
    queryKey: ["routing_rule_active"],
    queryFn: async () => {
      const { data, error } = await db
        .from("routing_rules")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const useSetExecutionMode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { execution_mode?: "shadow" | "live"; kill_switch?: boolean };
    }) => {
      const { error } = await db.from("routing_rules").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routing_rule_active"] });
      qc.invalidateQueries({ queryKey: ["routing_rules"] });
      toast.success("Routing controls updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
