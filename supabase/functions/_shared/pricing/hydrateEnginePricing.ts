import {
  assembleDynamicWorkbook,
  cardFromPublishedRow,
  correctionsFromPublished,
  type AssembleCorridor,
  type AssembleCurrency,
  type AssemblePartner,
  type AssemblePartnerFx,
  type AssemblePartnerPricing,
  type PublishedRateCardRow,
} from "./assembleDynamicWorkbook.ts";
import type { PayoutMinimum, VolumeDiscountTier } from "./types.ts";
import { setCorrections, setLiveBase } from "./workbookStore.ts";

type AnyClient = {
  from: (table: string) => { select: (columns: string) => Promise<{ data: unknown; error: unknown }> };
};

async function selectAll(client: AnyClient, table: string, columns: string): Promise<unknown[]> {
  try {
    const { data, error } = await client.from(table).select(columns);
    if (error) return [];
    return (data as unknown[]) ?? [];
  } catch {
    return [];
  }
}

let hydratedAt = 0;

export async function hydrateEnginePricing(client: AnyClient): Promise<void> {
  if (hydratedAt > 0 && Date.now() - hydratedAt < 30_000) return;
  const [partners, corridors, pricing, fx, currencies, cards, volumes, payouts] = await Promise.all([
    selectAll(client, "payment_partners", "id,name,code,status"),
    selectAll(client, "partner_corridors", "partner_id,enabled,direction,source_currency,dest_currency,payment_method,est_minutes"),
    selectAll(client, "partner_pricing", "partner_id,source_currency,dest_currency,payment_method,percentage_fee,fixed_fee,min_fee,max_fee,fx_markup_bps,settlement_fee,network_fee,compliance_fee,effective_to"),
    selectAll(client, "partner_fx_rates", "partner_id,base_currency,quote_currency,fx_spread_bps,mid_market_rate,partner_rate"),
    selectAll(client, "currencies", "code,is_active,currency_type"),
    selectAll(client, "corridor_rate_cards", "*"),
    selectAll(client, "volume_discount_tiers", "*"),
    selectAll(client, "payout_method_minimums", "*"),
  ]);

  const live = assembleDynamicWorkbook({
    partners: partners as AssemblePartner[],
    corridors: corridors as AssembleCorridor[],
    partnerPricing: (pricing as AssemblePartnerPricing[]).filter((row) => !row.effective_to),
    partnerFx: fx as AssemblePartnerFx[],
    currencies: currencies as AssembleCurrency[],
    volumes: volumes as VolumeDiscountTier[],
    payouts: payouts as PayoutMinimum[],
  });
  const published = (cards as PublishedRateCardRow[])
    .filter((row) => row.active !== false)
    .map(cardFromPublishedRow);
  setLiveBase(live);
  setCorrections(correctionsFromPublished(live, published));
  hydratedAt = Date.now();
}
