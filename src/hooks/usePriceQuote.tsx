import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PriceQuoteLegRequest {
  label?: string;
  direction?: "payin" | "payout";
  source_currency?: string;
  dest_currency?: string | null;
  dest_country?: string | null;
  payment_method?: string | null;
  amount?: number;
}

export interface PriceQuoteLeg {
  label: string;
  fee: number;
  fxRevenue: number;
  fxMarginBps: number;
  pricingMissing: boolean;
}

export interface PriceQuoteResult {
  fee: number;
  fx_margin_bps: number;
  fx_revenue: number;
  total_fee: number;
  pricing_missing: boolean;
  pricing_id: string | null;
  legs: PriceQuoteLeg[];
}

export interface UsePriceQuoteArgs {
  direction?: "payin" | "payout";
  sourceCurrency?: string | null;
  destCurrency?: string | null;
  destCountry?: string | null;
  paymentMethod?: string | null;
  customerType?: string;
  amount: number;
  legs?: PriceQuoteLegRequest[];
  enabled?: boolean;
}

/**
 * Canonical customer price for a flow. Always resolved server-side from the
 * central rate card (`efinmoney_pricing`) — never computed in the UI.
 */
export function usePriceQuote(args: UsePriceQuoteArgs) {
  const {
    direction = "payout",
    sourceCurrency,
    destCurrency = null,
    destCountry = null,
    paymentMethod = null,
    customerType = "consumer",
    amount,
    legs,
    enabled = true,
  } = args;

  return useQuery({
    queryKey: [
      "price-quote", direction, sourceCurrency, destCurrency, destCountry,
      paymentMethod, customerType, amount, legs?.map((l) => l.payment_method).join(","),
    ],
    enabled: enabled && !!sourceCurrency && Number(amount) > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<PriceQuoteResult | null> => {
      const { data, error } = await supabase.functions.invoke("price-quote", {
        body: {
          direction,
          source_currency: sourceCurrency,
          dest_currency: destCurrency,
          dest_country: destCountry,
          payment_method: paymentMethod,
          customer_type: customerType,
          amount: Number(amount),
          legs: legs ?? [],
        },
      });
      if (error) throw error;
      return data as PriceQuoteResult;
    },
  });
}
