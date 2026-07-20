import { swychrFetch } from "./swychr-auth.ts";

export async function swychrCardRequest<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: T; message: string; status: number }> {
  const res = await swychrFetch("card", path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  return {
    ok: res.ok,
    data: json as T,
    message: String(json.message ?? ""),
    status: Number(json.status ?? res.status),
  };
}

export async function issueSwychrLiteCard(params: {
  user_id: string;
  amount: number;
  card_type: "VISA" | "MASTERCARD";
  swipe_count?: number;
}) {
  return swychrCardRequest("/issue_lite_card", params);
}

export async function rechargeSwychrCard(params: { card_id: string; amount: number }) {
  return swychrCardRequest("/recharge_vcard", params);
}

export async function freezeSwychrCard(params: { card_id: string }) {
  return swychrCardRequest("/freeze_card", params);
}

export async function unfreezeSwychrCard(params: { card_id: string }) {
  return swychrCardRequest("/unfreeze_card", params);
}

export async function getSwychrCardTransactions(params: { card_id: string }) {
  return swychrCardRequest("/get_card_transactions", params);
}
