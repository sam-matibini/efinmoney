/**
 * Settle open Flovide Interac collections by polling GET /api/v1/transactions.
 * Used until Flovide registers merchant webhooks.
 *
 * Auth:
 *  - user JWT (reconcile own intent via POST { intent_id })
 *  - service role / x-internal-secret (batch cron)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditWalletViaFlovide } from "../_shared/flovide-credit.ts";
import {
  flovideConfigured,
  flovideGetTransaction,
  flovideListTransactions,
  flovideTxnStatus,
  isFlovideTxnFailure,
  isFlovideTxnSuccess,
} from "../_shared/flovide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const OPEN = ["pending", "awaiting_payment", "processing"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? v as Record<string, unknown> : {};
}

function extractList(payload: Record<string, unknown>): Record<string, unknown>[] {
  const data = payload.data;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const inner = data as Record<string, unknown>;
    if (Array.isArray(inner.data)) return inner.data as Record<string, unknown>[];
    if (Array.isArray(inner.transactions)) return inner.transactions as Record<string, unknown>[];
    if (Array.isArray(inner.items)) return inner.items as Record<string, unknown>[];
  }
  if (Array.isArray(payload.transactions)) return payload.transactions as Record<string, unknown>[];
  return [];
}

function blobText(remote: Record<string, unknown>): string {
  const nested = [
    asRecord(remote.meta),
    asRecord(remote.metadata),
    asRecord(remote.details),
    asRecord(remote.recipient),
    asRecord(remote.sender),
    asRecord(remote.payer),
    asRecord(remote.bank_account),
  ];
  const parts = [
    remote.reference,
    remote.payment_reference,
    remote.order_id,
    remote.description,
    remote.narration,
    remote.narrative,
    remote.message,
    remote.memo,
    remote.note,
    remote.remarks,
    remote.comment,
    ...nested.flatMap((o) => Object.values(o)),
  ];
  return parts.map((v) => String(v ?? "")).join(" ").toUpperCase();
}

function isInboundCadDeposit(remote: Record<string, unknown>): boolean {
  const type = String(
    remote.transaction_type ?? remote.type ?? remote.kind ?? "",
  ).toLowerCase();
  if (["payout", "withdrawal", "payment"].includes(type)) return false;
  const currency = String(remote.currency ?? remote.to_currency ?? "CAD").toUpperCase();
  if (currency && currency !== "CAD") return false;
  return true;
}

function matchTxn(
  remote: Record<string, unknown>,
  local: Record<string, unknown>,
): boolean {
  if (!isInboundCadDeposit(remote)) return false;

  const refs = [
    String(remote.reference || ""),
    String(remote.payment_reference || ""),
    String(remote.order_id || ""),
    String(remote.transaction_id || ""),
    String(remote.id || ""),
  ].map((s) => s.trim()).filter(Boolean);

  const localRefs = [
    String(local.provider_reference || ""),
    String(local.provider_order_id || ""),
    String(local.provider_txn_id || ""),
    String(local.reference || ""),
  ].map((s) => s.trim()).filter(Boolean);

  if (refs.some((r) => localRefs.includes(r))) return true;

  // Autodeposit: our EFN-FV-… reference in Interac message / Flovide narrative
  const localRef = String(local.reference || "").trim().toUpperCase();
  const amount = Number(remote.amount ?? remote.net_amount ?? remote.to_amount);
  const localAmount = Number(local.amount);
  if (localRef.length >= 8 && blobText(remote).includes(localRef)) {
    if (!Number.isFinite(amount) || !Number.isFinite(localAmount)) return true;
    const delta = Math.abs(amount - localAmount);
    if (delta < 0.05 || delta <= Math.max(2, localAmount * 0.2)) return true;
    return false;
  }

  // Fallback: same CAD amount + payer email (when message ref is missing)
  const email = String(
    remote.email
      ?? remote.payer_email
      ?? asRecord(remote.payer).email
      ?? asRecord(remote.sender).email
      ?? "",
  ).trim().toLowerCase();
  const localEmail = String(local.payer_email || "").trim().toLowerCase();
  if (
    Number.isFinite(amount)
    && Number.isFinite(localAmount)
    && Math.abs(amount - localAmount) < 0.05
    && email
    && localEmail
    && email === localEmail
  ) {
    const remoteCreated = String(remote.created_at ?? remote.created ?? remote.updated_at ?? "");
    const localCreated = String(local.created_at || "");
    if (remoteCreated && localCreated && remoteCreated < localCreated) return false;
    return true;
  }
  return false;
}

async function settleOne(
  admin: ReturnType<typeof createClient>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): Promise<{ outcome: string; wallet_id?: string; already?: boolean }> {
  const status = flovideTxnStatus(remote);
  const providerRef = String(
    remote.reference || remote.payment_reference || remote.id || local.provider_reference || "",
  ).trim();
  const remoteId = String(remote.id || remote.transaction_id || "").trim();

  // Don't attach a remote txn already credited to another intent
  if (remoteId) {
    const { data: taken } = await admin.from("flovide_transactions").select("id")
      .neq("id", local.id)
      .or(`provider_txn_id.eq.${remoteId},provider_order_id.eq.${remoteId},provider_reference.eq.${remoteId}`)
      .limit(1);
    if (taken?.length) {
      return { outcome: "remote_already_linked" };
    }
  }

  if (isFlovideTxnFailure(status)) {
    await admin.from("flovide_transactions").update({
      status: "failed",
      failure_reason: String(remote.failure_reason || remote.message || "Flovide collection failed").slice(0, 500),
      provider_reference: providerRef || local.provider_reference,
      provider_txn_id: remoteId || local.provider_txn_id,
      last_event: remote,
      updated_at: new Date().toISOString(),
    }).eq("id", local.id);
    return { outcome: "failed" };
  }

  if (!isFlovideTxnSuccess(status)) {
    await admin.from("flovide_transactions").update({
      status: local.status === "pending" ? "awaiting_payment" : local.status,
      provider_reference: providerRef || local.provider_reference,
      provider_order_id: remoteId || local.provider_order_id,
      last_event: remote,
      updated_at: new Date().toISOString(),
    }).eq("id", local.id);
    return { outcome: "pending" };
  }

  if (local.status === "completed") {
    return { outcome: "already_completed" };
  }

  const gross = Number(remote.amount ?? local.amount);
  const fees = Number(remote.fees ?? remote.fee);
  const netFromRemote = Number.isFinite(gross) && Number.isFinite(fees) && fees >= 0
    ? Math.round((gross - fees) * 100) / 100
    : Number(remote.net_amount);
  const creditAmount = Number(
    (Number.isFinite(Number(local.credit_amount)) && Number(local.credit_amount) > 0
      ? local.credit_amount
      : null)
      ?? (Number.isFinite(netFromRemote) && netFromRemote > 0 ? netFromRemote : null)
      ?? local.amount,
  );
  const creditCurrency = String(local.credit_currency || local.currency_code || "CAD").toUpperCase();
  const idem = String(local.reference || providerRef || local.id);

  const credit = await creditWalletViaFlovide(
    admin,
    String(local.user_id),
    creditCurrency,
    creditAmount,
    idem,
    local.target_wallet_id ? String(local.target_wallet_id) : undefined,
  );

  await admin.from("flovide_transactions").update({
    status: "completed",
    credited_at: new Date().toISOString(),
    credit_amount: creditAmount,
    provider_reference: providerRef || local.provider_reference,
    provider_order_id: remoteId || local.provider_order_id,
    provider_txn_id: remoteId || local.provider_txn_id,
    last_event: remote,
    updated_at: new Date().toISOString(),
  }).eq("id", local.id);

  if (local.purpose === "transfer" && local.transfer_id) {
    try {
      const base = Deno.env.get("SUPABASE_URL")!;
      const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      await fetch(`${base}/functions/v1/execute-transfer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${service}`,
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
        },
        body: JSON.stringify({
          transfer_id: local.transfer_id,
          internal_secret: Deno.env.get("INTERNAL_FUNCTION_SECRET") || service,
        }),
      });
    } catch (e) {
      console.warn("flovide-reconcile: transfer release failed", e);
    }
  }

  return { outcome: "credited", wallet_id: credit.wallet_id, already: credit.already };
}

async function reconcileIntent(
  admin: ReturnType<typeof createClient>,
  local: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Prefer direct fetch when we have a provider id
  const directId = String(local.provider_order_id || local.provider_txn_id || "").trim();
  if (directId) {
    const one = await flovideGetTransaction(directId);
    if (one.ok) {
      const remote = asRecord(one.json?.data ?? one.json);
      if (Object.keys(remote).length) {
        const result = await settleOne(admin, local, remote);
        return { intent_id: local.id, ...result, via: "get_by_id" };
      }
    }
  }

  // List recent CAD transactions and match
  const list = await flovideListTransactions({ currency: "CAD" });
  if (!list.ok) {
    // Fallback: unfiltered list
    const all = await flovideListTransactions();
    if (!all.ok) {
      return {
        intent_id: local.id,
        outcome: "provider_error",
        error: String(list.json?.message || all.json?.message || "Could not list Flovide transactions"),
      };
    }
    const rows = extractList(all.json || {});
    const hit = rows.find((r) => matchTxn(r, local));
    if (!hit) return { intent_id: local.id, outcome: "not_found_yet", scanned: rows.length };
    const result = await settleOne(admin, local, hit);
    return { intent_id: local.id, ...result, via: "list_all" };
  }

  const rows = extractList(list.json || {});
  const hit = rows.find((r) => matchTxn(r, local));
  if (!hit) {
    // Also try by provider_reference as path id
    const pref = String(local.provider_reference || "").trim();
    if (pref && pref !== directId) {
      const one = await flovideGetTransaction(pref);
      if (one.ok) {
        const remote = asRecord(one.json?.data ?? one.json);
        if (Object.keys(remote).length && (isFlovideTxnSuccess(flovideTxnStatus(remote)) || matchTxn(remote, local))) {
          const result = await settleOne(admin, local, remote);
          return { intent_id: local.id, ...result, via: "get_by_reference" };
        }
      }
    }
    return { intent_id: local.id, outcome: "not_found_yet", scanned: rows.length };
  }

  const result = await settleOne(admin, local, hit);
  return { intent_id: local.id, ...result, via: "list_cad" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!flovideConfigured()) {
      return json({ error: "Flovide is not configured" }, 503);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, service);

    const authHeader = req.headers.get("Authorization") || "";
    const internal = req.headers.get("x-internal-secret") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const isService = !!(service && (bearer === service || internal === service));

    let userId: string | null = null;
    if (!isService) {
      const userClient = createClient(supabaseUrl, anon, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await userClient.auth.getUser();
      if (error || !user) return json({ error: "Unauthorized" }, 401);
      userId = user.id;
    }

    const body = req.method === "POST"
      ? await req.json().catch(() => ({})) as Record<string, unknown>
      : {};
    const url = new URL(req.url);
    const intentId = String(body.intent_id || url.searchParams.get("intent_id") || "").trim();
    const limit = Math.min(50, Math.max(1, Number(body.limit || url.searchParams.get("limit") || 20)));

    if (intentId) {
      let q = admin.from("flovide_transactions").select("*").eq("id", intentId).eq("kind", "interac_collection");
      if (userId) q = q.eq("user_id", userId);
      const { data: local, error } = await q.maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!local) return json({ error: "Intent not found" }, 404);
      if (local.status === "completed" || local.status === "failed") {
        return json({ success: true, results: [{ intent_id: local.id, outcome: local.status }] });
      }
      const result = await reconcileIntent(admin, local as Record<string, unknown>);
      const { data: fresh } = await admin.from("flovide_transactions").select("*").eq("id", intentId).maybeSingle();
      return json({ success: true, results: [result], intent: fresh });
    }

    // Batch: open collections (service = all users; user = own)
    let q = admin.from("flovide_transactions").select("*")
      .eq("kind", "interac_collection")
      .in("status", OPEN)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (userId) q = q.eq("user_id", userId);
    const { data: openRows, error: listErr } = await q;
    if (listErr) return json({ error: listErr.message }, 500);

    const results = [];
    for (const row of openRows || []) {
      results.push(await reconcileIntent(admin, row as Record<string, unknown>));
    }

    return json({
      success: true,
      scanned: openRows?.length || 0,
      results,
      mode: isService ? "batch_service" : "batch_user",
    });
  } catch (err) {
    console.error("flovide-reconcile error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
