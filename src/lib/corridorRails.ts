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

/** Code default when no collect policy is saved. */
export const DEFAULT_COLLECT_PARTNER: Record<string, string> = {
  CAD: "square",
  USD: "square",
  EUR: "square",
  GBP: "square",
  NGN: "fincra",
  GHS: "fincra",
  KES: "fincra",
  UGX: "fincra",
  TZS: "fincra",
  ZMW: "fincra",
  ZAR: "fincra",
  XAF: "fincra",
  XOF: "fincra",
  MWK: "fincra",
  RWF: "paytota",
};

export function defaultCollectPartner(currency: string): string | null {
  return DEFAULT_COLLECT_PARTNER[currency.toUpperCase()] || null;
}

/** Map a collect partner / method onto TopUpPage method ids. */
export function collectPayMethodIds(partnerOrMethod: string): string[] {
  const raw = partnerOrMethod.trim().toLowerCase();
  const method = collectMethodForPartner(raw) || raw;
  if (method === "square" || method === "paypal") return ["square"];
  if (method === "interac") return ["interac", "plaid"];
  if (method === "flutterwave") return ["flw_hosted", "flw_momo"];
  if (method === "wise") return ["wise", "wise_link"];
  if (method === "ghana") return ["ghana"];
  if (method === "elicate") return ["elicate"];
  if (method === "lenhub") return ["lenhub"];
  return [method];
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
      // Never use .single() here — PostgREST returns 406 when RETURNING is empty.
      if (row.id) {
        const { data, error } = await supabase
          .from("corridor_rail_policies" as never)
          .update(payload as never)
          .eq("id", row.id)
          .select("*");
        if (error) throw new Error(error.message || error.code || "Update blocked");
        const updated = Array.isArray(data) ? data[0] : data;
        if (updated) return updated as CorridorRailPolicy;
      }

      const { data, error } = await supabase
        .from("corridor_rail_policies" as never)
        .upsert(payload as never, { onConflict: "direction,country_code,currency_code" })
        .select("*");
      if (error) throw new Error(error.message || error.code || "Save blocked");
      const saved = Array.isArray(data) ? data[0] : data;
      if (saved) return saved as CorridorRailPolicy;
      if (row.id) return { ...payload, id: row.id } as CorridorRailPolicy;
      throw new Error("Save did not return a row — try again, or check you are still signed in as admin.");
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
): Promise<{ method: string | null; rails: string[]; source: "policy" | "default" | "none" }> {
  const ccy = currency.toUpperCase();
  const cc = (country || "").toUpperCase();
  const { data: exact } = cc
    ? await supabase
      .from("corridor_rail_policies" as never)
      .select("*")
      .eq("direction", "collect")
      .eq("currency_code", ccy)
      .eq("country_code", cc)
      .eq("enabled", true)
      .maybeSingle()
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
  if (!row) {
    const { data: anyRow } = await supabase
      .from("corridor_rail_policies" as never)
      .select("*")
      .eq("direction", "collect")
      .eq("currency_code", ccy)
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();
    row = anyRow as CorridorRailPolicy | null;
  }
  if (row) {
    const rails = [row.preferred_partner, ...(row.failover_partners || [])]
      .map((r) => r.toLowerCase())
      .filter(Boolean);
    const method = collectMethodForPartner(rails[0] || "");
    return { method, rails, source: "policy" };
  }
  const fallback = defaultCollectPartner(ccy);
  if (fallback) {
    return { method: collectMethodForPartner(fallback) || fallback, rails: [fallback], source: "default" };
  }
  return { method: null, rails: [], source: "none" };
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
