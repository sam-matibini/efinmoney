import {
  EFRR_FALLBACK,
  observationsFromUsdBook,
  parseBocValetJson,
  parseEcbEurofxrefXml,
  usdBookFromOxr,
  type FxObservation,
  type UsdBook,
} from "./engine.ts";

const BOC_URL = "https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?recent=1";
const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const OXR_URL = (appId: string) => `https://openexchangerates.org/api/latest.json?app_id=${appId}&base=USD`;
const ER_API_URL = "https://open.er-api.com/v6/latest/USD";

const headers = { Accept: "application/json, application/xml, text/xml, */*", "User-Agent": "eFinMoney-EFRR/1.0" };

export async function fetchBankOfCanada(): Promise<FxObservation[]> {
  const res = await fetch(BOC_URL, { headers });
  if (!res.ok) throw new Error(`Bank of Canada Valet ${res.status}`);
  const json = await res.json();
  const rows = parseBocValetJson(json);
  if (!rows.length) throw new Error("Bank of Canada Valet returned no FX observations");
  return rows;
}

export async function fetchOpenExchangeRates(): Promise<UsdBook> {
  const appId = Deno.env.get("OPENEXCHANGERATES_APP_ID");
  if (appId) {
    try {
      const res = await fetch(OXR_URL(appId), { headers });
      if (res.ok) {
        return usdBookFromOxr(await res.json(), EFRR_FALLBACK);
      }
      console.warn("Open Exchange Rates failed:", res.status, await res.text());
    } catch (e) {
      console.warn("Open Exchange Rates threw:", e);
    }
  }
  const fb = await fetch(ER_API_URL, { headers });
  if (!fb.ok) throw new Error(`OXR fallback ${fb.status}`);
  return usdBookFromOxr(await fb.json(), "open.er-api.com");
}

export async function fetchEcb(): Promise<FxObservation[]> {
  const res = await fetch(ECB_URL, { headers: { ...headers, Accept: "application/xml, text/xml" } });
  if (!res.ok) throw new Error(`ECB eurofxref ${res.status}`);
  const xml = await res.text();
  return parseEcbEurofxrefXml(xml);
}

export function oxrObservations(book: UsdBook): FxObservation[] {
  return observationsFromUsdBook(book);
}
