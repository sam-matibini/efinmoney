/** Shared Plaid API helpers for edge functions. */
import { resolveSystemPublic, resolveSystemSecret } from "./systemApi.ts";

const ALLOWED_ENVS = new Set(["sandbox", "development", "production"]);

type PlaidOverlay = {
  clientId: string;
  secret: string;
  env: string;
  idvTemplateId: string;
  monitorProgramId: string;
};

let overlay: PlaidOverlay | null = null;
let overlayAt = 0;

export async function ensurePlaid(): Promise<void> {
  if (overlay && Date.now() - overlayAt < 30_000) return;
  const [clientId, secret, env, idvTemplateId, monitorProgramId] = await Promise.all([
    resolveSystemSecret("plaid", "client_id", "PLAID_CLIENT_ID"),
    resolveSystemSecret("plaid", "secret", "PLAID_SECRET"),
    resolveSystemPublic("plaid", "env", (Deno.env.get("PLAID_ENV") || "production").trim()),
    resolveSystemSecret("plaid", "idv_template_id", "PLAID_IDV_TEMPLATE_ID"),
    resolveSystemSecret("plaid", "monitor_program_id", "PLAID_MONITOR_PROGRAM_ID"),
  ]);
  const normalized = env.trim().toLowerCase();
  overlay = {
    clientId,
    secret,
    env: ALLOWED_ENVS.has(normalized) ? normalized : "production",
    idvTemplateId,
    monitorProgramId,
  };
  overlayAt = Date.now();
}

export function plaidEnv(): string {
  if (overlay?.env) return overlay.env;
  const raw = (Deno.env.get("PLAID_ENV") || "production").trim().toLowerCase();
  return ALLOWED_ENVS.has(raw) ? raw : "production";
}

export function plaidBaseUrl(): string {
  return `https://${plaidEnv()}.plaid.com`;
}

export function plaidCredentials(): { clientId: string; secret: string } {
  if (overlay) return { clientId: overlay.clientId, secret: overlay.secret };
  return {
    clientId: (Deno.env.get("PLAID_CLIENT_ID") || "").trim(),
    secret: (Deno.env.get("PLAID_SECRET") || "").trim(),
  };
}

export function plaidIdvTemplateId(): string {
  return overlay?.idvTemplateId || (Deno.env.get("PLAID_IDV_TEMPLATE_ID") || "").trim();
}

export function plaidMonitorProgramId(): string {
  return overlay?.monitorProgramId || (Deno.env.get("PLAID_MONITOR_PROGRAM_ID") || "").trim();
}

export function plaidConfigured(): boolean {
  const { clientId, secret } = plaidCredentials();
  return Boolean(clientId && secret);
}

export async function plaidReady(): Promise<boolean> {
  await ensurePlaid();
  return plaidConfigured();
}

export async function plaidFetch(
  path: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  await ensurePlaid();
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
