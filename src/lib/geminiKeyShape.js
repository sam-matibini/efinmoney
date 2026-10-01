const DEFAULT_MODEL = "gemini-2.5-flash";

export function normalizeGeminiApiKey(raw) {
  const stripped = String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/^bearer\s+/i, "")
    .replace(/^['"`]+|['"`]+$/g, "");
  const match = stripped.match(/AIza[0-9A-Za-z_-]{20,}/);
  if (match) return match[0];
  if (/^\d+$/.test(stripped)) return "";
  return stripped;
}

export function looksLikeGeminiApiKey(key) {
  return /^AIza[0-9A-Za-z_-]{30,}$/.test(key);
}

function readConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { label: "", model: "", secrets: {} };
  }
  const publicConfig = value.public_config && typeof value.public_config === "object" ? value.public_config : {};
  const secrets = {};
  if (value.secrets && typeof value.secrets === "object" && !Array.isArray(value.secrets)) {
    for (const [key, item] of Object.entries(value.secrets)) {
      if (typeof item === "string") secrets[key] = item;
    }
  }
  return {
    label: typeof value.label === "string" ? value.label : "",
    model: typeof publicConfig.model === "string" ? publicConfig.model.trim() : "",
    secrets,
  };
}

function secretValues(secrets) {
  const values = [];
  const preferred = [secrets.api_key, secrets.apiKey, secrets.key];
  for (const value of [...preferred, ...Object.values(secrets)]) {
    const key = normalizeGeminiApiKey(value || "");
    if (key && !values.includes(key)) values.push(key);
  }
  return values.sort((a, b) => Number(looksLikeGeminiApiKey(b)) - Number(looksLikeGeminiApiKey(a)));
}

export function geminiKeyCandidates(rows) {
  const found = [];
  for (const row of rows || []) {
    const id = String(row.key || "").startsWith("system_api:") ? String(row.key).slice("system_api:".length) : "";
    const config = readConfig(row.config);
    const label = `${id} ${config.label}`.toLowerCase();
    const rank = id === "gemini" ? 2 : label.includes("gemini") ? 1 : 0;
    if (row.is_enabled === false || rank === 0) continue;
    for (const apiKey of secretValues(config.secrets)) {
      found.push({ apiKey, model: config.model || DEFAULT_MODEL, rank, shaped: looksLikeGeminiApiKey(apiKey) });
    }
  }
  found.sort((a, b) => Number(b.shaped) - Number(a.shaped) || b.rank - a.rank);
  const seen = new Set();
  const out = [];
  for (const item of found) {
    if (seen.has(item.apiKey)) continue;
    seen.add(item.apiKey);
    out.push({ apiKey: item.apiKey, model: item.model });
  }
  return out;
}

export function redactGeminiSecret(message) {
  return String(message || "").replace(/AIza[0-9A-Za-z_-]{8,}/g, "AIza…");
}
