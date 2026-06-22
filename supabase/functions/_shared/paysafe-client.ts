const PAYSAFE_API_KEY = Deno.env.get("PAYSAFE_API_KEY") || "";
const PAYSAFE_ENV = (Deno.env.get("PAYSAFE_ENV") || "test").toLowerCase();

export const PAYSAFE_BASE = PAYSAFE_ENV === "live" || PAYSAFE_ENV === "production"
  ? "https://api.paysafe.com"
  : "https://api.test.paysafe.com";

export function paysafeAuthHeader() {
  if (!PAYSAFE_API_KEY) throw new Error("PAYSAFE_API_KEY not configured");
  return `Basic ${btoa(PAYSAFE_API_KEY)}`;
}

export async function paysafeGet(path: string, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${PAYSAFE_BASE}${path}`, {
      method: "GET",
      headers: { Authorization: paysafeAuthHeader() },
      signal: ctrl.signal,
    });
    const json = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export function mapPaysafeCreditStatus(rawStatus: string, eventType = ""): "completed" | "failed" | "reversed" | "processing" | null {
  const s = (rawStatus || "").toUpperCase();
  const ev = (eventType || "").toUpperCase();

  const isReversal =
    ev.includes("CANCELLED") || ev.includes("CANCELED") ||
    ev.includes("EXPIRED") || ev.includes("RETURNED") || ev.includes("REVERSED") ||
    s.includes("CANCELLED") || s.includes("CANCELED") ||
    s.includes("EXPIRED") || s.includes("RETURNED") || s.includes("REVERSED");

  const isCompleted =
    ev.includes("DISBURSEMENT_COMPLETED") ||
    ev.includes("SA CREDIT COMPLETED") ||
    ev.includes("STANDALONE CREDIT COMPLETED") ||
    ev.includes("STANDALONE_CREDIT_COMPLETED") ||
    ["COMPLETED", "DELIVERED", "DEPOSITED", "RECEIVED", "PAYMENT_COMPLETED", "PAYMENT_HANDLE_COMPLETED"]
      .some((v) => s.includes(v) || ev.includes(v));

  const isFailed = !isCompleted && !isReversal && (
    ev.includes("DISBURSEMENT_FAILED") ||
    ev.includes("SA CREDIT FAILED") ||
    ev.includes("STANDALONE CREDIT FAILED") ||
    ["FAILED", "DECLINED", "PAYMENT_FAILED", "PAYMENT_HANDLE_FAILED", "ERRORED", "ERROR"]
      .some((v) => s.includes(v) || ev.includes(v))
  );

  if (isCompleted) return "completed";
  if (isReversal) return "reversed";
  if (isFailed) return "failed";
  if (s.includes("PROCESSING") || s.includes("PENDING") || s.includes("INITIATED") || s.includes("RECEIVED")) {
    return "processing";
  }
  return null;
}
