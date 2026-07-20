import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  createPaytotaPayout,
  executePaytotaMobilePayout,
  getPaytotaPayout,
  isPaytotaConfigured,
  mapPaytotaPayoutStatus,
  resolvePaytotaUgNetwork,
} from "../_shared/paytota.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expectedSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return json({ success: false, error: "Unauthorized", rail: "paytota" }, 401);
  }

  if (!isPaytotaConfigured()) {
    return json({ success: false, error: "Paytota is not configured", code: "paytota_not_configured", rail: "paytota" }, 503);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { transfer_id } = await req.json().catch(() => ({}));
    if (!transfer_id) return json({ success: false, error: "transfer_id required", rail: "paytota" }, 400);

    const { data: existing } = await supabase
      .from("paytota_payout_transactions")
      .select("*")
      .eq("transfer_id", transfer_id)
      .in("status", ["processing", "completed"])
      .maybeSingle();

    if (existing?.status === "completed") {
      return json({
        success: true,
        reference: existing.provider_payout_id || existing.reference,
        amount: existing.amount,
        currency: existing.currency,
        source: "paytota",
        status: "completed",
        duplicate: true,
      });
    }

    const { data: transfer, error: tErr } = await supabase.from("transfers").select("*").eq("id", transfer_id).single();
    if (tErr || !transfer) return json({ success: false, error: "Transfer not found", rail: "paytota" }, 404);

    const targetCurrency = String(transfer.target_currency || transfer.source_currency || "UGX").toUpperCase();
    if (targetCurrency !== "UGX") {
      return json({
        success: false,
        error: "Paytota payout currently supports UGX mobile money only",
        code: "unsupported_currency",
        rail: "paytota",
      }, 400);
    }

    const phone = String(transfer.recipient_phone || "").trim();
    if (!phone) {
      return json({ success: false, error: "Recipient phone required", code: "missing_phone", rail: "paytota" }, 400);
    }

    const payoutAmountRaw = Number(transfer.target_amount ?? transfer.source_amount ?? 0);
    // UGX has no minor units — round before sending to Paytota
    const payoutAmount = targetCurrency === "UGX"
      ? Math.max(1, Math.round(payoutAmountRaw))
      : payoutAmountRaw;
    if (!Number.isFinite(payoutAmount) || payoutAmount < 1) {
      return json({ success: false, error: "Invalid payout amount", rail: "paytota" }, 400);
    }

    const reference = `efin-paytota-payout-${transfer_id}`;
    const network = resolvePaytotaUgNetwork(phone, transfer.payout_method);

    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", transfer.sender_id)
      .maybeSingle();
    const email = String(profile?.email || "").trim() || "payouts@efin.money";

    await supabase.from("paytota_payout_transactions").upsert({
      transfer_id,
      user_id: transfer.sender_id,
      reference,
      amount: payoutAmount,
      currency: targetCurrency,
      phone,
      country_code: "UG",
      network,
      status: "pending",
      raw_request: {
        phone,
        network,
        amount: payoutAmount,
        payout_method: transfer.payout_method,
      },
    }, { onConflict: "reference" });

    const initiated = await createPaytotaPayout({
      email,
      phone,
      currency: targetCurrency,
      amountMajor: payoutAmount,
      reference,
      description: String(transfer.description || "eFinMoney UGX payout").slice(0, 120),
      country: "UG",
      fullName: String(transfer.recipient_name || "").trim() || undefined,
    });

    if (!initiated.ok || !initiated.payoutId) {
      await supabase.from("paytota_payout_transactions").update({
        status: "failed",
        failure_reason: initiated.message.slice(0, 500),
        raw_response: initiated.json,
      }).eq("reference", reference);

      return json({
        success: false,
        error: initiated.message,
        code: "paytota_initiate_failed",
        rail: "paytota",
        raw_response: initiated.json,
      }, 502);
    }

    await supabase.from("paytota_payout_transactions").update({
      provider_payout_id: initiated.payoutId,
      execution_url: initiated.executionUrl,
      status: "processing",
      raw_response: initiated.json,
    }).eq("reference", reference);

    const executed = await executePaytotaMobilePayout({
      payoutId: initiated.payoutId,
      executionUrl: initiated.executionUrl,
      phone,
      network,
      payoutMethod: transfer.payout_method,
    });

    if (!executed.ok) {
      const friendly = /terminal disabled/i.test(executed.message)
        ? "Paytota mobile payout is not enabled on this merchant yet (terminal disabled). Ask Paytota to enable MTN/Airtel payout terminals."
        : executed.message;

      await supabase.from("paytota_payout_transactions").update({
        status: "failed",
        failure_reason: friendly.slice(0, 500),
        network: executed.network,
        last_event: executed.json,
      }).eq("reference", reference);

      return json({
        success: false,
        error: friendly,
        code: "paytota_execute_failed",
        rail: "paytota",
        network: executed.network,
        raw_response: executed.json,
      }, 502);
    }

    // Confirm via GET when possible
    let mapped = mapPaytotaPayoutStatus(executed.status);
    const statusPoll = await getPaytotaPayout(initiated.payoutId);
    if (statusPoll.ok) {
      mapped = mapPaytotaPayoutStatus(statusPoll.json.status);
      await supabase.from("paytota_payout_transactions").update({
        last_event: statusPoll.json,
      }).eq("reference", reference);
    }

    if (mapped === "completed") {
      await supabase.from("transfers").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        provider_reference: initiated.payoutId,
      }).eq("id", transfer_id);
    } else {
      await supabase.from("transfers").update({
        status: "processing",
        provider_reference: initiated.payoutId,
      }).eq("id", transfer_id);
    }

    await supabase.from("paytota_payout_transactions").update({
      status: mapped === "failed" ? "failed" : mapped,
      network: executed.network,
      provider_reference: initiated.payoutId,
      last_event: executed.json,
    }).eq("reference", reference);

    return json({
      success: true,
      reference: initiated.payoutId,
      amount: payoutAmount,
      currency: targetCurrency,
      source: "paytota",
      status: mapped,
      network: executed.network,
      rail: "paytota",
    });
  } catch (e) {
    console.error("paytota-payout error:", e);
    return json({
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
      rail: "paytota",
    }, 500);
  }
});
