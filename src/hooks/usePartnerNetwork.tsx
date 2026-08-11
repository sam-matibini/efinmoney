import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// The partner network schema is broad; use a loose accessor to keep generated
// type instantiation shallow (the project schema is very large).
const db = supabase as unknown as { from: (t: string) => any };

export type PartnerDirection = "payin" | "payout" | "both";
export type PartnerOpStatus = "active" | "inactive" | "suspended" | "pending";
export type PartnerFeeType = "fixed" | "percentage" | "hybrid" | "tiered";
export type PricingSource = "api" | "file" | "manual" | "partner_portal";
export type RoutingStrategy =
  | "lowest_cost"
  | "highest_profit"
  | "highest_expected_profit"
  | "best_overall";

export interface PaymentPartner {
  id: string;
  code: string;
  /** Human reference (EFN####), auto-assigned by the database. */
  partner_ref: string | null;
  name: string;
  direction: PartnerDirection;
  country: string | null;
  regulatory_status: string | null;
  api_status: PartnerOpStatus;
  integration_status: PartnerOpStatus;
  settlement_currency: string | null;
  supported_currencies: string[];
  supported_countries: string[];
  payment_methods: string[];
  payin_function_slug: string | null;
  payout_function_slug: string | null;
  quote_function_slug: string | null;
  min_transaction: number | null;
  max_transaction: number | null;
  daily_limit: number | null;
  monthly_limit: number | null;
  settlement_time: string | null;
  reliability_score: number;
  compliance_risk: "low" | "medium" | "high";
  priority: number;
  status: PartnerOpStatus;
  notes: string | null;
  statement_mapping?: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}


export interface PartnerCorridor {
  id: string;
  partner_id: string;
  direction: PartnerDirection;
  source_country: string | null;
  dest_country: string;
  source_currency: string;
  dest_currency: string;
  payment_method: string;
  enabled: boolean;
  est_minutes: number | null;
}

export interface PartnerPricing {
  id: string;
  partner_id: string;
  direction: PartnerDirection;
  source_country: string | null;
  dest_country: string | null;
  source_currency: string;
  dest_currency: string;
  payment_method: string;
  fee_type: PartnerFeeType;
  fixed_fee: number;
  percentage_fee: number;
  min_fee: number | null;
  max_fee: number | null;
  fx_markup_bps: number;
  settlement_fee: number;
  network_fee: number;
  compliance_fee: number;
  fee_currency: string | null;
  effective_from: string;
  effective_to: string | null;
  source: PricingSource;
  source_reference: string | null;
  created_at: string;
}

export interface PartnerFxRate {
  id: string;
  partner_id: string;
  base_currency: string;
  quote_currency: string;
  partner_rate: number;
  mid_market_rate: number | null;
  fx_spread_bps: number | null;
  rate_timestamp: string;
  expires_at: string | null;
  source: PricingSource;
}

export interface EfinPricing {
  id: string;
  customer_type: string;
  direction: PartnerDirection;
  source_country: string | null;
  dest_country: string | null;
  source_currency: string;
  dest_currency: string;
  payment_method: string | null;
  fixed_fee: number;
  percentage_fee: number;
  fx_margin_bps: number;
  min_fee: number | null;
  max_fee: number | null;
  effective_from: string;
  effective_to: string | null;
}

export interface RoutingRule {
  id: string;
  name: string;
  strategy: RoutingStrategy;
  weight_profit: number;
  weight_success: number;
  weight_fx: number;
  weight_speed: number;
  weight_risk: number;
  min_success_rate: number;
  max_retries: number;
  failure_cost_percent: number;
  chargeback_cost_percent: number;
  fraud_cost_percent: number;
  compliance_cost_fixed: number;
  infrastructure_cost_fixed: number;
  is_active: boolean;
}

export interface PartnerLiquidity {
  id: string;
  partner_id: string;
  currency_code: string;
  available_balance: number;
  required_reserve: number;
  daily_utilized: number;
  as_of: string;
  source: PricingSource;
}

const numeric = <T,>(row: T, keys: (keyof T)[]): T => {
  const out = { ...(row as Record<string, unknown>) };
  keys.forEach((k) => {
    if (out[k as string] !== null && out[k as string] !== undefined) {
      out[k as string] = Number(out[k as string]);
    }
  });
  return out as T;
};

/* ------------------------------- partners ------------------------------- */

export const usePaymentPartners = () =>
  useQuery({
    queryKey: ["payment_partners"],
    queryFn: async (): Promise<PaymentPartner[]> => {
      const { data, error } = await db
        .from("payment_partners")
        .select("*")
        .order("priority")
        .order("name");
      if (error) throw error;
      return (data || []).map((r: PaymentPartner) =>
        numeric(r, ["reliability_score", "priority", "min_transaction", "max_transaction", "daily_limit", "monthly_limit"]),
      );
    },
  });

function crud<T extends { id: string }>(table: string, key: string) {
  const useCreate = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (row: Partial<T>) => {
        const { error } = await db.from(table).insert(row);
        if (error) throw error;
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [key] });
        toast.success("Saved");
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };
  const useUpdate = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: Partial<T> }) => {
        const { error } = await db.from(table).update(patch).eq("id", id);
        if (error) throw error;
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [key] });
        toast.success("Updated");
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };
  const useRemove = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (id: string) => {
        const { error } = await db.from(table).delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [key] });
        toast.success("Deleted");
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };
  return { useCreate, useUpdate, useRemove };
}

export const { useCreate: useCreatePartner, useUpdate: useUpdatePartner, useRemove: useDeletePartner } =
  crud<PaymentPartner>("payment_partners", "payment_partners");

/* ------------------------------- corridors ------------------------------ */

export const usePartnerCorridors = (partnerId?: string) =>
  useQuery({
    queryKey: ["partner_corridors", partnerId ?? "all"],
    queryFn: async (): Promise<PartnerCorridor[]> => {
      let q = db.from("partner_corridors").select("*").order("dest_country");
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

export const { useCreate: useCreateCorridor, useUpdate: useUpdateCorridor, useRemove: useDeleteCorridor } =
  crud<PartnerCorridor>("partner_corridors", "partner_corridors");

/* -------------------------------- pricing ------------------------------- */

export const usePartnerPricing = (opts?: { partnerId?: string; includeHistory?: boolean }) =>
  useQuery({
    queryKey: ["partner_pricing", opts?.partnerId ?? "all", opts?.includeHistory ?? false],
    queryFn: async (): Promise<PartnerPricing[]> => {
      let q = db.from("partner_pricing").select("*").order("effective_from", { ascending: false });
      if (opts?.partnerId) q = q.eq("partner_id", opts.partnerId);
      if (!opts?.includeHistory) q = q.is("effective_to", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: PartnerPricing) =>
        numeric(r, [
          "fixed_fee",
          "percentage_fee",
          "min_fee",
          "max_fee",
          "fx_markup_bps",
          "settlement_fee",
          "network_fee",
          "compliance_fee",
        ]),
      );
    },
  });

// Pricing is append-only: a new row supersedes the previous version via trigger.
export const useAddPartnerPricing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PartnerPricing>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db
        .from("partner_pricing")
        .insert({ ...row, updated_by: auth?.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_pricing"] });
      toast.success("New pricing version recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useBulkAddPartnerPricing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Partial<PartnerPricing>[]) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = rows.map((r) => ({ ...r, source: "file" as const, updated_by: auth?.user?.id ?? null }));
      const { error } = await db.from("partner_pricing").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["partner_pricing"] });
      toast.success(`${n} pricing rows imported`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/* -------------------------------- fx rates ------------------------------ */

export const usePartnerFxRates = (partnerId?: string) =>
  useQuery({
    queryKey: ["partner_fx_rates", partnerId ?? "all"],
    queryFn: async (): Promise<PartnerFxRate[]> => {
      let q = db.from("partner_fx_rates").select("*").order("rate_timestamp", { ascending: false }).limit(300);
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: PartnerFxRate) => numeric(r, ["partner_rate", "mid_market_rate", "fx_spread_bps"]));
    },
    refetchInterval: 60_000,
  });

export const useAddPartnerFxRate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PartnerFxRate>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("partner_fx_rates").insert({ ...row, updated_by: auth?.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_fx_rates"] });
      toast.success("Rate recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/**
 * Pulls LIVE rates from the partners that expose a rate API (Wise,
 * Flutterwave, Nomba today) and appends them to partner_fx_rates.
 * Partners without an adapter are reported back as skipped.
 */
export const useRefreshPartnerLiveRates = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partnerCode?: string) => {
      const { data, error } = await supabase.functions.invoke("partner-rates-refresh", {
        body: partnerCode ? { partner_code: partnerCode } : {},
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || "Rate refresh failed");
      return data as {
        refreshed: number;
        attempted: number;
        failed: number;
        skipped_partners: string[];
      };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["partner_fx_rates"] });
      if (res.refreshed) {
        toast.success(
          `${res.refreshed} live rate${res.refreshed === 1 ? "" : "s"} refreshed${
            res.failed ? ` · ${res.failed} pair(s) unavailable` : ""
          }`,
        );
      } else {
        toast.warning("No live rates returned — check partner API credentials");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
};



/* ------------------------- observed partner cost ------------------------ */

export interface PartnerCostDrift {
  partner_id: string;
  partner_code: string;
  partner_name: string;
  direction: string;
  source_currency: string;
  dest_currency: string | null;
  payment_method: string | null;
  samples: number;
  avg_observed_fee: number | null;
  avg_contracted_fee: number | null;
  avg_observed_fx_bps: number | null;
  avg_contracted_fx_bps: number | null;
  avg_drift_percent: number | null;
  last_observed_at: string;
}

/** Rolling 90-day comparison of what partners billed vs their rate card. */
export const usePartnerCostDrift = () =>
  useQuery({
    queryKey: ["partner_cost_drift"],
    queryFn: async () => {
      const { data, error } = await db.from("partner_cost_drift").select("*");
      if (error) throw error;
      return (data ?? []) as PartnerCostDrift[];
    },
    staleTime: 5 * 60_000,
  });

/* --------------------------- eFinMoney pricing -------------------------- */

export const useEfinPricing = (includeHistory = false) =>
  useQuery({
    queryKey: ["efinmoney_pricing", includeHistory],
    queryFn: async (): Promise<EfinPricing[]> => {
      let q = db.from("efinmoney_pricing").select("*").order("effective_from", { ascending: false });
      if (!includeHistory) q = q.is("effective_to", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: EfinPricing) =>
        numeric(r, ["fixed_fee", "percentage_fee", "fx_margin_bps", "min_fee", "max_fee"]),
      );
    },
  });

export const useAddEfinPricing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<EfinPricing>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("efinmoney_pricing").insert({ ...row, updated_by: auth?.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["efinmoney_pricing"] });
      toast.success("Customer pricing saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRetireEfinPricing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("efinmoney_pricing")
        .update({ effective_to: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["efinmoney_pricing"] });
      toast.success("Pricing retired");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/* ------------------------------ routing rules --------------------------- */

export const useRoutingRules = () =>
  useQuery({
    queryKey: ["routing_rules"],
    queryFn: async (): Promise<RoutingRule[]> => {
      const { data, error } = await db.from("routing_rules").select("*").order("created_at");
      if (error) throw error;
      return (data || []).map((r: RoutingRule) =>
        numeric(r, [
          "weight_profit",
          "weight_success",
          "weight_fx",
          "weight_speed",
          "weight_risk",
          "min_success_rate",
          "max_retries",
          "failure_cost_percent",
          "chargeback_cost_percent",
          "fraud_cost_percent",
          "compliance_cost_fixed",
          "infrastructure_cost_fixed",
        ]),
      );
    },
  });

export const { useCreate: useCreateRoutingRule, useUpdate: useUpdateRoutingRule, useRemove: useDeleteRoutingRule } =
  crud<RoutingRule>("routing_rules", "routing_rules");

/* ------------------------------- liquidity ------------------------------ */

export const usePartnerLiquidity = () =>
  useQuery({
    queryKey: ["partner_liquidity"],
    queryFn: async (): Promise<PartnerLiquidity[]> => {
      const { data, error } = await db.from("partner_liquidity").select("*").order("currency_code");
      if (error) throw error;
      return (data || []).map((r: PartnerLiquidity) =>
        numeric(r, ["available_balance", "required_reserve", "daily_utilized"]),
      );
    },
  });

export const useUpsertLiquidity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PartnerLiquidity>) => {
      const { error } = await db
        .from("partner_liquidity")
        .upsert({ ...row, as_of: new Date().toISOString() }, { onConflict: "partner_id,currency_code" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_liquidity"] });
      toast.success("Liquidity updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const { useRemove: useDeleteLiquidity } = crud<PartnerLiquidity>("partner_liquidity", "partner_liquidity");

/* --------------------------- network activation -------------------------- */

export type SeedScope = "pricing" | "fx" | "retail";

export interface SeedSummary {
  pricing: number;
  fx: number;
  retail: number;
  skipped: string[];
}

export interface SeedResult {
  success: boolean;
  applied: boolean;
  summary: SeedSummary;
  preview?: {
    pricing: Record<string, unknown>[];
    fx: Record<string, unknown>[];
    retail: Record<string, unknown>[];
  };
}

export const useSeedPartnerNetwork = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { partnerId?: string; scopes: SeedScope[]; apply: boolean }): Promise<SeedResult> => {
      const { data, error } = await supabase.functions.invoke("partner-network-seed", {
        body: { partner_id: input.partnerId || null, scopes: input.scopes, apply: input.apply },
      });
      if (error) throw error;
      if (data && (data as SeedResult).success === false) throw new Error((data as { error?: string }).error || "Seeding failed");
      return data as SeedResult;
    },
    onSuccess: (res) => {
      if (!res.applied) return;
      qc.invalidateQueries({ queryKey: ["partner_pricing"] });
      qc.invalidateQueries({ queryKey: ["partner_fx_rates"] });
      qc.invalidateQueries({ queryKey: ["efinmoney_pricing"] });
      qc.invalidateQueries({ queryKey: ["corridor_readiness"] });
      const { pricing, fx, retail } = res.summary;
      toast.success(`Seeded ${pricing} pricing, ${fx} FX and ${retail} retail rows`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
