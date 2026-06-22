import { supabase } from "@/integrations/supabase/client";

export type { RateRow } from "@/lib/fxRatesCore";
export { buildUsdRateMap, resolveEffectiveRate } from "@/lib/fxRatesCore";
import { buildUsdRateMap, type RateRow } from "@/lib/fxRatesCore";

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
