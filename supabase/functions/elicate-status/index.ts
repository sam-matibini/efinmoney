import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  elicateCheckoutStatus,
  elicatePaymentDetails,
  isElicateFailureStatus,
  isElicateSuccessStatus,
} from "../_shared/elicate.ts";
import { settleElicateChargeCredit } from "../_shared/elicate-settle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const chargeId = typeof body.charge_id === "string" ? body.charge_id : null;
    const transactionId = typeof body.transaction_id === "string" ? body.transaction_id : null;
    if (!chargeId && !transactionId) {
      return json({ error: "charge_id or transaction_id required" }, 400);
    }

    let query = admin.from("elicate_charges").select("*").eq("user_id", user.id);
    if (chargeId) query = query.eq("id", chargeId);
    else query = query.eq("psp_reference", transactionId!);

    const { data: charge, error } = await query.maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!charge) return json({ error: "Charge not found" }, 404);

    if (charge.status === "completed" || charge.status === "failed") {
      return json({
        success: true,
        charge_id: charge.id,
        status: charge.status,
        amount_minor: charge.amount_minor,
        currency: charge.currency,
        failure_reason: charge.failure_reason,
        provider_reference: charge.psp_reference,
        settled: charge.status === "completed",
      });
    }

    const providerId = String(charge.psp_reference || transactionId || "");
    if (!providerId) {
      return json({
        success: true,
        charge_id: charge.id,
        status: charge.status,
        amount_minor: charge.amount_minor,
        currency: charge.currency,
        provider_reference: null,
      });
    }

    let details = await elicatePaymentDetails(providerId);
    if (!details.ok) {
      details = await elicateCheckoutStatus(providerId);
    }

    const providerStatus = details.data.status ?? (details.data as Record<string, unknown>).data;
    const statusStr = typeof providerStatus === "object" && providerStatus
      ? String((providerStatus as Record<string, unknown>).status ?? "")
      : String(providerStatus ?? "");

    if (details.ok && isElicateSuccessStatus(statusStr)) {
      const settled = await settleElicateChargeCredit(admin, charge, providerId, details.data);
      if (!settled.ok) return json({ error: settled.reason || "Settlement failed" }, 500);
      return json({
        success: true,
        charge_id: charge.id,
        status: "completed",
        amount_minor: charge.amount_minor,
        currency: charge.currency,
        provider_reference: providerId,
        settled: true,
        provider_status: statusStr,
      });
    }

    if (details.ok && isElicateFailureStatus(statusStr)) {
      await admin.from("elicate_charges").update({
        status: "failed",
        failure_reason: String(details.data.message ?? details.error ?? "Top-up failed"),
        last_event: details.data,
      }).eq("id", charge.id);
      return json({
        success: true,
        charge_id: charge.id,
        status: "failed",
        amount_minor: charge.amount_minor,
        currency: charge.currency,
        failure_reason: String(details.data.message ?? "Top-up failed"),
        provider_reference: providerId,
        provider_status: statusStr,
      });
    }

    return json({
      success: true,
      charge_id: charge.id,
      status: charge.status,
      amount_minor: charge.amount_minor,
      currency: charge.currency,
      provider_reference: providerId,
      provider_status: statusStr || "pending",
      provider_ok: details.ok,
    });
  } catch (e) {
    console.error("elicate-status error", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
