import { useMemo } from "react";
import { useDashboardTransfers } from "@/hooks/useDashboardTransfers";
import { useFxRates } from "@/hooks/useFxRates";
import { buildUsdRateMap, convertToUsd } from "@/lib/fx";
import { normalizeCountryCode } from "@/lib/flags";

const PENDING = ["initiated", "funded", "processing"];

export const useDashboardStats = () => {
  const { data: transfers, isLoading } = useDashboardTransfers();
  const { data: fxRates } = useFxRates();

  const stats = useMemo(() => {
    const rateMap = buildUsdRateMap((fxRates ?? []) as Parameters<typeof buildUsdRateMap>[0]);
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let sentMonthUsd = 0;
    let dailyUsed = 0;
    let monthlyUsed = 0;
    const countries = new Set<string>();
    const recentCountries: string[] = [];
    let inFlightCount = 0;
    let inFlightUsd = 0;

    for (const t of transfers ?? []) {
      const ts = new Date(t.created_at).getTime();
      const usd =
        convertToUsd(Number(t.source_amount || 0), t.source_currency || "USD", rateMap) ?? 0;
      if (ts >= startMonth) {
        sentMonthUsd += usd;
        monthlyUsed += usd;
      }
      if (ts >= startDay) dailyUsed += usd;
      if (t.recipient_country) {
        const cc = normalizeCountryCode(t.recipient_country);
        if (cc) {
          countries.add(cc);
          if (recentCountries.length < 6 && !recentCountries.includes(cc)) {
            recentCountries.push(cc);
          }
        }
      }
      if (PENDING.includes(t.status)) {
        inFlightCount += 1;
        inFlightUsd += usd;
      }
    }

    return {
      sentMonthUsd,
      countryCount: countries.size,
      recentCountries,
      inFlightCount,
      inFlightUsd,
      dailyUsed,
      monthlyUsed,
      corridorCodes: Array.from(countries),
    };
  }, [transfers, fxRates]);

  return { ...stats, isLoading, transfers };
};
