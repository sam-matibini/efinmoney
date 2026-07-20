import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export interface SwychrCardRow {
  id: string;
  swychr_card_id: string;
  card_type: string;
  last_four: string;
  status: string;
  wallet_id: string | null;
  created_at: string;
}

export async function listSwychrCards(): Promise<SwychrCardRow[]> {
  const { data, error } = await supabase
    .from("swychr_cards")
    .select("id, swychr_card_id, card_type, last_four, status, wallet_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SwychrCardRow[];
}

export async function issueSwychrCard(params: {
  /** Optional — if omitted, edge function reuses or creates a live Swychr cardholder from the profile. */
  swychr_user_id?: string;
  amount: number;
  card_type?: "VISA" | "MASTERCARD";
  wallet_id?: string;
  email?: string;
  name?: string;
  country?: string;
}) {
  return invokeEdgeFunction<{ success: boolean; card?: Record<string, unknown>; message?: string }>(
    "swychr-card-issue",
    params,
  );
}

export async function swychrCardOp(params: {
  action: "recharge" | "freeze" | "unfreeze" | "transactions";
  card_id: string;
  amount?: number;
}) {
  return invokeEdgeFunction("swychr-card-ops", params);
}

