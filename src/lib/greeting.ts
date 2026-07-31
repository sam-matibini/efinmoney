// Map ISO country code -> representative IANA timezone for greeting purposes.
// We only need a single TZ per country; for large countries we pick the capital/most populous.
import { SYSTEM_TIMEZONE } from "./systemDefaults";

const COUNTRY_TZ: Record<string, string> = {
  CA: "America/Toronto",
  US: "America/New_York",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  NG: "Africa/Lagos",
  GH: "Africa/Accra",
  KE: "Africa/Nairobi",
  UG: "Africa/Kampala",
  TZ: "Africa/Dar_es_Salaam",
  ZM: "Africa/Lusaka",
  BI: "Africa/Bujumbura",
  RW: "Africa/Kigali",
  ZA: "Africa/Johannesburg",
  EG: "Africa/Cairo",
  MA: "Africa/Casablanca",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  PT: "Europe/Lisbon",
  CH: "Europe/Zurich",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  PL: "Europe/Warsaw",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  IN: "Asia/Kolkata",
  PK: "Asia/Karachi",
  CN: "Asia/Shanghai",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  SG: "Asia/Singapore",
  HK: "Asia/Hong_Kong",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  BR: "America/Sao_Paulo",
  MX: "America/Mexico_City",
  AR: "America/Argentina/Buenos_Aires",
  BW: "Africa/Gaborone",
  NA: "Africa/Windhoek",
  ZW: "Africa/Harare",
  MW: "Africa/Blantyre",
  MZ: "Africa/Maputo",
  ET: "Africa/Addis_Ababa",
  SN: "Africa/Dakar",
  CI: "Africa/Abidjan",
  CM: "Africa/Douala",
};

/** ISO-2 country code → representative IANA timezone (null when unknown). */
export const countryTimezone = (countryCode?: string | null): string | null => {
  if (!countryCode) return null;
  return COUNTRY_TZ[countryCode.trim().toUpperCase().slice(0, 2)] || null;
};

export const getHourForCountry = (countryCode?: string | null): number => {
  const tz = countryTimezone(countryCode) ?? SYSTEM_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    const h = parts.find((p) => p.type === "hour")?.value;
    const n = h ? parseInt(h, 10) : NaN;
    return Number.isFinite(n) ? n : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
};

export const getGreeting = (countryCode?: string | null) => {
  const hour = getHourForCountry(countryCode);
  if (hour < 5) return { emoji: "🌙", text: "Good night" };
  if (hour < 12) return { emoji: "🌅", text: "Good morning" };
  if (hour < 17) return { emoji: "☀️", text: "Good afternoon" };
  if (hour < 21) return { emoji: "🌆", text: "Good evening" };
  return { emoji: "🌙", text: "Good night" };
};
