import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

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
  return invokeEdgeFunction<Record<string, unknown>>("swychr-airtime-catalog", {
    country: country.toUpperCase(),
    type,
  });
}

export async function createSwychrAirtimeRecharge(params: {
  country: string;
  skuId: string;
  amount: number;
  mobile: string;
  wallet_id?: string;
  purchaseCurrency?: string;
}) {
  return invokeEdgeFunction<{ success?: boolean; error?: string; message?: string }>(
    "swychr-airtime-recharge",
    params,
  );
}

export function productSkuId(p: SwychrAirtimeProduct): string {
  return String(p.skuId ?? p.sku_id ?? "");
}

export function productLabel(p: SwychrAirtimeProduct): string {
  const name = p.productName ?? p.product_name ?? "Airtime";
  const op = p.operatorName ?? p.operator_name;
  return op ? `${op} — ${name}` : name;
}
