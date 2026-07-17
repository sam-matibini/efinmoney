import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isSwychrConfigured, isSwychrEnabled } from "../_shared/swychr-auth.ts";
import { createSwychrPayout, mapSwychrPayoutStatus } from "../_shared/swychr-payout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expectedSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!isSwychrEnabled() || !isSwychrConfigured("payout")) {
    return new Response(JSON.stringify({ success: false, error: "Swychr payout disabled", code: "swychr_disabled" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { transfer_id } = await req.json().catch(() => ({}));
    if (!transfer_id) {
      return new Response(JSON.stringify({ success: false, error: "transfer_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: transfer, error: tErr } = await supabase.from("transfers").select("*").eq("id", transfer_id).single();
    if (tErr || !transfer) {
      return new Response(JSON.stringify({ success: false, error: "Transfer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetCurrency = String(transfer.target_currency || "NGN").toUpperCase();
    const countryCode = targetCurrency === "NGN" ? "NG" : targetCurrency === "GHS" ? "GH" : "NG";
    const payoutAmount = Number(transfer.target_amount ?? transfer.source_amount ?? 0);
    const accountNumber = String(transfer.recipient_account || "").replace(/\D/g, "");
    const bankCode = String(transfer.recipient_bank_code || "").trim();
    const beneficiaryName = String(transfer.recipient_name || "Recipient").trim();
    const mobile = String(transfer.recipient_phone || "+2348000000000").trim();

    if (targetCurrency === "NGN" && (!accountNumber || accountNumber.length !== 10 || !bankCode)) {
      return new Response(JSON.stringify({
        success: false,
        error: "NGN bank payout requires bank_code and 10-digit account",
        code: "invalid_bank_details",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const transactionId = `efin-swychr-payout-${transfer_id}`;
    await supabase.from("swychr_payout_transactions").upsert({
      transfer_id,
      user_id: transfer.sender_id,
      transaction_id: transactionId,
      country_code: countryCode,
      amount: payoutAmount,
      currency: targetCurrency,
      payment_method: transfer.payout_method === "bank" ? "bank_transfer" : String(transfer.payout_method || "bank_transfer"),
      status: "pending",
      raw_request: { accountNumber, bankCode, beneficiaryName },
    }, { onConflict: "transaction_id" });

    const result = await createSwychrPayout({
      country_code: countryCode,
      beneficiary_name: beneficiaryName,
      mobile_no: mobile,
      amount: payoutAmount,
      transaction_id: transactionId,
      payment_method: "bank_transfer",
      bank_code: bankCode || undefined,
      account_number: accountNumber || undefined,
      remarks: String(transfer.description || "").slice(0, 120),
    });

    const mapped = mapSwychrPayoutStatus(
      result.raw?.data && typeof result.raw.data === "object"
        ? String((result.raw.data as Record<string, unknown>).status ?? "pending")
        : "pending",
    );

    if (!result.ok) {
      await supabase.from("swychr_payout_transactions").update({
        status: "failed",
        failure_reason: result.message.slice(0, 500),
        raw_response: result.raw,
      }).eq("transaction_id", transactionId);
      return new Response(JSON.stringify({
        success: false,
        error: result.message,
        rail: "swychr",
        raw_response: result.raw,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mapped === "completed") {
      await supabase.from("transfers").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        provider_reference: transactionId,
      }).eq("id", transfer_id);
    } else {
      await supabase.from("transfers").update({ status: "processing" }).eq("id", transfer_id);
    }

    await supabase.from("swychr_payout_transactions").update({
      status: mapped,
      provider_reference: transactionId,
      raw_response: result.raw,
    }).eq("transaction_id", transactionId);

    return new Response(JSON.stringify({
      success: true,
      reference: transactionId,
      amount: payoutAmount,
      currency: targetCurrency,
      source: "swychr",
      status: mapped,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
