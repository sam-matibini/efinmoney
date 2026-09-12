/** Currencies Fincra checkout API accepts (CAD is Interac-only, not hosted checkout). */
export const FINCRA_CHECKOUT_CURRENCIES = [
  "NGN", "USD", "GBP", "EUR", "GHS", "KES", "UGX", "TZS", "ZMW",
  "EGP", "MZN", "MWK", "ZWL", "GNF", "XOF", "XAF", "ZAR",
] as const;

export function isFincraCheckoutCurrency(currency: string): boolean {
  return FINCRA_CHECKOUT_CURRENCIES.includes(currency.toUpperCase() as typeof FINCRA_CHECKOUT_CURRENCIES[number]);
}

/** Fincra appends ?reference=… to redirectUrl — do not put our own query string on it. */
export function buildFincraTopupRedirectUrl(): { url: string; usesProductionReturn: boolean } {
  return buildFincraRedirectUrl("/wallet/topup");
}

/** Return to /send after card-funded collect (intent lives in sessionStorage). */
export function buildFincraCardSendRedirectUrl(): { url: string; usesProductionReturn: boolean } {
  return buildFincraRedirectUrl("/send");
}

export function buildFincraRedirectUrl(path: string): { url: string; usesProductionReturn: boolean } {
  const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const productionBase = (import.meta.env.VITE_APP_URL || "https://www.efin.money").replace(/\/+$/, "");
  if (isLocal) {
    return { url: `${productionBase}${path}`, usesProductionReturn: true };
  }
  const origin = window.location.origin;
  if (origin.startsWith("http://")) {
    return { url: `${productionBase}${path}`, usesProductionReturn: true };
  }
  return { url: `${origin}${path}`, usesProductionReturn: false };
}

/** Parse reference when Fincra concatenates ?reference onto the return URL. */
export function parseFincraReturnReference(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const direct = params.get("reference");
  if (direct) return direct;

  const provider = params.get("provider") || "";
  const embedded = provider.match(/(?:^|\?)reference=(.+)$/);
  if (embedded?.[1]) return decodeURIComponent(embedded[1]);

  const loose = search.match(/reference=((?:topup|cardsend|banksend|banktopup|bankmove)-fincra-[^&]+|efm_fincra_[^&]+)/i);
  return loose?.[1] ? decodeURIComponent(loose[1]) : null;
}
