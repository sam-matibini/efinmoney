const DEFAULT_MODEL = "gemini-2.5-flash";

export type SavedSystemApiRow = {
  key: string;
  is_enabled: boolean | null;
  config: unknown;
};

export function pickSavedGemini(rows: SavedSystemApiRow[]): { apiKey: string; model: string } | null {
  const ranked = rows
    .map((row) => {
      const id = row.key.startsWith("system_api:") ? row.key.slice("system_api:".length) : "";
      const config = readConfig(row.config);
      const label = `${id} ${config.label}`.toLowerCase();
      const gemini = id === "gemini" ? 2 : label.includes("gemini") ? 1 : 0;
      return { enabled: row.is_enabled !== false, config, gemini };
    })
    .filter((row) => row.enabled && row.gemini > 0)
    .sort((a, b) => b.gemini - a.gemini);

  for (const row of ranked) {
    const apiKey = firstSecret(row.config.secrets);
    if (!apiKey) continue;
    return { apiKey, model: row.config.model || DEFAULT_MODEL };
  }
  return null;
}

function readConfig(value: unknown): { label: string; model: string; secrets: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { label: "", model: "", secrets: {} };
  }
  const record = value as { label?: unknown; public_config?: unknown; secrets?: unknown };
  const publicConfig = record.public_config && typeof record.public_config === "object"
    ? record.public_config as { model?: unknown }
    : {};
  const secrets: Record<string, string> = {};
  if (record.secrets && typeof record.secrets === "object" && !Array.isArray(record.secrets)) {
    for (const [key, item] of Object.entries(record.secrets as Record<string, unknown>)) {
      if (typeof item === "string") secrets[key] = item;
    }
  }
  return {
    label: typeof record.label === "string" ? record.label : "",
    model: typeof publicConfig.model === "string" ? publicConfig.model.trim() : "",
    secrets,
  };
}

function firstSecret(secrets: Record<string, string>): string {
  const preferred = secrets.api_key || secrets.apiKey || secrets.key || "";
  if (preferred.trim()) return preferred.trim();
  for (const value of Object.values(secrets)) {
    if (value.trim()) return value.trim();
  }
  return "";
}

export function isMissingGeminiError(message: string): boolean {
  return /missing gemini api key|GEMINI_API_KEY/i.test(message);
}

/** Use the saved System API key when Alice's function has no Gemini key of its own. */
export function shouldUseSavedGemini(serverReply: string, serverMessage: string): boolean {
  if (serverReply && !isMissingGeminiError(serverReply)) return false;
  if (serverMessage && !isMissingGeminiError(serverMessage)) return false;
  return true;
}
