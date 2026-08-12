/**
 * VoPay webhooks — Interac Request Money fulfilled → credit CAD wallet,
 * Autodeposit sweep to Loop, release linked transfer.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getLoopCadConfig } from "../_shared/loopCad.ts";
import { creditWalletViaWise } from "../_shared/wise-credit.ts";
import { getVoPayConfig, voPayPost, voPayValidationKey } from "../_shared/vopay.ts";

const SUCCESS = new Set(["successful", "success", "completed", "fulfilled", "received"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  const cfg = getVoPayConfig();
  if (!cfg) return jsonResponse({ error: "VoPay not configured" }, 503);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const event = String(payload.Event || payload.event || "transaction").toLowerCase();
    const status = String(payload.Status || payload.TransactionStatus || "").toLowerCase();
    const transactionId = String(
      payload.TransactionID || payload.ID || payload.Id || payload.id || "",
    ).trim();
    const clientRef = String(payload.ClientReferenceNumber || payload.clientReferenceNumber || "").trim();
    const validationKey = String(payload.ValidationKey || payload.validationKey || "");

    if (transactionId && validationKey) {
      const expected = await voPayValidationKey(cfg.sharedSecret, transactionId);
      if (expected !== validationKey.toLowerCase() && expected !== validationKey) {
        // Some payloads use EventID as record id — try both
        const eventId = String(payload.EventID || "");
        const alt = eventId ? await voPayValidationKey(cfg.sharedSecret, eventId) : "";
        if (alt !== validationKey.toLowerCase() && alt !== validationKey) {
          console.warn("vopay-webhook: invalid ValidationKey", { transactionId, event });
          return jsonResponse({ error: "Invalid ValidationKey" }, 401);
        }
      }
    }

    console.log("vopay-webhook", { event, status, transactionId, clientRef });

    if (!SUCCESS.has(status) && status !== "pending" && status !== "requested") {
      // Still acknowledge non-success so VoPay doesn't retry forever for declines
      if (["failed", "cancelled", "canceled", "declined"].includes(status) && (transactionId || clientRef)) {
        let q = supabase.from("fincra_cad_interac_intents").update({
          status: "expired",
        }).in("status", ["pending", "awaiting_payment"]);
        if (transactionId) q = q.eq("provider_reference", transactionId);
        else q = q.eq("reference", clientRef);
        await q;
      }
      return jsonResponse({ ok: true, ignored: true, status });
    }

    if (!SUCCESS.has(status)) {
      return jsonResponse({ ok: true, pending: true });
    }

    let intentQuery = supabase
      .from("fincra_cad_interac_intents")
      .select("id, user_id, wallet_id, amount, currency_code, reference, transfer_id, status, provider_reference")
      .in("status", ["pending", "awaiting_payment"]);
    if (transactionId) {
      intentQuery = intentQuery.eq("provider_reference", transactionId);
    } else if (clientRef) {
      intentQuery = intentQuery.eq("reference", clientRef);
    } else {
      return jsonResponse({ ok: true, unmatched: true });
    }

    const { data: intent } = await intentQuery.maybeSingle();
    if (!intent) {
      await supabase.from("admin_notifications").insert({
        title: "VoPay Interac unmatched",
        message: `VoPay txn ${transactionId || clientRef} status=${status} — no open intent.`,
        type: "treasury",
      }).catch(() => {/* ignore */});
      return jsonResponse({ ok: true, unmatched: true });
    }

    const nowIso = new Date().toISOString();
    const amount = Number(intent.amount);
    const creditIdem = `vopay-rfm-${intent.id}-${transactionId || intent.reference}`;

    try {
      await creditWalletViaWise(
        supabase,
        intent.user_id,
        intent.currency_code || "CAD",
        amount,
        creditIdem,
        intent.wallet_id,
        `Interac Request Money (VoPay) → Loop Autodeposit (${intent.reference})`,
      );
    } catch (creditErr) {
      console.error("vopay-webhook: credit failed", creditErr);
      await supabase.from("admin_notifications").insert({
        title: "VoPay credit failed",
        message: `${intent.reference}: ${creditErr instanceof Error ? creditErr.message : String(creditErr)}`,
        type: "treasury",
      }).catch(() => {/* ignore */});
      return jsonResponse({ error: "credit_failed" }, 500);
    }

    await supabase.from("fincra_cad_interac_intents").update({
      status: "settled",
      provider_reference: transactionId || intent.provider_reference,
      credited_at: nowIso,
      received_at: nowIso,
      matched_at: nowIso,
      confirmed_at: nowIso,
      match_tier: "vopay_webhook",
    }).eq("id", intent.id).in("status", ["pending", "awaiting_payment"]);

    // Treasury sweep: Interac Autodeposit into Loop (etx@efin.money)
    const loop = getLoopCadConfig();
    try {
      const sweep = await voPayPost("/interac/bulk-payout", {
        Amount: amount,
        Currency: "CAD",
        EmailAddress: loop.alias,
        RecipientName: "eFinMoney Loop Bank",
        Memo: intent.reference,
        ClientReferenceNumber: `LOOP-${intent.reference}`,
        IdempotencyKey: `loop-ad-${intent.id}`,
        Notes: `Sweep VoPay RFM ${transactionId} to Loop Autodeposit`,
        SenderName: "eFinMoney",
      });
      console.log("vopay-webhook: Loop Autodeposit sweep", sweep);
    } catch (sweepErr) {
      console.error("vopay-webhook: Loop sweep failed (funds remain on VoPay)", sweepErr);
      await supabase.from("admin_notifications").insert({
        title: "Loop Autodeposit sweep failed",
        message:
          `${intent.reference}: VoPay collected CAD ${amount} but Interac to ${loop.alias} failed: ` +
          (sweepErr instanceof Error ? sweepErr.message : String(sweepErr)),
        type: "treasury",
      }).catch(() => {/* ignore */});
    }

    if (intent.transfer_id) {
      try {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/execute-transfer`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
              "x-internal-secret": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
              "x-idempotency-key": creditIdem,
            },
            body: JSON.stringify({ transfer_id: intent.transfer_id }),
          },
        );
        const body = await res.text();
        if (!res.ok) {
          console.error(`vopay-webhook: execute-transfer failed [${res.status}]: ${body}`);
          await supabase.from("transfers").update({
            status: "failed",
            failure_reason: body.slice(0, 500),
          }).eq("id", intent.transfer_id);
        }
      } catch (payoutErr) {
        console.error("vopay-webhook: execute-transfer threw", payoutErr);
      }
    }

    return jsonResponse({ ok: true, credited: true, reference: intent.reference });
  } catch (e) {
    console.error("vopay-webhook", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
