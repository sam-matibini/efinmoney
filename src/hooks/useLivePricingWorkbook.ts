import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  usePaymentPartners,
  usePartnerCorridors,
  usePartnerPricing,
  usePartnerFxRates,
  useEfinPricing,
  type EfinPricing,
} from "@/hooks/usePartnerNetwork";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useFxRates } from "@/hooks/useFxRates";
import {
  assembleDynamicWorkbook,
  applyCorrections,
  cardFromPublishedRow,
  correctionsFromPublished,
  diffCard,
  emptyCorrections,
  hasCorrections,
  mergeCorrections,
  newManualCorridor,
  type CardPatch,
  type PricingCorrections,
  type PublishedRateCardRow,
} from "@/lib/pricing/assembleDynamicWorkbook";
import {
  getCorrections,
  releaseAdminLiveBase,
  setCorrections,
  setLiveBase,
} from "@/lib/pricing/workbookStore";
import type { CorridorRateCard, PayoutMethod, PricingWorkbook } from "@/lib/pricing/types";
import { payoutMethodFromInput } from "@/lib/pricing/rateCard";

const db = supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> };

function cardToDbRow(card: CorridorRateCard) {
  return {
    corridor_id: card.corridor_id,
    source_currency: card.source_currency,
    destination_currency: card.destination_currency,
    payout_method: card.payout_method,
    channel: card.channel,
    delivery: card.delivery,
    partner: card.partner,
    partner_cost_pct: card.costs.partner_cost_pct,
    partner_fixed_fee: card.costs.partner_fixed_fee,
    payment_cost_pct: card.costs.payment_cost_pct,
    payment_fixed_fee: card.costs.payment_fixed_fee,
    payout_cost_fixed: card.costs.payout_cost_fixed,
    liquidity_cost_pct: card.costs.liquidity_cost_pct,
    risk_cost_pct: card.costs.risk_cost_pct,
    required_margin: card.costs.required_margin,
    efin_fx_spread: card.efin_fx_spread,
    efin_transfer_fee_pct: card.efin_transfer_fee_pct,
    transfer_fee: card.transfer_fee,
    minimum_fee: card.minimum_fee,
    maximum_fee: card.maximum_fee,
    fee_currency: card.fee_currency,
    recommended_position: card.recommended_position,
    estimated_delivery: card.estimated_delivery,
    volume_discount: card.volume_discount,
    effective_from: card.effective_from,
    effective_to: card.effective_to,
    active: card.active,
  };
}

function efinToPatch(row: EfinPricing): { channel: "wallet" | "external"; idHint: Partial<CorridorRateCard>; patch: CardPatch } {
  const channel = row.payment_method === "fx_swap" ? "wallet" : "external";
  const method = payoutMethodFromInput(row.payment_method, channel);
  return {
    channel,
    idHint: {
      source_currency: row.source_currency,
      destination_currency: row.dest_currency,
      payout_method: method,
      channel,
    },
    patch: {
      efin_fx_spread: Number(row.fx_margin_bps || 0) / 10000,
      efin_transfer_fee_pct: Number(row.percentage_fee || 0) / 100,
      minimum_fee: row.min_fee ?? undefined,
      maximum_fee: row.max_fee ?? undefined,
    },
  };
}

function useSoftTable<T>(key: string, table: string, columns = "*") {
  return useQuery({
    queryKey: [key],
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await db.from(table).select(columns);
      if (error) return [];
      return (data ?? []) as T[];
    },
    retry: false,
    refetchInterval: 60_000,
  });
}

export function useCheckoutPricingHydrator() {
  const currencies = useCurrencies();
  const dbCards = useSoftTable<PublishedRateCardRow>("corridor_rate_cards", "corridor_rate_cards");
  const volumes = useSoftTable<{
    id: string;
    min_monthly_volume: number;
    max_monthly_volume: number | null;
    fx_spread_discount: number | null;
    transfer_fee_discount: number | null;
    label: string;
    custom: boolean;
  }>("volume_discount_tiers", "volume_discount_tiers");
  const payouts = useSoftTable<{
    payout_method: PayoutMethod;
    label: string;
    minimum_fee: number;
    fee_currency: string;
  }>("payout_method_minimums", "payout_method_minimums");

  const liveBase = useMemo(() => {
    const published = (dbCards.data ?? [])
      .filter((row) => row.active !== false)
      .map(cardFromPublishedRow);
    return assembleDynamicWorkbook({
      currencies: currencies.data ?? [],
      volumes: volumes.data ?? [],
      payouts: payouts.data ?? [],
      publishedCards: published,
    });
  }, [currencies.data, dbCards.data, volumes.data, payouts.data]);

  useEffect(() => {
    setLiveBase(liveBase, "checkout");
  }, [liveBase]);

  return liveBase;
}

export function LivePricingHydrator() {
  useCheckoutPricingHydrator();
  return null;
}

export function useLivePricingWorkbook() {
  const qc = useQueryClient();
  const partners = usePaymentPartners();
  const corridors = usePartnerCorridors();
  const partnerPricing = usePartnerPricing();
  const partnerFx = usePartnerFxRates();
  const currencies = useCurrencies();
  const fxRates = useFxRates();
  const efin = useEfinPricing(false);
  const dbCards = useSoftTable<PublishedRateCardRow>("corridor_rate_cards", "corridor_rate_cards");
  const volumes = useSoftTable<{
    id: string;
    min_monthly_volume: number;
    max_monthly_volume: number | null;
    fx_spread_discount: number | null;
    transfer_fee_discount: number | null;
    label: string;
    custom: boolean;
  }>("volume_discount_tiers", "volume_discount_tiers");
  const payouts = useSoftTable<{
    payout_method: PayoutMethod;
    label: string;
    minimum_fee: number;
    fee_currency: string;
  }>("payout_method_minimums", "payout_method_minimums");

  const liveBase = useMemo(
    () =>
      assembleDynamicWorkbook({
        partners: partners.data ?? [],
        corridors: corridors.data ?? [],
        partnerPricing: partnerPricing.data ?? [],
        partnerFx: partnerFx.data ?? [],
        currencies: currencies.data ?? [],
        volumes: volumes.data ?? [],
        payouts: payouts.data ?? [],
      }),
    [partners.data, corridors.data, partnerPricing.data, partnerFx.data, currencies.data, volumes.data, payouts.data],
  );

  const [draft, setDraft] = useState<PricingCorrections>(() => getCorrections());
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const hydrated = useRef(false);
  const holdHydrate = useRef(false);

  useEffect(() => {
    setLiveBase(liveBase, "admin");
    setLastRefreshed(new Date());
    return () => releaseAdminLiveBase();
  }, [liveBase]);

  useEffect(() => {
    if (holdHydrate.current) return;
    if (hydrated.current) return;
    if (partners.isLoading || corridors.isLoading || efin.isLoading || dbCards.isLoading) return;
    hydrated.current = true;
    const published = (dbCards.data ?? [])
      .filter((row) => row.active !== false)
      .map(cardFromPublishedRow);
    let next = correctionsFromPublished(liveBase, published);
    for (const row of efin.data ?? []) {
      const mapped = efinToPatch(row);
      const pool = mapped.channel === "wallet" ? liveBase.wallets : liveBase.corridors;
      const live = pool.find(
        (c) =>
          c.source_currency === mapped.idHint.source_currency &&
          c.destination_currency === mapped.idHint.destination_currency &&
          (mapped.channel === "wallet" || c.payout_method === mapped.idHint.payout_method),
      );
      if (!live) continue;
      const bucket = mapped.channel === "wallet" ? next.wallets : next.corridors;
      const patch = diffCard(live, { ...live, ...mapped.patch });
      if (patch) bucket[live.corridor_id] = { ...(bucket[live.corridor_id] ?? {}), ...patch };
    }
    next = mergeCorrections(next, getCorrections());
    setDraft(next);
    setCorrections(next);
  }, [liveBase, dbCards.data, efin.data, partners.isLoading, corridors.isLoading, efin.isLoading, dbCards.isLoading]);

  const workbook = useMemo(() => applyCorrections(liveBase, draft), [liveBase, draft]);

  useEffect(() => {
    setLiveBase(liveBase, "admin");
    setCorrections(draft);
  }, [liveBase, draft]);

  const loading = partners.isLoading || corridors.isLoading || currencies.isLoading;
  const liveCorridorCount = liveBase.corridors.filter((c) => c.origin === "live").length;
  const liveWalletCount = liveBase.wallets.filter((c) => c.origin === "live").length;
  const livePartners = [...new Set(liveBase.corridors.filter((c) => c.origin === "live").map((c) => c.partner).filter(Boolean))];

  const patchCard = (kind: "corridors" | "wallets", id: string, patch: CardPatch) => {
    setDraft((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        [id]: { ...(prev[kind][id] ?? {}), ...patch, costs: { ...(prev[kind][id]?.costs ?? {}), ...(patch.costs ?? {}) } },
      },
    }));
  };

  const revertCard = (kind: "corridors" | "wallets", id: string) => {
    setDraft((prev) => {
      const bucket = { ...prev[kind] };
      delete bucket[id];
      return {
        ...prev,
        [kind]: bucket,
        extras: (prev.extras ?? []).filter((row) => row.corridor_id !== id),
      };
    });
  };

  const patchVolume = (id: string, patch: PricingCorrections["volumes"][string]) => {
    setDraft((prev) => ({ ...prev, volumes: { ...prev.volumes, [id]: { ...(prev.volumes[id] ?? {}), ...patch } } }));
  };

  const patchPayout = (method: string, patch: PricingCorrections["payouts"][string]) => {
    setDraft((prev) => ({ ...prev, payouts: { ...prev.payouts, [method]: { ...(prev.payouts[method] ?? {}), ...patch } } }));
  };

  const addManualRow = (input: { source: string; dest: string; method: PayoutMethod; channel: "wallet" | "external" }) => {
    const card = newManualCorridor(input);
    setDraft((prev) => {
      const extras = [...(prev.extras ?? []).filter((row) => row.corridor_id !== card.corridor_id), card];
      return { ...prev, extras };
    });
    return card;
  };

  const resetToLive = () => {
    holdHydrate.current = true;
    hydrated.current = true;
    const empty = emptyCorrections();
    setDraft(empty);
    setCorrections(empty);
  };

  const save = async () => {
    setSaving(true);
    try {
      setCorrections(draft);
      const merged = applyCorrections(liveBase, draft);
      const dirtyIds = new Set([
        ...Object.keys(draft.corridors),
        ...Object.keys(draft.wallets),
        ...(draft.extras ?? []).map((row) => row.corridor_id),
      ]);
      const allCards = [...merged.corridors, ...merged.wallets];
      const cardsToWrite = dirtyIds.size ? allCards.filter((c) => dirtyIds.has(c.corridor_id)) : allCards;
      let wrote = 0;
      const failures: string[] = [];

      for (const card of cardsToWrite) {
        const row = cardToDbRow(card);
        const { data: existing, error: updateError } = await db
          .from("corridor_rate_cards")
          .update(row)
          .eq("corridor_id", card.corridor_id)
          .is("effective_to", null)
          .select("id");
        if (updateError) {
          failures.push(updateError.message);
          continue;
        }
        if (!existing?.length) {
          const { error: insertError } = await db.from("corridor_rate_cards").insert(row);
          if (insertError) {
            failures.push(insertError.message);
            continue;
          }
        }
        wrote += 1;

        if (!dirtyIds.has(card.corridor_id)) continue;
        const payment_method = card.channel === "wallet" ? "fx_swap" : card.payout_method.toLowerCase();
        const current = (efin.data ?? []).find(
          (r) =>
            r.source_currency === card.source_currency &&
            r.dest_currency === card.destination_currency &&
            (r.payment_method ?? "fx_swap") === payment_method,
        );
        if (current?.id) {
          await db.from("efinmoney_pricing").update({ effective_to: new Date().toISOString() }).eq("id", current.id);
        }
        const { error: priceError } = await db.from("efinmoney_pricing").insert({
          customer_type: "consumer",
          direction: "payout",
          source_currency: card.source_currency,
          dest_currency: card.destination_currency,
          payment_method,
          fixed_fee: 0,
          percentage_fee: card.efin_transfer_fee_pct * 100,
          fx_margin_bps: card.efin_fx_spread * 10000,
          min_fee: card.minimum_fee,
          max_fee: card.maximum_fee,
        });
        if (priceError) failures.push(priceError.message);
      }

      for (const tier of merged.volumes) {
        const { error } = await db.from("volume_discount_tiers").upsert({
          id: tier.id,
          min_monthly_volume: tier.min_monthly_volume,
          max_monthly_volume: tier.max_monthly_volume,
          fx_spread_discount: tier.fx_spread_discount,
          transfer_fee_discount: tier.transfer_fee_discount,
          label: tier.label,
          custom: tier.custom,
        });
        if (error) failures.push(error.message);
      }
      for (const payout of merged.payouts) {
        const { error } = await db.from("payout_method_minimums").upsert({
          payout_method: payout.payout_method,
          label: payout.label,
          minimum_fee: payout.minimum_fee,
          fee_currency: payout.fee_currency,
        });
        if (error) failures.push(error.message);
      }

      await qc.invalidateQueries({ queryKey: ["corridor_rate_cards"] });
      await qc.invalidateQueries({ queryKey: ["efinmoney_pricing"] });
      await qc.invalidateQueries({ queryKey: ["volume_discount_tiers"] });
      await qc.invalidateQueries({ queryKey: ["payout_method_minimums"] });

      if (failures.length && wrote === 0) {
        return { ok: false as const, db: false, wrote, error: failures[0] };
      }
      return { ok: true as const, db: failures.length === 0, wrote, error: failures[0] };
    } catch (error) {
      setCorrections(draft);
      return { ok: false as const, db: false, wrote: 0, error };
    } finally {
      setSaving(false);
    }
  };

  const refetch = async () => {
    setRefreshing(true);
    try {
      const settled = await Promise.allSettled([
        partners.refetch(),
        corridors.refetch(),
        partnerPricing.refetch(),
        partnerFx.refetch(),
        currencies.refetch(),
        fxRates.refetch(),
        dbCards.refetch(),
        volumes.refetch(),
        payouts.refetch(),
        efin.refetch(),
      ]);
      const failed = settled.filter((r) => r.status === "rejected").length;
      setLastRefreshed(new Date());
      return { ok: failed === 0, failed };
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      void partners.refetch();
      void corridors.refetch();
      void partnerPricing.refetch();
      void partnerFx.refetch();
      void currencies.refetch();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [partners.refetch, corridors.refetch, partnerPricing.refetch, partnerFx.refetch, currencies.refetch]);

  return {
    workbook,
    liveBase,
    draft,
    loading,
    saving,
    refreshing,
    dirty: hasCorrections(draft),
    liveCorridorCount,
    liveWalletCount,
    livePartners,
    fxRates: fxRates.data ?? [],
    lastRefreshed,
    isCardDirty: (kind: "corridors" | "wallets", id: string) =>
      Boolean(draft[kind][id]) || Boolean(draft.extras?.some((row) => row.corridor_id === id)),
    patchCard,
    revertCard,
    addManualRow,
    patchVolume,
    patchPayout,
    resetToLive,
    save,
    refetch,
  };
}

export type LivePricingWorkbook = ReturnType<typeof useLivePricingWorkbook>;
export type { PricingWorkbook };
