// Resolve a display country for a user profile.
//
// Priority: address_country → country_code → phone dial code → Unknown.

import { ISO_COUNTRIES } from "@/lib/isoCountries";
import { COUNTRY_NAME_TO_CODE } from "@/lib/flags";

export interface ResolvedCountry {
  /** ISO 3166-1 alpha-2, or null when unresolved. */
  code: string | null;
  name: string;
  flag: string;
  source: "address" | "profile" | "phone" | "unknown";
}

const UNKNOWN: ResolvedCountry = { code: null, name: "Unknown", flag: "🌐", source: "unknown" };

/** Longest-prefix-first dial code → ISO2 for the corridors we serve. */
const DIAL_TO_ISO: Array<[string, string]> = [
  ["1868", "TT"], ["1246", "BB"], ["1876", "JM"],
  ["211", "SS"], ["212", "MA"], ["213", "DZ"], ["216", "TN"], ["220", "GM"],
  ["221", "SN"], ["223", "ML"], ["224", "GN"], ["225", "CI"], ["226", "BF"],
  ["227", "NE"], ["228", "TG"], ["229", "BJ"], ["230", "MU"], ["231", "LR"],
  ["232", "SL"], ["233", "GH"], ["234", "NG"], ["235", "TD"], ["236", "CF"],
  ["237", "CM"], ["238", "CV"], ["239", "ST"], ["240", "GQ"], ["241", "GA"],
  ["242", "CG"], ["243", "CD"], ["244", "AO"], ["250", "RW"], ["251", "ET"],
  ["252", "SO"], ["253", "DJ"], ["254", "KE"], ["255", "TZ"], ["256", "UG"],
  ["257", "BI"], ["258", "MZ"], ["260", "ZM"], ["261", "MG"], ["263", "ZW"],
  ["264", "NA"], ["265", "MW"], ["266", "LS"], ["267", "BW"], ["268", "SZ"],
  ["27", "ZA"], ["249", "SD"],
  ["351", "PT"], ["352", "LU"], ["353", "IE"], ["31", "NL"], ["32", "BE"],
  ["33", "FR"], ["34", "ES"], ["39", "IT"], ["41", "CH"], ["43", "AT"],
  ["44", "GB"], ["45", "DK"], ["46", "SE"], ["47", "NO"], ["48", "PL"],
  ["49", "DE"],
  ["852", "HK"], ["855", "KH"], ["856", "LA"], ["86", "CN"], ["81", "JP"],
  ["82", "KR"], ["84", "VN"], ["91", "IN"], ["92", "PK"], ["93", "AF"],
  ["94", "LK"], ["95", "MM"], ["880", "BD"], ["971", "AE"], ["972", "IL"],
  ["973", "BH"], ["974", "QA"], ["965", "KW"], ["966", "SA"], ["968", "OM"],
  ["962", "JO"], ["961", "LB"], ["60", "MY"], ["61", "AU"], ["62", "ID"],
  ["63", "PH"], ["64", "NZ"], ["65", "SG"], ["66", "TH"],
  ["52", "MX"], ["54", "AR"], ["55", "BR"], ["56", "CL"], ["57", "CO"],
  ["58", "VE"], ["51", "PE"],
].sort((a, b) => b[0].length - a[0].length) as Array<[string, string]>;

const isoIndex = new Map(ISO_COUNTRIES.map((c) => [c.code, c]));

const flagFromCode = (code: string) =>
  isoIndex.get(code)?.flag ??
  String.fromCodePoint(...code.split("").map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));

const nameFromCode = (code: string) => isoIndex.get(code)?.name ?? code;

const build = (code: string, source: ResolvedCountry["source"]): ResolvedCountry => ({
  code,
  name: nameFromCode(code),
  flag: flagFromCode(code),
  source,
});

/** Accepts an ISO2 code or a full country name. */
const toIso2 = (value?: string | null): string | null => {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  const byName = ISO_COUNTRIES.find((c) => c.name.toLowerCase() === v.toLowerCase());
  if (byName) return byName.code;
  return COUNTRY_NAME_TO_CODE[v] ?? null;
};

const fromPhone = (phone?: string | null): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) return null;
  const rest = digits.slice(1);
  if (rest.startsWith("1")) return "CA"; // NANP — treat as Canada unless a longer match wins
  for (const [dial, iso] of DIAL_TO_ISO) {
    if (rest.startsWith(dial)) return iso;
  }
  return null;
};

export const resolveUserCountry = (profile: {
  address_country?: string | null;
  country_code?: string | null;
  phone_number?: string | null;
}): ResolvedCountry => {
  const fromAddress = toIso2(profile.address_country);
  if (fromAddress) return build(fromAddress, "address");

  const fromProfile = toIso2(profile.country_code);
  if (fromProfile) return build(fromProfile, "profile");

  const phone = fromPhone(profile.phone_number);
  if (phone) return build(phone, "phone");

  return UNKNOWN;
};
