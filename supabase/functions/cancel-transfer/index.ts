import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { transfer_id } = await req.json().catch(() => ({}));
    if (!transfer_id || typeof transfer_id !== "string") {
      return json({ error: "transfer_id required" }, 400);
    }

    const { data: transfer, error: tErr } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .eq("sender_id", user.id)
      .maybeSingle();

    if (tErr || !transfer) return json({ error: "Transfer not found" }, 404);

    const cancellable = ["initiated", "funded", "processing", "pending_liquidity"];
    if (!cancellable.includes(transfer.status)) {
      return json({ error: `Cannot cancel a transfer that is ${transfer.status}` }, 400);
    }

    // Idempotency: if a cancellation journal already exists, just ensure status is reversed
    const { data: existingCancel } = await supabase
      .from("ledger_entries")
      .select("id")
      .eq("reference_type", "transfer_cancellation")
      .eq("reference_id", transfer_id)
      .limit(1);

    if (existingCancel && existingCancel.length > 0) {
      await supabase.from("transfers").update({
        status: "reversed",
        failure_reason: transfer.failure_reason || "Cancelled by user",
        completed_at: transfer.completed_at || new Date().toISOString(),
      }).eq("id", transfer_id);
      return json({ success: true, already_cancelled: true });
    }

    // Best-effort: cancel upstream Flutterwave transfer if we have a reference
    if (transfer.provider_reference) {
      try {
        const flwKey = Deno.env.get("FLW_SECRET_KEY") || Deno.env.get("FLUTTERWAVE_SECRET_KEY");
        if (flwKey) {
          const r = await fetch(
            `https://api.flutterwave.com/v3/transfers/${transfer.provider_reference}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${flwKey}` } },
          );
          const body = await r.json().catch(() => ({}));
          const msg = String(body?.message || "").toLowerCase();
          if (!r.ok && (msg.includes("paid") || msg.includes("success") || msg.includes("completed"))) {
            return json({ error: "Transfer has already been paid out and cannot be cancelled." }, 409);
          }
        }
      } catch (e) {
        console.warn("FLW cancel best-effort failed:", e);
      }
    }

    // Reverse the original journal lines (debit <-> credit swap)
    const { data: originalEntries, error: leErr } = await supabase
      .from("ledger_entries")
      .select("*")
      .eq("reference_type", "transfer")
      .eq("reference_id", transfer_id);

    if (leErr) {
      console.error("Lookup ledger_entries error:", leErr);
      return json({ error: "Failed to read ledger" }, 500);
    }

    if (originalEntries && originalEntries.length > 0) {
      const reversalJournalId = crypto.randomUUID();
      const refLabel = `EFM-${transfer_id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      const reversal = originalEntries.map((e: any) => ({
        journal_id: reversalJournalId,
        account_id: e.account_id,
        wallet_id: e.wallet_id,
        currency_code: e.currency_code,
        debit_amount: Number(e.credit_amount) || 0,
        credit_amount: Number(e.debit_amount) || 0,
        description: `Cancellation refund for ${refLabel}`,
        reference_type: "transfer_cancellation",
        reference_id: transfer_id,
        created_by: user.id,
      }));

      const { error: insErr } = await supabase.from("ledger_entries").insert(reversal);
      if (insErr) {
        console.error("Reversal insert error:", insErr);
        return json({ error: "Failed to refund wallet" }, 500);
      }
    }

    const { error: updErr } = await supabase.from("transfers").update({
      status: "reversed",
      failure_reason: "Cancelled by user",
      completed_at: new Date().toISOString(),
    }).eq("id", transfer_id);

    if (updErr) {
      console.error("Transfer update error:", updErr);
      return json({ error: "Failed to update transfer status" }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("cancel-transfer error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
