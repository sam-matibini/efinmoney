// Treasury worker: sync balances, process pending_liquidity transfers, manage settlement jobs.
import {
  corsHeaders,
  json,
  admin,
  requireStaffOrCron,
  fetchStripeBalances,
  fetchFlutterwaveBalances,
  upsertProviderBalances,
  flwDebitCurrency,
  sumPendingLiquidityNeed,
  hasActiveSettlementJob,
  createSettlementJob,
  maybeInitiateStripePayout,
  checkFlutterwaveLiquidity,
  treasuryBufferAmount,
  autoStripePayoutEnabled,
} from "../_shared/treasury-worker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function resolveNetwork(payoutMethod: string | null | undefined, currency: string): string {
  const map: Record<string, string> = {
    mtn_mobile: "mtn", airtel_money: "airtel", mpesa: "mpesa", bank: "bank",
  };
  if (payoutMethod && map[payoutMethod]) return map[payoutMethod];
  const defaults: Record<string, string> = {
    KES: "mpesa", GHS: "mtn", UGX: "mtn", TZS: "airtel", ZMW: "mtn", NGN: "bank",
  };
  return defaults[currency] || "mpesa";
}

async function invokeNombaPayout(transferId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/nomba-payout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "x-internal-secret": SERVICE_KEY,
    },
    body: JSON.stringify({ transfer_id: transferId }),
  });
  return res.json();
}

async function invokeFlutterwavePayout(transfer: Record<string, unknown>) {
  const body = {
    transfer_id: transfer.id,
    phone_number: transfer.recipient_phone,
    account_number: transfer.recipient_account,
    bank_code: transfer.recipient_bank_code,
    amount: Number(transfer.target_amount ?? transfer.source_amount),
    currency: transfer.target_currency ?? transfer.source_currency,
    network: resolveNetwork(
      transfer.payout_method as string,
      String(transfer.target_currency ?? transfer.source_currency),
    ),
    recipient_name: transfer.recipient_name,
  };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/flutterwave-payout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "x-internal-secret": SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireStaffOrCron(req);
    if ("error" in gate) return gate.error;

    const db = admin();
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const skipPayouts = body?.sync_only === true;

    // 1. Sync balances
    const [stripeRows, flwRows] = await Promise.all([
      fetchStripeBalances(),
      fetchFlutterwaveBalances(),
    ]);
    await upsertProviderBalances(db, [...stripeRows, ...flwRows]);

    const debitCur = flwDebitCurrency();
    const { count: pendingCount, total: pendingTotal } = await sumPendingLiquidityNeed(db, debitCur);
    const liquidity = await checkFlutterwaveLiquidity(db, pendingTotal || 0, debitCur, { requireBuffer: true });

    const results: Record<string, unknown> = {
      synced: stripeRows.length + flwRows.length,
      pending_liquidity: { count: pendingCount, total: pendingTotal },
      flutterwave: liquidity,
      buffer: treasuryBufferAmount(),
      auto_stripe_payout: autoStripePayoutEnabled(),
      processed: [] as unknown[],
      settlement: null as unknown,
    };

    if (skipPayouts) {
      return json({ ok: true, ...results });
    }

    // 2. Process pending_liquidity transfers (FIFO)
    const { data: queued } = await db
      .from("transfers")
      .select("*")
      .eq("status", "pending_liquidity")
      .order("created_at", { ascending: true })
      .limit(25);

    for (const t of queued ?? []) {
      const amt = Number(t.target_amount ?? 0);
      const cur = String(t.target_currency ?? "NGN").toUpperCase();
      const check = await checkFlutterwaveLiquidity(db, amt, cur, { requireBuffer: false });
      if (!check.sufficient) {
        (results.processed as unknown[]).push({
          transfer_id: t.id,
          action: "skipped",
          reason: "insufficient_balance",
          available: check.available,
          needed: check.needed,
        });
        continue; // skip this one — try smaller/newer queued transfers
      }
      const payout = await invokeFlutterwavePayout(t);
      let action: string;
      if (payout?.pending_liquidity || payout?.queued) {
        action = "still_queued";
      } else if (payout?.success) {
        action = "payout_sent";
      } else {
        action = "payout_failed";
      }
      (results.processed as unknown[]).push({
        transfer_id: t.id,
        action,
        error: payout?.error ?? payout?.provider_message ?? null,
        payout,
      });
    }

    // 3. Settlement job if still short after processing
    const { total: stillNeed } = await sumPendingLiquidityNeed(db, debitCur);
    if (stillNeed > 0 && !liquidity.sufficient) {
      let job = null;
      const active = await hasActiveSettlementJob(db);
      if (!active) {
        job = await createSettlementJob(db, stillNeed + treasuryBufferAmount(), "USD", debitCur);
        const payoutResult = await maybeInitiateStripePayout(db, job);
        results.settlement = { job, stripe_payout: payoutResult };
      } else {
        const { data: existing } = await db
          .from("treasury_settlement_jobs")
          .select("*")
          .in("status", ["pending", "stripe_payout_initiated", "awaiting_flw_credit"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing?.status === "stripe_payout_initiated") {
          // Move to awaiting bank→FLW leg once Stripe payout exists
          await db
            .from("treasury_settlement_jobs")
            .update({ status: "awaiting_flw_credit" })
            .eq("id", existing.id)
            .eq("status", "stripe_payout_initiated");
        }
        // Auto-complete job when FLW balance covers need
        if (existing && liquidity.sufficient) {
          await db
            .from("treasury_settlement_jobs")
            .update({
              status: "completed",
              dest_amount_filled: stillNeed,
              completed_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        }
        results.settlement = { existing, active: true };
      }
    }

    // 4. Retry failed Nomba NGN bank payouts (primary rail)
    const { data: failedNomba } = await db
      .from("nomba_payout_transactions")
      .select("transfer_id, reference, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: true })
      .limit(10);

    const nombaRetries: unknown[] = [];
    for (const row of failedNomba ?? []) {
      const { data: t } = await db
        .from("transfers")
        .select("id, status, target_currency, payout_method, recipient_account, recipient_bank_code")
        .eq("id", row.transfer_id)
        .maybeSingle();
      if (!t || t.status !== "funded") continue;
      if (String(t.target_currency).toUpperCase() !== "NGN") continue;
      if (t.payout_method !== "bank" || !t.recipient_account || !t.recipient_bank_code) continue;
      const payout = await invokeNombaPayout(t.id);
      nombaRetries.push({
        transfer_id: t.id,
        reference: row.reference,
        action: payout?.success ? "nomba_retry_sent" : "nomba_retry_failed",
        error: payout?.error ?? null,
        payout,
      });
    }
    results.nomba_retries = nombaRetries;

    return json({ ok: true, ...results });
  } catch (e) {
    console.error("treasury-worker", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
