/**
 * Poll Fincra for payout status by customer reference (= transfer id).
 * Updates transfers when webhooks are delayed/missing.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fincraFetch } from "../_shared/fincra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function reverseTransferLedger(
  supabase: ReturnType<typeof createClient>,
  transferId: string,
) {
  const { data: existing } = await supabase.from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (existing?.length) return { reversed: false, reason: "already_reversed" };
  const { data: originals, error } = await supabase.from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (error || !originals?.length) return { reversed: false, reason: error?.message || "no_entries" };
  const j = crypto.randomUUID();
  const { error: insErr } = await supabase.from("ledger_entries").insert(originals.map((o) => ({
    journal_id: j,
    account_id: o.account_id,
    wallet_id: o.wallet_id,
    currency_code: o.currency_code,
    debit_amount: o.credit_amount,
    credit_amount: o.debit_amount,
    description: `REVERSAL: ${o.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal",
    reference_id: transferId,
  })));
  if (insErr) return { reversed: false, reason: insErr.message };
  return { reversed: true };
}

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

    const body = await req.json().catch(() => ({}));
    const transferId = String(body?.transfer_id || "").trim();
    if (!transferId) return json({ error: "transfer_id required" }, 400);

    const { data: transfer, error: tErr } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transferId)
      .eq("sender_id", user.id)
      .maybeSingle();
    if (tErr || !transfer) return json({ error: "Transfer not found" }, 404);

    if (["completed", "failed", "reversed", "cancelled", "expired"].includes(transfer.status)) {
      return json({ changed: false, status: transfer.status, note: "terminal" });
    }

    const customerRef = transferId;
    const providerRef = String(transfer.provider_reference || "");
    const isPendingStub =
      !providerRef ||
      /^FINCRA-PENDING/i.test(providerRef) ||
      /^STUB-FINCRA/i.test(providerRef);

    let payout: Record<string, unknown> | null = null;

    const byCustomer = await fincraFetch(
      `/disbursements/payouts/customer-reference/${encodeURIComponent(customerRef)}`,
      { method: "GET", withBusinessId: true },
    );
    if (byCustomer.ok && byCustomer.json?.data) {
      payout = (byCustomer.json.data as Record<string, unknown>) || null;
    } else if (providerRef && !isPendingStub) {
      const byRef = await fincraFetch(
        `/disbursements/payouts/reference/${encodeURIComponent(providerRef)}`,
        { method: "GET", withBusinessId: true },
      );
      if (byRef.ok && byRef.json?.data) {
        payout = (byRef.json.data as Record<string, unknown>) || null;
      }
    } else if (!byCustomer.ok && byCustomer.status !== 404) {
      return json({
        changed: false,
        status: transfer.status,
        note: "fincra_lookup_unavailable",
        error: String(byCustomer.json?.message || byCustomer.json?.error || `HTTP ${byCustomer.status}`),
      });
    }

    if (!payout) {
      return json({
        changed: false,
        status: transfer.status,
        note: isPendingStub ? "payout_not_submitted" : "not_found",
      });
    }

    const rawStatus = String(payout.status || "").toLowerCase();
    const fincraRef = String(payout.reference || payout.id || providerRef || customerRef);

    if (["successful", "success", "completed", "done"].includes(rawStatus)) {
      await supabase.from("transfers").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        provider_reference: fincraRef,
        failure_reason: null,
      }).eq("id", transferId);
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Transfer delivered",
        message: `Your ${transfer.target_currency} ${transfer.target_amount} transfer to ${transfer.recipient_name} was completed.`,
        type: "transfer",
      }).catch(() => {/* ignore */});
      return json({ changed: true, status: "completed", provider_status: rawStatus, reference: fincraRef });
    }

    if (["failed", "cancelled", "canceled", "rejected"].includes(rawStatus)) {
      const reason = String(
        payout.message || payout.reason || payout.failureReason || `Fincra payout ${rawStatus}`,
      );
      const rev = await reverseTransferLedger(supabase, transferId);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: reason.slice(0, 500),
        provider_reference: fincraRef,
      }).eq("id", transferId);
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Transfer failed — refunded",
        message: rev.reversed
          ? `Your transfer to ${transfer.recipient_name} could not be completed. Funds returned to your wallet.`
          : `Your transfer to ${transfer.recipient_name} could not be completed.`,
        type: "error",
      }).catch(() => {/* ignore */});
      return json({
        changed: true,
        status: "failed",
        provider_status: rawStatus,
        error: reason,
        refunded: rev.reversed,
        reference: fincraRef,
      });
    }

    // Still processing at Fincra
    if (fincraRef && fincraRef !== providerRef) {
      await supabase.from("transfers").update({
        provider_reference: fincraRef,
        status: transfer.status === "funded" ? "processing" : transfer.status,
      }).eq("id", transferId);
    }

    return json({
      changed: false,
      status: transfer.status === "funded" ? "processing" : transfer.status,
      provider_status: rawStatus || "processing",
      reference: fincraRef,
      note: "still_processing",
    });
  } catch (err) {
    console.error("fincra-verify-transfer", err);
    return json({ error: err instanceof Error ? err.message : "Verify failed" }, 500);
  }
});
