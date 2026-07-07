import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildCallbackUrl,
  formatGhanaPhoneIntl,
  getGhanaPayConfig,
  ghanaPayFetch,
  isGhanaPayConfigured,
  newGhanaReference,
  newGhanaTransactionId,
  resolveGhanaNetwork,
} from "../_shared/ghana-pay.ts";

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

    if (!isGhanaPayConfigured()) {
      return new Response(JSON.stringify({ success: false, error: "Ghana Pay not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cfg = getGhanaPayConfig();

    const amount = Number(transfer.target_amount ?? transfer.source_amount);
    const currency = String(transfer.target_currency || "GHS").toUpperCase();
    if (currency !== "GHS") {
      return new Response(JSON.stringify({ success: false, error: "Ghana Pay payout only supports GHS" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasBankRail = !!(transfer.recipient_account && transfer.recipient_bank_code);
    if (hasBankRail) {
      return new Response(JSON.stringify({
        success: false,
        error: "Ghana Pay is mobile-money only. Use Flutterwave/Fincra for bank payouts.",
        code: "bank_not_supported",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const phone = transfer.recipient_phone;
    if (!phone) {
      return new Response(JSON.stringify({ success: false, error: "Missing recipient phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const network = resolveGhanaNetwork(transfer.payout_method);
    const customerNumber = formatGhanaPhoneIntl(phone);
    const nickname = String(transfer.recipient_name || "Recipient").trim();
    const providerTxnId = newGhanaTransactionId("efin-payout");
    const reference = newGhanaReference("payout", transfer_id);
    const senderId = transfer.sender_id as string;

    const { error: insErr } = await supabase.from("ghana_pay_transactions").insert({
      user_id: senderId,
      direction: "payout",
      reference,
      transaction_id: providerTxnId,
      amount,
      currency: "GHS",
      network,
      customer_number: customerNumber,
      nickname,
      transfer_id,
      status: "pending",
      raw_request: { reference, transaction_id: providerTxnId, amount, network, customer_number: customerNumber },
    });
    if (insErr) {
      return new Response(JSON.stringify({ success: false, error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      user: cfg.merchantUser,
      call_back_url: buildCallbackUrl(),
      customer_number: customerNumber,
      nickname,
      transaction_id: providerTxnId,
      amount: Math.round(amount * 100) / 100,
      reference,
      network,
    };

    console.log("Ghana Pay PAYOUT:", { url: cfg.payoutUrl, payload });

    const result = await ghanaPayFetch(cfg.payoutUrl, payload);

    if (result.duplicate || !result.ok) {
      const reason = result.response_message
        || (result.duplicate ? "Duplicate payout transaction" : "Payout failed");
      const rev = await reverseTransferLedger(supabase, transfer_id);
      await supabase.from("transfers").update({ status: "failed", failure_reason: reason.slice(0, 500) }).eq("id", transfer_id);
      await supabase.from("ghana_pay_transactions").update({
        status: "failed",
        failure_reason: reason,
        raw_response: result.json,
      }).eq("reference", reference);
      await supabase.from("notifications").insert({
        user_id: senderId,
        title: "Transfer failed — refunded",
        message: rev.reversed ? `${reason}. Funds returned to your wallet.` : reason,
        type: "error",
      });
      return new Response(JSON.stringify({
        success: false,
        error: reason,
        response_code: result.response_code,
        refunded: rev.reversed,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: providerTxnId,
    }).eq("id", transfer_id);
    await supabase.from("ghana_pay_transactions").update({
      status: "processing",
      provider_reference: providerTxnId,
      raw_response: result.json,
    }).eq("reference", reference);

    await supabase.from("notifications").insert({
      user_id: senderId,
      title: "Transfer initiated",
      message: `Your GHS ${amount} transfer to ${nickname} is being processed.`,
      type: "info",
    });

    return new Response(JSON.stringify({
      success: true,
      reference: providerTxnId,
      response_code: result.response_code,
      message: result.response_message,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("ghana-payout error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
