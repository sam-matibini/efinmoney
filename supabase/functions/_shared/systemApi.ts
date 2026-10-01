/** Load System API credentials saved by admins. Falls back to server secrets. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SYSTEM_API_CATALOG, systemApiDef } from "./systemApiLogic.ts";

type Loaded = {
  enabled: boolean;
  secrets: Record<string, string>;
  publicConfig: Record<string, string>;
  at: number;
};

const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; row: Loaded | null }>();

export function clearSystemApiCache(provider?: string) {
  if (provider) cache.delete(provider);
  else cache.clear();
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && item.trim()) out[key] = item.trim();
  }
  return out;
}

export async function loadSystemApi(provider: string): Promise<Loaded | null> {
  const hit = cache.get(provider);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.row;

  try {
    const admin = adminClient();
    const { data: row, error } = await admin
      .from("system_api_providers")
      .select("is_enabled, public_config, updated_at")
      .eq("provider", provider)
      .maybeSingle();
    if (error) {
      console.warn("system api provider lookup", provider, error.message);
      return null;
    }
    if (!row) {
      cache.set(provider, { at: Date.now(), row: null });
      return null;
    }
    const { data: secretRow, error: secretErr } = await admin
      .from("system_api_secrets")
      .select("secrets")
      .eq("provider", provider)
      .maybeSingle();
    if (secretErr) console.warn("system api secret lookup", provider, secretErr.message);
    const loaded: Loaded = {
      enabled: row.is_enabled !== false,
      secrets: asRecord(secretRow?.secrets),
      publicConfig: asRecord(row.public_config),
      at: Date.now(),
    };
    cache.set(provider, { at: Date.now(), row: loaded });
    return loaded;
  } catch (err) {
    console.warn("system api load failed", provider, err instanceof Error ? err.message : err);
    return null;
  }
}

function first(saved: string | undefined, envName: string): string {
  const fromSaved = (saved || "").trim();
  if (fromSaved) return fromSaved;
  return (Deno.env.get(envName) || "").trim();
}

export async function resolveSystemSecret(provider: string, field: string, envName: string): Promise<string> {
  const row = await loadSystemApi(provider);
  if (!row) return (Deno.env.get(envName) || "").trim();
  if (!row.enabled) return "";
  return first(row.secrets[field], envName);
}

export async function resolveSystemPublic(
  provider: string,
  field: string,
  fallback: string,
): Promise<string> {
  const row = await loadSystemApi(provider);
  if (!row || !row.enabled) return fallback;
  return (row.publicConfig[field] || "").trim() || fallback;
}

export async function geminiCredentials(): Promise<{ apiKey: string; model: string }> {
  const def = systemApiDef("gemini");
  const modelDefault = def?.publicFields.find((f) => f.key === "model")?.defaultValue || "gemini-3.5-flash";
  const [apiKey, model] = await Promise.all([
    resolveSystemSecret("gemini", "api_key", "GEMINI_API_KEY"),
    resolveSystemPublic("gemini", "model", modelDefault),
  ]);
  return { apiKey, model };
}

export async function resendCredentials(): Promise<{ apiKey: string; from: string | null }> {
  const [apiKey, from] = await Promise.all([
    resolveSystemSecret("resend", "api_key", "RESEND_API_KEY"),
    resolveSystemPublic("resend", "from", ""),
  ]);
  return { apiKey, from: from || null };
}

export function envHas(name: string): boolean {
  return Boolean((Deno.env.get(name) || "").trim());
}

export function catalog() {
  return SYSTEM_API_CATALOG;
}
