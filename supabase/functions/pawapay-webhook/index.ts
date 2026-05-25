import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PawaPay sends callbacks for deposits, payouts, and refunds.
// Payload shape: { payoutId | depositId | refundId, status, ... }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Callback authentication: PawaPay must include a shared secret in the
  // configured callback URL (?secret=...) or x-callback-secret header.
  // Internal pollers/tests can authenticate with x-internal-secret = service role key.
  // While PAWAPAY_CALLBACK_SECRET is not yet configured (provider not live), we accept
  // the request and log a warning. Once the secret is set it becomes strictly enforced.
  const expectedCb = Deno.env.get("PAWAPAY_CALLBACK_SECRET") || "";
  const expectedInt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const providedCb = req.headers.get("x-callback-secret") || new URL(req.url).searchParams.get("secret") || "";
  const providedInt = req.headers.get("x-internal-secret") || "";
  const intOk = expectedInt && providedInt === expectedInt;
  if (expectedCb) {
    const cbOk = providedCb === expectedCb;
    if (!cbOk && !intOk) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } else if (!intOk) {
    console.warn("PAWAPAY_CALLBACK_SECRET not configured — accepting webhook without authentication");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = await req.json().catch(() => ({}));
    console.log("WEBHOOK RECEIVED:", JSON.stringify(payload));

    const providerRef: string | undefined =
      payload.payoutId || payload.depositId || payload.refundId;
    const status: string = (payload.status || "").toUpperCase();
    const eventType = payload.payoutId ? "payout" : payload.depositId ? "deposit" : "refund";

    if (!providerRef) {
      return new Response(JSON.stringify({ error: "Missing transaction id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find the matching transfer by provider_reference
    const { data: transfer } = await supabase
      .from("transfers")
      .select("*")
      .eq("provider_reference", providerRef)
      .maybeSingle();

    if (!transfer) {
      console.warn("No transfer found for providerRef", providerRef);
      return new Response(JSON.stringify({ received: true, matched: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isSuccess = status === "COMPLETED" || status === "SUCCESS";
    const isFailure = status === "FAILED" || status === "REJECTED";

    if (isSuccess && eventType === "payout") {
      // Idempotency: ensure we haven't already posted a settlement journal for this transfer
      const { data: existing } = await supabase
        .from("ledger_entries")
        .select("id")
        .eq("reference_type", "transfer_settlement")
        .eq("reference_id", transfer.id)
        .limit(1);

      if (!existing || existing.length === 0) {
        // Settlement journal: Debit PawaPay Settlement Asset (1207), Credit the
        // payable account previously credited at funding time. The funding journal
        // credited the country's MM payable account (e.g. 21xx). Here we move from
        // payable -> PawaPay receivable to recognize external settlement.
        const { data: payableEntry } = await supabase
          .from("ledger_entries")
          .select("account_id, currency_code, credit_amount")
          .eq("reference_type", "transfer")
          .eq("reference_id", transfer.id)
          .gt("credit_amount", 0)
          .order("credit_amount", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: pawapayAcc } = await supabase
          .from("ledger_accounts").select("id").eq("code", "1207").maybeSingle();

        if (pawapayAcc && payableEntry) {
          const journalId = crypto.randomUUID();
          const amount = Number(transfer.target_amount);
          // DR Payable (clears the liability set up at funding time)
          // CR PawaPay Settlement 1207 (reduces the asset — cash sent out via PawaPay)
          const entries = [
            {
              journal_id: journalId,
              account_id: payableEntry.account_id,
              currency_code: transfer.target_currency,
              debit_amount: amount,
              credit_amount: 0,
              description: `Clear payable - PawaPay payout ${providerRef}`,
              reference_type: "transfer_settlement",
              reference_id: transfer.id,
            },
            {
              journal_id: journalId,
              account_id: pawapayAcc.id,
              currency_code: transfer.target_currency,
              debit_amount: 0,
              credit_amount: amount,
              description: `PawaPay payout settled (${providerRef})`,
              reference_type: "transfer_settlement",
              reference_id: transfer.id,
            },
          ];

          const { error: leErr } = await supabase.from("ledger_entries").insert(entries);
          if (leErr) console.error("Settlement ledger insert error:", leErr);
        }

      }

      await supabase.from("transfers").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", transfer.id);
    } else if (isFailure) {
      const reason =
        payload?.failureReason?.failureMessage ||
        payload?.rejectionReason?.rejectionMessage ||
        `PawaPay ${eventType} ${status}`;
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: reason,
      }).eq("id", transfer.id);
    }

    return new Response(JSON.stringify({ received: true, matched: true, status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("pawapay-webhook error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
