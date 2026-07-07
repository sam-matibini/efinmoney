// Reconcile transfers stuck in "processing" by polling Flutterwave for their
// real status. Handles the case where a transfer.completed/failed webhook was
// delayed or missed, so a transfer never left "processing" even though the
// money actually landed (or bounced). Also powers the admin "refresh" button.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";
import { corsHeaders, json, requireStaffOrCron } from "../_shared/treasury-worker.ts";

type SbAdmin = ReturnType<typeof createClient>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function reverseTransferLedger(supabase: SbAdmin, transferId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (existing && existing.length > 0) return false;
  const { data: originals } = await supabase
    .from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (!originals || originals.length === 0) return false;
  const journalId = crypto.randomUUID();
  const rows = originals.map((o) => ({
    journal_id: journalId, account_id: o.account_id, wallet_id: o.wallet_id, currency_code: o.currency_code,
    debit_amount: o.credit_amount, credit_amount: o.debit_amount,
    description: `REVERSAL: ${o.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal", reference_id: transferId,
  }));
  const { error } = await supabase.from("ledger_entries").insert(rows);
  if (error) { console.error("reverseTransferLedger insert failed", error); return false; }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireStaffOrCron(req);
    if ("error" in gate) return gate.error;

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const onlyId: string | undefined = body?.transfer_id;

    // Transfers we consider "in flight" at the provider.
    let q = db.from("transfers")
      .select("id, sender_id, recipient_name, target_currency, target_amount, provider_reference, status")
      .in("status", ["processing"])
      .not("provider_reference", "is", null)
      .order("created_at", { ascending: true })
      .limit(100);
    if (onlyId) q = db.from("transfers")
      .select("id, sender_id, recipient_name, target_currency, target_amount, provider_reference, status")
      .eq("id", onlyId);

    const { data: transfers, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const results: unknown[] = [];
    for (const t of transfers ?? []) {
      const flwId = String(t.provider_reference || "");
      if (!flwId) { results.push({ transfer_id: t.id, action: "skipped", reason: "no_provider_reference" }); continue; }

      const { ok, json: res } = await flwV3Fetch(`/transfers/${encodeURIComponent(flwId)}`, { method: "GET" });
      const flwStatus = String(res?.data?.status || "").toUpperCase();
      if (!ok && !flwStatus) {
        results.push({ transfer_id: t.id, action: "check_failed", provider_message: res?.message ?? null });
        continue;
      }

      if (flwStatus === "SUCCESSFUL") {
        await db.from("transfers").update({
          status: "completed",
          completed_at: new Date().toISOString(),
        }).eq("id", t.id).eq("status", "processing");
        await db.from("notifications").insert({
          user_id: t.sender_id, title: "Transfer completed",
          message: `Your transfer of ${t.target_currency} ${t.target_amount} to ${t.recipient_name} is complete.`,
          type: "transfer",
        });
        results.push({ transfer_id: t.id, action: "completed", flw_status: flwStatus });
      } else if (flwStatus === "FAILED") {
        const refunded = await reverseTransferLedger(db, t.id);
        await db.from("transfers").update({
          status: "failed",
          failure_reason: String(res?.data?.complete_message || "Provider reported FAILED").slice(0, 500),
        }).eq("id", t.id).eq("status", "processing");
        await db.from("notifications").insert({
          user_id: t.sender_id,
          title: refunded ? "Transfer failed — refunded" : "Transfer failed",
          message: refunded
            ? `Your transfer to ${t.recipient_name} failed and has been refunded.`
            : `Your transfer to ${t.recipient_name} failed.`,
          type: "error",
        });
        results.push({ transfer_id: t.id, action: "failed", refunded, flw_status: flwStatus });
      } else {
        // NEW / PENDING — genuinely still processing at Flutterwave.
        results.push({ transfer_id: t.id, action: "still_processing", flw_status: flwStatus || "unknown" });
      }
    }

    return json({ ok: true, checked: transfers?.length ?? 0, results });
  } catch (e) {
    console.error("flw-reconcile-transfers", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
