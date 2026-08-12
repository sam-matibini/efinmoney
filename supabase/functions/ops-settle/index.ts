/**
 * Admin ops settle for pending_ops transfers: retry | complete | refund
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { explainPayoutError, notifyOpsBrief } from "../_shared/ops-alert.ts";
import { payoutFnForRail } from "../_shared/corridor-rails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function assertAdmin(authHeader: string) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 as const };
  const admin = createClient(url, service);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const ok = (roles || []).some((r: { role: string }) =>
    ["admin", "finance"].includes(String(r.role))
  );
  if (!ok) return { error: "Forbidden" as const, status: 403 as const };
  return { user, admin };
}

async function refundTransfer(
  admin: ReturnType<typeof createClient>,
  transferId: string,
  note: string,
) {
  const { data: existing } = await admin.from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (existing?.length) {
    await admin.from("transfers").update({
      status: "reversed",
      ops_status: "refunded",
      ops_note: note,
      ops_resolved_at: new Date().toISOString(),
      failure_reason: note.slice(0, 500),
    }).eq("id", transferId);
    return { already: true };
  }
  const { data: originals } = await admin.from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (originals?.length) {
    const j = crypto.randomUUID();
    await admin.from("ledger_entries").insert(originals.map((o) => ({
      journal_id: j,
      account_id: o.account_id,
      wallet_id: o.wallet_id,
      currency_code: o.currency_code,
      debit_amount: o.credit_amount,
      credit_amount: o.debit_amount,
      description: `OPS REFUND: ${o.description ?? ""}`.slice(0, 500),
      reference_type: "transfer_reversal",
      reference_id: transferId,
    })));
  }
  await admin.from("transfers").update({
    status: "reversed",
    ops_status: "refunded",
    ops_note: note,
    ops_resolved_at: new Date().toISOString(),
    failure_reason: note.slice(0, 500),
    completed_at: new Date().toISOString(),
  }).eq("id", transferId);
  return { already: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const auth = await assertAdmin(authHeader);
    if ("error" in auth) return json({ error: auth.error }, auth.status);
    const { user, admin } = auth;

    if (req.method === "GET") {
      const { data, error } = await admin.from("transfers").select(
        "id, sender_id, status, source_currency, target_currency, source_amount, target_amount, recipient_name, recipient_country, payout_method, failure_reason, ops_status, ops_note, rails_attempted, ops_alerted_at, created_at, provider_reference, provider_charge_id",
      )
        .eq("status", "pending_ops")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json({ error: error.message }, 500);
      return json({ transfers: data || [] });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const transferId = String(body.transfer_id || "").trim();
    const action = String(body.action || "").trim().toLowerCase();
    const note = String(body.note || "").trim();
    const rail = String(body.rail || "").trim().toLowerCase();

    if (!transferId || !["retry", "complete", "refund"].includes(action)) {
      return json({ error: "transfer_id and action (retry|complete|refund) required" }, 400);
    }

    const { data: transfer, error: tErr } = await admin.from("transfers").select("*")
      .eq("id", transferId).maybeSingle();
    if (tErr || !transfer) return json({ error: "Transfer not found" }, 404);
    if (transfer.status !== "pending_ops" && action !== "complete") {
      return json({ error: `Transfer is ${transfer.status}, expected pending_ops` }, 409);
    }

    if (action === "refund") {
      const r = await refundTransfer(admin, transferId, note || "Refunded by ops");
      await admin.from("transfers").update({ ops_resolved_by: user.id }).eq("id", transferId);
      return json({ success: true, action: "refund", ...r });
    }

    if (action === "complete") {
      await admin.from("transfers").update({
        status: "completed",
        ops_status: "manual_completed",
        ops_note: note || "Marked completed by ops",
        ops_resolved_by: user.id,
        ops_resolved_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        failure_reason: null,
      }).eq("id", transferId);
      return json({ success: true, action: "complete" });
    }

    // retry
    const fn = payoutFnForRail(rail);
    if (!fn) return json({ error: `Unknown rail: ${rail || "(empty)"}` }, 400);

    await admin.from("transfers").update({
      status: "processing",
      ops_status: "retrying",
      provider_charge_id: `rail:${rail}`,
      ops_note: note || `Retry via ${rail}`,
    }).eq("id", transferId);

    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const base = Deno.env.get("SUPABASE_URL")!;
    const flwBody = {
      transfer_id: transferId,
      phone_number: transfer.recipient_phone,
      account_number: transfer.recipient_account,
      bank_code: transfer.recipient_bank_code,
      amount: Number(transfer.target_amount ?? transfer.source_amount),
      currency: transfer.target_currency ?? transfer.source_currency,
      network: transfer.payout_method,
      recipient_name: transfer.recipient_name,
      skip_reversal: true,
    };

    const res = await fetch(`${base}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": service,
        Authorization: `Bearer ${service}`,
      },
      body: JSON.stringify(rail === "flovide" || rail === "nomba" || rail === "paytota" || rail === "swychr" || rail === "ghana" || rail === "ghana_pay" || rail === "elicate" || rail === "lenhub" || rail === "lenhub_flutter"
        ? { ...flwBody, transfer_id: transferId }
        : flwBody),
    });
    const payout = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
    const ok = payout && payout.success !== false && (payout.success === true || payout.queued || payout.pending_liquidity);

    const attempted = Array.isArray(transfer.rails_attempted)
      ? [...transfer.rails_attempted, rail]
      : [rail];

    if (ok) {
      await admin.from("transfers").update({
        status: payout.queued || payout.pending_liquidity ? "pending_liquidity" : "processing",
        ops_status: "retry_accepted",
        ops_resolved_by: user.id,
        rails_attempted: attempted,
        failure_reason: null,
      }).eq("id", transferId);
      return json({ success: true, action: "retry", rail, payout });
    }

    const retryErr = String(payout.error || "Retry failed");
    const explained = explainPayoutError(retryErr);
    await admin.from("transfers").update({
      status: "pending_ops",
      ops_status: "needs_manual_settlement",
      rails_attempted: attempted,
      failure_reason: retryErr.slice(0, 500),
      ops_note: `${explained.plain} — ${explained.tip}`.slice(0, 500),
    }).eq("id", transferId);

    await notifyOpsBrief({
      subject: `[Action needed] Retry failed — ${transfer.source_amount} ${transfer.source_currency} still on hold`,
      moneyStatus: "held",
      amount: `${transfer.source_amount} ${transfer.source_currency}`,
      recipient: String(transfer.recipient_name || ""),
      corridor: `${transfer.source_currency} → ${transfer.target_currency || transfer.source_currency}`,
      country: String(transfer.recipient_country || ""),
      transferId,
      providersTried: attempted,
      rawError: retryErr,
    });

    return json({ success: false, action: "retry", rail, payout });
  } catch (err) {
    console.error("ops-settle error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
