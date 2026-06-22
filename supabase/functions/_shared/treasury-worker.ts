// Treasury settlement worker — balance sync, liquidity checks, settlement jobs
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";
import { flwV3Fetch } from "./flw-v3.ts";
import { corsHeaders, json, requireUser, admin, isStaff } from "./treasury.ts";

export { corsHeaders, json, requireUser, admin, isStaff };

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

export function flwDebitCurrency(): string {
  return (Deno.env.get("FLW_MERCHANT_CURRENCY") || "NGN").toUpperCase();
}

export function treasuryBufferAmount(): number {
  const n = Number(Deno.env.get("TREASURY_FLW_BUFFER") || "5000");
  return Number.isFinite(n) && n >= 0 ? n : 5_000;
}

export function autoStripePayoutEnabled(): boolean {
  return (Deno.env.get("TREASURY_AUTO_STRIPE_PAYOUT") || "").toLowerCase() === "true";
}

export async function requireStaffOrCron(req: Request) {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (secret && req.headers.get("x-internal-secret") === secret) {
    return { user: null as { id: string } | null, internal: true };
  }
  const auth = await requireUser(req);
  if ("error" in auth) return { error: auth.error };
  const db = admin();
  const staff = await isStaff(db, auth.user.id);
  if (!staff) return { error: json({ error: "Forbidden" }, 403) };
  return { user: auth.user, internal: false };
}

export type ProviderBalance = {
  provider: string;
  currency: string;
  available: number;
  pending: number;
  raw?: unknown;
};

export async function fetchStripeBalances(): Promise<ProviderBalance[]> {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return [];
  try {
    const bal = await stripe.balance.retrieve();
    const rows: ProviderBalance[] = [];
    for (const b of bal.available ?? []) {
      rows.push({
        provider: "stripe",
        currency: String(b.currency).toUpperCase(),
        available: Number(b.amount) / 100,
        pending: 0,
        raw: b,
      });
    }
    for (const b of bal.pending ?? []) {
      const cur = String(b.currency).toUpperCase();
      const existing = rows.find((r) => r.provider === "stripe" && r.currency === cur);
      if (existing) existing.pending = Number(b.amount) / 100;
      else {
        rows.push({
          provider: "stripe",
          currency: cur,
          available: 0,
          pending: Number(b.amount) / 100,
          raw: b,
        });
      }
    }
    return rows;
  } catch (e) {
    console.error("fetchStripeBalances", e);
    return [];
  }
}

export async function fetchFlutterwaveBalances(): Promise<ProviderBalance[]> {
  const { ok, json: body } = await flwV3Fetch("/balances", { method: "GET", timeoutMs: 15_000 });
  if (!ok) {
    console.warn("fetchFlutterwaveBalances failed", body?.message);
    return [];
  }
  const list = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
  return list.map((row: Record<string, unknown>) => ({
    provider: "flutterwave",
    currency: String(row.currency ?? row.currency_code ?? "NGN").toUpperCase(),
    available: Number(row.available_balance ?? row.balance ?? row.ledger_balance ?? 0),
    pending: Number(row.pending_balance ?? 0),
    raw: row,
  }));
}

export async function upsertProviderBalances(db: SupabaseClient, rows: ProviderBalance[]) {
  const now = new Date().toISOString();
  for (const r of rows) {
    await db.from("treasury_provider_balances").upsert(
      {
        provider: r.provider,
        currency: r.currency,
        available_amount: r.available,
        pending_amount: r.pending,
        raw: r.raw ?? null,
        synced_at: now,
      },
      { onConflict: "provider,currency" },
    );
  }
}

export async function getCachedBalance(
  db: SupabaseClient,
  provider: string,
  currency: string,
): Promise<number> {
  const { data } = await db
    .from("treasury_provider_balances")
    .select("available_amount")
    .eq("provider", provider)
    .eq("currency", currency)
    .maybeSingle();
  return Number(data?.available_amount ?? 0);
}

export async function estimateUsdForDest(
  db: SupabaseClient,
  destCurrency: string,
  destAmount: number,
): Promise<number | null> {
  if (destCurrency === "USD") return destAmount;
  const { data: direct } = await db
    .from("fx_rates")
    .select("rate")
    .eq("from_currency", "USD")
    .eq("to_currency", destCurrency)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (direct?.rate && Number(direct.rate) > 0) {
    return destAmount / Number(direct.rate);
  }
  const { data: inverse } = await db
    .from("fx_rates")
    .select("rate")
    .eq("from_currency", destCurrency)
    .eq("to_currency", "USD")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inverse?.rate && Number(inverse.rate) > 0) {
    return destAmount * Number(inverse.rate);
  }
  // Fallback rough NGN rate if no FX row
  if (destCurrency === "NGN") return destAmount / 1550;
  return null;
}

export async function sumPendingLiquidityNeed(
  db: SupabaseClient,
  debitCurrency: string,
): Promise<{ count: number; total: number }> {
  const { data } = await db
    .from("transfers")
    .select("target_amount, target_currency")
    .eq("status", "pending_liquidity");
  let total = 0;
  let count = 0;
  for (const t of data ?? []) {
    const cur = String(t.target_currency ?? "").toUpperCase();
    if (debitCurrency === "NGN" && cur !== "NGN") continue;
    total += Number(t.target_amount ?? 0);
    count += 1;
  }
  return { count, total };
}

export async function hasActiveSettlementJob(db: SupabaseClient, corridor = "stripe_flw_ngn") {
  const { data } = await db
    .from("treasury_settlement_jobs")
    .select("id, status")
    .eq("corridor", corridor)
    .in("status", ["pending", "stripe_payout_initiated", "awaiting_flw_credit"])
    .limit(1);
  return (data ?? []).length > 0;
}

export async function createSettlementJob(
  db: SupabaseClient,
  destAmountNeeded: number,
  sourceCurrency = "USD",
  destCurrency = "NGN",
) {
  const estUsd = await estimateUsdForDest(db, destCurrency, destAmountNeeded);
  const { data, error } = await db
    .from("treasury_settlement_jobs")
    .insert({
      corridor: "stripe_flw_ngn",
      status: "pending",
      source_currency: sourceCurrency,
      dest_currency: destCurrency,
      dest_amount_needed: destAmountNeeded,
      source_amount: estUsd != null ? Math.ceil(estUsd * 100) / 100 : null,
      metadata: { estimated_usd: estUsd },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function maybeInitiateStripePayout(
  db: SupabaseClient,
  job: Record<string, unknown>,
): Promise<{ ok: boolean; payoutId?: string; error?: string }> {
  if (!autoStripePayoutEnabled()) {
    return { ok: false, error: "TREASURY_AUTO_STRIPE_PAYOUT not enabled" };
  }
  const neededUsd = Number(job.source_amount ?? 0);
  if (!Number.isFinite(neededUsd) || neededUsd < 1) {
    return { ok: false, error: "USD amount too small for Stripe payout" };
  }
  try {
    const bal = await stripe.balance.retrieve();
    const usd = (bal.available ?? []).find((b) => b.currency === "usd");
    const availableCents = Number(usd?.amount ?? 0);
    const payoutCents = Math.min(Math.round(neededUsd * 100), availableCents);
    if (payoutCents < 100) {
      return { ok: false, error: "Insufficient Stripe USD available for payout" };
    }
    const payout = await stripe.payouts.create({
      amount: payoutCents,
      currency: "usd",
      metadata: {
        treasury_job_id: String(job.id ?? ""),
        corridor: "stripe_flw_ngn",
      },
    });
    await db
      .from("treasury_settlement_jobs")
      .update({
        status: "stripe_payout_initiated",
        stripe_payout_id: payout.id,
        source_amount: payoutCents / 100,
        metadata: { ...(job.metadata as object ?? {}), stripe_payout: payout },
      })
      .eq("id", job.id);
    return { ok: true, payoutId: payout.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .from("treasury_settlement_jobs")
      .update({ status: "failed", failure_reason: msg.slice(0, 500) })
      .eq("id", job.id);
    return { ok: false, error: msg };
  }
}

export function isFlutterwaveCorridorTransfer(transfer: Record<string, unknown>): boolean {
  const country = String(transfer.recipient_country ?? "").toUpperCase();
  const type = String(transfer.transfer_type ?? "");
  if (type === "domestic_canada" || country === "CA") return false;
  if (transfer.use_pawapay === true) return false;
  if (transfer.use_mtn_momo === true) return false;
  if (transfer.use_stellar === true) return false;
  const cur = String(transfer.target_currency ?? "").toUpperCase();
  if (cur === "ZMW" || country === "ZM") return false;
  return true;
}

export async function checkFlutterwaveLiquidity(
  db: SupabaseClient,
  amount: number,
  payoutCurrency: string,
  options?: { requireBuffer?: boolean },
): Promise<{ sufficient: boolean; available: number; debitCurrency: string; needed: number }> {
  const debitCurrency = flwDebitCurrency();
  const targetCur = payoutCurrency.toUpperCase();
  const compareCur = debitCurrency === targetCur ? targetCur : debitCurrency;
  let available = await getCachedBalance(db, "flutterwave", compareCur);
  if (available <= 0) {
    const live = await fetchFlutterwaveBalances();
    await upsertProviderBalances(db, live);
    const row = live.find((b) => b.currency === compareCur);
    available = row?.available ?? 0;
  }
  const buffer = options?.requireBuffer && compareCur === "NGN" ? treasuryBufferAmount() : 0;
  const needed = amount + buffer;
  return {
    sufficient: available >= needed,
    available,
    debitCurrency,
    needed,
  };
}

/** Client-safe copy — never expose provider balances or settlement internals. */
export const PENDING_LIQUIDITY_USER_MESSAGE =
  "Your payment was received. We're completing delivery to your recipient — this usually takes a few minutes.";

export async function queuePendingLiquidity(
  db: SupabaseClient,
  transferId: string,
  userId: string,
  internalReason: string,
) {
  console.log(`[treasury] pending_liquidity ${transferId}: ${internalReason}`);
  await db.from("transfers").update({
    status: "pending_liquidity",
    failure_reason: null,
  }).eq("id", transferId);
  await db.from("notifications").insert({
    user_id: userId,
    title: "Transfer in progress",
    message: PENDING_LIQUIDITY_USER_MESSAGE,
    type: "info",
  });
}
