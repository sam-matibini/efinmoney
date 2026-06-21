/** ISO-2 → country calling code (common eFin markets). */
export const DIAL: Record<string, string> = {
  NG: "234",
  US: "1",
  CA: "1",
  GB: "44",
  KE: "254",
  GH: "233",
  UG: "256",
  TZ: "255",
  ZA: "27",
  FR: "33",
  DE: "49",
};

/**
 * Normalize to E.164 (+country…).
 * - Already has + or 00 → converted as-is (any country).
 * - Local leading 0 (e.g. 080…) → only if `countryCode` is set (NG→+234, CA→+1…).
 * - Never guesses country — no default to Nigeria.
 */
export function normalizeToE164(phone: string, countryCode?: string | null): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  let raw = trimmed.replace(/[\s\-().]/g, "");
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("00")) return `+${raw.slice(2)}`;

  const cc = countryCode?.trim().toUpperCase().slice(0, 2);
  if (!cc) return null;

  const dial = DIAL[cc];
  if (!dial) return null;

  if (raw.startsWith("0")) return `+${dial}${raw.slice(1)}`;
  if (raw.startsWith(dial)) return `+${raw}`;
  if (/^\d{7,15}$/.test(raw)) return `+${dial}${raw}`;

  return null;
}

export function isLikelyE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.replace(/[\s\-()]/g, ""));
}
