import {
  CUSTOMER_CORRIDOR_RATES,
  DEFAULT_EXTERNAL_COSTS,
  DEFAULT_TRANSFER_FEE_PCT,
  DEFAULT_WALLET_COSTS,
  PAYOUT_MINIMUMS,
  RATE_CARD_EFFECTIVE_FROM,
  VOLUME_DISCOUNT_TIERS,
  WALLET_RATES,
  payoutMethodFromInput,
} from "./rateCard.ts";
import type {
  CorridorRateCard,
  CostComponents,
  PayoutMethod,
  PayoutMinimum,
  PricingWorkbook,
  RecommendedPosition,
  VolumeDiscountTier,
} from "./types.ts";

export type AssemblePartner = {
  id: string;
  name: string;
  code?: string | null;
  status?: string | null;
};

export type AssembleCorridor = {
  partner_id: string;
  enabled: boolean;
  direction?: string | null;
  source_currency: string;
  dest_currency: string;
  payment_method: string;
  est_minutes?: number | null;
};

export type AssemblePartnerPricing = {
  partner_id: string;
  source_currency: string;
  dest_currency: string;
  payment_method?: string | null;
  percentage_fee?: number | null;
  fixed_fee?: number | null;
  min_fee?: number | null;
  max_fee?: number | null;
  fx_markup_bps?: number | null;
  settlement_fee?: number | null;
  network_fee?: number | null;
  compliance_fee?: number | null;
  effective_to?: string | null;
};

export type AssemblePartnerFx = {
  partner_id: string;
  base_currency: string;
  quote_currency: string;
  fx_spread_bps?: number | null;
  mid_market_rate?: number | null;
  partner_rate?: number | null;
};

export type AssembleCurrency = {
  code: string;
  is_active?: boolean;
  currency_type?: string | null;
};

export type AssembleInput = {
  partners?: AssemblePartner[];
  corridors?: AssembleCorridor[];
  partnerPricing?: AssemblePartnerPricing[];
  partnerFx?: AssemblePartnerFx[];
  currencies?: AssembleCurrency[];
  volumes?: VolumeDiscountTier[];
  payouts?: PayoutMinimum[];
  publishedCards?: CorridorRateCard[];
};

const today = () => new Date().toISOString().slice(0, 10);

function deliveryFromMinutes(minutes: number | null | undefined, method: PayoutMethod): string {
  if (minutes != null && minutes <= 2) return "Instant";
  if (minutes != null && minutes <= 60) return "Minutes";
  if (minutes != null && minutes <= 240) return "Minutes – 1 hour";
  if (minutes != null && minutes <= 1440) return "Same day";
  if (method === "BANK") return "1–2 business days";
  if (method === "MOBILE_MONEY" || method === "WALLET") return "Minutes";
  return "Varies";
}

function deliveryLabel(method: PayoutMethod): string {
  if (method === "MOBILE_MONEY") return "Mobile Money";
  if (method === "BANK") return "Bank";
  if (method === "WALLET") return "Wallet";
  if (method === "CASH_PICKUP") return "Cash pickup";
  if (method === "CARD_PAYOUT") return "Card payout";
  if (method === "STABLECOIN") return "Stablecoin";
  if (method === "CORPORATE") return "Corporate payout";
  if (method === "WALLET_BANK") return "Wallet/Bank";
  return "eFinMoney wallet";
}

function positionFromSpread(spread: number, template?: RecommendedPosition): RecommendedPosition {
  if (template) return template;
  if (spread <= 0.006) return "Highly competitive";
  if (spread <= 0.0175) return "Competitive";
  if (spread >= 0.02) return "Higher-cost corridor";
  return "Competitive";
}

function scorePricing(p: AssemblePartnerPricing, corridor: AssembleCorridor): number {
  let s = 0;
  if (p.partner_id !== corridor.partner_id) return -1;
  if (p.effective_to) return -1;
  if (p.source_currency === "*" || p.source_currency === corridor.source_currency) s += p.source_currency === "*" ? 1 : 8;
  else return -1;
  if (p.dest_currency === "*" || p.dest_currency === corridor.dest_currency) s += p.dest_currency === "*" ? 1 : 8;
  else return -1;
  const method = (p.payment_method || "").toLowerCase();
  const want = corridor.payment_method.toLowerCase();
  if (!method || method === want || method === "any") s += method === want ? 4 : 1;
  return s;
}

function pickPricing(rows: AssemblePartnerPricing[], corridor: AssembleCorridor): AssemblePartnerPricing | null {
  let best: AssemblePartnerPricing | null = null;
  let bestScore = -1;
  for (const row of rows) {
    const score = scorePricing(row, corridor);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

function pickFx(rows: AssemblePartnerFx[], partnerId: string, from: string, to: string): AssemblePartnerFx | null {
  return (
    rows.find((r) => r.partner_id === partnerId && r.base_currency === from && r.quote_currency === to) ||
    rows.find((r) => r.partner_id === partnerId && r.base_currency === to && r.quote_currency === from) ||
    null
  );
}

function templateFor(source: string, dest: string, method: PayoutMethod, channel: "wallet" | "external"): CorridorRateCard | null {
  const pool = channel === "wallet" ? WALLET_RATES : CUSTOMER_CORRIDOR_RATES;
  return (
    pool.find((c) => c.source_currency === source && c.destination_currency === dest && c.payout_method === method) ||
    pool.find((c) => c.source_currency === source && c.destination_currency === dest) ||
    null
  );
}

function payoutMin(method: PayoutMethod): number {
  return PAYOUT_MINIMUMS.find((p) => p.payout_method === method)?.minimum_fee ?? 1.5;
}

function costsFromPartner(pricing: AssemblePartnerPricing | null, template?: CostComponents): CostComponents {
  const base = template ?? DEFAULT_EXTERNAL_COSTS;
  if (!pricing) return { ...base };
  const pct = Math.max(0, Number(pricing.percentage_fee) || 0) / 100;
  const fixed =
    (Number(pricing.fixed_fee) || 0) + (Number(pricing.settlement_fee) || 0) + (Number(pricing.network_fee) || 0);
  const fxBps = Number(pricing.fx_markup_bps) || 0;
  return {
    ...base,
    partner_cost_pct: pct || base.partner_cost_pct,
    partner_fixed_fee: fixed || base.partner_fixed_fee,
    liquidity_cost_pct: fxBps > 0 ? Math.min(0.005, fxBps / 10000) : base.liquidity_cost_pct,
    risk_cost_pct: Number(pricing.compliance_fee) > 0 ? base.risk_cost_pct : base.risk_cost_pct,
  };
}

export function corridorKey(source: string, dest: string, method: PayoutMethod, channel: "wallet" | "external"): string {
  const prefix = channel === "wallet" ? "WALLET_" : "";
  return `${prefix}${source}_${dest}_${method}`;
}

function fromLiveCorridor(
  corridor: AssembleCorridor,
  partner: AssemblePartner,
  pricing: AssemblePartnerPricing | null,
  fx: AssemblePartnerFx | null,
): CorridorRateCard {
  const method = payoutMethodFromInput(corridor.payment_method, "external");
  const source = corridor.source_currency.toUpperCase();
  const dest = corridor.dest_currency.toUpperCase();
  const template = templateFor(source, dest, method, "external");
  const partnerSpread = Math.max(0, Number(fx?.fx_spread_bps ?? pricing?.fx_markup_bps ?? 0) / 10000);
  const listed = template?.efin_fx_spread ?? Math.min(0.025, partnerSpread + 0.005);
  const efin_fx_spread = Math.max(listed, partnerSpread + 0.0025);
  const minFloor = Math.max(template?.minimum_fee ?? 0, payoutMin(method), Number(pricing?.min_fee) || 0);
  return {
    corridor_id: template?.corridor_id ?? corridorKey(source, dest, method, "external"),
    source_currency: source,
    destination_currency: dest,
    payout_method: method,
    channel: "external",
    delivery: deliveryLabel(method),
    partner: partner.name,
    efin_fx_spread,
    efin_transfer_fee_pct: template?.efin_transfer_fee_pct ?? DEFAULT_TRANSFER_FEE_PCT,
    transfer_fee: template?.transfer_fee ?? minFloor,
    minimum_fee: minFloor || 1.5,
    maximum_fee: Number(pricing?.max_fee) || template?.maximum_fee || 50,
    fee_currency: source === "USD" ? "USD" : "CAD",
    recommended_position: positionFromSpread(efin_fx_spread, template?.recommended_position),
    estimated_delivery: deliveryFromMinutes(corridor.est_minutes, method),
    costs: costsFromPartner(pricing, template?.costs),
    volume_discount: 0,
    effective_from: RATE_CARD_EFFECTIVE_FROM,
    effective_to: null,
    active: true,
    origin: "live",
  };
}

export function assembleDynamicWorkbook(input: AssembleInput = {}): PricingWorkbook {
  const partners = (input.partners ?? []).filter((p) => !p.status || p.status === "active");
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const liveCorridors = (input.corridors ?? []).filter((c) => {
    if (!c.enabled) return false;
    const dir = String(c.direction || "payout").toLowerCase();
    if (dir === "payin") return false;
    return partnerById.has(c.partner_id);
  });

  const byId = new Map<string, CorridorRateCard>();
  for (const row of CUSTOMER_CORRIDOR_RATES) {
    byId.set(row.corridor_id, { ...row, origin: "template" });
  }

  for (const corridor of liveCorridors) {
    const partner = partnerById.get(corridor.partner_id);
    if (!partner) continue;
    const pricing = pickPricing(input.partnerPricing ?? [], corridor);
    const fx = pickFx(
      input.partnerFx ?? [],
      corridor.partner_id,
      corridor.source_currency.toUpperCase(),
      corridor.dest_currency.toUpperCase(),
    );
    const card = fromLiveCorridor(corridor, partner, pricing, fx);
    const existing = byId.get(card.corridor_id);
    if (!existing || existing.origin !== "live") {
      byId.set(card.corridor_id, card);
    } else if (card.costs.partner_cost_pct + card.costs.partner_fixed_fee < existing.costs.partner_cost_pct + existing.costs.partner_fixed_fee) {
      byId.set(card.corridor_id, card);
    }
  }

  const wallets = new Map<string, CorridorRateCard>();
  for (const row of WALLET_RATES) wallets.set(row.corridor_id, { ...row, origin: "template" });

  const liveList = [...byId.values()];
  const sources = new Set<string>(["CAD", "USD", ...liveList.map((c) => c.source_currency)]);
  const dests = new Set<string>([
    ...(input.currencies ?? []).filter((c) => c.is_active !== false).map((c) => c.code.toUpperCase()),
    ...liveList.map((c) => c.destination_currency),
    "USDC",
    "USD",
  ]);

  for (const source of sources) {
    for (const dest of dests) {
      if (!source || !dest || source === dest) continue;
      const id = `WALLET_${source}_${dest}`;
      const remittance = liveList
        .filter((c) => c.source_currency === source && c.destination_currency === dest)
        .sort((a, b) => a.efin_fx_spread - b.efin_fx_spread)[0];
      const existing = wallets.get(id);
      if (source !== "CAD" && !existing && !remittance && !isStablecoin(dest)) continue;
      const next = walletCardForPair(source, dest, remittance, existing);
      if (next) wallets.set(id, next);
    }
  }

  const assembled: PricingWorkbook = {
    corridors: [...byId.values()].sort((a, b) => a.corridor_id.localeCompare(b.corridor_id)),
    wallets: [...wallets.values()].sort((a, b) => a.corridor_id.localeCompare(b.corridor_id)),
    volumes: (input.volumes?.length ? input.volumes : VOLUME_DISCOUNT_TIERS).map((v) => ({ ...v })),
    payouts: (input.payouts?.length ? input.payouts : PAYOUT_MINIMUMS).map((p) => ({ ...p })),
  };

  if (input.publishedCards?.length) return upsertPublishedCards(assembled, input.publishedCards);
  return assembled;
}

function isStablecoin(code: string): boolean {
  return code === "USDC" || code === "USDT" || code === "EURC";
}

function walletCardForPair(
  source: string,
  dest: string,
  remittance: CorridorRateCard | undefined,
  existing: CorridorRateCard | undefined,
): CorridorRateCard | null {
  const same = WALLET_RATES.find((c) => c.corridor_id === "WALLET_SAME_CURRENCY");
  if (!same && !existing) return null;
  const seed = existing ?? {
    ...same!,
    corridor_id: `WALLET_${source}_${dest}`,
    source_currency: source,
    destination_currency: dest,
    efin_fx_spread: dest === "USD" || isStablecoin(dest) ? 0.005 : 0.01,
    efin_transfer_fee_pct: DEFAULT_TRANSFER_FEE_PCT,
    transfer_fee: 0.5,
    minimum_fee: 0.5,
    maximum_fee: 25,
    fee_currency: source === "USD" ? "USD" : "CAD",
    costs: { ...DEFAULT_WALLET_COSTS },
    origin: "template" as const,
    effective_from: today(),
  };
  if (!remittance) return existing ? existing : { ...seed, origin: "template" };
  if (isStablecoin(dest)) {
    return { ...seed, origin: existing?.origin === "corrected" ? "corrected" : "live", partner: remittance.partner ?? seed.partner };
  }
  const spread = Math.min(remittance.efin_fx_spread, 0.015);
  const minFee = Math.min(Math.max(remittance.minimum_fee, 0.5), 1.5);
  return {
    ...seed,
    efin_fx_spread: spread,
    transfer_fee: minFee,
    minimum_fee: minFee,
    partner: remittance.partner ?? seed.partner,
    origin: "live",
    effective_from: today(),
  };
}

export type CardPatch = Partial<
  Pick<
    CorridorRateCard,
    | "efin_fx_spread"
    | "efin_transfer_fee_pct"
    | "transfer_fee"
    | "minimum_fee"
    | "maximum_fee"
    | "recommended_position"
    | "active"
    | "partner"
    | "delivery"
    | "estimated_delivery"
  >
> & { costs?: Partial<CostComponents> };

export type PricingCorrections = {
  corridors: Record<string, CardPatch>;
  wallets: Record<string, CardPatch>;
  volumes: Record<string, Partial<VolumeDiscountTier>>;
  payouts: Record<string, Partial<PayoutMinimum>>;
  extras?: CorridorRateCard[];
};

export function emptyCorrections(): PricingCorrections {
  return { corridors: {}, wallets: {}, volumes: {}, payouts: {}, extras: [] };
}

function applyCardPatch(card: CorridorRateCard, patch?: CardPatch): CorridorRateCard {
  if (!patch || Object.keys(patch).length === 0) return card;
  return {
    ...card,
    ...patch,
    costs: { ...card.costs, ...(patch.costs ?? {}) },
    origin: "corrected",
  };
}

export function applyCorrections(base: PricingWorkbook, corrections: PricingCorrections | null | undefined): PricingWorkbook {
  const c = corrections ?? emptyCorrections();
  const extras = c.extras ?? [];
  const knownCorridor = new Set(base.corridors.map((row) => row.corridor_id));
  const knownWallet = new Set(base.wallets.map((row) => row.corridor_id));
  return {
    corridors: [
      ...base.corridors.map((row) => applyCardPatch(row, c.corridors[row.corridor_id])),
      ...extras
        .filter((row) => row.channel === "external" && !knownCorridor.has(row.corridor_id))
        .map((row) => ({ ...row, origin: "corrected" as const })),
    ],
    wallets: [
      ...base.wallets.map((row) => applyCardPatch(row, c.wallets[row.corridor_id])),
      ...extras
        .filter((row) => row.channel === "wallet" && !knownWallet.has(row.corridor_id))
        .map((row) => ({ ...row, origin: "corrected" as const })),
    ],
    volumes: base.volumes.map((row) => {
      const patch = c.volumes[row.id];
      return patch ? { ...row, ...patch } : row;
    }),
    payouts: base.payouts.map((row) => {
      const patch = c.payouts[row.payout_method];
      return patch ? { ...row, ...patch } : row;
    }),
  };
}

export function hasCorrections(corrections: PricingCorrections): boolean {
  return (
    Object.keys(corrections.corridors).length +
      Object.keys(corrections.wallets).length +
      Object.keys(corrections.volumes).length +
      Object.keys(corrections.payouts).length +
      (corrections.extras?.length ?? 0) >
    0
  );
}

const CARD_PATCH_KEYS: (keyof CardPatch)[] = [
  "efin_fx_spread",
  "efin_transfer_fee_pct",
  "transfer_fee",
  "minimum_fee",
  "maximum_fee",
  "recommended_position",
  "active",
  "partner",
  "delivery",
  "estimated_delivery",
];

export function diffCard(
  live: CorridorRateCard,
  saved: Partial<CorridorRateCard> & { costs?: Partial<CostComponents> },
): CardPatch | null {
  const patch: CardPatch = {};
  for (const key of CARD_PATCH_KEYS) {
    if (saved[key] != null && saved[key] !== live[key]) (patch as Record<string, unknown>)[key] = saved[key];
  }
  if (saved.costs) {
    const costPatch: CardPatch["costs"] = {};
    for (const [k, v] of Object.entries(saved.costs)) {
      if (v != null && v !== (live.costs as Record<string, number>)[k]) {
        (costPatch as Record<string, number>)[k] = Number(v);
      }
    }
    if (Object.keys(costPatch).length) patch.costs = costPatch;
  }
  return Object.keys(patch).length ? patch : null;
}

export function upsertPublishedCards(base: PricingWorkbook, published: CorridorRateCard[]): PricingWorkbook {
  const corridors = new Map(base.corridors.map((row) => [row.corridor_id, row]));
  const wallets = new Map(base.wallets.map((row) => [row.corridor_id, row]));
  for (const card of published) {
    const tagged = { ...card, origin: card.origin ?? ("live" as const) };
    if (card.channel === "wallet") wallets.set(card.corridor_id, tagged);
    else corridors.set(card.corridor_id, tagged);
  }
  return {
    corridors: [...corridors.values()].sort((a, b) => a.corridor_id.localeCompare(b.corridor_id)),
    wallets: [...wallets.values()].sort((a, b) => a.corridor_id.localeCompare(b.corridor_id)),
    volumes: base.volumes,
    payouts: base.payouts,
  };
}

export function correctionsFromPublished(live: PricingWorkbook, published: CorridorRateCard[]): PricingCorrections {
  const next = emptyCorrections();
  for (const card of published) {
    const pool = card.channel === "wallet" ? live.wallets : live.corridors;
    const base = pool.find((row) => row.corridor_id === card.corridor_id);
    if (!base) {
      next.extras = [...(next.extras ?? []), { ...card, origin: "corrected" }];
      continue;
    }
    const patch = diffCard(base, card);
    if (!patch) continue;
    if (card.channel === "wallet") next.wallets[card.corridor_id] = patch;
    else next.corridors[card.corridor_id] = patch;
  }
  return next;
}

export type PublishedRateCardRow = {
  corridor_id: string;
  source_currency: string;
  destination_currency: string;
  payout_method: string;
  channel?: string | null;
  delivery?: string | null;
  partner?: string | null;
  partner_cost_pct?: number | null;
  partner_fixed_fee?: number | null;
  payment_cost_pct?: number | null;
  payment_fixed_fee?: number | null;
  payout_cost_fixed?: number | null;
  liquidity_cost_pct?: number | null;
  risk_cost_pct?: number | null;
  required_margin?: number | null;
  efin_fx_spread?: number | null;
  efin_transfer_fee_pct?: number | null;
  transfer_fee?: number | null;
  minimum_fee?: number | null;
  maximum_fee?: number | null;
  fee_currency?: string | null;
  recommended_position?: string | null;
  estimated_delivery?: string | null;
  volume_discount?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  active?: boolean | null;
};

export function cardFromPublishedRow(row: PublishedRateCardRow): CorridorRateCard {
  const channel = row.channel === "wallet" ? "wallet" : "external";
  return {
    corridor_id: row.corridor_id,
    source_currency: String(row.source_currency || "").toUpperCase(),
    destination_currency: String(row.destination_currency || "").toUpperCase(),
    payout_method: payoutMethodFromInput(row.payout_method, channel),
    channel,
    delivery: row.delivery || (channel === "wallet" ? "eFinMoney wallet" : "Bank"),
    partner: row.partner ?? null,
    efin_fx_spread: Number(row.efin_fx_spread) || 0,
    efin_transfer_fee_pct: Number(row.efin_transfer_fee_pct) || DEFAULT_TRANSFER_FEE_PCT,
    transfer_fee: Number(row.transfer_fee) || 0,
    minimum_fee: Number(row.minimum_fee) || 0,
    maximum_fee: Number(row.maximum_fee) || 50,
    fee_currency: row.fee_currency || "CAD",
    recommended_position: (row.recommended_position as CorridorRateCard["recommended_position"]) || "Competitive",
    estimated_delivery: row.estimated_delivery || "Varies",
    costs: {
      partner_cost_pct: Number(row.partner_cost_pct) || 0,
      partner_fixed_fee: Number(row.partner_fixed_fee) || 0,
      payment_cost_pct: Number(row.payment_cost_pct) || 0,
      payment_fixed_fee: Number(row.payment_fixed_fee) || 0,
      payout_cost_fixed: Number(row.payout_cost_fixed) || 0,
      liquidity_cost_pct: Number(row.liquidity_cost_pct) || 0,
      risk_cost_pct: Number(row.risk_cost_pct) || 0,
      required_margin: Number(row.required_margin) || 0,
    },
    volume_discount: Number(row.volume_discount) || 0,
    effective_from: row.effective_from ? String(row.effective_from).slice(0, 10) : RATE_CARD_EFFECTIVE_FROM,
    effective_to: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
    active: row.active !== false,
    origin: "live",
  };
}

export function mergeCorrections(base: PricingCorrections, overlay: PricingCorrections): PricingCorrections {
  const extrasById = new Map<string, CorridorRateCard>();
  for (const row of [...(base.extras ?? []), ...(overlay.extras ?? [])]) extrasById.set(row.corridor_id, row);
  return {
    corridors: { ...base.corridors, ...overlay.corridors },
    wallets: { ...base.wallets, ...overlay.wallets },
    volumes: { ...base.volumes, ...overlay.volumes },
    payouts: { ...base.payouts, ...overlay.payouts },
    extras: [...extrasById.values()],
  };
}

export function newManualCorridor(input: {
  source: string;
  dest: string;
  method: PayoutMethod;
  channel: "wallet" | "external";
}): CorridorRateCard {
  const source = input.source.toUpperCase();
  const dest = input.dest.toUpperCase();
  const id = corridorKey(source, dest, input.method, input.channel);
  const template = templateFor(source, dest, input.method, input.channel);
  const same = WALLET_RATES.find((c) => c.corridor_id === "WALLET_SAME_CURRENCY")!;
  if (input.channel === "wallet") {
    return {
      ...(template ?? same),
      corridor_id: id.startsWith("WALLET_") ? id : `WALLET_${source}_${dest}`,
      source_currency: source,
      destination_currency: dest,
      payout_method: "WALLET_TO_WALLET",
      channel: "wallet",
      delivery: "eFinMoney wallet",
      partner: "eFinMoney",
      origin: "corrected",
      effective_from: today(),
      active: true,
    };
  }
  return {
    ...(template ?? {
      ...same,
      costs: { ...DEFAULT_EXTERNAL_COSTS },
      efin_fx_spread: 0.015,
      transfer_fee: payoutMin(input.method),
      minimum_fee: payoutMin(input.method),
      maximum_fee: 50,
      recommended_position: "Competitive" as const,
    }),
    corridor_id: id,
    source_currency: source,
    destination_currency: dest,
    payout_method: input.method,
    channel: "external",
    delivery: deliveryLabel(input.method),
    origin: "corrected",
    effective_from: today(),
    active: true,
  };
}
