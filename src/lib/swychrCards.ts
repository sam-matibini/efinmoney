import { supabase } from "@/integrations/supabase/client";

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
  swychr_user_id: string;
  amount: number;
  card_type?: "VISA" | "MASTERCARD";
  wallet_id?: string;
}) {
  const { data, error } = await supabase.functions.invoke("swychr-card-issue", { body: params });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { success: boolean; card?: Record<string, unknown> };
}

export async function swychrCardOp(params: {
  action: "recharge" | "freeze" | "unfreeze" | "transactions";
  card_id: string;
  amount?: number;
}) {
  const { data, error } = await supabase.functions.invoke("swychr-card-ops", { body: params });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data;
}
