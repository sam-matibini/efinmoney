import { geminiKeyCandidates, looksLikeGeminiApiKey, normalizeGeminiApiKey } from "./geminiKeyShape.js";

export type SavedSystemApiRow = {
  key: string;
  is_enabled: boolean | null;
  config: unknown;
};

export { geminiKeyCandidates, looksLikeGeminiApiKey, normalizeGeminiApiKey };

export function pickSavedGemini(rows: SavedSystemApiRow[]): { apiKey: string; model: string } | null {
  return geminiKeyCandidates(rows)[0] || null;
}

export function savedGeminiProblem(rows: SavedSystemApiRow[]): string | null {
  const candidates = geminiKeyCandidates(rows);
  if (candidates.some((item) => looksLikeGeminiApiKey(item.apiKey))) return null;
  const labeled = rows.some((row) => {
    const id = row.key.startsWith("system_api:") ? row.key.slice("system_api:".length) : row.key;
    const config = row.config && typeof row.config === "object" ? row.config as { label?: string } : {};
    return row.is_enabled !== false && (`${id} ${config.label || ""}`).toLowerCase().includes("gemini");
  });
  if (!labeled && candidates.length === 0) {
    return "Save the Gemini API key on the Gemini card in System API, then try Alice again.";
  }
  if (!candidates.length) {
    return "The value saved on the Gemini card is not a Google API key. In Google AI Studio, copy the key that starts with AIza and save it again.";
  }
  return null;
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
