/**
 * Batch-reconcile Fincra payouts stuck in processing/funded.
 * Polls Fincra by customer reference (= transfer UUID) when webhooks are delayed/missed.
 * Auth: staff JWT or x-internal-secret (service role) for cron.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fincraFetch } from "../_shared/fincra.ts";
import { corsHeaders, json, requireStaffOrCron } from "../_shared/treasury-worker.ts";

type SbAdmin = ReturnType<typeof createClient>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function looksFincra(t: {
  provider_reference?: string | null;
  provider_charge_id?: string | null;
}): boolean {
  const charge = String(t.provider_charge_id || "");
  const ref = String(t.provider_reference || "");
  if (/rail:fincra/i.test(charge)) return true;
  if (/^FINCRA-PENDING/i.test(ref) || /^STUB-FINCRA/i.test(ref)) return true;
  // Clear Flutterwave / stub patterns — not ours
  if (/^efmpayout-/i.test(ref)) return false;
  if (/^EFM-[0-9a-f]{8}-\d+/i.test(ref)) return false;
  if (/^STUB-/i.test(ref) && !/^STUB-FINCRA/i.test(ref)) return false;
  if (/^\d+$/.test(ref)) return false; // FLW numeric transfer id
  // Fincra provider refs are typically hex / alphanumeric (not pure digits)
  if (ref && /^[a-z0-9-]{8,}$/i.test(ref)) return true;
  return false;
}

async function reverseTransferLedger(supabase: SbAdmin, transferId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (existing?.length) return false;
  const { data: originals } = await supabase
    .from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (!originals?.length) return false;
  const journalId = crypto.randomUUID();
  const { error } = await supabase.from("ledger_entries").insert(originals.map((o) => ({
    journal_id: journalId,
    account_id: o.account_id,
    wallet_id: o.wallet_id,
    currency_code: o.currency_code,
    debit_amount: o.credit_amount,
    credit_amount: o.debit_amount,
    description: `REVERSAL: ${o.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal",
    reference_id: transferId,
  })));
  if (error) {
    console.error("reverseTransferLedger insert failed", error);
    return false;
  }
  return true;
}

async function fetchFincraPayout(
  transferId: string,
  providerRef: string,
): Promise<{ payout: Record<string, unknown> | null; error?: string }> {
  const isPendingStub =
    !providerRef ||
    /^FINCRA-PENDING/i.test(providerRef) ||
    /^STUB-FINCRA/i.test(providerRef);

  const byCustomer = await fincraFetch(
    `/disbursements/payouts/customer-reference/${encodeURIComponent(transferId)}`,
    { method: "GET", withBusinessId: true },
  );
  if (byCustomer.ok && byCustomer.json?.data) {
    return { payout: byCustomer.json.data as Record<string, unknown> };
  }
  if (providerRef && !isPendingStub) {
    const byRef = await fincraFetch(
      `/disbursements/payouts/reference/${encodeURIComponent(providerRef)}`,
      { method: "GET", withBusinessId: true },
    );
    if (byRef.ok && byRef.json?.data) {
      return { payout: byRef.json.data as Record<string, unknown> };
    }
  }
  if (!byCustomer.ok && byCustomer.status !== 404) {
    return {
      payout: null,
      error: String(byCustomer.json?.message || byCustomer.json?.error || `HTTP ${byCustomer.status}`),
    };
  }
  return { payout: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireStaffOrCron(req);
    if ("error" in gate) return gate.error;

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const onlyId: string | undefined = body?.transfer_id
      ? String(body.transfer_id)
      : undefined;

    const selectCols =
      "id, sender_id, recipient_name, target_currency, target_amount, provider_reference, provider_charge_id, status";

    let transfers: Array<Record<string, unknown>> = [];
    if (onlyId) {
      const { data, error } = await db.from("transfers").select(selectCols).eq("id", onlyId);
      if (error) return json({ error: error.message }, 500);
      transfers = (data ?? []) as Array<Record<string, unknown>>;
    } else {
      const { data, error } = await db
        .from("transfers")
        .select(selectCols)
        .in("status", ["processing", "funded"])
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) return json({ error: error.message }, 500);
      transfers = ((data ?? []) as Array<Record<string, unknown>>).filter((t) =>
        looksFincra({
          provider_reference: t.provider_reference as string | null,
          provider_charge_id: t.provider_charge_id as string | null,
        })
      );
    }

    const results: unknown[] = [];
    for (const t of transfers) {
      const transferId = String(t.id);
      const providerRef = String(t.provider_reference || "");
      const status = String(t.status || "");

      if (["completed", "failed", "reversed", "cancelled", "expired"].includes(status)) {
        results.push({ transfer_id: transferId, action: "skipped", reason: "terminal" });
        continue;
      }

      if (!looksFincra({
        provider_reference: t.provider_reference as string | null,
        provider_charge_id: t.provider_charge_id as string | null,
      }) && onlyId) {
        results.push({ transfer_id: transferId, action: "skipped", reason: "not_fincra" });
        continue;
      }

      let fetched: { payout: Record<string, unknown> | null; error?: string };
      try {
        fetched = await fetchFincraPayout(transferId, providerRef);
      } catch (e) {
        results.push({
          transfer_id: transferId,
          action: "check_failed",
          error: e instanceof Error ? e.message : String(e),
        });
        continue;
      }

      if (fetched.error) {
        results.push({
          transfer_id: transferId,
          action: "check_failed",
          provider_message: fetched.error,
        });
        continue;
      }
      if (!fetched.payout) {
        results.push({
          transfer_id: transferId,
          action: "not_found",
          note: "payout_not_at_fincra",
        });
        continue;
      }

      const payout = fetched.payout;
      const rawStatus = String(payout.status || "").toLowerCase();
      const fincraRef = String(payout.reference || payout.id || providerRef || transferId);

      if (["successful", "success", "completed", "done"].includes(rawStatus)) {
        await db.from("transfers").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          provider_reference: fincraRef,
          failure_reason: null,
        }).eq("id", transferId).in("status", ["processing", "funded"]);
        if (t.sender_id) {
          await db.from("notifications").insert({
            user_id: t.sender_id,
            title: "Transfer delivered",
            message: `Your ${t.target_currency} ${t.target_amount} transfer to ${t.recipient_name} was completed.`,
            type: "transfer",
          }).catch(() => {/* ignore */});
        }
        results.push({
          transfer_id: transferId,
          action: "completed",
          provider_status: rawStatus,
          reference: fincraRef,
        });
      } else if (["failed", "cancelled", "canceled", "rejected"].includes(rawStatus)) {
        const reason = String(
          payout.message || payout.reason || payout.failureReason || `Fincra payout ${rawStatus}`,
        ).slice(0, 500);
        const refunded = await reverseTransferLedger(db, transferId);
        await db.from("transfers").update({
          status: "failed",
          failure_reason: reason,
          provider_reference: fincraRef,
        }).eq("id", transferId).in("status", ["processing", "funded"]);
        if (t.sender_id) {
          await db.from("notifications").insert({
            user_id: t.sender_id,
            title: refunded ? "Transfer failed — refunded" : "Transfer failed",
            message: refunded
              ? `Your transfer to ${t.recipient_name} could not be completed. Funds returned to your wallet.`
              : `Your transfer to ${t.recipient_name} could not be completed.`,
            type: "error",
          }).catch(() => {/* ignore */});
        }
        results.push({
          transfer_id: transferId,
          action: "failed",
          refunded,
          provider_status: rawStatus,
          reason,
        });
      } else {
        if (fincraRef && fincraRef !== providerRef) {
          await db.from("transfers").update({
            provider_reference: fincraRef,
            status: status === "funded" ? "processing" : status,
          }).eq("id", transferId);
        }
        results.push({
          transfer_id: transferId,
          action: "still_processing",
          provider_status: rawStatus || "processing",
          reference: fincraRef,
        });
      }
    }

    return json({ ok: true, checked: transfers.length, results });
  } catch (e) {
    console.error("fincra-reconcile-transfers", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
