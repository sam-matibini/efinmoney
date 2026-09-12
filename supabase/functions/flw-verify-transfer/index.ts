// Active transfer status check. Queries Flutterwave directly for the latest
// status of a transfer and updates our DB — so the tracking page reflects
// reality even if the async webhook never arrives.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";
import { checkFlutterwaveLiquidity } from "../_shared/treasury-worker.ts";

import { isCanadaCadPayout, resolvePayoutNetwork } from "../_shared/nomba-payout-corridors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function resolveNetwork(payoutMethod: string | null | undefined, currency: string): string {
  return resolvePayoutNetwork(payoutMethod, currency);
}

async function retryPendingPayout(supabase: ReturnType<typeof createClient>, transfer: Record<string, unknown>) {
  if (isCanadaCadPayout({
    currency: String(transfer.target_currency || ""),
    country: transfer.recipient_country as string,
    method: transfer.payout_method as string,
    transferType: transfer.transfer_type as string,
    sourceCurrency: transfer.source_currency as string,
  })) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/nomba-payout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": SERVICE_KEY,
      },
      body: JSON.stringify({ transfer_id: transfer.id }),
    });
    return res.json();
  }
  const body = {
    transfer_id: transfer.id,
    phone_number: transfer.recipient_phone,
    account_number: transfer.recipient_account,
    bank_code: transfer.recipient_bank_code,
    amount: Number(transfer.target_amount ?? transfer.source_amount),
    currency: transfer.target_currency ?? transfer.source_currency,
    network: resolveNetwork(
      transfer.payout_method as string,
      String(transfer.target_currency ?? transfer.source_currency),
    ),
    recipient_name: transfer.recipient_name,
  };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/flutterwave-payout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

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

    const { data: nombaPayout } = await supabase
      .from("nomba_payout_transactions")
      .select("id")
      .eq("transfer_id", transfer_id)
      .limit(1)
      .maybeSingle();
    if (nombaPayout) {
      return json({
        success: true,
        status: transfer.status,
        changed: false,
        note: "nomba_transfer_use_nomba_verify",
      });
    }

    // Queued for payout — retry automatically when provider balance covers this transfer.
    if (transfer.status === "pending_liquidity") {
      const amt = Number(transfer.target_amount ?? 0);
      const cur = String(transfer.target_currency ?? "NGN");
      const liq = await checkFlutterwaveLiquidity(supabase, amt, cur, { requireBuffer: false });
      if (liq.sufficient) {
        const payout = await retryPendingPayout(supabase, transfer);
        if (payout?.success && !payout?.pending_liquidity) {
          const { data: fresh } = await supabase.from("transfers").select("*").eq("id", transfer_id).maybeSingle();
          return json({
            success: true,
            status: fresh?.status ?? "processing",
            changed: fresh?.status !== "pending_liquidity",
            retried: true,
          });
        }
      }
      return json({
        success: true,
        status: transfer.status,
        changed: false,
        note: "still_processing",
      });
    }

    // Stuck after ledger debit but before a real provider handoff — retry payout now.
    // This is the usual path when the client got a false "success" or the payout call failed silently.
    const providerRef = transfer.provider_reference ? String(transfer.provider_reference) : "";
    const stubRef = !providerRef || /^STUB-/i.test(providerRef);
    if (
      stubRef &&
      ["funded", "processing", "initiated"].includes(String(transfer.status))
    ) {
      const payout = await retryPendingPayout(supabase, transfer);
      const { data: fresh } = await supabase.from("transfers").select("*").eq("id", transfer_id).maybeSingle();
      if (payout?.success === false || fresh?.status === "failed") {
        return json({
          success: true,
          status: fresh?.status ?? "failed",
          changed: true,
          retried: true,
          error: payout?.error || fresh?.failure_reason || "Payout failed",
          provider_message: payout?.provider_message || null,
          refunded: payout?.refunded === true,
        });
      }
      if (payout?.pending_liquidity || payout?.queued) {
        return json({
          success: true,
          status: fresh?.status ?? "pending_liquidity",
          changed: true,
          retried: true,
          note: "pending_liquidity",
        });
      }
      if (payout?.success && fresh) {
        return json({
          success: true,
          status: fresh.status,
          changed: fresh.status !== transfer.status,
          retried: true,
        });
      }
      // Still no provider ref — mark failed with a clear reason so UI is not stuck on Processing.
      const reason =
        payout?.error ||
        payout?.provider_message ||
        "Payout provider did not accept this transfer. Check Flutterwave transfer enablement and IP whitelist.";
      if (fresh && !["failed", "completed", "cancelled"].includes(String(fresh.status))) {
        const rev = await reverseTransferLedger(supabase, transfer_id);
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: String(reason).slice(0, 500),
        }).eq("id", transfer_id);
        await supabase.from("notifications").insert({
          user_id: transfer.sender_id,
          title: rev.reversed ? "Transfer failed — refunded" : "Transfer failed",
          message: rev.reversed
            ? `${reason} Funds returned to your wallet.`
            : String(reason),
          type: "error",
        });
        return json({
          success: true,
          status: "failed",
          changed: true,
          retried: true,
          error: reason,
          refunded: rev.reversed,
        });
      }
      return json({
        success: true,
        status: fresh?.status ?? transfer.status,
        changed: false,
        note: "no provider reference yet",
        error: reason,
      });
    }

    if (!providerRef) {
      return json({ success: true, status: transfer.status, changed: false, note: "no provider reference yet" });
    }

    // Flutterwave V3: GET /transfers/{id}
    const { ok, json: resp } = await flwV3Fetch(`/transfers/${encodeURIComponent(providerRef)}`, {
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
