// Active transfer status check. Queries Flutterwave directly for the latest
// status of a transfer and updates our DB — so the tracking page reflects
// reality even if the async webhook never arrives.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function reverseTransferLedger(supabase: ReturnType<typeof createClient>, transferId: string) {
  const { data: existing } = await supabase.from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (existing && existing.length > 0) return { reversed: false, reason: "already_reversed" };
  const { data: originals, error } = await supabase.from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (error || !originals?.length) return { reversed: false, reason: "no_entries" };
  const j = crypto.randomUUID();
  const rows = originals.map((o) => ({
    journal_id: j, account_id: o.account_id, wallet_id: o.wallet_id, currency_code: o.currency_code,
    debit_amount: o.credit_amount, credit_amount: o.debit_amount,
    description: `REVERSAL: ${o.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal", reference_id: transferId,
  }));
  const { error: insErr } = await supabase.from("ledger_entries").insert(rows);
  if (insErr) return { reversed: false, reason: insErr.message };
  return { reversed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { transfer_id } = await req.json().catch(() => ({}));
    if (!transfer_id) return json({ error: "transfer_id required" }, 400);

    const { data: transfer, error: tErr } = await supabase
      .from("transfers").select("*").eq("id", transfer_id).eq("sender_id", user.id).single();
    if (tErr || !transfer) return json({ error: "Transfer not found" }, 404);

    // Already terminal — nothing to do.
    if (["completed", "failed", "reversed", "expired", "cancelled"].includes(transfer.status)) {
      return json({ success: true, status: transfer.status, changed: false });
    }

    const providerRef = transfer.provider_reference;
    if (!providerRef) {
      return json({ success: true, status: transfer.status, changed: false, note: "no provider reference yet" });
    }

    // Flutterwave V3: GET /transfers/{id}
    const { ok, json: resp } = await flwV3Fetch(`/transfers/${encodeURIComponent(String(providerRef))}`, {
      method: "GET", timeoutMs: 20_000,
    });

    if (!ok) {
      return json({ success: true, status: transfer.status, changed: false, note: "provider lookup unavailable" });
    }

    const flwStatus = String(resp?.data?.status || "").toUpperCase();
    let newStatus: string | null = null;
    if (["SUCCESSFUL", "SUCCESS", "COMPLETED"].includes(flwStatus)) newStatus = "completed";
    else if (["FAILED", "ERROR", "REVERSED", "CANCELLED"].includes(flwStatus)) newStatus = "failed";

    if (!newStatus || newStatus === transfer.status) {
      return json({ success: true, status: transfer.status, changed: false, provider_status: flwStatus });
    }

    let refunded = false;
    let title = "", message = "";
    if (newStatus === "completed") {
      title = "Transfer completed";
      message = `Your transfer of ${transfer.target_currency} ${transfer.target_amount} to ${transfer.recipient_name} is complete.`;
      await supabase.from("transfers").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", transfer_id);
    } else {
      const rev = await reverseTransferLedger(supabase, transfer_id);
      refunded = rev.reversed;
      title = refunded ? "Transfer failed — refunded" : "Transfer failed";
      message = refunded
        ? `Your transfer to ${transfer.recipient_name} failed and has been refunded.`
        : `Your transfer to ${transfer.recipient_name} has failed.`;
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: (resp?.data?.complete_message || flwStatus || "Transfer failed").toString().slice(0, 500),
      }).eq("id", transfer_id);
    }

    await supabase.from("notifications").insert({
      user_id: transfer.sender_id, title, message,
      type: newStatus === "completed" ? "transfer" : "error",
    });

    return json({ success: true, status: newStatus, changed: true, refunded, provider_status: flwStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("flw-verify-transfer error", msg);
    return json({ error: msg }, 500);
  }
});
