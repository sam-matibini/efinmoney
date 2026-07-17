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

export async function createSwychrRecharge(params: {
  country: string;
  skuId: string;
  amount: number;
  mobile: string;
  purchaseCurrency?: string;
}) {
  const res = await swychrFetch("airtime", "/recharges/create", {
    method: "POST",
    body: JSON.stringify(params),
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
