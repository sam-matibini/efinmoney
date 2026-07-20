import { supabase } from "@/integrations/supabase/client";

export interface SwychrAirtimeProduct {
  skuId?: string;
  sku_id?: string;
  productName?: string;
  product_name?: string;
  amount?: number;
  operatorName?: string;
  operator_name?: string;
}

export async function fetchSwychrAirtimeCatalog(country: string, type: "products" | "operators" = "products") {
  const { data, error } = await supabase.functions.invoke("swychr-airtime-catalog", {
    body: { country: country.toUpperCase(), type },
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function createSwychrAirtimeRecharge(params: {
  country: string;
  skuId: string;
  amount: number;
  mobile: string;
  wallet_id?: string;
  purchaseCurrency?: string;
}) {
  const { data, error } = await supabase.functions.invoke("swychr-airtime-recharge", { body: params });
  if (error) throw error;
  const payload = data as { success?: boolean; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload;
}

export function productSkuId(p: SwychrAirtimeProduct): string {
  return String(p.skuId ?? p.sku_id ?? "");
}

export function productLabel(p: SwychrAirtimeProduct): string {
  const name = p.productName ?? p.product_name ?? "Airtime";
  const op = p.operatorName ?? p.operator_name;
  return op ? `${op} — ${name}` : name;
}
