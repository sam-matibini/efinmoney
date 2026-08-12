/**
 * Admin-configured corridor rail policies (preferred + optional failover).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type RailDirection = "collect" | "payout";

export type CorridorRailPolicy = {
  id: string;
  direction: RailDirection;
  country_code: string;
  currency_code: string;
  preferred_partner: string;
  failover_partners: string[];
  enabled: boolean;
  notes: string | null;
};

/** Send historically stored currency (NGN) or name (Nigeria) in recipient_country. */
const CURRENCY_TO_ISO2: Record<string, string> = {
  NGN: "NG",
  GHS: "GH",
  KES: "KE",
  UGX: "UG",
  TZS: "TZ",
  RWF: "RW",
  ZMW: "ZM",
  ZAR: "ZA",
  XOF: "SN",
  XAF: "CM",
  CAD: "CA",
  USD: "US",
  GBP: "GB",
  EUR: "DE",
  MWK: "MW",
};

const NAME_TO_ISO2: Record<string, string> = {
  NIGERIA: "NG",
  GHANA: "GH",
  KENYA: "KE",
  UGANDA: "UG",
  TANZANIA: "TZ",
  RWANDA: "RW",
  ZAMBIA: "ZM",
  "SOUTH AFRICA": "ZA",
  SENEGAL: "SN",
  CAMEROON: "CM",
  CANADA: "CA",
  "UNITED STATES": "US",
  "UNITED KINGDOM": "GB",
};

/** Ordered rails: preferred first, then failover (deduped). */
export function railsFromPolicy(policy: CorridorRailPolicy): string[] {
  const out: string[] = [];
  const push = (code: string) => {
    const c = code.trim().toLowerCase();
    if (c && !out.includes(c)) out.push(c);
  };
  push(policy.preferred_partner);
  for (const f of policy.failover_partners || []) push(f);
  return out;
}

export function normalizePolicyCountry(
  country?: string | null,
  currency?: string | null,
): string {
  const raw = String(country || "").trim().toUpperCase();
  if (!raw) return CURRENCY_TO_ISO2[String(currency || "").trim().toUpperCase()] || "";
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  if (CURRENCY_TO_ISO2[raw]) return CURRENCY_TO_ISO2[raw];
  if (NAME_TO_ISO2[raw]) return NAME_TO_ISO2[raw];
  return raw;
}

export async function resolveCorridorRails(
  admin: SupabaseClient,
  direction: RailDirection,
  currency: string,
  country?: string | null,
): Promise<{ policy: CorridorRailPolicy | null; rails: string[] }> {
  const ccy = String(currency || "").trim().toUpperCase();
  const cc = normalizePolicyCountry(country, ccy);
  if (!ccy) return { policy: null, rails: [] };

  // Prefer exact ISO2 match, then currency-wide (empty country), then any enabled row for currency
  // (covers legacy transfers that stored NGN/Nigeria instead of NG).
  let row: CorridorRailPolicy | null = null;
  if (cc) {
    const { data } = await admin.from("corridor_rail_policies").select("*")
      .eq("direction", direction)
      .eq("currency_code", ccy)
      .eq("country_code", cc)
      .eq("enabled", true)
      .maybeSingle();
    row = (data as CorridorRailPolicy | null) ?? null;
  }
  if (!row) {
    const { data } = await admin.from("corridor_rail_policies").select("*")
      .eq("direction", direction)
      .eq("currency_code", ccy)
      .eq("country_code", "")
      .eq("enabled", true)
      .maybeSingle();
    row = (data as CorridorRailPolicy | null) ?? null;
  }
  if (!row) {
    const { data } = await admin.from("corridor_rail_policies").select("*")
      .eq("direction", direction)
      .eq("currency_code", ccy)
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    row = (data as CorridorRailPolicy | null) ?? null;
  }
  if (!row) return { policy: null, rails: [] };
  return { policy: row, rails: railsFromPolicy(row) };
}

/** Map partner code → edge function slug for payout. */
export const PAYOUT_FN_BY_RAIL: Record<string, string> = {
  fincra: "fincra-payout",
  nomba: "nomba-payout",
  flovide: "flovide-payout",
  flutterwave: "flutterwave-payout",
  flw: "flutterwave-payout",
  lenhub: "lenhub-flutter-payout",
  lenhub_flutter: "lenhub-flutter-payout",
  paytota: "paytota-payout",
  swychr: "swychr-payout",
  ghana: "ghana-payout",
  ghana_pay: "ghana-payout",
  elicate: "elicate-payout",
  pawapay: "pawapay-payout",
  mtn_momo: "mtn-momo-payout",
  paysafe: "paysafe-payout",
};

/** Collect method keys used by TopUp UI / gateways. */
export const COLLECT_METHOD_BY_RAIL: Record<string, string> = {
  fincra: "fincra",
  nomba: "nomba",
  flovide: "interac",
  flovide_interac: "interac",
  interac: "interac",
  flutterwave: "flutterwave",
  flw: "flutterwave",
  paytota: "paytota",
  swychr: "swychr",
  dodo: "dodo",
  square: "square",
  paypal: "paypal",
  wise: "wise",
  ghana: "ghana",
  ghana_pay: "ghana",
  elicate: "elicate",
  lenhub: "lenhub",
  lenhub_flutter: "lenhub",
};

export function payoutFnForRail(rail: string): string | null {
  return PAYOUT_FN_BY_RAIL[rail.trim().toLowerCase()] || null;
}

export function collectMethodForRail(rail: string): string | null {
  return COLLECT_METHOD_BY_RAIL[rail.trim().toLowerCase()] || null;
}
