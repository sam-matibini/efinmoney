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
  emptyCorrections,
  hasCorrections,
  type CardPatch,
  type PricingCorrections,
} from "@/lib/pricing/assembleDynamicWorkbook";
import {
  getCorrections,
  setCorrections,
  setLiveBase,
} from "@/lib/pricing/workbookStore";
import type { CorridorRateCard, PricingWorkbook } from "@/lib/pricing/types";
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

function patchFromSaved(live: CorridorRateCard, saved: Partial<CorridorRateCard> & { costs?: Partial<CorridorRateCard["costs"]> }): CardPatch | null {
  const patch: CardPatch = {};
  const keys: (keyof CardPatch)[] = [
    "efin_fx_spread",
    "efin_transfer_fee_pct",
    "transfer_fee",
    "minimum_fee",
    "maximum_fee",
    "recommended_position",
    "active",
    "partner",
  ];
  for (const key of keys) {
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

export function useLivePricingWorkbook() {
  const qc = useQueryClient();
  const partners = usePaymentPartners();
  const corridors = usePartnerCorridors();
  const partnerPricing = usePartnerPricing();
  const partnerFx = usePartnerFxRates();
  const currencies = useCurrencies();
  const fxRates = useFxRates();
  const efin = useEfinPricing(false);

  const dbCards = useQuery({
    queryKey: ["corridor_rate_cards"],
    queryFn: async () => {
      const { data, error } = await db.from("corridor_rate_cards").select("*").eq("active", true);
      if (error) return [];
      return data ?? [];
    },
    retry: false,
  });

  const liveBase = useMemo(
    () =>
      assembleDynamicWorkbook({
        partners: partners.data ?? [],
        corridors: corridors.data ?? [],
        partnerPricing: partnerPricing.data ?? [],
        partnerFx: partnerFx.data ?? [],
        currencies: currencies.data ?? [],
      }),
    [partners.data, corridors.data, partnerPricing.data, partnerFx.data, currencies.data],
  );

  const [draft, setDraft] = useState<PricingCorrections>(() => getCorrections());
  const [saving, setSaving] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    setLiveBase(liveBase);
  }, [liveBase]);

  useEffect(() => {
    if (hydrated.current) return;
    if (partners.isLoading || corridors.isLoading || efin.isLoading || dbCards.isLoading) return;
    hydrated.current = true;
    const next = emptyCorrections();
    const savedRows = (dbCards.data ?? []) as Array<Record<string, unknown>>;
    for (const row of savedRows) {
      const id = String(row.corridor_id || "");
      const channel = row.channel === "wallet" ? "wallets" : "corridors";
      const live = (channel === "wallets" ? liveBase.wallets : liveBase.corridors).find((c) => c.corridor_id === id);
      if (!live) continue;
      const patch = patchFromSaved(live, {
        efin_fx_spread: Number(row.efin_fx_spread),
        efin_transfer_fee_pct: Number(row.efin_transfer_fee_pct),
        transfer_fee: Number(row.transfer_fee),
        minimum_fee: Number(row.minimum_fee),
        maximum_fee: Number(row.maximum_fee),
        recommended_position: row.recommended_position as CorridorRateCard["recommended_position"],
        partner: (row.partner as string) ?? null,
        costs: {
          partner_cost_pct: Number(row.partner_cost_pct),
          partner_fixed_fee: Number(row.partner_fixed_fee),
          payment_cost_pct: Number(row.payment_cost_pct),
          payment_fixed_fee: Number(row.payment_fixed_fee),
          liquidity_cost_pct: Number(row.liquidity_cost_pct),
          risk_cost_pct: Number(row.risk_cost_pct),
          required_margin: Number(row.required_margin),
        },
      });
      if (patch) next[channel][id] = patch;
    }
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
      bucket[live.corridor_id] = { ...(bucket[live.corridor_id] ?? {}), ...mapped.patch };
    }
    const local = getCorrections();
    const merged: PricingCorrections = {
      corridors: { ...next.corridors, ...local.corridors },
      wallets: { ...next.wallets, ...local.wallets },
      volumes: { ...next.volumes, ...local.volumes },
      payouts: { ...next.payouts, ...local.payouts },
    };
    setDraft(merged);
    setCorrections(merged);
  }, [liveBase, dbCards.data, efin.data, partners.isLoading, corridors.isLoading, efin.isLoading, dbCards.isLoading]);

  const workbook = useMemo(() => applyCorrections(liveBase, draft), [liveBase, draft]);

  useEffect(() => {
    setLiveBase(liveBase);
    setCorrections(draft);
  }, [liveBase, draft]);

  const loading = partners.isLoading || corridors.isLoading || currencies.isLoading;

  const liveCorridorCount = liveBase.corridors.filter((c) => c.origin === "live").length;
  const livePartners = [...new Set(liveBase.corridors.filter((c) => c.origin === "live").map((c) => c.partner).filter(Boolean))];

  const patchCard = (kind: "corridors" | "wallets", id: string, patch: CardPatch) => {
    setDraft((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], [id]: { ...(prev[kind][id] ?? {}), ...patch, costs: { ...(prev[kind][id]?.costs ?? {}), ...(patch.costs ?? {}) } } },
    }));
  };

  const patchVolume = (id: string, patch: PricingCorrections["volumes"][string]) => {
    setDraft((prev) => ({ ...prev, volumes: { ...prev.volumes, [id]: { ...(prev.volumes[id] ?? {}), ...patch } } }));
  };

  const patchPayout = (method: string, patch: PricingCorrections["payouts"][string]) => {
    setDraft((prev) => ({ ...prev, payouts: { ...prev.payouts, [method]: { ...(prev.payouts[method] ?? {}), ...patch } } }));
  };

  const resetToLive = () => {
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
      ]);
      const dirtyCards = [...merged.corridors, ...merged.wallets].filter((c) => dirtyIds.has(c.corridor_id));

      for (const card of dirtyCards) {
        const row = cardToDbRow(card);
        const { data: existing } = await db
          .from("corridor_rate_cards")
          .update(row)
          .eq("corridor_id", card.corridor_id)
          .is("effective_to", null)
          .select("id");
        if (!existing?.length) {
          await db.from("corridor_rate_cards").insert(row);
        }

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
        await db.from("efinmoney_pricing").insert({
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
      }

      for (const tier of merged.volumes) {
        await db.from("volume_discount_tiers").upsert({
          id: tier.id,
          min_monthly_volume: tier.min_monthly_volume,
          max_monthly_volume: tier.max_monthly_volume,
          fx_spread_discount: tier.fx_spread_discount,
          transfer_fee_discount: tier.transfer_fee_discount,
          label: tier.label,
          custom: tier.custom,
        });
      }
      for (const payout of merged.payouts) {
        await db.from("payout_method_minimums").upsert({
          payout_method: payout.payout_method,
          label: payout.label,
          minimum_fee: payout.minimum_fee,
          fee_currency: payout.fee_currency,
        });
      }

      await qc.invalidateQueries({ queryKey: ["corridor_rate_cards"] });
      await qc.invalidateQueries({ queryKey: ["efinmoney_pricing"] });
      return { ok: true as const, db: true };
    } catch (error) {
      setCorrections(draft);
      return { ok: true as const, db: false, error };
    } finally {
      setSaving(false);
    }
  };

  return {
    workbook,
    liveBase,
    draft,
    loading,
    saving,
    dirty: hasCorrections(draft),
    liveCorridorCount,
    livePartners,
    fxRates: fxRates.data ?? [],
    patchCard,
    patchVolume,
    patchPayout,
    resetToLive,
    save,
    refetch: () => {
      void partners.refetch();
      void corridors.refetch();
      void partnerPricing.refetch();
      void partnerFx.refetch();
      void currencies.refetch();
      void fxRates.refetch();
    },
  };
}

/** Keep checkout quotes on the live partner/corridor card. */
export function LivePricingHydrator() {
  useLivePricingWorkbook();
  return null;
}
