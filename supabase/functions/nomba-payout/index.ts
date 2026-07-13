import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  isNombaNigeriaConfigured,
  nombaBankTransfer,
  nombaTransferConversion,
} from "../_shared/nomba-nigeria.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function reverseTransferLedger(supabase: ReturnType<typeof createClient>, transferId: string) {
  const { data: existing } = await supabase.from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (existing?.length) return { reversed: false, reason: "already_reversed" };

  const { data: originals, error } = await supabase.from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description, created_by")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (error || !originals?.length) return { reversed: false, reason: error?.message || "no_entries" };

  const journalId = crypto.randomUUID();
  const rows = originals.map((o) => ({
    journal_id: journalId,
    account_id: o.account_id,
    wallet_id: o.wallet_id,
    currency_code: o.currency_code,
    debit_amount: o.credit_amount,
    credit_amount: o.debit_amount,
    description: `REVERSAL: ${o.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal",
    reference_id: transferId,
    created_by: o.created_by,
  }));
  const { error: insErr } = await supabase.from("ledger_entries").insert(rows);
  if (insErr) return { reversed: false, reason: insErr.message };
  return { reversed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expectedSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
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

    const { data: transfer, error: tErr } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single();
    if (tErr || !transfer) {
      return new Response(JSON.stringify({ success: false, error: "Transfer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isNombaNigeriaConfigured()) {
      return new Response(JSON.stringify({ success: false, error: "Nomba Nigeria not configured", code: "not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetCurrency = String(transfer.target_currency || "NGN").toUpperCase();
    const sourceCurrency = String(transfer.source_currency || "NGN").toUpperCase();
    if (targetCurrency !== "NGN") {
      return new Response(JSON.stringify({ success: false, error: "Nomba payout only supports NGN bank transfers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountNumber = String(transfer.recipient_account || "").replace(/\D/g, "");
    const bankCode = String(transfer.recipient_bank_code || "").trim();
    const accountName = String(transfer.recipient_name || "Recipient").trim();
    if (!accountNumber || accountNumber.length !== 10 || !bankCode) {
      return new Response(JSON.stringify({
        success: false,
        error: "Nigerian bank payout requires bank_code and 10-digit account_number",
        code: "invalid_bank_details",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let payoutAmount = Number(transfer.target_amount ?? 0);
    if (sourceCurrency !== "NGN") {
      const sourceAmount = Number(transfer.source_amount ?? 0);
      const conv = await nombaTransferConversion(sourceAmount, sourceCurrency, "NGN");
      if (!conv.ok || !conv.convertedAmount) {
        return new Response(JSON.stringify({
          success: false,
          error: conv.message || "FX conversion failed",
          code: conv.code || "conversion_failed",
          rail: "nomba",
          provider_message: conv.message,
          nomba_raw: conv.json,
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      payoutAmount = conv.convertedAmount;
      await supabase.from("transfers").update({
        target_amount: payoutAmount,
        exchange_rate: payoutAmount / sourceAmount,
      }).eq("id", transfer_id);
    }

    if (!payoutAmount || payoutAmount <= 0) {
      return new Response(JSON.stringify({ success: false, error: "Invalid payout amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reference = `nomba-payout-${transfer_id}`;
    const senderId = transfer.sender_id as string;
    const narrative = String(transfer.description || `Transfer to ${accountName}`).slice(0, 120);

    const { error: insErr } = await supabase.from("nomba_payout_transactions").insert({
      user_id: senderId,
      transfer_id,
      reference,
      amount: payoutAmount,
      currency: "NGN",
      account_number: accountNumber,
      bank_code: bankCode,
      account_name: accountName,
      status: "pending",
      raw_request: {
        amount: payoutAmount,
        account_number: accountNumber,
        bankcode: bankCode,
        account_name: accountName,
        ref_text: transfer_id,
        narrative,
      },
    });
    if (insErr && !insErr.message.includes("duplicate")) {
      return new Response(JSON.stringify({ success: false, error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await nombaBankTransfer({
      amount: payoutAmount,
      account_number: accountNumber,
      bankcode: bankCode,
      account_name: accountName,
      ref_text: transfer_id,
      narrative,
    });

    if (!result.ok) {
      const reason = result.message || "Bank payout failed";
      await supabase.from("nomba_payout_transactions").update({
        status: "failed",
        failure_reason: reason.slice(0, 500),
        raw_response: result.json,
      }).eq("reference", reference);
      return new Response(JSON.stringify({
        success: false,
        error: reason,
        code: result.code || "nomba_payout_failed",
        rail: "nomba",
        provider_message: reason,
        nomba_raw: result.json,
        raw_response: result.json,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const providerRef = result.providerRef || reference;
    const completedAt = new Date().toISOString();
    await supabase.from("transfers").update({
      status: "completed",
      completed_at: completedAt,
      provider_reference: providerRef,
    }).eq("id", transfer_id);
    await supabase.from("nomba_payout_transactions").update({
      status: "completed",
      provider_reference: providerRef,
      raw_response: result.json,
    }).eq("reference", reference);

    await supabase.from("notifications").insert({
      user_id: senderId,
      title: "Transfer complete",
      message: `Your NGN ${payoutAmount} transfer to ${accountName} has been delivered.`,
      type: "info",
    });

    return new Response(JSON.stringify({
      success: true,
      reference: providerRef,
      amount: payoutAmount,
      currency: "NGN",
      source: "nomba",
      status: "completed",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("nomba-payout error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
