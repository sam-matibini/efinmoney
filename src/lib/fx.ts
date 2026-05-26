import { supabase } from "@/integrations/supabase/client";

export interface RateRow {
  from_currency: string;
  to_currency: string;
  effective_rate: number;
}

/** Build a lookup of latest from→USD rates from a list of fx_rates rows. */
export const buildUsdRateMap = (rates: RateRow[]): Map<string, number> => {
  const map = new Map<string, number>();
  map.set("USD", 1);
  for (const r of rates) {
    if (r.to_currency === "USD" && !map.has(r.from_currency)) {
      map.set(r.from_currency, Number(r.effective_rate));
    }
  }
  // Derive inverse rates if only USD->X exists
  for (const r of rates) {
    if (r.from_currency === "USD" && !map.has(r.to_currency) && Number(r.effective_rate) > 0) {
      map.set(r.to_currency, 1 / Number(r.effective_rate));
    }
  }
  return map;
};

/** Convert a (currency, amount) pair to USD. Returns null if no rate. */
export const convertToUsd = (
  amount: number,
  currency: string,
  rateMap: Map<string, number>,
): number | null => {
  const r = rateMap.get(currency);
  if (r === undefined) return null;
  return amount * r;
};

/** Fetch currently-valid fx_rates and return a from→USD lookup map. */
export const fetchUsdRateMap = async (): Promise<Map<string, number>> => {
  const { data, error } = await supabase
    .from("fx_rates")
    .select("from_currency,to_currency,effective_rate")
    .or("valid_until.is.null,valid_until.gt." + new Date().toISOString())
    .order("valid_from", { ascending: false })
    .limit(500);
  if (error) return new Map([["USD", 1]]);
  return buildUsdRateMap((data ?? []) as RateRow[]);
};
