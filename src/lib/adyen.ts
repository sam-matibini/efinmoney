import { supabase } from "@/integrations/supabase/client";

export interface AdyenSessionResult {
  sessionId: string;
  sessionData: string;
  clientKey: string;
  environment: string;
  reference: string;
  amount: { value: number; currency: string };
  session_db_id: string;
}

export async function createAdyenSession(params: {
  amount: number;
  currency: string;
  purpose?: "wallet_topup" | "transfer_funding" | "invoice" | "admin_link";
  target_wallet_id?: string | null;
  target_currency?: string | null;
  return_url?: string;
  related_transfer_id?: string | null;
  related_invoice_id?: string | null;
}): Promise<AdyenSessionResult> {
  const { data, error } = await supabase.functions.invoke("adyen-create-session", { body: params });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as AdyenSessionResult;
}

export async function createAdyenPayLink(params: {
  amount: number;
  currency: string;
  purpose?: "invoice" | "admin_link" | "wallet_topup";
  description?: string;
  sales_invoice_id?: string | null;
  customer_email?: string | null;
  expires_in_hours?: number;
}) {
  const { data, error } = await supabase.functions.invoke("adyen-create-paylink", { body: params });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as {
    id: string;
    link_id: string;
    url: string;
    short_url: string;
    expires_at: string;
    amount: { value: number; currency: string };
  };
}
