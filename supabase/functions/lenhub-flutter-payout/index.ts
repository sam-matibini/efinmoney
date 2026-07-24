/**
 * Lenhub Flutter payout — bank FX payout/exchange + Ghana MoMo.
 * Internal: x-internal-secret (from execute-transfer)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  isLenhubFlutterPayoutEnabled,
  getLenhubFlutterWebhookUrl,
  lenhubFlutterBankPayout,
  lenhubFlutterGhanaMomoPayout,
  resolveGhanaMomoNetwork,
  splitName,
  supportsLenhubFlutterBankPayout,
  supportsLenhubFlutterMomoPayout,
} from "../_shared/lenhub-flutter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

function isMobileMoney(method: string | null | undefined): boolean {
  const m = String(method || "").toLowerCase();
  return m.includes("mobile") || m.includes("momo") || m.includes("mpesa") || m.includes("mtn") || m.includes("airtel") || m.includes("vodafone");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expectedSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  if (!isLenhubFlutterPayoutEnabled()) {
    return json({ success: false, error: "Lenhub Flutter payout disabled" }, 503);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const transfer_id = String(body.transfer_id || "");
    if (!transfer_id) return json({ success: false, error: "transfer_id required" }, 400);

    const { data: transfer, error: tErr } = await supabase.from("transfers").select("*").eq("id", transfer_id).single();
    if (tErr || !transfer) return json({ success: false, error: "Transfer not found" }, 404);

    const sourceCurrency = String(transfer.source_currency || "").toUpperCase();
    const destCurrency = String(transfer.target_currency || transfer.source_currency || "").toUpperCase();
    const amount = Number(transfer.target_amount ?? transfer.source_amount);
    const senderId = transfer.sender_id as string;
    const recipientName = String(transfer.recipient_name || "Recipient");
    const { first, last } = splitName(recipientName);

    const callbackUrl = getLenhubFlutterWebhookUrl();
    const narration = `Transfer to ${recipientName}`.slice(0, 180);

    const hasBank = !!(transfer.recipient_account && transfer.recipient_bank_code);
    const momo = isMobileMoney(transfer.payout_method) || (!hasBank && !!transfer.recipient_phone);

    let result;
    let rail: string;

    if (hasBank && supportsLenhubFlutterBankPayout(destCurrency)) {
      rail = "bank_exchange";
      // amount for payout/exchange is typically destination amount
      result = await lenhubFlutterBankPayout({
        amount: Math.round(amount * 100) / 100,
        sourceCurrency,
        destinationCurrency: destCurrency,
        bankCode: String(transfer.recipient_bank_code),
        accountNumber: String(transfer.recipient_account).replace(/\D/g, ""),
        callbackUrl,
        narration,
      });
    } else if (momo && supportsLenhubFlutterMomoPayout(destCurrency)) {
      rail = "ghana_momo";
      if (!transfer.recipient_phone) {
        return json({ success: false, error: "recipient phone required for MoMo payout" }, 400);
      }
      result = await lenhubFlutterGhanaMomoPayout({
        amount: Math.round(amount * 100) / 100,
        msisdn: String(transfer.recipient_phone),
        firstName: first,
        lastName: last,
        network: resolveGhanaMomoNetwork(String(transfer.payout_method || "MTN")),
        sourceCurrency,
        narration,
      });
    } else {
      return json({
        success: false,
        error: `Lenhub Flutter does not support ${destCurrency} ${hasBank ? "bank" : "momo"} payout`,
        code: "unsupported_corridor",
      }, 400);
    }

    await supabase.from("lenhub_flutter_payouts").insert({
      transfer_id,
      user_id: senderId,
      source_currency: sourceCurrency,
      destination_currency: destCurrency,
      amount,
      rail,
      provider_reference: result.providerRef,
      status: result.ok ? "processing" : "failed",
      provider_response: result.json,
    });

    if (!result.ok) {
      const rev = await reverseTransferLedger(supabase, transfer_id);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: result.message.slice(0, 500),
      }).eq("id", transfer_id);
      await supabase.from("notifications").insert({
        user_id: senderId,
        title: "Transfer failed — refunded",
        message: rev.reversed
          ? `Could not send via Flutter rail — ${result.message}. Funds returned to your wallet.`
          : result.message,
        type: "error",
      });
      return json({
        success: false,
        error: result.message,
        refunded: rev.reversed,
        api: "lenhub_flutter",
        provider: result.json,
      }, 400);
    }

    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: result.providerRef || `lf-${transfer_id.slice(0, 8)}`,
    }).eq("id", transfer_id);

    await supabase.from("notifications").insert({
      user_id: senderId,
      title: "Transfer initiated",
      message: `Your ${destCurrency} ${amount} transfer to ${recipientName} is being processed.`,
      type: "info",
    });

    return json({
      success: true,
      api: "lenhub_flutter",
      rail,
      provider_reference: result.providerRef,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("lenhub-flutter-payout", msg);
    return json({ success: false, error: msg }, 500);
  }
});
