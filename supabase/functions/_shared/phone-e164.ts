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

/** Normalize to E.164 (+country…). Never defaults country — see normalizeToE164 in mobile lib. */
export function toE164(phone: string | null | undefined, countryCode?: string | null): string | undefined {
  if (!phone?.trim()) return undefined;

  let raw = phone.trim().replace(/[\s\-().]/g, "");
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("00")) return `+${raw.slice(2)}`;

  const cc = countryCode?.trim().toUpperCase().slice(0, 2);
  if (!cc) return undefined;

  const dial = DIAL[cc];
  if (!dial) return undefined;

  if (raw.startsWith("0")) return `+${dial}${raw.slice(1)}`;
  if (raw.startsWith(dial)) return `+${raw}`;
  if (/^\d{7,15}$/.test(raw)) return `+${dial}${raw}`;

  return undefined;
}
