import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const looseDb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
  from: (t: string) => any;
  functions: { invoke: (n: string, o?: Record<string, unknown>) => any };
};

export interface CorridorReadiness {
  corridor_id: string;
  partner_id: string;
  partner_code: string;
  partner_name: string;
  direction: string;
  source_currency: string;
  dest_currency: string;
  dest_country: string | null;
  payment_method: string | null;
  enabled: boolean;
  live_routing_enabled: boolean;
  has_pricing: boolean;
  has_fx: boolean;
  has_liquidity: boolean;
  liquidity_stale: boolean;
  has_performance: boolean;
  ready: boolean;
}

export interface CostAssuranceRow {
  partner_id: string;
  partner_code: string;
  partner_name: string;
  invoice_count: number;
  billed_total: number;
  expected_total: number;
  variance_total: number;
  unmatched_lines: number;
  missing_lines: number;
}

export interface PartnerInvoice {
  id: string;
  partner_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  currency_code: string;
  billed_total: number;
  expected_total: number;
  variance_total: number;
  matched_lines: number;
  unmatched_lines: number;
  missing_lines: number;
  status: string;
  reconciled_at: string | null;
  created_at: string;
}

export const useCorridorReadiness = () =>
  useQuery({
    queryKey: ["corridor_readiness"],
    queryFn: async (): Promise<CorridorReadiness[]> => {
      const { data, error } = await looseDb.rpc("corridor_readiness");
      if (error) throw error;
      return (data || []) as CorridorReadiness[];
    },
  });

const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export const useCostAssurance = (days = 90) =>
  useQuery({
    queryKey: ["cost_assurance_summary", days],
    queryFn: async (): Promise<CostAssuranceRow[]> => {
      const { data, error } = await looseDb.rpc("cost_assurance_summary", {
        p_from: since(days),
        p_to: new Date().toISOString(),
      });
      if (error) throw error;
      return (data || []).map((r: CostAssuranceRow) => ({
        ...r,
        invoice_count: Number(r.invoice_count ?? 0),
        billed_total: Number(r.billed_total ?? 0),
        expected_total: Number(r.expected_total ?? 0),
        variance_total: Number(r.variance_total ?? 0),
        unmatched_lines: Number(r.unmatched_lines ?? 0),
        missing_lines: Number(r.missing_lines ?? 0),
      }));
    },
  });

export const usePartnerInvoices = () =>
  useQuery({
    queryKey: ["partner_invoices"],
    queryFn: async (): Promise<PartnerInvoice[]> => {
      const { data, error } = await looseDb
        .from("partner_invoices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as PartnerInvoice[];
    },
  });

export interface InvoiceLineInput {
  external_reference?: string | null;
  transfer_id?: string | null;
  description?: string | null;
  billed_amount: number;
}

export const useReconcileInvoice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      partner_id: string;
      invoice_number: string;
      period_start: string;
      period_end: string;
      currency_code: string;
      lines: InvoiceLineInput[];
    }) => {
      const { data, error } = await looseDb.functions.invoke("partner-invoice-reconcile", {
        body: payload,
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Reconciliation failed");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_invoices"] });
      qc.invalidateQueries({ queryKey: ["cost_assurance_summary"] });
      toast.success("Invoice reconciled");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRefreshLiquidity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await looseDb.functions.invoke("partner-liquidity-refresh", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["partner_liquidity"] });
      qc.invalidateQueries({ queryKey: ["corridor_readiness"] });
      toast.success(`Liquidity refreshed${data?.updated != null ? ` (${data.updated} balance${data.updated === 1 ? "" : "s"})` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
