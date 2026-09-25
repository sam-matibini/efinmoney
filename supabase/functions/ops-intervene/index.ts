/**
 * Operations interventions on a live transfer.
 * retry | cancel | switch_provider | manual_complete | reverse | escalate
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { payoutFnForRail, resolveCorridorRails } from "../_shared/corridor-rails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIONS = ["retry", "cancel", "switch_provider", "manual_complete", "reverse", "escalate"] as const;
type Action = (typeof ACTIONS)[number];

const OPEN_STATUSES = ["initiated", "funded", "processing", "pending_liquidity", "pending_ops", "failed"];
const STAFF = ["admin", "finance", "support", "compliance"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refundLedger(
  admin: ReturnType<typeof createClient>,
  transferId: string,
  note: string,
  referenceType: "transfer_cancellation" | "transfer_reversal",
) {
  const { data: existing } = await admin.from("ledger_entries").select("id")
    .in("reference_type", ["transfer_cancellation", "transfer_reversal"])
    .eq("reference_id", transferId)
    .limit(1);
  if (existing?.length) return { already: true };

  const { data: originals, error } = await admin.from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description")
    .eq("reference_type", "transfer")
    .eq("reference_id", transferId);
  if (error) throw new Error(error.message);

  if (originals?.length) {
    const journal = crypto.randomUUID();
    const { error: insErr } = await admin.from("ledger_entries").insert(originals.map((o) => ({
      journal_id: journal,
      account_id: o.account_id,
      wallet_id: o.wallet_id,
      currency_code: o.currency_code,
      debit_amount: Number(o.credit_amount) || 0,
      credit_amount: Number(o.debit_amount) || 0,
      description: `OPS ${referenceType === "transfer_cancellation" ? "CANCEL" : "REVERSE"}: ${o.description ?? note}`.slice(0, 500),
      reference_type: referenceType,
      reference_id: transferId,
    })));
    if (insErr) throw new Error(insErr.message);
  }
  return { already: false, refunded: (originals?.length ?? 0) > 0 };
}

function currentRail(transfer: Record<string, unknown>): string {
  const charge = String(transfer.provider_charge_id || "");
  if (charge.startsWith("rail:")) return charge.slice(5).toLowerCase();
  const attempted = Array.isArray(transfer.rails_attempted) ? transfer.rails_attempted : [];
  const last = attempted.length ? String(attempted[attempted.length - 1] || "") : "";
  return last.toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, service);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const staff = (roles || []).some((r: { role: string }) => STAFF.includes(String(r.role)));
    if (!staff) return json({ error: "Only operations staff can intervene" }, 403);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const transferId = String(body.transfer_id || "").trim();
    const action = String(body.action || "").trim().toLowerCase() as Action;
    const reason = String(body.reason || "").trim();
    const provider = String(body.provider || "").trim().toLowerCase();

    if (!transferId || !ACTIONS.includes(action)) {
      return json({ error: "transfer_id and action are required" }, 400);
    }
    if (reason.length < 3) return json({ error: "A reason is required" }, 400);
    if (action === "switch_provider" && !provider) {
      return json({ error: "Choose a provider to switch to" }, 400);
    }

    const { data: transfer, error: tErr } = await admin.from("transfers").select("*").eq("id", transferId).maybeSingle();
    if (tErr || !transfer) return json({ error: "Transfer not found" }, 404);

    const { data: intervention, error: iErr } = await admin.from("transaction_interventions").insert({
      transfer_id: transferId,
      intervention_type: action,
      status: "pending",
      reason,
      initiated_by: user.id,
      old_provider: currentRail(transfer) || null,
      new_provider: action === "switch_provider" ? provider : (action === "retry" ? (provider || currentRail(transfer) || null) : null),
    }).select("id").single();
    if (iErr) return json({ error: iErr.message }, 500);

    const finish = async (ok: boolean, result: string, extra: Record<string, unknown> = {}) => {
      await admin.from("transaction_interventions").update({
        status: ok ? "executed" : "failed",
        executed_at: new Date().toISOString(),
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        result: result.slice(0, 500),
      }).eq("id", intervention.id);
      return json({ success: ok, action, intervention_id: intervention.id, result, ...extra }, ok ? 200 : 409);
    };

    const status = String(transfer.status || "");

    if (action === "escalate") {
      await admin.from("transfers").update({
        ops_status: "escalated",
        ops_note: reason.slice(0, 500),
        ops_alerted_at: new Date().toISOString(),
      }).eq("id", transferId);
      const { error: disputeErr } = await admin.from("disputes").insert({
        transaction_id: transferId,
        user_id: transfer.sender_id,
        dispute_type: "service_issue",
        status: "escalated",
        priority: "high",
        amount: transfer.source_amount,
        currency_code: transfer.source_currency,
        reason,
        created_by: user.id,
        assigned_to: user.id,
      });
      if (disputeErr) console.warn("escalate dispute insert:", disputeErr.message);
      return await finish(true, disputeErr ? "Marked escalated" : "Escalated to disputes");
    }

    if (action === "manual_complete") {
      if (["reversed", "expired"].includes(status)) {
        return await finish(false, `Cannot complete a transfer that is ${status}`);
      }
      await admin.from("transfers").update({
        status: "completed",
        ops_status: "manual_completed",
        ops_note: reason.slice(0, 500),
        ops_resolved_by: user.id,
        ops_resolved_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        failure_reason: null,
      }).eq("id", transferId);
      return await finish(true, "Marked completed");
    }

    if (action === "cancel" || action === "reverse") {
      if (action === "cancel" && ["completed", "reversed"].includes(status)) {
        return await finish(false, `Cannot cancel a transfer that is ${status}. Use Reverse for a completed payout.`);
      }
      if (action === "reverse" && status === "reversed") {
        return await finish(true, "Already reversed");
      }
      if (action === "reverse" && !["completed", "failed", "pending_ops", "processing", "funded", "pending_liquidity"].includes(status)) {
        return await finish(false, `Cannot reverse a transfer that is ${status}`);
      }
      const note = reason || (action === "cancel" ? "Cancelled by operations" : "Reversed by operations");
      const refund = await refundLedger(
        admin,
        transferId,
        note,
        action === "cancel" ? "transfer_cancellation" : "transfer_reversal",
      );
      await admin.from("transfers").update({
        status: "reversed",
        ops_status: action === "cancel" ? "cancelled" : "refunded",
        ops_note: note.slice(0, 500),
        ops_resolved_by: user.id,
        ops_resolved_at: new Date().toISOString(),
        failure_reason: note.slice(0, 500),
        completed_at: new Date().toISOString(),
      }).eq("id", transferId);
      return await finish(true, refund.already ? "Already refunded" : "Wallet refunded and transfer reversed", refund);
    }

    // retry or switch_provider
    if (!OPEN_STATUSES.includes(status) && status !== "pending_ops") {
      return await finish(false, `Cannot ${action === "retry" ? "retry" : "switch"} a transfer that is ${status}`);
    }

    let rail = action === "switch_provider" ? provider : (provider || currentRail(transfer));
    if (!rail) {
      const resolved = await resolveCorridorRails(
        admin,
        "payout",
        String(transfer.target_currency || transfer.source_currency || ""),
        String(transfer.recipient_country || ""),
        String(transfer.payout_method || transfer.transfer_type || ""),
      );
      const tried = new Set((Array.isArray(transfer.rails_attempted) ? transfer.rails_attempted : []).map((r: string) => String(r).toLowerCase()));
      rail = resolved.rails.find((r) => !tried.has(r)) || resolved.rails[0] || "";
    }
    const fn = payoutFnForRail(rail);
    if (!fn) return await finish(false, `Unknown provider: ${rail || "(none)"}`);

    if (action === "switch_provider" && rail === currentRail(transfer) && currentRail(transfer)) {
      return await finish(false, `Already on ${rail}. Pick a different provider.`);
    }

    await admin.from("transfers").update({
      status: "processing",
      ops_status: action === "switch_provider" ? "switching_provider" : "retrying",
      provider_charge_id: `rail:${rail}`,
      ops_note: reason.slice(0, 500),
      failure_reason: null,
    }).eq("id", transferId);

    const payoutAmount = Number(transfer.target_amount ?? transfer.source_amount);
    const res = await fetch(`${url}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": service,
        Authorization: `Bearer ${service}`,
      },
      body: JSON.stringify({
        transfer_id: transferId,
        phone_number: transfer.recipient_phone,
        account_number: transfer.recipient_account,
        bank_code: transfer.recipient_bank_code,
        amount: payoutAmount,
        currency: transfer.target_currency ?? transfer.source_currency,
        network: transfer.payout_method,
        recipient_name: transfer.recipient_name,
        skip_reversal: true,
      }),
    });
    const payout = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
    const ok = payout && payout.success !== false && (payout.success === true || payout.queued || payout.pending_liquidity);
    const attempted = Array.isArray(transfer.rails_attempted) ? [...transfer.rails_attempted, rail] : [rail];

    if (ok) {
      await admin.from("transfers").update({
        status: payout.queued || payout.pending_liquidity ? "pending_liquidity" : "processing",
        ops_status: action === "switch_provider" ? "switched" : "retry_accepted",
        ops_resolved_by: user.id,
        rails_attempted: attempted,
        failure_reason: null,
        ops_note: reason.slice(0, 500),
      }).eq("id", transferId);
      await admin.from("transaction_interventions").update({ new_provider: rail }).eq("id", intervention.id);
      return await finish(true, `${action === "switch_provider" ? "Switched to" : "Retried via"} ${rail}`, { rail, payout });
    }

    const retryErr = String(payout?.error || "Payout was not accepted");
    await admin.from("transfers").update({
      status: "pending_ops",
      ops_status: "needs_manual_settlement",
      rails_attempted: attempted,
      failure_reason: retryErr.slice(0, 500),
      ops_note: reason.slice(0, 500),
    }).eq("id", transferId);
    return await finish(false, retryErr, { rail, payout });
  } catch (err) {
    console.error("ops-intervene error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
