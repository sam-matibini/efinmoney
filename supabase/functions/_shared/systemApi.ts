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

async function loadIntegrationApi(
  admin: ReturnType<typeof createClient>,
  provider: string,
): Promise<Loaded | null> {
  const { data, error } = await admin
    .from("integration_settings")
    .select("is_enabled, config")
    .eq("key", `system_api:${provider}`)
    .maybeSingle();
  if (error || !data) return null;
  const config = data.config && typeof data.config === "object" ? data.config as Record<string, unknown> : {};
  return {
    enabled: data.is_enabled !== false,
    secrets: asRecord(config.secrets),
    publicConfig: asRecord(config.public_config),
    at: Date.now(),
  };
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
    if (error || !row) {
      if (error) console.warn("system api provider lookup", provider, error.message);
      const saved = await loadIntegrationApi(admin, provider);
      if (saved) {
        cache.set(provider, { at: Date.now(), row: saved });
        return saved;
      }
      if (!error) cache.set(provider, { at: Date.now(), row: null });
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
  if (apiKey) return { apiKey, model: model || "gemini-2.5-flash" };
  const saved = await findLabeledGeminiKey();
  if (saved) return saved;
  return { apiKey: "", model: model || "gemini-2.5-flash" };
}

async function findLabeledGeminiKey(): Promise<{ apiKey: string; model: string } | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("integration_settings")
    .select("key, is_enabled, config")
    .like("key", "system_api:%");
  if (error || !data) return null;
  const ranked = data
    .map((row) => {
      const id = String(row.key || "").replace(/^system_api:/, "");
      const config = row.config && typeof row.config === "object" ? row.config as Record<string, unknown> : {};
      const label = `${id} ${typeof config.label === "string" ? config.label : ""}`.toLowerCase();
      const rank = id === "gemini" ? 2 : label.includes("gemini") ? 1 : 0;
      const secrets = config.secrets && typeof config.secrets === "object" ? config.secrets as Record<string, unknown> : {};
      const preferred = [secrets.api_key, secrets.apiKey, secrets.key].find((value) => typeof value === "string" && value.trim());
      const fallback = Object.values(secrets).find((value) => typeof value === "string" && value.trim());
      const apiKey = preferred || fallback;
      const publicConfig = config.public_config && typeof config.public_config === "object"
        ? config.public_config as Record<string, unknown>
        : {};
      const model = typeof publicConfig.model === "string" && publicConfig.model.trim()
        ? publicConfig.model.trim()
        : "gemini-2.5-flash";
      return { enabled: row.is_enabled !== false, rank, apiKey: typeof apiKey === "string" ? apiKey.trim() : "", model };
    })
    .filter((row) => row.enabled && row.rank > 0 && row.apiKey)
    .sort((a, b) => b.rank - a.rank);
  const match = ranked[0];
  return match ? { apiKey: match.apiKey, model: match.model } : null;
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
