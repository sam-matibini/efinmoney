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
