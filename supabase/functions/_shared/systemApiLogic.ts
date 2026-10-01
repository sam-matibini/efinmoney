/** Pure System API catalog and save rules. No Deno or network calls. */

export type SecretField = { key: string; label: string; env: string };
export type PublicField = {
  key: string;
  label: string;
  defaultValue: string;
  options?: string[];
};

export type SystemApiDef = {
  provider: string;
  label: string;
  description: string;
  secrets: SecretField[];
  publicFields: PublicField[];
};

export type FieldView = {
  key: string;
  label: string;
  kind: "secret" | "public";
  env: string | null;
  configured: boolean;
  source: "saved" | "server" | "missing" | "default";
  hint: string | null;
  value: string | null;
  options?: string[];
};

export type ProviderView = {
  provider: string;
  label: string;
  description: string;
  is_enabled: boolean;
  updated_at: string | null;
  fields: FieldView[];
};

export const SYSTEM_API_CATALOG: SystemApiDef[] = [
  {
    provider: "gemini",
    label: "Gemini",
    description: "Google Gemini API for the Alice AI assistant.",
    secrets: [{ key: "api_key", label: "API key", env: "GEMINI_API_KEY" }],
    publicFields: [{ key: "model", label: "Model", defaultValue: "gemini-3.5-flash" }],
  },
  {
    provider: "plaid",
    label: "Plaid",
    description: "Bank linking, identity verification, and monitor screening.",
    secrets: [
      { key: "client_id", label: "Client ID", env: "PLAID_CLIENT_ID" },
      { key: "secret", label: "Secret", env: "PLAID_SECRET" },
      { key: "idv_template_id", label: "Identity Verification template ID", env: "PLAID_IDV_TEMPLATE_ID" },
      { key: "monitor_program_id", label: "Monitor program ID", env: "PLAID_MONITOR_PROGRAM_ID" },
    ],
    publicFields: [{
      key: "env",
      label: "Environment",
      defaultValue: "production",
      options: ["sandbox", "development", "production"],
    }],
  },
  {
    provider: "resend",
    label: "Resend",
    description: "Transactional email, including KYC approval notices.",
    secrets: [{ key: "api_key", label: "API key", env: "RESEND_API_KEY" }],
    publicFields: [{
      key: "from",
      label: "From address",
      defaultValue: "",
    }],
  },
];

const PROVIDERS = new Set(SYSTEM_API_CATALOG.map((d) => d.provider));

export function systemApiDef(provider: string): SystemApiDef | null {
  return SYSTEM_API_CATALOG.find((d) => d.provider === provider) ?? null;
}

export function isSystemApiProvider(provider: string): boolean {
  return PROVIDERS.has(provider);
}

export function secretHint(value: string | null | undefined): string | null {
  const v = String(value || "").trim();
  if (!v) return null;
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-4)}`;
}

export function mergeSecrets(
  existing: Record<string, string>,
  incoming: Record<string, unknown> | undefined,
  clear: string[] | undefined,
  allowed: string[],
): Record<string, string> {
  const allow = new Set(allowed);
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(existing || {})) {
    if (allow.has(key) && typeof value === "string" && value.trim()) next[key] = value.trim();
  }
  for (const key of clear || []) {
    if (allow.has(key)) delete next[key];
  }
  for (const [key, value] of Object.entries(incoming || {})) {
    if (!allow.has(key) || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > 4000) throw new Error(`${key} is too long`);
    next[key] = trimmed;
  }
  return next;
}

export function normalizePublicConfig(
  def: SystemApiDef,
  incoming: Record<string, unknown> | undefined,
  existing: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...existing };
  for (const field of def.publicFields) {
    const raw = incoming && Object.prototype.hasOwnProperty.call(incoming, field.key)
      ? incoming[field.key]
      : existing[field.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      delete next[field.key];
      continue;
    }
    if (value.length > 200) throw new Error(`${field.label} is too long`);
    if (field.options && !field.options.includes(value)) {
      throw new Error(`${field.label} must be ${field.options.join(", ")}`);
    }
    if (field.key === "model" && !/^[a-zA-Z0-9._-]{1,80}$/.test(value)) {
      throw new Error("Model name is not valid");
    }
    if (field.key === "from" && !value.includes("@")) {
      throw new Error("From address must include an email");
    }
    next[field.key] = value;
  }
  return next;
}

export function buildProviderView(
  def: SystemApiDef,
  row: { is_enabled: boolean; public_config: Record<string, string>; updated_at: string | null } | null,
  secrets: Record<string, string>,
  envHas: (name: string) => boolean,
): ProviderView {
  const enabled = row ? row.is_enabled !== false : true;
  const publicConfig = row?.public_config || {};
  const fields: FieldView[] = [];

  for (const field of def.secrets) {
    const saved = String(secrets[field.key] || "").trim();
    const onServer = envHas(field.env);
    const source = saved ? "saved" : onServer ? "server" : "missing";
    fields.push({
      key: field.key,
      label: field.label,
      kind: "secret",
      env: field.env,
      configured: enabled && (Boolean(saved) || onServer),
      source,
      hint: saved ? secretHint(saved) : null,
      value: null,
    });
  }

  for (const field of def.publicFields) {
    const saved = String(publicConfig[field.key] || "").trim();
    const value = saved || field.defaultValue;
    fields.push({
      key: field.key,
      label: field.label,
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
    provider: def.provider,
    label: def.label,
    description: def.description,
    is_enabled: enabled,
    updated_at: row?.updated_at ?? null,
    fields,
  };
}
