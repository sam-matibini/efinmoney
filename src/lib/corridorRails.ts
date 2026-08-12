import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RailDirection = "collect" | "payout";

export type CorridorRailPolicy = {
  id: string;
  direction: RailDirection;
  country_code: string;
  currency_code: string;
  preferred_partner: string;
  failover_partners: string[];
  enabled: boolean;
  notes: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export const RAIL_OPTIONS = [
  "fincra",
  "nomba",
  "flovide",
  "flutterwave",
  "lenhub_flutter",
  "paytota",
  "swychr",
  "ghana_pay",
  "elicate",
  "dodo",
  "square",
  "paypal",
  "wise",
  "interac",
] as const;

const COLLECT_METHOD: Record<string, string> = {
  fincra: "fincra",
  nomba: "nomba",
  flovide: "interac",
  interac: "interac",
  flutterwave: "flutterwave",
  paytota: "paytota",
  swychr: "swychr",
  dodo: "dodo",
  square: "square",
  paypal: "paypal",
  wise: "wise",
  ghana_pay: "ghana",
  elicate: "elicate",
  lenhub_flutter: "lenhub",
};

export function collectMethodForPartner(partner: string): string | null {
  return COLLECT_METHOD[partner.trim().toLowerCase()] || null;
}

export function useCorridorRailPolicies() {
  return useQuery({
    queryKey: ["corridor_rail_policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corridor_rail_policies" as never)
        .select("*")
        .order("direction")
        .order("currency_code");
      if (error) throw error;
      return (data || []) as CorridorRailPolicy[];
    },
  });
}

export function useSaveCorridorRailPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<CorridorRailPolicy> & {
      direction: RailDirection;
      currency_code: string;
      preferred_partner: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        direction: row.direction,
        country_code: (row.country_code || "").toUpperCase(),
        currency_code: row.currency_code.toUpperCase(),
        preferred_partner: row.preferred_partner.toLowerCase(),
        failover_partners: (row.failover_partners || []).map((p) => p.toLowerCase()),
        enabled: row.enabled !== false,
        notes: row.notes || null,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      };
      if (row.id) {
        const { data, error } = await supabase
          .from("corridor_rail_policies" as never)
          .update(payload as never)
          .eq("id", row.id)
          .select("*")
          .single();
        if (error) throw new Error(error.message || error.code || "Update blocked");
        return data as CorridorRailPolicy;
      }
      const { data, error } = await supabase
        .from("corridor_rail_policies" as never)
        .insert(payload as never)
        .select("*")
        .single();
      if (error) throw new Error(error.message || error.code || "Insert blocked");
      return data as CorridorRailPolicy;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corridor_rail_policies"] }),
  });
}

export function useDeleteCorridorRailPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("corridor_rail_policies" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corridor_rail_policies"] }),
  });
}

/** Resolve preferred collect method for a currency (client-side). */
export async function resolveCollectMethodPreference(
  currency: string,
  country?: string,
): Promise<{ method: string | null; rails: string[]; source: "policy" | "none" }> {
  const ccy = currency.toUpperCase();
  const cc = (country || "").toUpperCase();
  let q = supabase
    .from("corridor_rail_policies" as never)
    .select("*")
    .eq("direction", "collect")
    .eq("currency_code", ccy)
    .eq("enabled", true);
  const { data: exact } = cc
    ? await q.eq("country_code", cc).maybeSingle()
    : { data: null };
  let row = exact as CorridorRailPolicy | null;
  if (!row) {
    const { data } = await supabase
      .from("corridor_rail_policies" as never)
      .select("*")
      .eq("direction", "collect")
      .eq("currency_code", ccy)
      .eq("country_code", "")
      .eq("enabled", true)
      .maybeSingle();
    row = data as CorridorRailPolicy | null;
  }
  if (!row) return { method: null, rails: [], source: "none" };
  const rails = [row.preferred_partner, ...(row.failover_partners || [])]
    .map((r) => r.toLowerCase())
    .filter(Boolean);
  const method = collectMethodForPartner(rails[0] || "");
  return { method, rails, source: "policy" };
}

/** Best-effort ops email for collect/top-up failures. */
export async function notifyOpsCollectFailure(details: Record<string, string | number | null | undefined>) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ops-alert`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: `[Ops] Top-up issue — ${details.currency || details.rail || "collect"}`,
        headline: "Collect / top-up failure",
        details,
      }),
    });
  } catch {
    /* ignore */
  }
}
