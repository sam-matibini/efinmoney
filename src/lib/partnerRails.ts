export type PartnerRailBalance = {
  partner: string;
  label: string;
  currency_code: string;
  available: number;
  source: string;
  can_payout: boolean;
  error?: string | null;
};

export const PARTNER_RAIL_ORDER = ["fincra", "nomba", "verto"] as const;
export const PARTNER_PAYOUT_COUNTRIES = new Set(["NG", "GH", "KE"]);

export type PartnerPayoutRailChoice = "auto" | "fincra" | "nomba" | "wallet";

export function isPartnerPayoutCorridor(country: string): boolean {
  return PARTNER_PAYOUT_COUNTRIES.has(country.toUpperCase());
}

export function railsForCurrency(
  rails: PartnerRailBalance[],
  currency: string,
): PartnerRailBalance[] {
  const ccy = currency.toUpperCase();
  return rails.filter((r) => r.currency_code.toUpperCase() === ccy);
}

export function bestPayoutRail(
  rails: PartnerRailBalance[],
  currency: string,
  amount: number,
  preferred?: string | null,
): PartnerRailBalance | null {
  const ccy = currency.toUpperCase();
  const pref = (preferred || "").toLowerCase();
  if (pref && pref !== "auto" && pref !== "wallet") {
    return (
      rails.find(
        (r) =>
          r.partner === pref &&
          r.can_payout &&
          r.currency_code.toUpperCase() === ccy,
      ) || null
    );
  }
  const funded = rails.filter(
    (r) =>
      r.can_payout &&
      r.currency_code.toUpperCase() === ccy &&
      Number(r.available) + 1e-6 >= amount,
  );
  for (const code of PARTNER_RAIL_ORDER) {
    const hit = funded.find((r) => r.partner === code);
    if (hit) return hit;
  }
  return funded[0] || null;
}

export function formatRailLine(
  rails: PartnerRailBalance[],
  currency: string,
  fmt: (n: number, ccy: string) => string,
): string | null {
  const rows = railsForCurrency(rails, currency);
  if (!rows.length) return null;
  const live = rows.filter((r) => r.source === "api" || r.source === "mock");
  if (!live.length) return null;
  return live
    .map((r) => `${r.label} · ${fmt(Number(r.available), r.currency_code)}`)
    .join(" · ");
}
