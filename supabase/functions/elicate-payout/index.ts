import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getElicateConfig } from "../_shared/elicate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Elicate routes by phone prefix, so a single bank code "MPS" (Mobile Payment Service)
// works across MTN / Airtel / Zamtel on Zambia.
const ELICATE_BANK_CODE = "MPS";

// Normalize to Elicate's required international format: 260XXXXXXXXX (NO leading zero).
// Accepts any of: +260971234567, 260971234567, 0971234567, 971234567, with spaces/dashes.
function normalizeZmPhoneIntl(raw?: string | null): string {
  let phone = String(raw || "").replace(/[^\d]/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);    // 00260... -> 260...
  if (phone.startsWith("0")) phone = phone.slice(1);     // 0971...  -> 971...
  if (!phone.startsWith("260")) phone = `260${phone}`;   // 971...   -> 260971...
  return phone;
}

function buildReference(transferId: string, existing?: string | null): string {
  const candidate = String(existing || "").trim();
  if (candidate) return candidate;
  return transferId;
}

async function reverseTransferLedger(supabase: ReturnType<typeof createClient>, transferId: string) {
  const { data: existing } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "transfer_reversal")
    .eq("reference_id", transferId)
    .limit(1);

  if (existing && existing.length > 0) return { reversed: false, reason: "already_reversed" };

  const { data: originals, error } = await supabase
    .from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description, created_by")
    .eq("reference_type", "transfer")
    .eq("reference_id", transferId);

  if (error || !originals?.length) return { reversed: false, reason: error?.message || "no_entries" };

  const journalId = crypto.randomUUID();
  const rows = originals.map((entry) => ({
    journal_id: journalId,
    account_id: entry.account_id,
    wallet_id: entry.wallet_id,
    currency_code: entry.currency_code,
    debit_amount: Number(entry.credit_amount) || 0,
    credit_amount: Number(entry.debit_amount) || 0,
    description: `REVERSAL: ${entry.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal",
    reference_id: transferId,
    created_by: entry.created_by,
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
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const elicate = getElicateConfig();
    const secret = elicate.secretKey;
    const PAYOUT_URL = elicate.payoutUrl;
    if (!secret) {
      return new Response(JSON.stringify({ success: false, error: `ELICATE_${elicate.mode === "live" ? "LIVE_" : ""}SECRET_KEY not configured` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!PAYOUT_URL) {
      return new Response(JSON.stringify({ success: false, error: "ELICATE_LIVE_BASE_URL not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: transfer, error: tErr } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single();

    if (tErr || !transfer) {
      return new Response(JSON.stringify({ success: false, error: "Transfer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: if this transfer was already dispatched, don't fire a second payout.
    // Webhook will (or already did) flip status to completed/failed.
    if (["processing", "completed", "refunded"].includes(transfer.status) && transfer.provider_reference) {
      return new Response(JSON.stringify({
        success: true,
        already_dispatched: true,
        status: transfer.status,
        provider_reference: transfer.provider_reference,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const phone = normalizeZmPhoneIntl(transfer.recipient_phone);
    const amount = Math.round(Number(transfer.target_amount ?? transfer.source_amount) * 100) / 100;
    const reference = buildReference(transfer_id, transfer.provider_reference);
    const beneficiaryName = String(transfer.recipient_name || "Customer").trim() || "Customer";
    const narration = String(transfer.purpose || transfer.notes || "eFinMoney payout").slice(0, 100);

    // Elicate payout (disbursement) — pushes funds to the beneficiary; no PIN prompt.
    const payload = {
      amount,
      currency: "ZMW",
      account_bank: ELICATE_BANK_CODE,
      account_number: phone,
      beneficiary_name: beneficiaryName,
      reference,
      narration,
    };

    console.log("Elicate PAYOUT request:", { mode: elicate.mode, url: PAYOUT_URL, payload });

    const res = await fetch(PAYOUT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const respText = await res.text();
    console.log("Elicate PAYOUT response:", res.status, respText);

    let respJson: any = {};
    try { respJson = JSON.parse(respText); } catch { respJson = { raw: respText }; }

    if (!res.ok) {
      const friendlyError = res.status >= 500
        ? "Elicate returned an internal server error. Please retry in a few moments."
        : respJson?.message || respJson?.error || "Elicate payout failed";

      const reversal = await reverseTransferLedger(supabase, transfer_id);

      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: friendlyError,
      }).eq("id", transfer_id);

      return new Response(JSON.stringify({
        success: false,
        error: friendlyError,
        code: res.status >= 500 ? "provider_internal_error" : "provider_error",
        refunded: reversal.reversed,
        provider_status: res.status,
        provider_response: respJson,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Extract documented fields: transaction_id / id from the payout response.
    const data = respJson?.data || respJson;
    const transactionId =
      data?.transaction_id || data?.transactionId || data?.id || null;
    const providerReference = transactionId || data?.reference || reference;

    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: providerReference,
    }).eq("id", transfer_id);

    return new Response(JSON.stringify({
      success: true,
      transaction_id: transactionId,
      provider_reference: providerReference,
      provider_response: respJson,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("elicate-payout error:", err);
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
