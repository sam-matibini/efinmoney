/**
 * Nomba payout capability map.
 * Domestic NGN bank uses /v2/transfers/bank.
 * Everything else uses Global Payout /v1/global-payout/transfer/authorize.
 * Zambia (ZMW) is intentionally unsupported by Nomba.
 */

export type NombaPayoutKind = "domestic_ngn" | "global_momo" | "global_bank" | "global_interac" | "unsupported";

/** Destination currency → ISO2 used when recipient_country is missing. */
export const NOMBA_CURRENCY_COUNTRY: Record<string, string> = {
  NGN: "NG",
  GHS: "GH",
  KES: "KE",
  UGX: "UG",
  TZS: "TZ",
  RWF: "RW",
  XOF: "SN", // default; CI/NE override via country
  XAF: "CM", // default; GA override via country
  ETB: "ET",
  CDF: "CD",
  USD: "US", // CD also uses USD MoMo/bank — country wins
  ZAR: "ZA",
  AED: "AE",
  CAD: "CA",
  GBP: "GB",
  EUR: "DE",
};

/** MoMo destinations Nomba Global Payout documents. */
export const NOMBA_MOMO_CURRENCIES = new Set([
  "GHS",
  "KES",
  "UGX",
  "TZS",
  "RWF",
  "XOF",
  "XAF",
  "ETB",
  "CDF",
  "USD", // DRC USD MoMo when country=CD
]);

/** Bank / rail destinations (non-MoMo) Nomba documents. */
export const NOMBA_BANK_CURRENCIES = new Set([
  "NGN",
  "ZAR",
  "AED",
  "CAD",
  "GBP",
  "EUR",
  "USD",
  "CDF",
]);

/** Fallback institution hints when provider list is empty / slow. */
export const NOMBA_MOMO_FALLBACK: Record<string, { code: string; displayName: string }> = {
  "KE:mpesa": { code: "mpesa", displayName: "M-Pesa" },
  "KE:safaricom": { code: "mpesa", displayName: "M-Pesa" },
  "GH:mtn": { code: "mtn", displayName: "MTN Mobile Money" },
  "UG:mtn": { code: "mtn", displayName: "MTN Mobile Money" },
  "UG:airtel": { code: "airtel", displayName: "Airtel Money" },
  "TZ:airtel": { code: "airtel", displayName: "Airtel Money" },
  "TZ:vodafone": { code: "vodafone", displayName: "Vodafone" },
  "TZ:tigo": { code: "tigo", displayName: "Tigo" },
  "RW:mtn": { code: "mtn", displayName: "MTN Mobile Money" },
  "RW:airtel": { code: "airtel", displayName: "Airtel Money" },
  "SN:orange": { code: "orange", displayName: "Orange Money" },
  "CI:orange": { code: "orange", displayName: "Orange Money" },
  "CI:mtn": { code: "mtn", displayName: "MTN Mobile Money" },
  "CM:mtn": { code: "mtn", displayName: "MTN Mobile Money" },
  "CM:orange": { code: "orange", displayName: "Orange Money" },
  "CD:mpesa": { code: "mpesa", displayName: "Mpesa" },
  "CD:airtel": { code: "airtel", displayName: "Airtel Money" },
  "CD:orange": { code: "orange", displayName: "Orange" },
};

const NAME_TO_ISO2: Record<string, string> = {
  NIGERIA: "NG",
  GHANA: "GH",
  KENYA: "KE",
  UGANDA: "UG",
  TANZANIA: "TZ",
  RWANDA: "RW",
  SENEGAL: "SN",
  CAMEROON: "CM",
  GABON: "GA",
  ETHIOPIA: "ET",
  "COTE D IVOIRE": "CI",
  "CÔTE D'IVOIRE": "CI",
  "IVORY COAST": "CI",
  NIGER: "NE",
  "SOUTH AFRICA": "ZA",
  CANADA: "CA",
  "UNITED STATES": "US",
  "UNITED KINGDOM": "GB",
  "DR CONGO": "CD",
  "DEMOCRATIC REPUBLIC OF CONGO": "CD",
  CONGO: "CD",
  UAE: "AE",
  "UNITED ARAB EMIRATES": "AE",
};

export function normalizeNombaCountry(
  country?: string | null,
  currency?: string | null,
): string {
  const raw = String(country || "").trim().toUpperCase();
  const ccy = String(currency || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  if (NAME_TO_ISO2[raw]) return NAME_TO_ISO2[raw];
  if (NOMBA_CURRENCY_COUNTRY[ccy]) return NOMBA_CURRENCY_COUNTRY[ccy];
  return "";
}

function isMomoMethod(method?: string | null): boolean {
  const m = String(method || "").toLowerCase();
  if (!m) return false;
  if (m === "bank" || m.includes("interac") || m.includes("sepa") || m.includes("ach") || m.includes("wire") || m.includes("faster")) {
    return false;
  }
  return (
    m.includes("mobile")
    || m.includes("money")
    || m.includes("momo")
    || m.includes("mpesa")
    || ["mtn", "airtel", "vodafone", "tigo", "orange", "wave", "moov"].some((t) => m.includes(t))
  );
}

function isInteracMethod(method?: string | null): boolean {
  return String(method || "").toLowerCase().includes("interac");
}

function isBankMethod(method?: string | null): boolean {
  const m = String(method || "").toLowerCase();
  return m === "bank" || m.includes("bank") || m.includes("eft") || m.includes("sepa") || m.includes("ach") || m.includes("wire") || m.includes("faster");
}

/** Classify how we should pay out on Nomba for this transfer. */
export function classifyNombaPayout(params: {
  currency: string;
  country?: string | null;
  method?: string | null;
}): NombaPayoutKind {
  const ccy = String(params.currency || "").toUpperCase();
  const country = normalizeNombaCountry(params.country, ccy);
  const method = params.method;

  if (ccy === "ZMW" || country === "ZM") return "unsupported";

  if (ccy === "NGN" && (isBankMethod(method) || !method || method === "bank")) {
    return "domestic_ngn";
  }

  if (isInteracMethod(method) && (ccy === "CAD" || country === "CA")) {
    return "global_interac";
  }

  if (isMomoMethod(method)) {
    if (ccy === "USD" && country && country !== "CD") return "unsupported";
    if (NOMBA_MOMO_CURRENCIES.has(ccy)) return "global_momo";
    return "unsupported";
  }

  if (isBankMethod(method) || !method) {
    // Prefer MoMo for African MoMo-only corridors when method omitted.
    if (!method && NOMBA_MOMO_CURRENCIES.has(ccy) && ccy !== "USD" && ccy !== "CDF") {
      return "global_momo";
    }
    if (ccy === "NGN") return "domestic_ngn";
    if (NOMBA_BANK_CURRENCIES.has(ccy)) return "global_bank";
  }

  return "unsupported";
}

export function nombaPayoutSupported(params: {
  currency: string;
  country?: string | null;
  method?: string | null;
}): boolean {
  return classifyNombaPayout(params) !== "unsupported";
}

/**
 * Ordered payout rails when no admin corridor_rail_policies row exists.
 * Nomba first wherever it can pay; Zambia stays Fincra-only.
 */
export function defaultPayoutRails(params: {
  currency: string;
  country?: string | null;
  method?: string | null;
}): string[] {
  const ccy = String(params.currency || "").toUpperCase();
  const country = normalizeNombaCountry(params.country, ccy);
  const kind = classifyNombaPayout(params);

  if (ccy === "ZMW" || country === "ZM") return ["fincra"];

  const fincraAfrica = ["fincra", "flovide", "flutterwave"];
  const eastAfrica = ["fincra", "flovide", "flutterwave", "paytota"];

  switch (kind) {
    case "domestic_ngn":
      return ["nomba", "fincra", "flovide", "flutterwave", "swychr"];
    case "global_momo":
      if (["UGX", "KES", "RWF", "TZS"].includes(ccy)) return ["nomba", ...eastAfrica];
      if (["GHS", "XOF", "XAF", "ETB", "CDF"].includes(ccy) || (ccy === "USD" && country === "CD")) {
        return ["nomba", ...fincraAfrica];
      }
      return ["nomba", ...fincraAfrica];
    case "global_interac":
      return ["nomba", "flovide"];
    case "global_bank":
      if (ccy === "CAD") return ["nomba", "flovide"];
      if (ccy === "ZAR" || ccy === "AED") return ["nomba", "fincra", "flutterwave"];
      if (ccy === "USD" || ccy === "GBP" || ccy === "EUR") return ["nomba", "flutterwave"];
      return ["nomba", "fincra", "flutterwave"];
    default:
      return [];
  }
}

/** Map our network token → Nomba provider search keys. */
export function momoNetworkHints(network: string, country: string): string[] {
  const n = network.toLowerCase().replace(/[_\s-]+/g, "");
  const hints: string[] = [];
  if (n.includes("mpesa") || n.includes("safaricom")) hints.push("mpesa", "m-pesa", "safaricom");
  if (n.includes("mtn")) hints.push("mtn");
  if (n.includes("airtel")) hints.push("airtel");
  if (n.includes("vodafone") || n.includes("vodacom")) hints.push("vodafone", "vodacom");
  if (n.includes("tigo")) hints.push("tigo");
  if (n.includes("orange")) hints.push("orange");
  if (n.includes("wave")) hints.push("wave");
  if (n.includes("moov")) hints.push("moov");
  if (n.includes("zamtel")) hints.push("zamtel");
  if (!hints.length) {
    const fb = NOMBA_MOMO_FALLBACK[`${country.toUpperCase()}:${network.toLowerCase()}`]
      || NOMBA_MOMO_FALLBACK[`${country.toUpperCase()}:mpesa`]
      || NOMBA_MOMO_FALLBACK[`${country.toUpperCase()}:mtn`];
    if (fb) hints.push(fb.code, fb.displayName.toLowerCase());
  }
  return hints;
}

export function pickNombaInstitution(
  institutions: { code: string; displayName: string }[],
  hints: string[],
  country: string,
  network: string,
): { code: string; displayName: string } | null {
  const lowerHints = hints.map((h) => h.toLowerCase());
  for (const inst of institutions) {
    const blob = `${inst.code} ${inst.displayName}`.toLowerCase();
    if (lowerHints.some((h) => blob.includes(h))) return inst;
  }
  if (institutions.length === 1) return institutions[0];
  const fbKey = `${country.toUpperCase()}:${network.toLowerCase()}`;
  const fb = NOMBA_MOMO_FALLBACK[fbKey]
    || NOMBA_MOMO_FALLBACK[`${country.toUpperCase()}:mpesa`]
    || NOMBA_MOMO_FALLBACK[`${country.toUpperCase()}:mtn`];
  if (fb) return fb;
  if (institutions[0]) return institutions[0];
  return null;
}

/** Nomba Global paymentMethod for bank-like rails. */
export function nombaBankPaymentMethod(currency: string, country: string, method?: string | null): string {
  const m = String(method || "").toLowerCase();
  if (m.includes("interac")) return "INTERAC";
  if (currency === "GBP" || country === "GB" || m.includes("faster")) return "FASTER_PAYMENTS";
  if (currency === "EUR" || m.includes("sepa")) return "SEPA";
  if (currency === "USD" && country === "US") {
    if (m.includes("wire")) return "WIRE";
    return "ACH";
  }
  if (currency === "CAD" && m.includes("eft")) return "EFT";
  return "BANK";
}
