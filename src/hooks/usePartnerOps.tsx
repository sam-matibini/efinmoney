import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as unknown as {
  from: (t: string) => any;
  functions: { invoke: (n: string, o?: Record<string, unknown>) => any };
};

/* -------------------------------- limits -------------------------------- */

export interface PartnerLimit {
  id: string;
  partner_id: string;
  corridor_id: string | null;
  currency_code: string;
  min_amount: number | null;
  max_amount: number | null;
  daily_limit: number | null;
  monthly_limit: number | null;
  created_at: string;
  updated_at: string;
}

export const usePartnerLimits = () =>
  useQuery({
    queryKey: ["partner_limits"],
    queryFn: async (): Promise<PartnerLimit[]> => {
      const { data, error } = await db
        .from("partner_limits")
        .select("*")
        .order("currency_code");
      if (error) throw error;
      return (data || []).map((r: PartnerLimit) => ({
        ...r,
        min_amount: r.min_amount === null ? null : Number(r.min_amount),
        max_amount: r.max_amount === null ? null : Number(r.max_amount),
        daily_limit: r.daily_limit === null ? null : Number(r.daily_limit),
        monthly_limit: r.monthly_limit === null ? null : Number(r.monthly_limit),
      }));
    },
  });

export const useSavePartnerLimit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...row }: Partial<PartnerLimit>) => {
      const { error } = id
        ? await db.from("partner_limits").update(row).eq("id", id)
        : await db.from("partner_limits").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_limits"] });
      toast.success("Limit saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeletePartnerLimit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("partner_limits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_limits"] });
      toast.success("Limit removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Volume routed per partner + currency inside the current day and month. */
export interface LimitUsage {
  daily: number;
  monthly: number;
}

export const usePartnerLimitUsage = () =>
  useQuery({
    queryKey: ["partner_limit_usage"],
    queryFn: async (): Promise<Record<string, LimitUsage>> => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);

      const { data, error } = await db
        .from("transaction_economics")
        .select("partner_id, source_currency, amount, created_at")
        .gte("created_at", monthStart.toISOString());
      if (error) throw error;

      const out: Record<string, LimitUsage> = {};
      for (const r of data || []) {
        if (!r.partner_id) continue;
        const key = `${r.partner_id}|${r.source_currency}`;
        const bucket = (out[key] ||= { daily: 0, monthly: 0 });
        const amount = Number(r.amount) || 0;
        bucket.monthly += amount;
        if (new Date(r.created_at) >= dayStart) bucket.daily += amount;
      }
      return out;
    },
  });

/* -------------------------------- alerts -------------------------------- */

export type AlertSeverityLevel = "critical" | "warning" | "info";
export type PartnerAlertStatus = "open" | "acknowledged" | "resolved";

export interface PartnerAlert {
  id: string;
  fingerprint: string;
  alert_type: string;
  severity: AlertSeverityLevel;
  title: string;
  message: string;
  partner_id: string | null;
  corridor_key: string | null;
  metrics: Record<string, unknown>;
  status: PartnerAlertStatus;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export const usePartnerAlerts = (status?: PartnerAlertStatus | "all") =>
  useQuery({
    queryKey: ["partner_alerts", status ?? "open"],
    queryFn: async (): Promise<PartnerAlert[]> => {
      let q = db.from("partner_alerts").select("*").order("last_seen_at", { ascending: false }).limit(200);
      if (status && status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as PartnerAlert[];
    },
  });

export const useUpdatePartnerAlert = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PartnerAlertStatus }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const patch: Record<string, unknown> = { status };
      if (status === "acknowledged") {
        patch.acknowledged_at = new Date().toISOString();
        patch.acknowledged_by = uid;
      }
      if (status === "resolved") {
        patch.resolved_at = new Date().toISOString();
        patch.resolved_by = uid;
      }
      const { error } = await db.from("partner_alerts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_alerts"] });
      toast.success("Alert updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRunPartnerAlertScan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.functions.invoke("partner-alerts-scan", { body: {} });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Scan failed");
      return data as { findings: number; created: number; updated: number; auto_resolved: number };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["partner_alerts"] });
      toast.success(
        `Scan complete — ${res.findings} finding(s), ${res.created} new, ${res.auto_resolved} auto-resolved`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/* --------------------------- invoice line detail -------------------------- */

export interface PartnerInvoiceLine {
  id: string;
  invoice_id: string;
  partner_reference: string | null;
  transfer_id: string | null;
  transaction_date: string | null;
  currency_code: string | null;
  amount: number | null;
  billed_fee: number;
  expected_fee: number | null;
  variance: number | null;
  match_status: string;
  match_method?: string | null;
  match_reference?: string | null;
  dispute_status?: string | null;
  notes: string | null;
}


export const usePartnerInvoiceLines = (invoiceId?: string) =>
  useQuery({
    queryKey: ["partner_invoice_lines", invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<PartnerInvoiceLine[]> => {
      const { data, error } = await db
        .from("partner_invoice_lines")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("match_status");
      if (error) throw error;
      return (data || []) as PartnerInvoiceLine[];
    },
  });

/* ---------------------------- margin guardrails --------------------------- */

export type MarginFloorAction = "warn" | "uplift" | "block";

export interface MarginFloor {
  id: string;
  scope: "global" | "corridor";
  direction: string | null;
  source_currency: string | null;
  dest_currency: string | null;
  dest_country: string | null;
  payment_method: string | null;
  customer_type: string | null;
  min_margin_percent: number;
  action: MarginFloorAction;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useMarginFloors = () =>
  useQuery({
    queryKey: ["margin_floors"],
    queryFn: async (): Promise<MarginFloor[]> => {
      const { data, error } = await db
        .from("margin_floors")
        .select("*")
        .order("scope")
        .order("source_currency");
      if (error) throw error;
      return (data || []).map((r: MarginFloor) => ({
        ...r,
        min_margin_percent: Number(r.min_margin_percent ?? 0),
      }));
    },
  });

export const useSaveMarginFloor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...row }: Partial<MarginFloor>) => {
      const { error } = id
        ? await db.from("margin_floors").update(row).eq("id", id)
        : await db.from("margin_floors").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["margin_floors"] });
      toast.success("Margin floor saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteMarginFloor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("margin_floors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["margin_floors"] });
      toast.success("Margin floor removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/* -------------------------- pricing recommendations ----------------------- */

export interface PricingRecommendation {
  group_key: string;
  group_label: string;
  source_currency: string;
  dest_currency: string;
  dest_country: string | null;
  payment_method: string | null;
  txn_count: number;
  volume: number;
  revenue: number;
  modelled_cost: number;
  billed_cost: number;
  effective_cost: number;
  current_margin_percent: number;
  target_margin_percent: number;
  current_fixed_fee: number;
  current_percentage_fee: number;
  recommended_percentage_fee: number;
  fee_delta_percent: number;
  revenue_uplift: number;
}

export const usePricingRecommendations = (days: number, targetMargin: number) =>
  useQuery({
    queryKey: ["pricing_recommendations", days, targetMargin],
    queryFn: async (): Promise<PricingRecommendation[]> => {
      const rpcDb = supabase as unknown as { rpc: (fn: string, a?: Record<string, unknown>) => any };
      const { data, error } = await rpcDb.rpc("pricing_recommendations", {
        p_from: new Date(Date.now() - days * 86_400_000).toISOString(),
        p_to: new Date().toISOString(),
        p_target_margin: targetMargin,
      });
      if (error) throw error;
      return (data || []).map((r: PricingRecommendation) => ({
        ...r,
        txn_count: Number(r.txn_count ?? 0),
        volume: Number(r.volume ?? 0),
        revenue: Number(r.revenue ?? 0),
        modelled_cost: Number(r.modelled_cost ?? 0),
        billed_cost: Number(r.billed_cost ?? 0),
        effective_cost: Number(r.effective_cost ?? 0),
        current_margin_percent: Number(r.current_margin_percent ?? 0),
        target_margin_percent: Number(r.target_margin_percent ?? 0),
        current_fixed_fee: Number(r.current_fixed_fee ?? 0),
        current_percentage_fee: Number(r.current_percentage_fee ?? 0),
        recommended_percentage_fee: Number(r.recommended_percentage_fee ?? 0),
        fee_delta_percent: Number(r.fee_delta_percent ?? 0),
        revenue_uplift: Number(r.revenue_uplift ?? 0),
      }));
    },
  });

/* ------------------------- automated fee adjustments ---------------------- */

export interface FeeAdjustmentSettings {
  id: string;
  enabled: boolean;
  auto_apply: boolean;
  target_margin_percent: number;
  lookback_days: number;
  min_txn_count: number;
  min_volume: number;
  max_fee_delta_percent: number;
  cooldown_days: number;
}

export const useFeeAdjustmentSettings = () =>
  useQuery({
    queryKey: ["fee_adjustment_settings"],
    queryFn: async (): Promise<FeeAdjustmentSettings | null> => {
      const { data, error } = await db
        .from("fee_adjustment_settings")
        .select("*")
        .eq("is_singleton", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        target_margin_percent: Number(data.target_margin_percent ?? 0),
        lookback_days: Number(data.lookback_days ?? 30),
        min_txn_count: Number(data.min_txn_count ?? 0),
        min_volume: Number(data.min_volume ?? 0),
        max_fee_delta_percent: Number(data.max_fee_delta_percent ?? 0),
        cooldown_days: Number(data.cooldown_days ?? 0),
      } as FeeAdjustmentSettings;
    },
  });

export const useSaveFeeAdjustmentSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<FeeAdjustmentSettings>) => {
      const { id, ...row } = patch;
      const { error } = id
        ? await db.from("fee_adjustment_settings").update(row).eq("id", id)
        : await db.from("fee_adjustment_settings").insert({ ...row, is_singleton: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee_adjustment_settings"] });
      toast.success("Settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export type PricingProposalStatus = "pending" | "approved" | "rejected" | "applied" | "superseded";

export interface PricingProposal {
  id: string;
  group_key: string;
  group_label: string;
  direction: string;
  source_currency: string;
  dest_currency: string;
  dest_country: string | null;
  payment_method: string | null;
  customer_type: string;
  current_fixed_fee: number;
  current_percentage_fee: number;
  proposed_fixed_fee: number;
  proposed_percentage_fee: number;
  fee_delta_percent: number;
  txn_count: number;
  volume: number;
  revenue: number;
  effective_cost: number;
  current_margin_percent: number;
  target_margin_percent: number;
  expected_revenue_uplift: number;
  source: "auto_scan" | "manual";
  status: PricingProposalStatus;
  review_note: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  created_at: string;
}

const numeric = (r: Record<string, unknown>): PricingProposal =>
  ({
    ...r,
    current_fixed_fee: Number(r.current_fixed_fee ?? 0),
    current_percentage_fee: Number(r.current_percentage_fee ?? 0),
    proposed_fixed_fee: Number(r.proposed_fixed_fee ?? 0),
    proposed_percentage_fee: Number(r.proposed_percentage_fee ?? 0),
    fee_delta_percent: Number(r.fee_delta_percent ?? 0),
    txn_count: Number(r.txn_count ?? 0),
    volume: Number(r.volume ?? 0),
    revenue: Number(r.revenue ?? 0),
    effective_cost: Number(r.effective_cost ?? 0),
    current_margin_percent: Number(r.current_margin_percent ?? 0),
    target_margin_percent: Number(r.target_margin_percent ?? 0),
    expected_revenue_uplift: Number(r.expected_revenue_uplift ?? 0),
  }) as PricingProposal;

export const usePricingProposals = (status: PricingProposalStatus | "all" = "pending") =>
  useQuery({
    queryKey: ["pricing_proposals", status],
    queryFn: async (): Promise<PricingProposal[]> => {
      let q = db
        .from("pricing_proposals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(numeric);
    },
  });

export const useReviewPricingProposal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: "approve" | "reject"; note?: string }) => {
      const { data, error } = await db.functions.invoke("pricing-proposal-apply", {
        body: { proposal_id: id, action, note },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Review failed");
      return data as { status: string };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["pricing_proposals"] });
      qc.invalidateQueries({ queryKey: ["efinmoney_pricing"] });
      toast.success(res.status === "applied" ? "Proposal applied to customer pricing" : "Proposal rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRunFeeAdjustScan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.functions.invoke("pricing-adjust-scan", { body: { force: true } });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Scan failed");
      return data as {
        evaluated: number;
        raised: number;
        applied: number;
        capped: number;
        skipped_cooldown: number;
        skipped_threshold: number;
      };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["pricing_proposals"] });
      toast.success(
        `Scan complete — ${res.raised} proposal(s) raised, ${res.applied} auto-applied, ${res.capped} capped`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Turn a recommendation row into a pending proposal for review. */
export const useCreateManualProposal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: PricingRecommendation) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("pricing_proposals").insert({
        group_key: r.group_key,
        group_label: r.group_label,
        direction: "payout",
        source_currency: r.source_currency,
        dest_currency: r.dest_currency,
        dest_country: r.dest_country,
        payment_method: r.payment_method,
        customer_type: "consumer",
        current_fixed_fee: r.current_fixed_fee,
        current_percentage_fee: r.current_percentage_fee,
        proposed_fixed_fee: r.current_fixed_fee,
        proposed_percentage_fee: r.recommended_percentage_fee,
        fee_delta_percent: r.recommended_percentage_fee - r.current_percentage_fee,
        txn_count: r.txn_count,
        volume: r.volume,
        revenue: r.revenue,
        effective_cost: r.effective_cost,
        current_margin_percent: r.current_margin_percent,
        target_margin_percent: r.target_margin_percent,
        expected_revenue_uplift: r.revenue_uplift,
        source: "manual",
        status: "pending",
        created_by: auth?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing_proposals"] });
      toast.success("Proposal queued for review");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
