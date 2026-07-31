// Shared helpers for Phase 11 automated fee adjustments.
// A proposal is applied by inserting a NEW versioned efinmoney_pricing row —
// existing rows are closed off by effective_to so history stays intact.

export interface FeeAdjustmentSettings {
  id: string;
  enabled: boolean;
  auto_apply: boolean;
  target_margin_percent: number;
  lookback_days: number;
  min_txn_count: number;
  min_volume: number;
  max_fee_delta_percent: number;
  cooldown_days: number;
}

export const DEFAULT_SETTINGS: Omit<FeeAdjustmentSettings, "id"> = {
  enabled: false,
  auto_apply: false,
  target_margin_percent: 3,
  lookback_days: 30,
  min_txn_count: 20,
  min_volume: 10_000,
  max_fee_delta_percent: 0.5,
  cooldown_days: 14,
};

// deno-lint-ignore no-explicit-any
type Client = any;

export async function loadSettings(supabase: Client): Promise<FeeAdjustmentSettings> {
  const { data } = await supabase
    .from("fee_adjustment_settings")
    .select("*")
    .eq("is_singleton", true)
    .maybeSingle();
  if (!data) return { id: "", ...DEFAULT_SETTINGS };
  return {
    id: data.id,
    enabled: !!data.enabled,
    auto_apply: !!data.auto_apply,
    target_margin_percent: Number(data.target_margin_percent ?? DEFAULT_SETTINGS.target_margin_percent),
    lookback_days: Number(data.lookback_days ?? DEFAULT_SETTINGS.lookback_days),
    min_txn_count: Number(data.min_txn_count ?? DEFAULT_SETTINGS.min_txn_count),
    min_volume: Number(data.min_volume ?? DEFAULT_SETTINGS.min_volume),
    max_fee_delta_percent: Number(data.max_fee_delta_percent ?? DEFAULT_SETTINGS.max_fee_delta_percent),
    cooldown_days: Number(data.cooldown_days ?? DEFAULT_SETTINGS.cooldown_days),
  };
}

/**
 * Insert the proposed fee as a new efinmoney_pricing version and stamp the
 * proposal as applied. Re-checks the fee-move cap so a stale proposal cannot
 * slip through after the cap was tightened.
 */
export async function applyProposal(
  supabase: Client,
  // deno-lint-ignore no-explicit-any
  proposal: any,
  settings: FeeAdjustmentSettings,
  userId: string | null,
): Promise<{ ok: true; pricing_id: string } | { ok: false; error: string }> {
  const delta = Math.abs(
    Number(proposal.proposed_percentage_fee ?? 0) - Number(proposal.current_percentage_fee ?? 0),
  );
  const cap = Number(settings.max_fee_delta_percent);
  if (Number.isFinite(cap) && cap > 0 && delta > cap + 1e-9) {
    return { ok: false, error: `Fee move of ${delta.toFixed(4)}pp exceeds the cap of ${cap}pp` };
  }

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabase
    .from("efinmoney_pricing")
    .insert({
      customer_type: proposal.customer_type ?? "consumer",
      direction: proposal.direction ?? "payout",
      dest_country: proposal.dest_country ?? null,
      source_currency: proposal.source_currency,
      dest_currency: proposal.dest_currency,
      payment_method: proposal.payment_method ?? null,
      fixed_fee: Number(proposal.proposed_fixed_fee ?? 0),
      percentage_fee: Number(proposal.proposed_percentage_fee ?? 0),
      fx_margin_bps: Number(proposal.proposed_fx_margin_bps ?? 0),
      effective_from: nowIso,
      updated_by: userId,
    })
    .select("id")
    .single();

  if (insErr) return { ok: false, error: insErr.message };

  // close any other open version for the same corridor/customer type
  await supabase
    .from("efinmoney_pricing")
    .update({ effective_to: nowIso })
    .is("effective_to", null)
    .neq("id", inserted.id)
    .eq("customer_type", proposal.customer_type ?? "consumer")
    .eq("direction", proposal.direction ?? "payout")
    .eq("source_currency", proposal.source_currency)
    .eq("dest_currency", proposal.dest_currency);

  const { error: updErr } = await supabase
    .from("pricing_proposals")
    .update({
      status: "applied",
      applied_pricing_id: inserted.id,
      applied_at: nowIso,
      reviewed_by: proposal.reviewed_by ?? userId,
      reviewed_at: proposal.reviewed_at ?? nowIso,
    })
    .eq("id", proposal.id);
  if (updErr) return { ok: false, error: updErr.message };

  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "pricing_proposal_applied",
    table_name: "pricing_proposals",
    record_id: proposal.id,
    old_data: {
      fixed_fee: Number(proposal.current_fixed_fee ?? 0),
      percentage_fee: Number(proposal.current_percentage_fee ?? 0),
    },
    new_data: {
      corridor: proposal.group_key,
      fixed_fee: Number(proposal.proposed_fixed_fee ?? 0),
      percentage_fee: Number(proposal.proposed_percentage_fee ?? 0),
      efinmoney_pricing_id: inserted.id,
      source: proposal.source,
    },
  });

  return { ok: true, pricing_id: inserted.id };
}
