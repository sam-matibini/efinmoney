import type { SystemApiProvider } from "@/components/admin/SystemApiPanel";

function secret(key: string, label: string, env: string) {
  return {
    key,
    label,
    kind: "secret" as const,
    env,
    configured: false,
    source: "missing" as const,
    hint: null,
    value: null,
  };
}

function setting(key: string, label: string, value: string, options?: string[]) {
  return {
    key,
    label,
    kind: "public" as const,
    env: null,
    configured: Boolean(value),
    source: "default" as const,
    hint: null,
    value,
    options,
  };
}

/** Cards shown before the system-api function answers, so the tab is never blank. */
export const FALLBACK_SYSTEM_APIS: SystemApiProvider[] = [
  {
    provider: "gemini",
    label: "Gemini",
    description: "Google Gemini API for the Alice AI assistant.",
    is_enabled: true,
    updated_at: null,
    custom: false,
    fields: [
      secret("api_key", "API key", "GEMINI_API_KEY"),
      setting("model", "Model", "gemini-3.5-flash"),
    ],
  },
  {
    provider: "plaid",
    label: "Plaid",
    description: "Bank linking, identity verification, and monitor screening.",
    is_enabled: true,
    updated_at: null,
    custom: false,
    fields: [
      secret("client_id", "Client ID", "PLAID_CLIENT_ID"),
      secret("secret", "Secret", "PLAID_SECRET"),
      secret("idv_template_id", "Identity Verification template ID", "PLAID_IDV_TEMPLATE_ID"),
      secret("monitor_program_id", "Monitor program ID", "PLAID_MONITOR_PROGRAM_ID"),
      setting("env", "Environment", "production", ["sandbox", "development", "production"]),
    ],
  },
  {
    provider: "resend",
    label: "Resend",
    description: "Transactional email, including KYC approval notices.",
    is_enabled: true,
    updated_at: null,
    custom: false,
    fields: [
      secret("api_key", "API key", "RESEND_API_KEY"),
      setting("from", "From address", ""),
    ],
  },
];

export const TESTABLE_SYSTEM_APIS = new Set(["gemini", "plaid", "resend"]);
