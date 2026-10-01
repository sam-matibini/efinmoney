export function normalizeGeminiApiKey(raw: string): string;
export function looksLikeGeminiApiKey(key: string): boolean;
export function geminiKeyCandidates(
  rows: { key?: string; is_enabled?: boolean | null; config?: unknown }[],
): { apiKey: string; model: string }[];
export function redactGeminiSecret(message: string): string;
