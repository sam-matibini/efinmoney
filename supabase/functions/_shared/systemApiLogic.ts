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
  custom: boolean;
  fields: FieldView[];
};

export type CustomFieldInput = { key?: unknown; label?: unknown; env?: unknown; defaultValue?: unknown; options?: unknown };

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
const FIELD_KEY = /^[a-z][a-z0-9_]{0,40}$/;
const PROVIDER_ID = /^[a-z][a-z0-9_]{1,40}$/;

export function systemApiDef(provider: string): SystemApiDef | null {
  return SYSTEM_API_CATALOG.find((d) => d.provider === provider) ?? null;
}

export function isBuiltinSystemApi(provider: string): boolean {
  return PROVIDERS.has(provider);
}

export function isSystemApiProvider(provider: string): boolean {
  return PROVIDERS.has(provider);
}

function cleanLabel(value: unknown, fallback: string): string {
  const label = typeof value === "string" ? value.trim() : "";
  if (!label) return fallback;
  if (label.length > 80) throw new Error("Field name is too long");
  return label;
}

function cleanKey(value: unknown, fallback: string, used: Set<string>): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  let key = FIELD_KEY.test(raw) ? raw : fallback;
  if (!FIELD_KEY.test(key)) throw new Error("Field key is not valid");
  let unique = key;
  let n = 2;
  while (used.has(unique)) unique = `${key}_${n++}`.slice(0, 41);
  if (!FIELD_KEY.test(unique)) throw new Error("Field key is not valid");
  used.add(unique);
  return unique;
}

export function parseCustomDefinition(input: {
  provider?: unknown;
  label?: unknown;
  description?: unknown;
  definition?: unknown;
}): SystemApiDef {
  const provider = typeof input.provider === "string" ? input.provider.trim().toLowerCase() : "";
  if (!PROVIDER_ID.test(provider)) throw new Error("Use a short name like stripe or twilio");
  if (isBuiltinSystemApi(provider)) throw new Error("That API is already on this page");
  const label = cleanLabel(input.label, "");
  if (!label) throw new Error("Enter a name for the API");
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 240) : "";
  const definition = input.definition && typeof input.definition === "object"
    ? input.definition as { secrets?: unknown; publicFields?: unknown }
    : {};
  const secretInput = Array.isArray(definition.secrets) ? definition.secrets : [{ label: "API key" }];
  const publicInput = Array.isArray(definition.publicFields) ? definition.publicFields : [];
  if (secretInput.length > 8 || publicInput.length > 6) throw new Error("Too many fields");
  const used = new Set<string>();
  const secrets: SecretField[] = secretInput.map((item, index) => {
    const field = (item || {}) as CustomFieldInput;
    const fieldLabel = cleanLabel(field.label, index === 0 ? "API key" : "");
    if (!fieldLabel) throw new Error("Each key needs a name");
    const env = typeof field.env === "string" ? field.env.trim().toUpperCase() : "";
    if (env && !/^[A-Z][A-Z0-9_]{0,60}$/.test(env)) throw new Error("Server secret name is not valid");
    return { key: cleanKey(field.key, "api_key", used), label: fieldLabel, env };
  });
  if (!secrets.length) throw new Error("Add at least one key");
  const publicFields: PublicField[] = publicInput.map((item) => {
    const field = (item || {}) as CustomFieldInput;
    const fieldLabel = cleanLabel(field.label, "");
    if (!fieldLabel) throw new Error("Each setting needs a name");
    const options = Array.isArray(field.options)
      ? field.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 8)
      : undefined;
    return {
      key: cleanKey(field.key, "setting", used),
      label: fieldLabel,
      defaultValue: typeof field.defaultValue === "string" ? field.defaultValue.trim().slice(0, 200) : "",
      options: options?.length ? options : undefined,
    };
  });
  return { provider, label, description, secrets, publicFields };
}

export function defFromStoredSchema(
  provider: string,
  label: string,
  description: string,
  schema: unknown,
): SystemApiDef | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;
  try {
    return parseCustomDefinition({
      provider,
      label,
      description,
      definition: schema,
    });
  } catch {
    return null;
  }
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
    if (def.provider === "gemini" && field.key === "model" && !/^[a-zA-Z0-9._-]{1,80}$/.test(value)) {
      throw new Error("Model name is not valid");
    }
    if (def.provider === "resend" && field.key === "from" && !value.includes("@")) {
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
      env: field.env || null,
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
    custom: !isBuiltinSystemApi(def.provider),
    fields,
  };
}
