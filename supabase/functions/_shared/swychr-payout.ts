import { swychrFetch } from "./swychr-auth.ts";

export interface SwychrPayoutRequest {
  country_code: string;
  beneficiary_name: string;
  mobile_no: string;
  amount: number;
  transaction_id: string;
  payment_method: string;
  remarks?: string;
  bank_code?: string;
  account_number?: string;
  address?: string;
}

export async function getSwychrNigeriaBanks(): Promise<Array<{ name: string; code: string }>> {
  const res = await swychrFetch("payout", "/nigeria_banks", { method: "GET" });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  const data = Array.isArray(json.data) ? json.data as Array<Record<string, unknown>> : [];
  return data.map((b) => ({
    name: String(b.name ?? ""),
    code: String(b.code ?? ""),
  })).filter((b) => b.code);
}

export async function getSwychrPayoutMethods(countryCode: string): Promise<Record<string, unknown>[]> {
  const res = await swychrFetch("payout", "/payout_methods", {
    method: "POST",
    body: JSON.stringify({ country_code: countryCode }),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  const data = (json.data && typeof json.data === "object") ? json.data as Record<string, unknown> : {};
  const methods = data.payment_methods;
  return Array.isArray(methods) ? methods as Record<string, unknown>[] : [];
}

export async function createSwychrPayout(req: SwychrPayoutRequest): Promise<{
  ok: boolean;
  transaction_id: string;
  message: string;
  raw: Record<string, unknown>;
}> {
  const res = await swychrFetch("payout", "/create_transaction", {
    method: "POST",
    body: JSON.stringify(req),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  return {
    ok: res.ok && (json.status === 200 || json.status === undefined),
    transaction_id: String(json.transaction_id ?? req.transaction_id),
    message: String(json.message ?? ""),
    raw: json,
  };
}

export async function getSwychrPayoutStatus(transactionId: string): Promise<{
  status: string;
  raw: Record<string, unknown>;
}> {
  const res = await swychrFetch("payout", "/transaction_status", {
    method: "POST",
    body: JSON.stringify({ transaction_id: transactionId }),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  const data = (json.data && typeof json.data === "object") ? json.data as Record<string, unknown> : {};
  return {
    status: String(data.status ?? "pending"),
    raw: json,
  };
}

export function mapSwychrPayoutStatus(status: string): "pending" | "processing" | "completed" | "failed" {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return "completed";
  if (s === "failed" || s === "cancelled" || s === "refunded") return "failed";
  if (s === "processing") return "processing";
  return "pending";
}
