import type { SystemApiField, SystemApiProvider } from "@/components/admin/SystemApiPanel";

export const SYSTEM_API_KEY_PREFIX = "system_api:";

export type StoredSystemApiConfig = {
  label?: string;
  description?: string;
  public_config?: Record<string, string>;
  secrets?: Record<string, string>;
  fields?: {
    secrets?: { key?: string; label?: string; env?: string | null }[];
    publicFields?: { key?: string; label?: string; defaultValue?: string; options?: string[] }[];
  };
};

export type StoredSystemApiRow = {
  key: string;
  is_enabled: boolean;
  config: unknown;
  updated_at?: string | null;
};

export function normalizeProviderId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function assertProviderId(value: string): string {
  const id = normalizeProviderId(value);
  if (!/^[a-z0-9][a-z0-9_]{0,39}$/.test(id)) {
    throw new Error("Use a short id, such as gemini or a project number");
  }
  return id;
}

export function systemApiRowKey(provider: string): string {
  return `${SYSTEM_API_KEY_PREFIX}${assertProviderId(provider)}`;
}

export function secretHint(value: string | null | undefined): string | null {
  const v = String(value || "").trim();
  if (!v) return null;
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-4)}`;
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

export function readStoredConfig(value: unknown): StoredSystemApiConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as StoredSystemApiConfig;
  return {
    label: typeof record.label === "string" ? record.label : undefined,
    description: typeof record.description === "string" ? record.description : undefined,
    public_config: asRecord(record.public_config),
    secrets: asRecord(record.secrets),
    fields: record.fields,
  };
}

export function mergeSavedSecrets(
  existing: Record<string, string>,
  incoming: Record<string, string>,
  clear: string[],
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(existing || {})) {
    if (value.trim()) next[key] = value.trim();
  }
  for (const key of clear) delete next[key];
  for (const [key, value] of Object.entries(incoming || {})) {
    const trimmed = value.trim();
    if (trimmed) next[key] = trimmed;
  }
  return next;
}

function applyRow(provider: SystemApiProvider, row: StoredSystemApiRow | undefined): SystemApiProvider {
  if (!row) return provider;
  const config = readStoredConfig(row.config);
  const secrets = config.secrets || {};
  const publicConfig = config.public_config || {};
  return {
    ...provider,
    is_enabled: row.is_enabled !== false,
    updated_at: row.updated_at || provider.updated_at,
    fields: provider.fields.map((field) => {
      if (field.kind === "secret") {
        const saved = (secrets[field.key] || "").trim();
        return {
          ...field,
          source: saved ? "saved" : field.source,
          hint: saved ? secretHint(saved) : field.hint,
          configured: row.is_enabled !== false && (Boolean(saved) || field.configured),
          value: null,
        };
      }
      const saved = (publicConfig[field.key] || "").trim();
      if (!saved) return field;
      return { ...field, value: saved, source: "saved", configured: true };
    }),
  };
}

function customProvider(id: string, row: StoredSystemApiRow): SystemApiProvider {
  const config = readStoredConfig(row.config);
  const fields: SystemApiField[] = [];
  const secretDefs = config.fields?.secrets?.length
    ? config.fields.secrets
    : [{ key: "api_key", label: "API key" }];
  for (const field of secretDefs) {
    const key = field.key || "api_key";
    const saved = (config.secrets?.[key] || "").trim();
    fields.push({
      key,
      label: field.label || "API key",
      kind: "secret",
      env: field.env || null,
      configured: row.is_enabled !== false && Boolean(saved),
      source: saved ? "saved" : "missing",
      hint: saved ? secretHint(saved) : null,
      value: null,
    });
  }
  for (const field of config.fields?.publicFields || []) {
    const key = field.key || "setting";
    const saved = (config.public_config?.[key] || "").trim();
    const value = saved || field.defaultValue || "";
    fields.push({
      key,
      label: field.label || "Setting",
      kind: "public",
      env: null,
      configured: Boolean(value),
      source: saved ? "saved" : "default",
      hint: null,
      value,
      options: field.options,
    });
  }
  return {
    provider: id,
    label: config.label || id,
    description: config.description || "",
    is_enabled: row.is_enabled !== false,
    updated_at: row.updated_at || null,
    custom: true,
    fields,
  };
}

export function mergeSystemApiRows(
  fallback: SystemApiProvider[],
  rows: StoredSystemApiRow[],
): SystemApiProvider[] {
  const byProvider = new Map<string, StoredSystemApiRow>();
  for (const row of rows) {
    if (!row.key.startsWith(SYSTEM_API_KEY_PREFIX)) continue;
    const id = row.key.slice(SYSTEM_API_KEY_PREFIX.length);
    if (id) byProvider.set(id, row);
  }
  const builtin = new Set(fallback.map((item) => item.provider));
  const providers = fallback.map((item) => applyRow(item, byProvider.get(item.provider)));
  for (const [id, row] of byProvider) {
    if (builtin.has(id)) continue;
    providers.push(customProvider(id, row));
  }
  return providers;
}
