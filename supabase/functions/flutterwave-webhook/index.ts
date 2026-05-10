import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "verif-hash, content-type",
};

async function reverseTransferLedger(
  supabase: ReturnType<typeof createClient>,
  transferId: string,
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "transfer_reversal")
    .eq("reference_id", transferId)
    .limit(1);
  if (existing && existing.length > 0) return false;

  const { data: originals } = await supabase
    .from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description")
    .eq("reference_type", "transfer")
    .eq("reference_id", transferId);
  if (!originals || originals.length === 0) return false;

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
  }));
  const { error } = await supabase.from("ledger_entries").insert(rows);
  if (error) {
    console.error("webhook reverseTransferLedger insert failed", error);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Verify webhook secret hash header
    const expected = (Deno.env.get("FLW_WEBHOOK_HASH") || Deno.env.get("FLW_SECRET_KEY") || "").trim();
    const provided = req.headers.get("verif-hash") || "";
    if (!expected || provided !== expected) {
      console.warn("Flutterwave webhook hash mismatch");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = await req.json();
    console.log("Flutterwave webhook event:", JSON.stringify(event));

    // Transfer event payload
    const data = event?.data || event;
    const flwId = String(data?.id || "");
    const reference = data?.reference || "";
    const status = (data?.status || "").toLowerCase();
    const meta = Array.isArray(data?.meta) ? data.meta[0] : data?.meta;
    const transferId = meta?.transfer_id || (reference?.startsWith("EFM-") ? reference.split("-")[1] : null);

    if (!transferId && !flwId) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find transfer
    let query = supabase.from("transfers").select("*");
    if (transferId) {
      query = query.eq("id", transferId);
    } else {
      query = query.eq("provider_reference", flwId);
    }
    const { data: transfers } = await query.limit(1);
    const transfer = transfers?.[0];
    if (!transfer) {
      console.warn("Transfer not found for webhook", { transferId, flwId });
      return new Response(JSON.stringify({ ok: true, not_found: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let newStatus: string | null = null;
    let title = "";
    let message = "";

    if (status === "successful" || status === "success" || status === "completed") {
      newStatus = "completed";
      title = "Transfer completed";
      message = `Your transfer of ${transfer.target_currency} ${transfer.target_amount} to ${transfer.recipient_name} is complete.`;
    } else if (status === "failed" || status === "reversed") {
      newStatus = "failed";
      title = "Transfer failed";
      message = `Your transfer to ${transfer.recipient_name} has failed: ${data?.complete_message || data?.message || status}.`;
    }

    if (newStatus) {
      await supabase.from("transfers").update({
        status: newStatus,
        provider_reference: flwId || transfer.provider_reference,
        failure_reason: newStatus === "failed" ? (data?.complete_message || status) : transfer.failure_reason,
        completed_at: newStatus === "completed" ? new Date().toISOString() : transfer.completed_at,
      }).eq("id", transfer.id);

      await supabase.from("notifications").insert({
        user_id: transfer.sender_id,
        title,
        message,
        type: newStatus === "completed" ? "transfer" : "error",
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("flutterwave-webhook error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
