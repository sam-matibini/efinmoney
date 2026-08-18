/**
 * Retired partner stack: Lenhub / mtn.lenhub.net / /api/efin/* Django routes.
 * Do not call these hosts or paths — they 404 (e.g. /api/efin/exchange/).
 */
export const RETIRED_RAILS = new Set([
  "lenhub",
  "lenhub_flutter",
  "ghana",
  "ghana_pay",
  "mtn",
  "mtn_momo",
]);

export function isRetiredRail(code: string | null | undefined): boolean {
  return RETIRED_RAILS.has(String(code || "").trim().toLowerCase());
}

export function isRetiredPartnerUrl(url: string): boolean {
  const u = String(url || "").toLowerCase();
  return u.includes("lenhub.net") || u.includes("/api/efin");
}

export const RETIRED_PARTNER_MESSAGE =
  "This payment partner is no longer in use. Use Fincra or Flutterwave.";

export function filterLiveRails(rails: string[]): string[] {
  return rails.filter((r) => !isRetiredRail(r));
}
