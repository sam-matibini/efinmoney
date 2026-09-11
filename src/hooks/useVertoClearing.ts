import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VertoWallet = {
  id: string;
  currency: string;
  available: number;
  ledger: number;
  label: string | null;
  isDefault: boolean;
};

export type VertoStatus = {
  configured: boolean;
  mode: "live" | "mock";
  env: string;
  companyId: string | null;
  loginOk: boolean;
  loginError: string | null;
  docs: string;
  purposeId: string;
};

export type VertoTransfer = {
  id: string;
  flow_type: string;
  status: string;
  mode: string;
  source_currency: string;
  dest_currency: string | null;
  source_amount: number;
  dest_amount: number | null;
  fx_rate: number | null;
  partner_id: string | null;
  target_company_id: string | null;
  payment_id: string | null;
  client_reference: string | null;
  error_message: string | null;
  created_at: string;
  payment_partners?: { name: string; code: string } | null;
};

async function invoke<T>(action: string, body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("verto-ops", {
    body: { action, ...body },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Verto request failed");
  return data as T;
}

export function useVertoStatus() {
  return useQuery({
    queryKey: ["verto-status"],
    queryFn: () => invoke<VertoStatus>("status"),
    staleTime: 30_000,
  });
}

export function useVertoWallets() {
  return useQuery({
    queryKey: ["verto-wallets"],
    queryFn: () => invoke<{ mode: string; wallets: VertoWallet[] }>("wallets"),
    staleTime: 15_000,
  });
}

export function useVertoHistory() {
  return useQuery({
    queryKey: ["verto-history"],
    queryFn: () => invoke<{ transfers: VertoTransfer[] }>("history"),
    staleTime: 10_000,
  });
}

export function useVertoQuote() {
  return useMutation({
    mutationFn: (payload: { from_currency: string; to_currency: string }) =>
      invoke<{ mode: string; rate: number; vfxToken: string; expiry: string | null }>("quote", payload),
  });
}

export function useVertoConvert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => invoke("convert", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verto-history"] });
      qc.invalidateQueries({ queryKey: ["verto-wallets"] });
    },
  });
}

export function useVertoSend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => invoke("send", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verto-history"] });
      qc.invalidateQueries({ queryKey: ["verto-wallets"] });
    },
  });
}

export function useSaveVertoPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => invoke("save_partner", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment_partners"] });
    },
  });
}
