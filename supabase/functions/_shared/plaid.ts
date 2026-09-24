/** Shared Plaid API helpers for edge functions. */

const ALLOWED_ENVS = new Set(["sandbox", "development", "production"]);

export function plaidEnv(): string {
  const raw = (Deno.env.get("PLAID_ENV") || "production").trim().toLowerCase();
  return ALLOWED_ENVS.has(raw) ? raw : "production";
}

export function plaidBaseUrl(): string {
  return `https://${plaidEnv()}.plaid.com`;
}

export function plaidCredentials(): { clientId: string; secret: string } {
  return {
    clientId: (Deno.env.get("PLAID_CLIENT_ID") || "").trim(),
    secret: (Deno.env.get("PLAID_SECRET") || "").trim(),
  };
}

export function plaidConfigured(): boolean {
  const { clientId, secret } = plaidCredentials();
  return Boolean(clientId && secret);
}

export async function plaidFetch(
  path: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const { clientId, secret } = plaidCredentials();
  if (!clientId || !secret) {
    return {
      ok: false,
      status: 500,
      json: { error_message: "Plaid is not configured (PLAID_CLIENT_ID / PLAID_SECRET)" },
    };
  }
  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

export function plaidErrorMessage(json: Record<string, unknown>, fallback = "Plaid request failed"): string {
  return String(
    json.error_message || json.display_message || json.error_code || fallback,
  );
}
