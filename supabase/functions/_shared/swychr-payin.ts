import { swychrFetch } from "./swychr-auth.ts";

export interface SwychrPaymentLinkRequest {
  country_code: string;
  name: string;
  email: string;
  mobile?: string;
  amount: number;
  currency?: string;
  transaction_id: string;
  description?: string;
  pass_digital_charge: boolean;
  callback_url?: string;
}

export interface SwychrPaymentLinkResult {
  ok: boolean;
  payment_link: string | null;
  provider_id: number | null;
  transaction_id: string;
  message: string;
  raw: Record<string, unknown>;
}

/** ISO country from wallet currency (best-effort). */
export function countryCodeForCurrency(currency: string): string {
  const map: Record<string, string> = {
    // Live payin corridors on this merchant (US/UK/EU/CAD top-ups use Nomba, not Swychr)
    KES: "KE",
    XAF: "CM",
    XOF: "SN",
    UGX: "UG",
  };
  return map[currency.toUpperCase()] ?? currency.slice(0, 2).toUpperCase();
}

export function buildSwychrPayinWebhookUrl(): string {
  const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
  if (!projectRef) return "";
  return `https://${projectRef}.functions.supabase.co/swychr-payin-webhook`;
}

export async function createSwychrPaymentLink(
  req: SwychrPaymentLinkRequest,
  idempotencyKey?: string,
): Promise<SwychrPaymentLinkResult> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await swychrFetch("payin", "/create_payment_links", {
    method: "POST",
    headers,
    body: JSON.stringify(req),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  const data = (json.data && typeof json.data === "object")
    ? json.data as Record<string, unknown>
    : {};

  return {
    ok: res.ok && Boolean(data.payment_link),
    payment_link: data.payment_link ? String(data.payment_link) : null,
    provider_id: data.id != null ? Number(data.id) : null,
    transaction_id: String(data.transaction_id ?? req.transaction_id),
    message: String(json.message ?? ""),
    raw: json,
  };
}

/** Payin status: 0=pending, 1=success, 2=failed, 3=refunded */
export function parsePayinStatusCode(status: unknown): "pending" | "completed" | "failed" | "cancelled" {
  const n = Number(status);
  if (n === 1) return "completed";
  if (n === 2) return "failed";
  if (n === 3) return "cancelled";
  return "pending";
}

export async function getSwychrPaymentLinkStatus(transactionId: string): Promise<{
  status: "pending" | "completed" | "failed" | "cancelled";
  attributes: Record<string, unknown>;
  raw: Record<string, unknown>;
}> {
  const res = await swychrFetch("payin", "/payment_link_status", {
    method: "POST",
    body: JSON.stringify({ transaction_id: transactionId }),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  const outer = (json.data && typeof json.data === "object") ? json.data as Record<string, unknown> : {};
  const inner = (outer.data && typeof outer.data === "object") ? outer.data as Record<string, unknown> : {};
  const attrs = (inner.attributes && typeof inner.attributes === "object")
    ? inner.attributes as Record<string, unknown>
    : {};

  return {
    status: parsePayinStatusCode(attrs.status),
    attributes: attrs,
    raw: json,
  };
}

export function verifySwychrWebhookSignature(signature: string | null): boolean {
  const secret = Deno.env.get("SWYCHR_WEBHOOK_SECRET")?.trim();
  if (!secret) return true;
  if (!signature) return false;
  return signature === secret;
}
