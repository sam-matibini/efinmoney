import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import {
  resolveFxBenchmark,
  type CorridorProviderQuote,
  type FxBenchmark,
} from "@/lib/fxCorridorBenchmark";

type CorridorProviderFxResponse = {
  benchmark_rate?: number;
  source?: CorridorProviderQuote["source"];
  partner_code?: string | null;
  treasury_mid?: number | null;
  quotes?: CorridorProviderQuote[];
  error?: string;
};

export function useCorridorFxBenchmark(opts: {
  from: string;
  to: string;
  preferredPartner?: string | null;
  treasuryMid?: number | null;
  liveQuotes?: CorridorProviderQuote[];
  enabled?: boolean;
}): FxBenchmark {
  const from = opts.from.toUpperCase();
  const to = opts.to.toUpperCase();
  const enabled = opts.enabled !== false && !!from && !!to && from !== to;

  const { data } = useQuery({
    queryKey: ["corridor-provider-fx", from, to, opts.preferredPartner ?? ""],
    queryFn: async (): Promise<CorridorProviderFxResponse> => {
      try {
        return await invokeEdgeFunction<CorridorProviderFxResponse>("corridor-provider-fx", {
          from,
          to,
          preferred_partner: opts.preferredPartner ?? null,
        });
      } catch {
        return {};
      }
    },
    enabled,
    staleTime: 60_000,
    retry: 1,
  });

  return useMemo(() => {
    if (from === to) return { rate: 1, source: "treasury_mid", partnerCode: null };
    return resolveFxBenchmark({
      providerQuotes: [...(opts.liveQuotes ?? []), ...(data?.quotes ?? [])],
      preferredPartner: opts.preferredPartner,
      treasuryMid: data?.treasury_mid ?? opts.treasuryMid ?? null,
    });
  }, [from, to, opts.liveQuotes, opts.preferredPartner, opts.treasuryMid, data]);
}
