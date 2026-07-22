/**
 * Lenhub Flutter webhook / payment callback.
 * Settles card top-ups and bank/MoMo payouts.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SETTLEMENT_BY_CURRENCY: Record<string, string> = {
  NGN: "1260",
  USD: "1261",
  EUR: "1262",
  GBP: "1263",
  CAD: "1261",
  GHS: "1260",
  KES: "1260",
  UGX: "1260",
  RWF: "1260",
  TZS: "1260",
};

const LIABILITY_BY_CURRENCY: Record<string, string> = {
  NGN: "2102",
  USD: "2100",
  CAD: "2101",
  EUR: "2104",
  GBP: "2105",
  GHS: "2102",
  KES: "2102",
  UGX: "2102",
  RWF: "2102",
  TZS: "2102",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickStatus(payload: Record<string, unknown>): string {
  const data = (payload.data || payload) as Record<string, unknown>;
  return String(
    data.status ||
      payload.status ||
      (payload.message && typeof payload.message === "object"
        ? (payload.message as Record<string, unknown>).status
        : "") ||
      "",
  ).toLowerCase();
}

function pickChargeId(payload: Record<string, unknown>): string | null {
  const data = (payload.data || payload) as Record<string, unknown>;
  const id =
    data.charge_id ||
    data.chargeId ||
    data.order_ref ||
    data.orderRef ||
    data.flw_ref ||
    data.flwRef ||
    data.tx_ref ||
    data.txRef ||
    data.id ||
    payload.charge_id ||
    payload.chargeId ||
    payload.order_ref ||
    payload.flw_ref;
  return id != null ? String(id) : null;
}

/** Collect all plausible refs so VA top-ups (order_ref / flw_ref) still match. */
function pickChargeIdCandidates(payload: Record<string, unknown>): string[] {
  const data = (payload.data || payload) as Record<string, unknown>;
  const keys = [
    "charge_id", "chargeId", "order_ref", "orderRef", "flw_ref", "flwRef",
    "tx_ref", "txRef", "id", "reference",
  ];
  const out: string[] = [];
  for (const src of [data, payload]) {
    for (const k of keys) {
      const v = src[k];
      if (v != null && String(v).trim()) {
        const s = String(v).trim();
        if (!out.includes(s)) out.push(s);
      }
    }
  }
  return out;
}

function pickTransferRef(payload: Record<string, unknown>): string | null {
  const data = (payload.data || payload) as Record<string, unknown>;
  const meta = (data.meta || payload.meta || {}) as Record<string, unknown>;
  if (meta.transfer_id) return String(meta.transfer_id);
  const id = data.id || data.reference || data.flw_ref || payload.reference;
  return id != null ? String(id) : null;
}

async function creditWallet(
  supabase: ReturnType<typeof createClient>,
  params: { userId: string; walletId: string | null; currency: string; amount: number; chargeRowId: string; chargeId: string },
) {
  const { data: already } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "lenhub_flutter_topup")
    .eq("reference_id", params.chargeRowId)
    .limit(1);
  if (already?.length) return { credited: false, reason: "already_credited" };

  let walletId = params.walletId;
  if (!walletId) {
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", params.userId)
      .eq("currency_code", params.currency)
      .maybeSingle();
    walletId = wallet?.id ?? null;
  }
  if (!walletId) return { credited: false, reason: "wallet_missing" };

  const assetCode = SETTLEMENT_BY_CURRENCY[params.currency] || SETTLEMENT_BY_CURRENCY.USD;
  const liabCode = LIABILITY_BY_CURRENCY[params.currency] || LIABILITY_BY_CURRENCY.USD;
  const { data: asset } = await supabase.from("ledger_accounts").select("id").eq("code", assetCode).maybeSingle();
  const { data: liab } = await supabase.from("ledger_accounts").select("id").eq("code", liabCode).maybeSingle();
  if (!asset || !liab) return { credited: false, reason: "ledger_account_missing" };

  const journalId = crypto.randomUUID();
  const desc = `Lenhub Flutter top-up ${params.chargeId}`.slice(0, 500);
  const { error } = await supabase.from("ledger_entries").insert([
    {
      journal_id: journalId,
      account_id: asset.id,
      wallet_id: null,
      currency_code: params.currency,
      debit_amount: params.amount,
      credit_amount: 0,
      description: desc,
      reference_type: "lenhub_flutter_topup",
      reference_id: params.chargeRowId,
      external_reference: params.chargeId,
      created_by: params.userId,
    },
    {
      journal_id: journalId,
      account_id: liab.id,
      wallet_id: walletId,
      currency_code: params.currency,
      debit_amount: 0,
      credit_amount: params.amount,
      description: desc,
      reference_type: "lenhub_flutter_topup",
      reference_id: params.chargeRowId,
      external_reference: params.chargeId,
      created_by: params.userId,
    },
  ]);
  if (error) return { credited: false, reason: error.message };
  return { credited: true, reason: "ok" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    let payload: Record<string, unknown> = {};
    if (req.method === "GET") {
      for (const [k, v] of url.searchParams.entries()) payload[k] = v;
    } else {
      const text = await req.text();
      try {
        payload = text ? JSON.parse(text) as Record<string, unknown> : {};
      } catch {
        payload = { raw: text };
      }
    }

    try {
      await supabase.from("flw_webhook_logs").insert({
        event: "lenhub_flutter",
        payload,
        processed: false,
      });
    } catch { /* optional log table */ }

    const status = pickStatus(payload);
    const success = ["successful", "success", "succeeded", "completed", "paid"].includes(status);
    const failed = ["failed", "cancelled", "canceled", "reversed"].includes(status);

    const chargeCandidates = pickChargeIdCandidates(payload);
    const chargeId = chargeCandidates[0] || pickChargeId(payload);
    let charge: Record<string, unknown> | null = null;
    if (chargeCandidates.length) {
      const { data: charges } = await supabase
        .from("lenhub_flutter_charges")
        .select("*")
        .in("charge_id", chargeCandidates)
        .limit(1);
      charge = charges?.[0] ?? null;
    }
    if (charge && success && !charge.credited_at) {
      const settleId = String(charge.charge_id || chargeId || charge.id);
      const credit = await creditWallet(supabase, {
        userId: String(charge.user_id),
        walletId: (charge.wallet_id as string | null) ?? null,
        currency: String(charge.currency_code),
        amount: Number(charge.amount),
        chargeRowId: String(charge.id),
        chargeId: settleId,
      });
      await supabase.from("lenhub_flutter_charges").update({
        status: credit.credited ? "credited" : `success_${credit.reason}`,
        credited_at: credit.credited ? new Date().toISOString() : null,
        provider_response: payload,
        updated_at: new Date().toISOString(),
      }).eq("id", charge.id);
      if (credit.credited) {
        await supabase.from("notifications").insert({
          user_id: charge.user_id,
          title: "Wallet topped up",
          message: `${charge.currency_code} ${charge.amount} has been added to your wallet.`,
          type: "wallet",
        });
      }
    } else if (charge && failed) {
      await supabase.from("lenhub_flutter_charges").update({
        status: "failed",
        provider_response: payload,
        updated_at: new Date().toISOString(),
      }).eq("id", charge.id);
    }

    const providerRef = pickTransferRef(payload);
    if (providerRef) {
      const uuidMatch = providerRef.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      let q = supabase.from("transfers").select("*");
      q = uuidMatch ? q.eq("id", providerRef) : q.eq("provider_reference", providerRef);
      const { data: transfers } = await q.limit(1);
      const transfer = transfers?.[0];
      if (transfer) {
        if (success) {
          await supabase.from("transfers").update({
            status: "completed",
            completed_at: new Date().toISOString(),
          }).eq("id", transfer.id);
          await supabase.from("lenhub_flutter_payouts").update({
            status: "completed",
            provider_response: payload,
            updated_at: new Date().toISOString(),
          }).eq("transfer_id", transfer.id);
          await supabase.from("notifications").insert({
            user_id: transfer.sender_id,
            title: "Transfer complete",
            message: `Your transfer of ${transfer.target_currency} ${transfer.target_amount} to ${transfer.recipient_name} is complete.`,
            type: "transfer",
          });
        } else if (failed && transfer.status !== "failed") {
          await supabase.from("transfers").update({
            status: "failed",
            failure_reason: status,
          }).eq("id", transfer.id);
          await supabase.from("lenhub_flutter_payouts").update({
            status: "failed",
            provider_response: payload,
            updated_at: new Date().toISOString(),
          }).eq("transfer_id", transfer.id);
        }
      }
    }

    return json({ received: true, success, charge_id: chargeId, provider_ref: providerRef });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("lenhub-flutter-webhook", msg);
    return json({ error: msg }, 200);
  }
});
