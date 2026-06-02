// Client wrapper around Circle CPN edge functions.
import { supabase } from "@/integrations/supabase/client";

export interface CpnQuoteRequest {
  source_currency: string;
  dest_country: string;
  dest_currency: string;
  source_amount: number;
  payout_method?: "bank" | "wallet";
}

export interface CpnQuote {
  quote_id: string | null;
  source_currency: string;
  source_amount: number;
  dest_currency: string;
  dest_country: string;
  dest_amount: number;
  circle_rate: number;
  effective_rate: number;
  circle_fee: number;
  platform_fee: number;
  total_fee: number;
  est_minutes: number;
  expires_at: string | null;
}

export interface CpnRecipient {
  name: string;
  account_number: string;
  bank_code?: string;
  bank_name?: string;
  phone?: string;
  email?: string;
  address_line?: string;
  city?: string;
}

export interface CpnInitiateRequest {
  source_wallet_id: string;
  quote: CpnQuote;
  recipient: CpnRecipient;
}

export async function getCpnQuote(req: CpnQuoteRequest): Promise<CpnQuote> {
  const { data, error } = await supabase.functions.invoke("circle-quote", { body: req });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as CpnQuote;
}

export async function initiateCpnPayout(req: CpnInitiateRequest) {
  const { data, error } = await supabase.functions.invoke("initiate-cpn-payout", {
    body: {
      source_wallet_id: req.source_wallet_id,
      source_currency: req.quote.source_currency,
      source_amount: req.quote.source_amount,
      dest_country: req.quote.dest_country,
      dest_currency: req.quote.dest_currency,
      dest_amount: req.quote.dest_amount,
      payout_method: "bank",
      effective_rate: req.quote.effective_rate,
      platform_fee: req.quote.platform_fee,
      circle_fee: req.quote.circle_fee,
      quote_id: req.quote.quote_id,
      recipient: req.recipient,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export interface CpnCorridor {
  id: string;
  source_currency: string;
  dest_country: string;
  dest_currency: string;
  payout_method: string;
  enabled: boolean;
  min_amount: number;
  max_amount: number;
  est_minutes: number;
  markup_bps: number;
}

export async function listEnabledCorridors(): Promise<CpnCorridor[]> {
  const { data, error } = await supabase
    .from("cpn_corridors")
    .select("*")
    .eq("enabled", true)
    .order("dest_country");
  if (error) throw error;
  return (data ?? []) as CpnCorridor[];
}
