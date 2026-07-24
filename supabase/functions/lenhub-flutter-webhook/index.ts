/**
 * Lenhub Flutter webhook / payment callback.
 * Settles card top-ups and bank/MoMo payouts.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditLenhubFlutterTopup } from "../_shared/lenhub-flutter-credit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickStatus(payload: Record<string, unknown>): string {
  const data = (payload.data || payload) as Record<string, unknown>;
  const msg = payload.message;
  const msgObj = msg && typeof msg === "object" && !Array.isArray(msg)
    ? (msg as Record<string, unknown>)
    : null;
  const nestedStatus = msgObj?.status;
  const nested =
    nestedStatus && typeof nestedStatus === "object" && !Array.isArray(nestedStatus)
      ? (nestedStatus as Record<string, unknown>).status
      : nestedStatus;
  const raw = data.status ?? payload.status ?? nested ?? msgObj?.event ?? payload.event ?? "";
  return String(raw).toLowerCase();
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
    const eventName = String(payload.event || payload.type || "").toLowerCase();
    const success =
      ["successful", "success", "succeeded", "completed", "paid"].includes(status) ||
      eventName.includes("charge.completed") ||
      eventName.includes("transfer.completed") ||
      eventName.includes("payment.completed");
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
    // VA webhooks often key off account_number when reference isn't repeated
    if (!charge) {
      const data = (payload.data || payload) as Record<string, unknown>;
      const acct = String(
        data.account_number || data.accountNumber || payload.account_number || "",
      ).trim();
      if (acct) {
        const { data: byAcct } = await supabase
          .from("lenhub_flutter_charges")
          .select("*")
          .is("credited_at", null)
          .filter("provider_response", "cs", JSON.stringify({ account_number: acct }))
          .order("created_at", { ascending: false })
          .limit(5);
        charge = (byAcct || []).find((row) => {
          const pr = JSON.stringify(row.provider_response || {});
          return pr.includes(acct);
        }) ?? null;
        if (!charge) {
          const { data: recent } = await supabase
            .from("lenhub_flutter_charges")
            .select("*")
            .eq("status", "awaiting_transfer")
            .is("credited_at", null)
            .order("created_at", { ascending: false })
            .limit(20);
          charge = (recent || []).find((row) =>
            JSON.stringify(row.provider_response || {}).includes(acct),
          ) ?? null;
        }
      }
    }
    if (charge && success && !charge.credited_at) {
      const settleId = String(charge.charge_id || chargeId || charge.id);
      const credit = await creditLenhubFlutterTopup(supabase, {
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
