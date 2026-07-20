import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  elicatePayoutStatus,
  getElicateConfig,
  isElicateFailureStatus,
  isElicateSuccessStatus,
} from "../_shared/elicate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

async function settleSuccess(
  supabase: ReturnType<typeof createClient>,
  transfer: Record<string, unknown>,
  providerRef: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (transfer.status === "completed") return { ok: true };

  const { data: elicateAcc } = await supabase.from("ledger_accounts").select("id").eq("code", "1205").maybeSingle();
  const { data: walletLiab } = await supabase
    .from("ledger_accounts").select("id").like("code", "21%").eq("currency_code", "ZMW").limit(1).single();

  if (!elicateAcc || !walletLiab) return { ok: false, reason: "Ledger setup incomplete" };

  const journalId = crypto.randomUUID();
  const amount = Number(transfer.target_amount);
  const entries: Record<string, unknown>[] = [
    {
      journal_id: journalId,
      account_id: walletLiab.id,
      wallet_id: null,
      currency_code: "ZMW",
      debit_amount: amount,
      credit_amount: 0,
      description: `Elicate payout settled to ${transfer.recipient_name}`,
      reference_type: "elicate_payout",
      reference_id: transfer.id,
    },
    {
      journal_id: journalId,
      account_id: elicateAcc.id,
      wallet_id: null,
      currency_code: "ZMW",
      debit_amount: 0,
      credit_amount: amount,
      description: `Elicate settlement clearing for ${providerRef}`,
      reference_type: "elicate_payout",
      reference_id: transfer.id,
    },
  ];

  const { data: payableAcc } = await supabase.from("ledger_accounts").select("id").eq("code", "2123").maybeSingle();
  if (payableAcc) {
    entries[0].account_id = payableAcc.id;
    entries[0].description = `Clear ZMW payable for ${transfer.recipient_name}`;
  }

  const { data: existing } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "elicate_payout")
    .eq("reference_id", transfer.id)
    .limit(1);
  if (!existing?.length) {
    const { error: leErr } = await supabase.from("ledger_entries").insert(entries);
    if (leErr) return { ok: false, reason: leErr.message };
  }

  await supabase.from("transfers").update({
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", transfer.id);

  return { ok: true };
}

async function reverseLedger(supabase: ReturnType<typeof createClient>, transferId: string) {
  const { data: already } = await supabase
    .from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (already?.length) return;

  const { data: originals } = await supabase
    .from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description, created_by")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (!originals?.length) return;

  const journalId = crypto.randomUUID();
  const rows = originals.map((e) => ({
    journal_id: journalId,
    account_id: e.account_id,
    wallet_id: e.wallet_id,
    currency_code: e.currency_code,
    debit_amount: Number(e.credit_amount) || 0,
    credit_amount: Number(e.debit_amount) || 0,
    description: `REVERSAL: ${e.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal",
    reference_id: transferId,
    created_by: e.created_by,
  }));
  await supabase.from("ledger_entries").insert(rows);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let transferId: string | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      transferId = body?.transfer_id ?? null;
    }

    const { mode, secretKey } = getElicateConfig();
    if (!secretKey) {
      return new Response(JSON.stringify({ error: "Elicate not configured", mode }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let q = supabase
      .from("transfers")
      .select("*")
      .eq("status", "processing")
      .eq("target_currency", "ZMW")
      .not("provider_reference", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (transferId) q = q.eq("id", transferId);

    const { data: transfers, error } = await q;
    if (error) throw error;

    const results: Record<string, unknown>[] = [];
    for (const t of transfers ?? []) {
      const providerRef: string = t.provider_reference;
      // Prefer payout status API for PO-* / payout ids; also works for EP-* where applicable.
      const details = await elicatePayoutStatus(providerRef);
      const status = String(details.data?.status ?? "").toLowerCase();
      let action = "no_change";

      if (details.ok && isElicateSuccessStatus(status)) {
        const res = await settleSuccess(supabase, t, providerRef);
        action = res.ok ? "completed" : `error:${res.reason}`;
      } else if (details.ok && isElicateFailureStatus(status)) {
        await reverseLedger(supabase, t.id);
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: String(details.data?.message || details.error || `Elicate status: ${status}`),
        }).eq("id", t.id);
        action = "failed";
      }

      results.push({
        transfer_id: t.id,
        provider_reference: providerRef,
        provider_status: status || "(unknown)",
        action,
        http: details.status,
        ok: details.ok,
      });
    }

    return new Response(JSON.stringify({ mode, checked: results.length, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
