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
  // Swychr often returns HTTP 200 with business status 400 (e.g. insufficient wallet).
  const apiStatus = Number(json.status ?? (res.ok ? 200 : res.status));
  const message = String(json.message ?? "");
  const ok = res.ok && apiStatus === 200;
  return {
    ok,
    data: json as T,
    message,
    status: apiStatus,
  };
}

export async function createSwychrUser(params: {
  email: string;
  name: string;
  country?: string;
}) {
  return swychrCardRequest("/create_user", params);
}

export async function createSwychrFullUser(params: Record<string, unknown>) {
  return swychrCardRequest("/create_full_user", params);
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

/** Prefer UUID `card_id` from Swychr Card schema; fall back to numeric `id`. */
export function extractSwychrCard(payload: Record<string, unknown>): Record<string, unknown> | null {
  const root = (payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : payload);
  let list = root.card_list ?? payload.card_list;
  if (Array.isArray(list)) list = list[0];
  if (list && typeof list === "object") return list as Record<string, unknown>;
  return null;
}

export function extractSwychrCardId(card: Record<string, unknown> | null): string | null {
  if (!card) return null;
  const uuid = card.card_id ?? card.cardId;
  if (typeof uuid === "string" && uuid.length > 8) return uuid;
  if (typeof card.id === "string" && card.id.length > 8) return card.id;
  if (typeof card.id === "number") return String(card.id);
  return null;
}

export function extractSwychrLastFour(card: Record<string, unknown> | null): string {
  if (!card) return "0000";
  const direct = card.last_four ?? card.lastFour;
  if (typeof direct === "string" && direct.length >= 4) return direct.slice(-4);
  const pan = String(card.masked_pan ?? card.encrypted_cardnumber ?? "");
  const digits = pan.replace(/\D/g, "");
  return digits.slice(-4) || "0000";
}

export function extractSwychrUserId(payload: Record<string, unknown>): string | null {
  const data = (payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : payload);
  // create_full_user returns data.id; create_user docs say user_id but prod often returns null.
  const id = data.id ?? data.user_id ?? data.userId ?? payload.user_id ?? payload.id;
  return typeof id === "string" && id.length > 8 ? id : null;
}

/** Paginated cardholder list — used to resolve id when create_user returns null user_id. */
export async function listSwychrUsers(page = 1, pageSize = 50) {
  return swychrCardRequest(`/users?page=${page}&page_size=${pageSize}`, {});
}

export async function findSwychrUserIdByEmail(email: string): Promise<string | null> {
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const res = await listSwychrUsers(page, 50);
    const rows = Array.isArray((res.data as Record<string, unknown>)?.data)
      ? (res.data as Record<string, unknown>).data as Record<string, unknown>[]
      : Array.isArray(res.data)
      ? res.data as unknown as Record<string, unknown>[]
      : [];
    const hit = rows.find((u) => String(u.email ?? "").toLowerCase() === needle);
    if (hit && typeof hit.id === "string") return hit.id;
    if (rows.length < 50) break;
  }
  return null;
}
