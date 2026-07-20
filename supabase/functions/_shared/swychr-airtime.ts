import { swychrFetch } from "./swychr-auth.ts";

export async function listSwychrOperators(country: string) {
  const res = await swychrFetch("airtime", "/operators/list", {
    method: "POST",
    body: JSON.stringify({ country }),
  });
  return res.json().catch(() => ({}));
}

export async function listSwychrProductsByCountry(country: string) {
  const res = await swychrFetch("airtime", "/products/by-country", {
    method: "POST",
    body: JSON.stringify({ country }),
  });
  return res.json().catch(() => ({}));
}

export async function lookupSwychrMobile(mobile: string) {
  const res = await swychrFetch("airtime", "/mobile/lookup", {
    method: "POST",
    body: JSON.stringify({ mobile }),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: res.ok, ...json };
}

export async function createSwychrRecharge(params: {
  country: string;
  skuId: string;
  amount: number;
  mobile: string;
  purchaseCurrency?: string;
  user_id?: number;
}) {
  const body: Record<string, unknown> = {
    country: params.country,
    skuId: params.skuId,
    amount: params.amount,
    mobile: params.mobile,
  };
  if (params.purchaseCurrency) body.purchaseCurrency = params.purchaseCurrency;
  if (typeof params.user_id === "number") body.user_id = params.user_id;

  const res = await swychrFetch("airtime", "/recharges/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: res.ok, ...json };
}

export async function getSwychrRechargeStatus(transactionId: string) {
  const res = await swychrFetch("airtime", "/recharges/status", {
    method: "POST",
    body: JSON.stringify({ transaction_id: transactionId }),
  });
  return res.json().catch(() => ({}));
}
