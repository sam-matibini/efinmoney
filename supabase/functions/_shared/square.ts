/** Square Payments API helpers (Web Payments SDK → CreatePayment). */

export type SquareConfig = {
  accessToken: string;
  applicationId: string;
  locationId: string;
  environment: "production" | "sandbox";
  apiBase: string;
};

export function getSquareConfig(): SquareConfig {
  const accessToken = (Deno.env.get("SQUARE_ACCESS_TOKEN") || "").trim();
  const applicationId = (Deno.env.get("SQUARE_APPLICATION_ID") || "").trim();
  const locationId = (Deno.env.get("SQUARE_LOCATION_ID") || "").trim();
  const environment = (Deno.env.get("SQUARE_ENVIRONMENT") || "production").trim().toLowerCase() === "sandbox"
    ? "sandbox"
    : "production";
  const apiBase = environment === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
  return { accessToken, applicationId, locationId, environment, apiBase };
}

export function squareConfigured(cfg = getSquareConfig()): boolean {
  return !!(cfg.accessToken && cfg.applicationId && cfg.locationId);
}

/** Major units → Square smallest currency unit (cents for USD/CAD/EUR/GBP). */
export function toSquareAmountMoney(amount: number, currency: string): { amount: bigint; currency: string } {
  const ccy = currency.toUpperCase();
  const zeroDecimal = new Set(["JPY", "KRW", "VND"]);
  const cents = zeroDecimal.has(ccy)
    ? Math.round(amount)
    : Math.round(amount * 100);
  return { amount: BigInt(cents), currency: ccy };
}

export async function squareFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<{ ok: boolean; status: number; json: any }> {
  const cfg = getSquareConfig();
  if (!cfg.accessToken) {
    return { ok: false, status: 503, json: { errors: [{ detail: "Square not configured" }] } };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.accessToken}`,
    "Content-Type": "application/json",
    "Square-Version": "2025-01-23",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...init,
    headers,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}
